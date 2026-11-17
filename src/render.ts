import { jsx } from "hono/jsx";
import clientScript from "./client.generated.ts";
import { HinoteError } from "./errors.ts";
// `view` and `presenter` are served by the deck and sync through it. `static` is
// the single file from `hinote build`: one audience view with no sync.
export type Page = "view" | "presenter" | "static";
import type { Slide } from "./slide.ts";
import { withStepCounter } from "./step.tsx";
import {
  defaultTheme,
  mergeTheme,
  parseTheme,
  themeCss,
  themeDeclarations,
  type Theme,
} from "./theme.ts";

// Every slide is laid out on a fixed canvas and scaled as a whole, so a slide looks
// the same in any window. The client sets --hinote-scale to fit the canvas in #deck.
// rem stays the browser default; theme sizes in rem are relative to it, not to each other.
// Center sets flex:1, which fills the slide only because .slide is a column flex container.
const BASE_CSS = `
*{box-sizing:border-box}
html,body{margin:0;height:100%;overflow:hidden;background:var(--hinote-color-bg);color:var(--hinote-color-fg);font-family:var(--hinote-font-base)}
#deck{position:fixed;inset:0;display:grid;place-items:center;--hinote-scale:1}
.hinote-stage{position:relative;overflow:hidden;width:calc(var(--hinote-canvas-width) * var(--hinote-scale));height:calc(var(--hinote-canvas-height) * var(--hinote-scale))}
.slide{display:none;position:absolute;top:0;left:0;width:var(--hinote-canvas-width);height:var(--hinote-canvas-height);overflow:hidden;flex-direction:column;padding:calc(var(--hinote-space-unit) * 6);transform-origin:0 0;transform:scale(var(--hinote-scale));background:var(--hinote-color-bg);color:var(--hinote-color-fg);font-size:var(--hinote-text-body)}
.slide.is-active{display:flex}
[data-hinote-step]{transition:opacity .2s ease}
[data-hinote-step].is-hidden{opacity:0;visibility:hidden}
h1,h2,h3,p{margin:0}
h1{font-family:var(--hinote-font-heading);font-size:var(--hinote-text-h1);line-height:1.1}
h2,h3{font-family:var(--hinote-font-heading);font-size:var(--hinote-text-h2);line-height:1.2}
p{font-size:var(--hinote-text-body);line-height:1.5}
small{font-size:var(--hinote-text-small);color:var(--hinote-color-muted)}
code,pre{font-family:var(--hinote-font-mono)}
a{color:var(--hinote-color-accent)}
#hinote-pointer{position:fixed;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:#ff2d2d;box-shadow:0 0 16px #ff2d2d;pointer-events:none;z-index:10;opacity:0}
.hinote-thumb{position:relative;overflow:hidden;width:100%;aspect-ratio:var(--hinote-canvas-ratio);background:var(--hinote-color-bg);border-radius:6px}
.hinote-thumb>.slide{display:flex}
html[data-page="presenter"] body{display:grid;grid-template-columns:minmax(0,1fr) minmax(18rem,30vw);background:#111318;color:#f4f4f5;font:16px/1.6 system-ui,sans-serif}
html[data-page="presenter"] #deck{position:relative;inset:auto;min-width:0;min-height:0;padding:1.25rem;background:#0b0d12}
html[data-page="presenter"] .hinote-stage{box-shadow:0 18px 50px rgb(0 0 0 / .45)}
#hinote-panel{display:flex;flex-direction:column;gap:.75rem;min-height:0;padding:1.25rem;overflow:auto;background:#181b22;border-left:1px solid #2c313c}
.hinote-label{margin:0;color:#a1a1aa;font-size:12px;letter-spacing:.06em;text-transform:uppercase}
#hinote-next[data-end]::after{content:"End";position:absolute;inset:0;display:grid;place-items:center;color:#71717a;background:#0b0d12}
#hinote-meta{display:flex;align-items:baseline;justify-content:space-between;gap:1rem}
#hinote-timer{all:unset;cursor:pointer;font-size:28px;font-weight:600;font-variant-numeric:tabular-nums}
#hinote-step,#hinote-clock{margin:0;color:#a1a1aa;font-size:13px;font-variant-numeric:tabular-nums}
#hinote-notes{white-space:pre-wrap;flex:1}
#hinote-overview{display:none;position:fixed;inset:0;z-index:20;overflow:auto;padding:2rem;background:rgb(10 12 16 / .96);grid-template-columns:repeat(auto-fill,minmax(16rem,1fr));gap:1.25rem;align-content:start}
#hinote-overview.is-open{display:grid}
.hinote-overview-item{all:unset;cursor:pointer;display:flex;flex-direction:column;gap:.4rem;color:#d4d4d8;font:13px system-ui,sans-serif}
.hinote-overview-item.is-current .hinote-thumb{outline:3px solid #38bdf8;outline-offset:2px}
@media print{
html,body{height:auto;overflow:visible;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html[data-page] body{display:block}
#deck,html[data-page="presenter"] #deck{position:static;display:block;padding:0}
.hinote-stage{width:auto;height:auto;overflow:visible;box-shadow:none}
.hinote-stage>.slide{display:flex;position:relative;transform:none;break-after:page}
[data-hinote-step].is-hidden{opacity:1;visibility:visible}
#hinote-panel,#hinote-overview,#hinote-pointer{display:none}
}
`.trim();

