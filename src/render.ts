import { jsx } from "hono/jsx";
import { HtmlEscapedCallbackPhase, resolveCallback } from "hono/utils/html";
import clientScript from "./client.generated.ts";
import { loadCss, scopeCss, type CssSource, type StyleLayer } from "./css.ts";
import { HinoteError } from "./errors.ts";
// `view` and `presenter` are served by the deck and sync through it. `static` is
// the single file from `hinote build`: one audience view with no sync.
export type Page = "view" | "presenter" | "static";

// "server" and "broadcast" sync with the presenter; "reload" only hears that
// `hinote dev` reloaded the deck. Without one, a page syncs with nothing.
export type Sync = "server" | "broadcast" | "reload";
import type { Slide } from "./slide.ts";
import { numberSteps } from "./step.tsx";
import type { Transition } from "./transition.ts";
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
//
// Author CSS sits in cascade layers after `hinote` (see authorCss), so it wins over
// SLIDE_CSS whatever its selectors. FRAME_CSS is unlayered and wins over every layer:
// it holds what must not move, such as the canvas, hidden slides and steps, and the
// presenter view.

// Center sets flex:1, which fills the slide only because .slide is a column flex container.
const SLIDE_CSS = `
*{box-sizing:border-box}
.slide{display:flex;flex-direction:column;padding:calc(var(--hinote-space-unit) * 6);background:var(--hinote-color-bg);color:var(--hinote-color-fg);font-size:var(--hinote-text-body)}
:where(.slide) :is(h1,h2,h3,p){margin:0}
:where(.slide) h1{font-family:var(--hinote-font-heading);font-size:var(--hinote-text-h1);line-height:1.1}
:where(.slide) :is(h2,h3){font-family:var(--hinote-font-heading);font-size:var(--hinote-text-h2);line-height:1.2}
:where(.slide) p{font-size:var(--hinote-text-body);line-height:1.5}
:where(.slide) small{font-size:var(--hinote-text-small);color:var(--hinote-color-muted)}
:where(.slide) :is(code,pre){font-family:var(--hinote-font-mono)}
:where(.slide) pre.highlights{margin:0;padding:1em 1.25em;border-radius:var(--hinote-radius);font-size:var(--hinote-text-code);line-height:1.5;text-align:left;white-space:pre;overflow:hidden}
:where(.slide) a{color:var(--hinote-color-accent)}
`.trim();

