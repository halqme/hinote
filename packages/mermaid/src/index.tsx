import type { HinoteErrorLike } from "@hinote/types";
import { raw } from "hono/html";

export type MermaidProps = {
  // Mermaid source. Children work too: <Mermaid>{`graph LR; a --> b`}</Mermaid>.
  // A template literal keeps the source's braces out of JSX.
  code?: string;
  children?: string | string[];
  // Size of the SVG relative to the renderer's own, whose node labels are
  // 13px. The default 2.5 makes them about as large as slide body text on the
  // 1080px canvas.
  scale?: number;
  class?: string;
};

// hinote reports an error with this name as its own, message and all.
class MermaidError extends Error implements HinoteErrorLike {
  override readonly name = "HinoteError";
  readonly code = "mermaid";
}

// The diagrams beautiful-mermaid draws, by the first word of the source.
const SUPPORTED = new Map([
  ["graph", "flowchart"],
  ["flowchart", "flowchart"],
  ["statediagram", "state"],
  ["statediagram-v2", "state"],
  ["sequencediagram", "sequence"],
  ["classdiagram", "class"],
  ["erdiagram", "ER"],
  ["xychart", "XY chart"],
  ["xychart-beta", "XY chart"],
]);

const SUPPORTED_LIST =
  "graph or flowchart, stateDiagram, sequenceDiagram, classDiagram, erDiagram, and xychart";

// Source written inside a template literal carries the indentation of the JSX
// around it. Drop blank lines at both ends and the indentation every line shares.
export function dedent(source: string): string {
  const lines = source.replace(/\t/g, "  ").split("\n");
  while (lines.length > 0 && lines[0]?.trim() === "") lines.shift();
  while (lines.length > 0 && lines.at(-1)?.trim() === "") lines.pop();
  const indent = Math.min(
    ...lines
      .filter((line) => line.trim() !== "")
      .map((line) => line.length - line.trimStart().length),
  );
  return lines.map((line) => line.slice(indent)).join("\n");
}

// The first word of the first line that is not a comment, such as "graph".
function header(code: string): string {
  const line =
    code
      .split("\n")
      .map((text) => text.trim())
      .find((text) => text !== "" && !text.startsWith("%%")) ?? "";
  return (line.split(/[\s;]/)[0] ?? "").toLowerCase();
}

// A short, stable name for one diagram, so two diagrams on the page keep their
// styles and markers apart and the same diagram renders the same each time.
// FNV-1a, which needs nothing from Node and so runs on any host.
function salt(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// The renderer writes its colors as CSS variables, so the diagram takes the
// deck's theme, and a slide that changes the theme changes the diagram too.
const COLORS = {
  bg: "var(--hinote-color-bg)",
  fg: "var(--hinote-color-fg)",
  accent: "var(--hinote-color-accent)",
  muted: "var(--hinote-color-muted)",
  surface: "var(--hinote-color-surface)",
  border: "var(--hinote-color-border)",
};

// The renderer's <style> loads its font from Google Fonts and styles every
// `svg` and `text` on the page. This keeps its rules to one diagram and sets
// its text in the deck's fonts: the renderer estimates text widths from
// character classes rather than from one font's metrics, so another
// proportional font fits the boxes as well as its default does.
function scope(svg: string, name: string): string {
  return svg
    .replace(/<style>[\s\S]*?<\/style>/, (style) =>
      style
        .replace(/^\s*@import[^\n]*\n/gm, "")
        .replace(
          /^(\s*)text \{[^}]*\}/m,
          `$1.${name} text { font-family: var(--hinote-font-base); }`,
        )
        .replace(
          /^(\s*)\.mono \{[^}]*\}/m,
          `$1.${name} .mono { font-family: var(--hinote-font-mono); }`,
        )
        .replace(/^(\s*)svg \{/m, `$1.${name} {`),
    )
    .replace(/ id="([^"]+)"/g, ` id="${name}-$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${name}-$1)`)
    .replace(/ href="#([^"]+)"/g, ` href="#${name}-$1"`);
}

// Scales the drawing by its width and height and keeps its viewBox, as <D2> does.
function sized(svg: string, name: string, scale: number): string {
  return svg.replace(
    /^<svg ([^>]*?)width="([\d.]+)" height="([\d.]+)"/,
    (_, before: string, width: string, height: string) =>
      `<svg class="${name}" ${before}width="${round(Number(width) * scale)}" height="${round(Number(height) * scale)}"`,
  );
}

const round = (value: number) => Math.round(value * 100) / 100;

// Drawn while the slide renders, so the page gets a finished SVG and loads no
// script for it.
export async function Mermaid(props: MermaidProps) {
  const source =
    props.code ??
    (Array.isArray(props.children) ? props.children.join("") : props.children);
  if (typeof source !== "string" || source.trim() === "")
    throw new MermaidError(
      "<Mermaid> needs its source as `code` or as text children.",
    );
  const code = dedent(source);
  const kind = header(code);
  if (!SUPPORTED.has(kind))
    throw new MermaidError(
      `<Mermaid> cannot draw "${kind}". It draws ${SUPPORTED_LIST}.`,
    );
  const scale = props.scale ?? 2.5;
  if (!(scale > 0))
    throw new MermaidError("<Mermaid scale> must be a positive number.");
  // Loaded on the first diagram, so a deck that imports this package but
  // draws nothing never loads the layout engine.
  const { renderMermaidSVG } = await import("beautiful-mermaid");
  let svg: string;
  try {
    svg = renderMermaidSVG(code, { ...COLORS, transparent: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new MermaidError(`<Mermaid> is not valid Mermaid: ${message}`);
  }
  const name = `hinote-mermaid-${salt(JSON.stringify([code, scale]))}`;
  const className = props.class ? ` ${escapeAttribute(props.class)}` : "";
  return raw(
    `<div class="hinote-mermaid${className}">${sized(scope(svg, name), name, scale)}</div>`,
  );
}

function escapeAttribute(value: string): string {
  return value.replace(/[&"<>]/g, (char) => `&#${char.charCodeAt(0)};`);
}