// The HTML parser ends a script at the character sequence "</script".
// Replacing every "<" would also rewrite operators such as "<=".
const SCRIPT = clientScript.replace(/<\/script/gi, "\\u003c/script");

function elementHtml(node: unknown): string {
  if (
    !node ||
    typeof node !== "object" ||
    !("toString" in node) ||
    typeof node.toString !== "function"
  ) {
    throw new HinoteError("Slide renderers must return JSX.");
  }
  const rendered = node.toString();
  if (typeof rendered !== "string")
    throw new HinoteError("Slide renderers must be synchronous.");
  return rendered;
}

// A slide theme only declares the tokens it changes; the rest inherit from :root.
function slideStyle(slide: Slide): Record<string, string> {
  const style = slide.options.theme
    ? themeDeclarations(slide.options.theme)
    : {};
  if (slide.options.background) style.background = slide.options.background;
  return style;
}

// Filled in by the client: the next preview, the timer, and the overview.
function presenterPanel(slideCount: number, notes: string) {
  return [
    jsx(
      "aside",
      { id: "hinote-panel" },
      jsx("p", { class: "hinote-label" }, "Next"),
      jsx("div", { id: "hinote-next", class: "hinote-thumb" }),
      jsx(
        "div",
        { id: "hinote-meta" },
        jsx(
          "button",
          { id: "hinote-timer", type: "button", title: "Click to restart" },
          "0:00",
        ),
        jsx("p", { id: "hinote-clock" }),
      ),
      jsx(
        "p",
        { id: "hinote-step" },
        slideCount > 0 ? `1 / ${slideCount}` : "",
      ),
      jsx("p", { class: "hinote-label" }, "Notes"),
      jsx("div", { id: "hinote-notes" }, notes),
      jsx("p", { class: "hinote-label" }, "O: overview"),
    ),
    jsx("div", { id: "hinote-overview" }),
  ];
}

export async function renderDeck(input: {
  slides: readonly Slide[];
  theme?: Theme;
  title?: string;
  canvas?: { width: number; height: number };
  page?: Page;
}): Promise<string> {
  const theme = mergeTheme(
    defaultTheme,
    input.theme === undefined ? undefined : parseTheme(input.theme),
  );
  const page = input.page ?? "view";
  const canvas = input.canvas ?? { width: 1920, height: 1080 };
  const title =
    input.title ||
    input.slides.find((slide) => slide.options.title)?.options.title ||
    "hinote";
  const firstNotes = input.slides[0]?.options.notes ?? "";
  // Printing gives one page per slide at canvas size, which "Save as PDF" turns into a PDF.
  const css = `${themeCss(theme)}
:root{--hinote-canvas-width:${canvas.width}px;--hinote-canvas-height:${canvas.height}px;--hinote-canvas-ratio:${canvas.width} / ${canvas.height}}
@page{size:${canvas.width}px ${canvas.height}px;margin:0}
${BASE_CSS}`;
  const slides = input.slides.map((slide, index) => {
    const className = [
      "slide",
      index === 0 ? "is-active" : "",
      slide.options.class,
    ]
      .filter(Boolean)
      .join(" ");
    const html = withStepCounter(() => elementHtml(slide.render()));
    return jsx("section", {
      class: className,
      "data-notes": slide.options.notes ?? "",
      style: slideStyle(slide),
      dangerouslySetInnerHTML: { __html: html },
    });
  });
  const stage = jsx(
    "div",
    {
      class: "hinote-stage",
      "data-width": String(canvas.width),
      "data-height": String(canvas.height),
    },
    ...slides,
  );
  const deck = jsx("div", { id: "deck" }, stage);
  const document = jsx(
    "html",
    { "data-page": page },
    jsx(
      "head",
      {},
      jsx("meta", { charset: "utf-8" }),
      jsx("meta", {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      }),
      jsx("title", {}, title),
      jsx("style", { dangerouslySetInnerHTML: { __html: css } }),
    ),
    jsx(
      "body",
      {},
      deck,
      page === "presenter" ? presenterPanel(slides.length, firstNotes) : null,
      page === "static" ? null : jsx("div", { id: "hinote-pointer" }),
      jsx("script", { dangerouslySetInnerHTML: { __html: SCRIPT } }),
    ),
  );
  return `<!doctype html>${elementHtml(document)}`;
}