const FRAME_CSS = `
html,body{margin:0;height:100%;overflow:hidden;background:var(--hinote-color-bg);color:var(--hinote-color-fg);font-family:var(--hinote-font-base)}
#deck{position:fixed;inset:0;display:grid;place-items:center;--hinote-scale:1}
.hinote-stage{position:relative;overflow:hidden;width:calc(var(--hinote-canvas-width) * var(--hinote-scale));height:calc(var(--hinote-canvas-height) * var(--hinote-scale))}
.slide{position:absolute;top:0;left:0;width:var(--hinote-canvas-width);height:var(--hinote-canvas-height);overflow:hidden;transform-origin:0 0;transform:scale(var(--hinote-scale))}
.slide:not(.is-active){display:none}
[data-hinote-step]{transition:opacity .2s ease}
[data-hinote-step].is-hidden{opacity:0;visibility:hidden}
.hinote-stage{view-transition-name:hinote-stage}
::view-transition-old(root),::view-transition-new(root){animation:none}
::view-transition-image-pair(hinote-stage){overflow:clip}
::view-transition-old(hinote-stage),::view-transition-new(hinote-stage){animation-duration:.35s;animation-timing-function:ease}
html[data-transition="slide"]::view-transition-old(hinote-stage){animation-name:hinote-to-left}
html[data-transition="slide"]::view-transition-new(hinote-stage){animation-name:hinote-from-right}
html[data-transition="slide"][data-direction="back"]::view-transition-old(hinote-stage){animation-name:hinote-to-right}
html[data-transition="slide"][data-direction="back"]::view-transition-new(hinote-stage){animation-name:hinote-from-left}
@keyframes hinote-to-left{to{transform:translateX(-100%)}}
@keyframes hinote-to-right{to{transform:translateX(100%)}}
@keyframes hinote-from-left{from{transform:translateX(-100%)}}
@keyframes hinote-from-right{from{transform:translateX(100%)}}
#hinote-pointer{position:fixed;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:#ff2d2d;box-shadow:0 0 16px #ff2d2d;pointer-events:none;z-index:10;opacity:0}
.hinote-thumb{position:relative;overflow:hidden;width:100%;aspect-ratio:var(--hinote-canvas-ratio);background:var(--hinote-color-bg);border-radius:6px}
.hinote-thumb>.slide{display:revert-layer}
html[data-page="presenter"] body{display:grid;grid-template-columns:minmax(0,1fr) minmax(18rem,30vw);background:#111318;color:#f4f4f5;font:16px/1.6 system-ui,sans-serif}
html[data-page="presenter"] #deck{position:relative;inset:auto;min-width:0;min-height:0;padding:1.25rem;background:#0b0d12}
html[data-page="presenter"] .hinote-stage{box-shadow:0 18px 50px rgb(0 0 0 / .45)}
#hinote-panel{display:flex;flex-direction:column;gap:.75rem;min-height:0;padding:1.25rem;overflow:hidden;background:#181b22;border-left:1px solid #2c313c}
#hinote-next{flex:none}
#hinote-notes{white-space:pre-wrap;flex:1;min-height:0;overflow:auto}
.hinote-label{margin:0;color:#a1a1aa;font-size:12px;letter-spacing:.06em;text-transform:uppercase}
#hinote-next[data-end]::after{content:"End";position:absolute;inset:0;display:grid;place-items:center;color:#71717a;background:#0b0d12}
#hinote-meta{display:flex;align-items:baseline;justify-content:space-between;gap:1rem}
#hinote-toolbar{display:flex;flex-wrap:wrap;gap:.4rem}
#hinote-toolbar button{all:unset;cursor:pointer;padding:.3rem .7rem;border:1px solid #3a4150;border-radius:6px;color:#e4e4e7;font-size:13px}
#hinote-toolbar button:hover{background:#262b36}
#hinote-toolbar button:focus-visible{outline:2px solid #38bdf8;outline-offset:2px}
#hinote-toolbar button[aria-pressed="true"]{border-color:#ff2d2d;color:#ff8a8a}
#hinote-timer{all:unset;cursor:pointer;font-size:28px;font-weight:600;font-variant-numeric:tabular-nums}
#hinote-step,#hinote-clock{margin:0;color:#a1a1aa;font-size:13px;font-variant-numeric:tabular-nums}

#hinote-overview{display:none;position:fixed;inset:0;z-index:20;overflow:auto;padding:2rem;background:rgb(10 12 16 / .96);grid-template-columns:repeat(auto-fill,minmax(16rem,1fr));gap:1.25rem;align-content:start}
#hinote-overview.is-open{display:grid}
.hinote-overview-item{all:unset;cursor:pointer;display:flex;flex-direction:column;gap:.4rem;color:#d4d4d8;font:13px system-ui,sans-serif}
.hinote-overview-item.is-current .hinote-thumb{outline:3px solid #38bdf8;outline-offset:2px}
@media print{
html,body{height:auto;overflow:visible;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html[data-page] body{display:block}
#deck,html[data-page="presenter"] #deck{position:static;display:block;padding:0}
.hinote-stage{width:auto;height:auto;overflow:visible;box-shadow:none}
.hinote-stage>.slide{display:revert-layer;position:relative;transform:none;break-after:page}
[data-hinote-step].is-hidden{opacity:1;visibility:visible}
#hinote-panel,#hinote-overview,#hinote-pointer{display:none}
}
`.trim();

// The HTML parser ends a script at the character sequence "</script".
// Replacing every "<" would also rewrite operators such as "<=".
const SCRIPT = clientScript.replace(/<\/script/gi, "\\u003c/script");

// Hono/JSX renders to a string, or to a promise of one when a component is async.
async function elementHtml(node: unknown): Promise<string> {
  if (
    !node ||
    typeof node !== "object" ||
    !("toString" in node) ||
    typeof node.toString !== "function"
  ) {
    throw new HinoteError("Slide renderers must return JSX.");
  }
  // An escaped String object can carry callbacks (Suspense, ErrorBoundary);
  // resolving them is what Hono itself does before sending a response.
  const rendered = (await node.toString()) as unknown;
  // Hono's escaped strings are String objects made in this realm.
  // oxlint-disable-next-line unicorn/no-instanceof-builtins
  if (typeof rendered !== "string" && !(rendered instanceof String))
    throw new HinoteError("Slide renderers must return JSX.");
  return resolveCallback(
    rendered as string,
    HtmlEscapedCallbackPhase.Stringify,
    false,
    {},
  );
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
      jsx(
        "div",
        { id: "hinote-toolbar", role: "toolbar", "aria-label": "Presenter" },
        jsx(
          "button",
          { type: "button", "data-action": "prev", title: "Previous (←)" },
          "← Prev",
        ),
        jsx(
          "button",
          { type: "button", "data-action": "next", title: "Next (→)" },
          "Next →",
        ),
        jsx(
          "button",
          { type: "button", "data-action": "overview", title: "Overview (O)" },
          "Overview",
        ),
        jsx(
          "button",
          {
            type: "button",
            "data-action": "laser",
            "aria-pressed": "false",
            title: "Laser pointer (L)",
          },
          "Laser",
        ),
      ),
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
      jsx("p", { class: "hinote-label" }, "← → move · O overview · L laser"),
    ),
    jsx("div", { id: "hinote-overview" }),
  ];
}

