import { createHash } from "node:crypto";
import { PackageError, dedent } from "@hinote/shared";
import type { D2 as D2Compiler } from "@terrastruct/d2";
import { raw } from "hono/html";

export { dedent } from "@hinote/shared";

export type D2Props = {
  // D2 source. Children work too: <D2>{`a -> b`}</D2>. A template literal
  // keeps D2's braces out of JSX.
  code?: string;
  children?: string | string[];
  // A D2 theme id, such as 0 (the default), 1 (grey), 200 (dark), or 300
  // (terminal).
  theme?: number;
  // Hand-drawn look.
  sketch?: boolean;
  // Keep the theme's background behind the diagram. Without it the slide's
  // background shows through, which suits a theme whose colors match the
  // slide; a dark theme on a light slide wants its own background back.
  background?: boolean;
  // "elk" lays out larger or nested diagrams more evenly than the default.
  layout?: "dagre" | "elk";
  // Size of the SVG relative to D2's own, whose labels are 16px. The default 2
  // makes them about as large as slide body text on the 1080px canvas.
  scale?: number;
  class?: string;
};

// The compiler is WebAssembly in a worker thread. It starts on the first <D2>,
// so a deck that imports this package but draws nothing never loads it.
let compiler: Promise<D2Compiler> | undefined;
// The worker answers one request at a time and drops the earlier caller if a
// second one arrives, so calls wait for each other.
let queue: Promise<unknown> = Promise.resolve();

type Thread = { ref?: () => void; unref?: () => void };

function isThread(value: unknown): value is Thread {
  return typeof value === "object" && value !== null && "unref" in value;
}

// The worker would keep `hinote build` running after it finishes. It is held
// only while a diagram is being drawn.
function thread(d2: D2Compiler): Thread {
  return "worker" in d2 && isThread(d2.worker) ? d2.worker : {};
}

function start(): Promise<D2Compiler> {
  compiler ??= import("@terrastruct/d2").then(async (module) => {
    const d2 = new module.D2();
    if ("ready" in d2 && d2.ready instanceof Promise) await d2.ready;
    thread(d2).unref?.();
    return d2;
  });
  return compiler;
}

function serially<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next.catch(() => {});
  return next;
}

// A short, stable suffix for the ids inside one diagram's SVG. Every slide is
// on one page, so two diagrams must not share ids, and the same diagram must
// render the same each time.
function salt(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 8);
}

// D2 reports problems as a JSON list of `index:line:column: message`.
function describe(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  try {
    const problems: unknown = JSON.parse(text);
    if (Array.isArray(problems))
      return problems
        .map((problem: { errmsg?: unknown }) =>
          typeof problem.errmsg === "string"
            ? problem.errmsg.replace(/^index:/, "line ")
            : JSON.stringify(problem),
        )
        .join("; ");
  } catch {}
  return text;
}

// Drawn while the slide renders, so the page gets a finished SVG and loads no
// script or font for it.
export async function D2(props: D2Props) {
  const source =
    props.code ??
    (Array.isArray(props.children) ? props.children.join("") : props.children);
  if (typeof source !== "string")
    throw new PackageError(
      "<D2> needs its source as `code` or as text children.",
      "d2",
    );
  const code = dedent(source);
  const d2 = await start();
  const svg = await serially(async () => {
    const worker = thread(d2);
    worker.ref?.();
    try {
      const compiled = await d2
        .compile({
          fs: { index: code },
          options: { layout: props.layout ?? "dagre" },
        })
        .catch((error: unknown) => {
          throw new PackageError(
            `<D2> is not valid D2: ${describe(error)}`,
            "d2",
          );
        });
      return await d2.render(compiled.diagram, {
        ...compiled.renderOptions,
        themeID: props.theme ?? compiled.renderOptions.themeID ?? 0,
        sketch: props.sketch ?? compiled.renderOptions.sketch ?? false,
        pad: 0,
        scale: props.scale ?? 2,
        noXMLTag: true,
        salt: salt(
          JSON.stringify([
            code,
            props.theme,
            props.sketch,
            props.layout,
            props.scale,
          ]),
        ),
      });
    } finally {
      worker.unref?.();
    }
  });
  const className = props.class ? ` ${escapeAttribute(props.class)}` : "";
  const drawn = props.background ? svg : withoutBackground(svg);
  return raw(`<div class="hinote-d2${className}">${drawn}</div>`);
}

// D2 paints its theme's background (white for the default theme) as the first
// shape of the diagram, with its own unlayered style that deck CSS cannot
// override, so it is left out of the SVG instead.
const BACKGROUND =
  /(<svg class="d2-\d+ d2-svg"[^>]*>)<rect [^>]*class=" fill-N7"[^>]*\/>/;

function withoutBackground(svg: string): string {
  return svg.replace(BACKGROUND, "$1");
}

function escapeAttribute(value: string): string {
  return value.replace(/[&"<>]/g, (char) => `&#${char.charCodeAt(0)};`);
}
