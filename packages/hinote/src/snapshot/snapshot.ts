// One PNG per flattened slide, at the canvas size, then the server is gone.
// The same pass measures layout: canvas overflow and clipped content are
// problems; safe-area crossings are warnings.
import { mkdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import {
  poll,
  withBrowser,
  type BrowserName,
  type CapturePage,
} from "./browser.ts";
import {
  measureSlide,
  revealAllExpression,
  type LayoutIssue,
  type LayoutReport,
} from "./layout.ts";
import type { Canvas } from "@hinote/core/internal";
import { HinoteError, UsageError } from "../errors.ts";
import { loadDeckFile } from "../build/load.ts";
import { serve } from "../build/runtime.ts";
import { inlineScripts } from "../build/scripts.ts";
import { createDevApp } from "../build/server.ts";

const STAGE = ".hinote-stage";

export type Snapshot = {
  output: string;
  canvas: Canvas;
  browser: BrowserName;
  files: string[];
  problems: LayoutIssue[];
  warnings: LayoutIssue[];
};

// `only` lists flattened slide numbers, counted from 1. Each picture is named
// after its number, so a partial run never renames slide 2 to 1.png.
export async function takeSnapshots(
  entry: string,
  outDir: string,
  browser: BrowserName | "auto",
  only?: readonly number[],
): Promise<Snapshot> {
  const deck = await loadDeckFile(entry);
  if (deck.slides.length === 0)
    throw new HinoteError("This deck has no slides.", { code: "deck-export" });
  const missing = only?.filter((n) => n > deck.slides.length) ?? [];
  if (missing.length > 0)
    throw new UsageError(
      `This deck has ${deck.slides.length} slide${deck.slides.length === 1 ? "" : "s"}, so there is no slide ${missing.join(", ")}.`,
      `Pick numbers from 1 to ${deck.slides.length}.`,
    );
  const numbers = only ?? deck.slides.map((_, index) => index + 1);
  const directory = resolve(outDir);
  await mkdir(directory, { recursive: true });
  const canvas = deck.canvas;
  // <Script> runs as it does in dev and build, so what it inserts at load is
  // in the picture and the layout report.
  deck.transform = inlineScripts;
  const app = createDevApp(() => deck, dirname(entry));
  const server = await serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: (request) => app.fetch(request),
  });
  try {
    const files: string[] = [];
    const problems: LayoutIssue[] = [];
    const warnings: LayoutIssue[] = [];
    const used = await withBrowser(browser, canvas, async (page, name) => {
      for (const number of numbers) {
        const index = number - 1;
        const file = resolve(directory, `${number}.png`);
        const layout = await photograph(page, server.port, index, canvas, file);
        files.push(shown(file));
        problems.push(...layout.problems);
        warnings.push(...layout.warnings);
      }
      return name;
    });
    return {
      output: shown(directory),
      canvas,
      browser: used,
      files,
      problems,
      warnings,
    };
  } finally {
    server.stop();
  }
}

async function photograph(
  page: CapturePage,
  port: number,
  index: number,
  canvas: Canvas,
  file: string,
): Promise<LayoutReport> {
  await page.goto(`http://127.0.0.1:${port}/${index + 1}`);
  const expression = ready(index, canvas);
  await poll(
    async () => (await page.evaluate(expression)) === true,
    () =>
      new HinoteError(`Slide ${index + 1} was not ready to photograph.`, {
        code: "browser",
        hint: "The slide did not become the size of the canvas. Try another browser with --browser.",
      }),
  );
  // Every step must be visible with no fade: the picture and the layout report
  // both use the finished slide, not the empty first frame.
  await poll(
    async () => (await page.evaluate(revealAllExpression(index))) === true,
    () =>
      new HinoteError(`Slide ${index + 1} did not reveal every step.`, {
        code: "browser",
      }),
  );
  const layout = await measureSlide(page, index);
  await page.screenshot(file, STAGE);
  const size = pngSize(await readFile(file));
  if (size.width !== canvas.width || size.height !== canvas.height)
    throw new HinoteError(
      `Slide ${index + 1} was photographed at ${size.width}×${size.height}, not the canvas ${canvas.width}×${canvas.height}.`,
      {
        code: "browser",
        hint: "The browser scaled the page. Try another with --browser.",
      },
    );
  return layout;
}

// True once the URL's slide is the one on screen and the stage is the canvas,
// in CSS pixels. The runtime is a classic script and marks the slide before
// <Script> modules run; the page is complete only after they have. The client fits the stage to the window; pinning the scale
// keeps the picture the size the slide was written for.
function ready(index: number, { width, height }: Canvas): string {
  return `(() => {
    const deck = document.getElementById("deck");
    if (deck) deck.style.setProperty("--hinote-scale", "1");
    const stage = document.querySelector(${JSON.stringify(STAGE)});
    const slide = document.querySelectorAll("#deck .slide")[${index}];
    if (!stage || !slide || !slide.classList.contains("is-active")) return false;
    if (document.readyState !== "complete") return false;
    if (document.fonts && document.fonts.status !== "loaded") return false;
    for (const image of slide.querySelectorAll("img"))
      if (!image.complete) return false;
    const box = stage.getBoundingClientRect();
    return Math.round(box.width) === ${width} && Math.round(box.height) === ${height};
  })()`;
}

function pngSize(bytes: Buffer): { width: number; height: number } {
  const signature = bytes.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a" || bytes.length < 24)
    throw new HinoteError("The browser did not write a PNG.", {
      code: "browser",
    });
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function shown(file: string): string {
  const rel = relative(process.cwd(), file);
  return rel.startsWith("..") ? file : rel;
}