// Layers, weakest first: hinote's SLIDE_CSS, then the top-level deck (hinote-0),
// nested decks by depth (hinote-1, ...), then each slide's own (hinote-slide).
// Each layer reaches only its slides: they carry its id in data-hinote-css.
async function authorCss(
  slides: readonly Slide[],
  deckCss: readonly CssSource[] | undefined,
): Promise<{ css: string; scopes: (string | undefined)[] }> {
  const layers = new Map<StyleLayer, { id: string; depth: number }>();
  for (const slide of slides) {
    for (const [index, layer] of (slide.styles ?? []).entries()) {
      if (!layers.has(layer))
        layers.set(layer, { id: `d${layers.size}`, depth: index + 1 });
    }
  }
  const scope = (id: string) => `:where(.slide[data-hinote-css~="${id}"])`;
  const blocks: string[] = [`@layer hinote{${SLIDE_CSS}}`];
  if (deckCss)
    blocks.push(
      `@layer hinote-0{${scopeCss(await loadCss(deckCss), ":where(.slide)", "Deck css")}}`,
    );
  for (const [layer, { id, depth }] of layers)
    blocks.push(
      `@layer hinote-${depth}{${scopeCss(await loadCss(layer.sources), scope(id), "Nested deck css")}}`,
    );
  const scopes: (string | undefined)[] = [];
  for (const [index, slide] of slides.entries()) {
    const ids = (slide.styles ?? []).map((layer) => layers.get(layer)?.id);
    if (slide.options.css) {
      ids.push(`s${index}`);
      blocks.push(
        `@layer hinote-slide{${scopeCss(await loadCss(slide.options.css), scope(`s${index}`), `Slide ${index + 1} css`)}}`,
      );
    }
    scopes.push(ids.length > 0 ? ids.join(" ") : undefined);
  }
  const depth = Math.max(
    0,
    ...[...layers.values()].map((layer) => layer.depth),
  );
  const order = Array.from({ length: depth + 1 }, (_, i) => `hinote-${i}`);
  return {
    css: [`@layer hinote,${order.join(",")},hinote-slide;`, ...blocks].join(
      "\n",
    ),
    scopes,
  };
}

export async function renderDeck(input: {
  slides: readonly Slide[];
  theme?: Theme;
  title?: string;
  canvas?: { width: number; height: number };
  transition?: Transition;
  css?: readonly CssSource[];
  page?: Page;
  base?: string;
  // How served pages sync: through the deck's server, or, for pages
  // prerendered onto a static host, between windows of one browser.
  sync?: Sync;
  // Prerendered pages are directories on a static host, so their URLs end in "/".
  directories?: boolean;
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
  const author = await authorCss(input.slides, input.css);
  // Printing gives one page per slide at canvas size, which "Save as PDF" turns into a PDF.
  const css = `${themeCss(theme)}
:root{--hinote-canvas-width:${canvas.width}px;--hinote-canvas-height:${canvas.height}px;--hinote-canvas-ratio:${canvas.width} / ${canvas.height}}
@page{size:${canvas.width}px ${canvas.height}px;margin:0}
${author.css}
${FRAME_CSS}`;
  // Slides render one after another, so an error names the first broken slide.
  const slides = [];
  for (const [index, slide] of input.slides.entries()) {
    const className = [
      "slide",
      index === 0 ? "is-active" : "",
      slide.options.class,
    ]
      .filter(Boolean)
      .join(" ");
    const html = numberSteps(await elementHtml(await slide.render()));
    slides.push(
      jsx("section", {
        class: className,
        // Notes are for the presenter; other pages never carry them.
        "data-notes":
          page === "presenter" ? (slide.options.notes ?? "") : undefined,
        "data-hinote-css": author.scopes[index],
        "data-transition":
          slide.options.transition ?? input.transition ?? "none",
        style: slideStyle(slide),
        dangerouslySetInnerHTML: { __html: html },
      }),
    );
  }
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
    {
      "data-page": page,
      "data-sync": page !== "static" ? input.sync : undefined,
      "data-paths": input.directories ? "directories" : undefined,
    },
    jsx(
      "head",
      {},
      jsx("meta", { charset: "utf-8" }),
      jsx("meta", {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      }),
      input.base === undefined ? null : jsx("base", { href: `${input.base}/` }),
      jsx("title", {}, title),
      jsx("style", { dangerouslySetInnerHTML: { __html: css } }),
    ),
    jsx(
      "body",
      {},
      deck,
      page === "presenter" ? presenterPanel(slides.length, firstNotes) : null,
      page !== "static" &&
        (input.sync === "server" || input.sync === "broadcast")
        ? jsx("div", { id: "hinote-pointer" })
        : null,
      jsx("script", { dangerouslySetInnerHTML: { __html: SCRIPT } }),
    ),
  );
  return `<!doctype html>${await elementHtml(document)}`;
}
