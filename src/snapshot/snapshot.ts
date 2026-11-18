// One PNG per flattened slide, at the canvas size, then the server is gone.
// The browser is the shared one in browser.ts, so a later measurement of the
// same page (whether a slide overflows, for instance) can open it the same way.
import { mkdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import {
  poll,
  withBrowser,
  type BrowserName,
  type CapturePage,
} from "./browser.ts";
import type { Canvas } from "../deck/deck.ts";
import { HinoteError } from "../errors.ts";
import { loadDeckFile } from "../build/load.ts";
import { serve } from "../build/runtime.ts";
import { createDevApp } from "../build/server.ts";

const STAGE = ".hinote-stage";

export type Snapshot = {
  output: string;
  canvas: Canvas;
  browser: BrowserName;
  files: string[];
};

export async function takeSnapshots(
  entry: string,
  outDir: string,
  browser: BrowserName | "auto",
): Promise<Snapshot> {
  const deck = await loadDeckFile(entry);
  if (deck.slides.length === 0)
    throw new HinoteError("This deck has no slides.", { code: "deck-export" });
  const directory = resolve(outDir);
  await mkdir(directory, { recursive: true });
  const canvas = deck.canvas;
  const app = createDevApp(() => deck, dirname(entry));
  const server = await serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: (request) => app.fetch(request),
  });
  try {
    const files: string[] = [];
    const used = await withBrowser(browser, canvas, async (page, name) => {
      for (let index = 0; index < deck.slides.length; index++) {
        const file = resolve(directory, `${index + 1}.png`);
        await photograph(page, server.port, index, canvas, file);
        files.push(shown(file));
      }
      return name;
    });
    return { output: shown(directory), canvas, browser: used, files };
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
): Promise<void> {
  await page.goto(`http://127.0.0.1:${port}/${index + 1}`);
  const expression = ready(index, canvas);
  await poll(
    () => page.evaluate<boolean>(expression),
    () =>
      new HinoteError(`Slide ${index + 1} was not ready to photograph.`, {
        code: "browser",
        hint: "The slide did not become the size of the canvas. Try another browser with --browser.",
      }),
  );
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
}

// True once the URL's slide is the one on screen and the stage is the canvas,
// in CSS pixels. The client fits the stage to the window; pinning the scale
// keeps the picture the size the slide was written for.
function ready(index: number, { width, height }: Canvas): string {
  return `(() => {
    const deck = document.getElementById("deck");
    if (deck) deck.style.setProperty("--hinote-scale", "1");
    const stage = document.querySelector(${JSON.stringify(STAGE)});
    const slide = document.querySelectorAll("#deck .slide")[${index}];
    if (!stage || !slide || !slide.classList.contains("is-active")) return false;
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
