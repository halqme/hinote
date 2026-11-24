import { jsx } from "hono/jsx";
import { HtmlEscapedCallbackPhase, resolveCallback } from "hono/utils/html";
import clientScript from "../client/main.generated.ts";
import { loadCss, scopeCss, type CssSource, type StyleLayer } from "./css.ts";
import { HinoteError } from "../errors.ts";
// `view` and `presenter` are served by the deck and sync through it. `static` is
// the single file from `hinote build`: one audience view with no sync.
export type Page = "view" | "presenter" | "static";

// "server" and "broadcast" sync with the presenter; "reload" only hears that
// `hinote dev` reloaded the deck. Without one, a page syncs with nothing.
export type Sync = "server" | "broadcast" | "reload";
import type { Theme } from "@hinote/types";
import type { Slide } from "./slide.ts";
import { numberSteps } from "../components/step.tsx";
import { servedPath, slideHash } from "../client/location.ts";
import type { Transition } from "./transition.ts";
import {
  defaultTheme,
  mergeTheme,
  parseTheme,
  themeCss,
  themeDeclarations,
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
// Row / Column / Center put flex props on these classes (not on style=) so deck CSS in a
// later layer can override them. Props only set --hinote-gap / --hinote-align / --hinote-justify.
// Grid lays out Cards; each Card uses subgrid so cards in a band share row heights.
// Every Card spans the band's largest row count, so a footer in the last track lines up.
// Flow puts an arrow between boxes; the arrow is ::before content deck CSS can replace.
// Table widths are a --hinote-column-width variable per <col>; the width rule is here.
const SLIDE_CSS = `
*{box-sizing:border-box}
.slide{display:flex;flex-direction:column;padding:var(--hinote-space-safe);background:var(--hinote-color-bg);color:var(--hinote-color-fg);font-size:var(--hinote-text-body)}
.hinote-row,.hinote-column,.hinote-center{display:flex;width:100%;gap:var(--hinote-gap,normal)}
.hinote-row{flex-direction:row;align-items:var(--hinote-align,stretch);justify-content:var(--hinote-justify,start)}
.hinote-column{flex-direction:column;align-items:var(--hinote-align,stretch);justify-content:var(--hinote-justify,start)}
.hinote-center{flex:1;flex-direction:column;align-items:var(--hinote-align,center);justify-content:var(--hinote-justify,center)}
.hinote-grid{display:grid;width:100%;grid-template-columns:repeat(var(--hinote-grid-columns,2),minmax(0,1fr));gap:var(--hinote-gap,calc(var(--hinote-space-unit) * 3))}
.hinote-card{display:grid;grid-template-rows:subgrid;grid-row:span max(var(--hinote-card-rows,1),var(--hinote-grid-rows,1));grid-column:span var(--hinote-card-span,1);min-width:0;background:var(--hinote-color-surface);color:var(--hinote-color-fg);border:1px solid var(--hinote-color-border);border-radius:var(--hinote-radius)}
.hinote-card-cell{min-width:0;min-height:0;padding:calc(var(--hinote-space-unit) * 2)}
.hinote-card-footer{grid-row:-2/-1;align-self:end}
.hinote-flow{display:flex;align-items:stretch;width:100%;gap:var(--hinote-gap,calc(var(--hinote-space-unit) * 2))}
.hinote-flow-box{flex:1 1 0;min-width:0;display:flex;flex-direction:column;justify-content:center;padding:calc(var(--hinote-space-unit) * 3);background:var(--hinote-color-surface);color:var(--hinote-color-fg);border:1px solid var(--hinote-color-border);border-radius:var(--hinote-radius)}
.hinote-flow-box.is-emphasis{border-color:var(--hinote-color-accent);box-shadow:inset 0 0 0 2px var(--hinote-color-accent)}
.hinote-flow-arrow{flex:none;align-self:center;color:var(--hinote-color-muted);font-size:var(--hinote-text-h2);line-height:1}
.hinote-flow-arrow::before{content:"→"}
.hinote-table{width:100%;border-collapse:collapse;font-size:var(--hinote-text-body);line-height:1.4}
.hinote-table[data-hinote-widths]{table-layout:fixed}
.hinote-table col{width:var(--hinote-column-width,auto)}
.hinote-table :is(th,td){padding:var(--hinote-space-unit) calc(var(--hinote-space-unit) * 2);text-align:left;vertical-align:top;border-bottom:1px solid var(--hinote-color-border)}
.hinote-table thead th{font-weight:700;border-bottom-width:2px}
.hinote-table tr.is-emphasis{background:var(--hinote-color-surface);font-weight:700}
.hinote-table tr.is-emphasis>:first-child{box-shadow:inset 4px 0 0 var(--hinote-color-accent)}
:where(.slide) :is(h1,h2,h3,p){margin:0}
:where(.slide) h1{font-family:var(--hinote-font-heading);font-size:var(--hinote-text-h1);line-height:1.1}
:where(.slide) h2{font-family:var(--hinote-font-heading);font-size:var(--hinote-text-h2);line-height:1.2}
:where(.slide) h3{font-family:var(--hinote-font-heading);font-size:var(--hinote-text-h3);line-height:1.25}
:where(.slide) p{font-size:var(--hinote-text-body);line-height:1.5}
:where(.slide) :is(ul,ol){margin:0.4em 0;padding-left:1.4em;font-size:var(--hinote-text-body);line-height:1.45}
:where(.slide) li+li{margin-top:0.25em}
:where(.slide) small{font-size:var(--hinote-text-small);color:var(--hinote-color-muted)}
:where(.slide) :is(code,pre){font-family:var(--hinote-font-mono)}
:where(.slide:lang(ja)){word-break:auto-phrase}
:where(.slide:lang(ja)) :is(code,pre){word-break:normal}
:where(.slide) pre.highlights{margin:0;padding:1em 1.25em;border:1px solid var(--hinote-color-border);border-radius:var(--hinote-radius);background:var(--hinote-color-surface);font-size:var(--hinote-text-code);line-height:1.5;text-align:left;white-space:pre;overflow:hidden}
:where(.slide) a{color:var(--hinote-color-accent)}
:where(.slide) .hinote-page{position:absolute;right:calc(var(--hinote-space-unit) * 4);bottom:calc(var(--hinote-space-unit) * 3);margin:0;color:var(--hinote-color-muted);font-size:var(--hinote-text-small);font-variant-numeric:tabular-nums}
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
html[data-page="presenter"] body{display:grid;grid-template-columns:minmax(0,1fr) minmax(17rem,26rem);grid-template-rows:minmax(0,1fr) auto;background:#111318;color:#f4f4f5;font:16px/1.5 system-ui,sans-serif}
html[data-page="presenter"] #deck{grid-column:1;grid-row:1;position:relative;inset:auto;min-width:0;min-height:0;padding:1.25rem;background:#0b0d12}
html[data-page="presenter"] .hinote-stage{box-shadow:0 18px 50px rgb(0 0 0 / .45)}
html[data-page="presenter"] #hinote-panel{grid-column:2;grid-row:1 / -1}
html[data-page="presenter"] #hinote-toolbar{grid-column:1;grid-row:2;padding:0 1.25rem 1.1rem;background:#0b0d12}
#hinote-panel{display:flex;flex-direction:column;gap:.75rem;min-width:0;min-height:0;padding:1.1rem 1.25rem;overflow:hidden;background:#181b22;border-left:1px solid #2c313c}
#hinote-indicator{display:flex;gap:4px;height:8px;margin:0}
#hinote-indicator span{flex:1;min-width:0;border-radius:99px;background:#2a303b;overflow:hidden}
#hinote-indicator span::before{content:"";display:block;height:100%;width:calc(var(--hinote-fill, 0) * 100%);background:#71717a}
#hinote-indicator span[data-state="current"]{box-shadow:inset 0 0 0 1px #e4e4e7}
#hinote-indicator span[data-state="current"]::before{background:#f4f4f5}
#hinote-indicator span[data-state="past"]::before{background:#a1a1aa}
#hinote-next{flex:none;width:100%}
#hinote-notes{flex:1;min-height:0;overflow:auto;white-space:pre-wrap;padding:.9rem 0 0;border-top:1px solid #2c313c;font-size:1rem;line-height:1.45}
#hinote-notes:empty{display:none}
#hinote-notes>*{margin:0 0 .75em}
#hinote-notes :is(h1,h2,h3,h4,h5,h6){margin-bottom:.25em;font-size:1rem;font-weight:600;line-height:1.25;color:#fff}
#hinote-notes :is(ul,ol){padding-left:1.3em;white-space:normal}
#hinote-notes li+li{margin-top:.2em}
#hinote-notes strong{color:#fff}
#hinote-notes code{font-family:ui-monospace,monospace;font-size:.92em;padding:0 .25em;border-radius:3px;background:#262b36}
#hinote-next[data-end]::after{content:"End";position:absolute;inset:0;display:grid;place-items:center;color:#71717a;background:#0b0d12}
#hinote-meta{display:flex;align-items:baseline;justify-content:space-between;gap:1rem}
#hinote-toolbar{display:flex;flex-wrap:wrap;gap:.4rem}
#hinote-toolbar button{all:unset;cursor:pointer;padding:.3rem .7rem;border:1px solid #3a4150;border-radius:6px;color:#e4e4e7;font-size:13px}
#hinote-toolbar button:hover{background:#262b36}
#hinote-toolbar button:focus-visible{outline:2px solid #38bdf8;outline-offset:2px}
#hinote-toolbar button[aria-pressed="true"]{border-color:#ff2d2d;color:#ff8a8a}
#hinote-toolbar u{text-decoration:underline;text-underline-offset:2px}
#hinote-timer{all:unset;cursor:pointer;font-size:28px;font-weight:600;font-variant-numeric:tabular-nums}
#hinote-clock{margin:0;color:#a1a1aa;font-size:13px;font-variant-numeric:tabular-nums}

#hinote-overview{display:none;position:fixed;inset:0;z-index:20;overflow:auto;padding:2rem;background:rgb(10 12 16 / .96);grid-template-columns:repeat(auto-fill,minmax(16rem,1fr));gap:1.25rem;align-content:start}
#hinote-overview.is-open{display:grid}
.hinote-overview-item{all:unset;cursor:pointer;display:flex;flex-direction:column;gap:.4rem;min-width:0;color:#d4d4d8;font:13px system-ui,sans-serif}
.hinote-overview-label{overflow-wrap:break-word}
.hinote-overview-item.is-current .hinote-thumb{outline:3px solid #38bdf8;outline-offset:2px}
@media print{
html,body{height:auto;overflow:visible;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html[data-page] body{display:block}
#deck,html[data-page="presenter"] #deck{position:static;display:block;padding:0}
.hinote-stage{width:auto;height:auto;overflow:visible;box-shadow:none}
.hinote-stage>.slide{display:revert-layer;position:relative;transform:none;break-after:page}
[data-hinote-step].is-hidden{opacity:1;visibility:visible}
#hinote-panel,#hinote-notes,#hinote-toolbar,#hinote-overview,#hinote-pointer{display:none}
}
`.trim();

// The HTML parser ends a script at the character sequence "</script".
// Replacing every "<" would also rewrite operators such as "<=".
const SCRIPT = clientScript.replace(/<\/script/gi, "\\u003c/script");

// Hono/JSX renders to a string, or to a promise of one when a component is async.
async function elementHtml(node: unknown): Promise<string> {
  // Read without binding: it is called on the node below.
  const toHtml: unknown =
    node && typeof node === "object"
      ? Reflect.get(node, "toString")
      : undefined;
  if (typeof toHtml !== "function")
    throw new HinoteError("Slide renderers must return JSX.");
  // An escaped String object can carry callbacks (Suspense, ErrorBoundary);
  // resolving them is what Hono itself does before sending a response.
  const rendered: unknown = await toHtml.call(node);
  // Hono's escaped strings are String objects made in this realm.
  // oxlint-disable-next-line unicorn/no-instanceof-builtins
  if (typeof rendered !== "string" && !(rendered instanceof String))
    throw new HinoteError("Slide renderers must return JSX.");
  return resolveCallback(
    // Hono types its escaped strings as primitives, but they are String
    // objects, and converting one would drop its callbacks.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
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

// Filled in by the client: the progress indicator, the next preview, the timer,
// and the overview. Notes stay in the side column. The toolbar sits under the slide.
function presenterPanel(slideCount: number, notes: string) {
  const where = slideCount > 0 ? `Slide 1 of ${slideCount}` : undefined;
  return [
    jsx(
      "aside",
      { id: "hinote-panel" },
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
        "div",
        { id: "hinote-indicator", role: "img", "aria-label": where },
        Array.from({ length: slideCount }, (_, index) =>
          jsx("span", {
            "data-state": index === 0 ? "current" : "future",
            style: `--hinote-fill:${index === 0 ? 1 : 0}`,
          }),
        ),
      ),
      jsx("div", { id: "hinote-next", class: "hinote-thumb" }),
      jsx("div", { id: "hinote-notes" }, notes),
    ),
    jsx(
      "div",
      { id: "hinote-toolbar", role: "toolbar", "aria-label": "Presenter" },
      jsx(
        "button",
        { type: "button", "data-action": "prev", title: "Previous (P, ←)" },
        jsx("u", {}, "←"),
        " ",
        jsx("u", {}, "P"),
        "rev",
      ),
      jsx(
        "button",
        { type: "button", "data-action": "next", title: "Next (N, →)" },
        jsx("u", {}, "N"),
        "ext ",
        jsx("u", {}, "→"),
      ),
      jsx(
        "button",
        { type: "button", "data-action": "overview", title: "Overview (O)" },
        jsx("u", {}, "O"),
        "verview",
      ),
      jsx(
        "button",
        {
          type: "button",
          "data-action": "laser",
          "aria-pressed": "false",
          title: "Laser pointer (L)",
        },
        jsx("u", {}, "L"),
        "aser",
      ),
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

// Gives each <Link> an href for this page. Link writes data-hinote-to first
// and checks the id against SLIDE_ID, so the attribute is matched as written.
function linkSlides(html: string, href: (target: string) => string): string {
  return html.replace(
    /<a data-hinote-to="([\w-]+)"/g,
    (_, target: string) =>
      `<a href="${href(target)}" data-hinote-to="${target}"`,
  );
}

export async function renderDeck(input: {
  slides: readonly Slide[];
  theme?: Theme;
  title?: string;
  lang?: string;
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
  // Position of each slide in the whole deck, after nested decks are flattened.
  // Present only when the deck asked for page numbers. Same length as `slides`.
  pageNumbers?: readonly number[];
  pageCount?: number;
  // Slide ids of the whole deck and their flattened index, for <Link to>.
  // Rendering one slide alone still resolves links to the others.
  targets?: ReadonlyMap<string, number>;
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
    const html = linkSlides(
      numberSteps(
        await elementHtml(
          await slide.render({
            title: slide.options.title,
            sections: slide.sections ?? [],
          }),
        ),
      ),
      (target) => {
        const to = input.targets?.get(target);
        if (to === undefined)
          throw new HinoteError(
            `Slide ${index + 1} links to "${target}", but no slide has that id.`,
            { hint: `Give the slide createSlide({ id: "${target}" }, ...).` },
          );
        return page === "static"
          ? slideHash(to)
          : servedPath(
              input.base ?? "",
              page === "presenter" ? "presenter" : "view",
              to,
              input.directories,
            );
      },
    );
    const pageNumber = input.pageNumbers?.[index];
    const pageHtml =
      pageNumber !== undefined && slide.options.pageNumber !== false
        ? `<p class="hinote-page">${pageNumber} / ${input.pageCount}</p>`
        : "";
    slides.push(
      jsx("section", {
        class: className,
        "data-hinote-id": slide.options.id,
        // Notes and titles stay on the presenter page: notes in the side column,
        // titles on the overview.
        "data-notes":
          page === "presenter" ? (slide.options.notes ?? "") : undefined,
        "data-title": page === "presenter" ? slide.options.title : undefined,
        "data-hinote-css": author.scopes[index],
        "data-transition":
          slide.options.transition ?? input.transition ?? "none",
        style: slideStyle(slide),
        dangerouslySetInnerHTML: { __html: html + pageHtml },
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
      lang: input.lang,
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
