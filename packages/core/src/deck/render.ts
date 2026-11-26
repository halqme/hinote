import { jsx } from "hono/jsx";
import clientScript from "../client/script.ts";
import { loadCss, scopeCss, type CssSource, type StyleLayer } from "./css.ts";
import { HinoteError } from "../errors.ts";
// `view` and `presenter` are the pages the deck serves, one slide each, and
// sync through it. `static` is the single file from `hinote build --single`:
// one audience view of every slide with no sync.
export type Page = "view" | "presenter" | "static";

// "server" and "broadcast" sync with the presenter; "reload" only hears that
// `hinote dev` reloaded the deck. Without one, a page syncs with nothing.
export type Sync = "server" | "broadcast" | "reload";
import type { SlideContext, Theme } from "@hinote/types";
import type { Slide } from "./slide.ts";
import { numberSteps } from "../components/step.tsx";
import { slideHash, slideHref } from "../client/location.ts";
import { transitionData, type Transition } from "./transition.ts";
import { repeatedMorph } from "../components/morph.tsx";
import { gatherScripts } from "../components/script.tsx";
import {
  citationOrder,
  listedSources,
  numberCitations,
} from "../components/cite.tsx";
import { elementHtml } from "../components/html.ts";
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
// Contents lists name then title on one line, nested sections indented, the current one in accent.
// SectionBar, SectionDots, and Progress are small and muted, with the current part in accent.
// Progress fills to --hinote-progress and marks each section start at --hinote-at.
// Their lists space items with gap, so the base li+li margin is reset.
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
.hinote-contents ol{display:flex;flex-direction:column;gap:calc(var(--hinote-space-unit) * 1.5);margin:0;padding:0;list-style:none}
.hinote-contents li,.hinote-section-bar li,.hinote-section-dots li{margin:0}
.hinote-contents ol ol{margin-top:calc(var(--hinote-space-unit) * 1.5);padding-left:calc(var(--hinote-space-unit) * 4);font-size:.85em}
.hinote-contents-entry{display:flex;flex-wrap:wrap;align-items:baseline;gap:0 calc(var(--hinote-space-unit) * 2);color:inherit;text-decoration:none}
.hinote-contents-name{font-weight:700}
.hinote-contents-title{color:var(--hinote-color-muted)}
.hinote-contents-item.is-current>.hinote-contents-entry .hinote-contents-name{color:var(--hinote-color-accent)}
.hinote-section-bar ol{display:flex;flex-wrap:wrap;gap:0 calc(var(--hinote-space-unit) * 3);margin:0;padding:0;list-style:none}
.hinote-section-bar-name{color:var(--hinote-color-muted);text-decoration:none}
.hinote-section-bar-item.is-current .hinote-section-bar-name{color:var(--hinote-color-accent)}
.hinote-section-dots{display:flex;flex-wrap:wrap;gap:calc(var(--hinote-space-unit) * .75);margin:0;padding:0;list-style:none}
.hinote-section-dots li{width:calc(var(--hinote-space-unit) * 1.25);height:calc(var(--hinote-space-unit) * 1.25);border:1px solid var(--hinote-color-muted);border-radius:50%}
.hinote-section-dots li.is-current{background:var(--hinote-color-accent);border-color:var(--hinote-color-accent)}
.hinote-progress{position:relative;width:100%;height:calc(var(--hinote-space-unit) * .75);background:var(--hinote-color-border)}
.hinote-progress-bar{position:absolute;inset:0 auto 0 0;width:calc(var(--hinote-progress) * 100%);background:var(--hinote-color-accent)}
.hinote-progress-tick{position:absolute;top:0;bottom:0;left:calc(var(--hinote-at) * 100%);width:2px;background:var(--hinote-color-bg)}
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
.hinote-cite{white-space:nowrap}
.hinote-references{list-style:none;padding-left:0}
.hinote-references>li{padding-left:2.5em;text-indent:-2.5em}
.hinote-references>li::before{content:"[" attr(value) "]";display:inline-block;width:2.5em;text-indent:0}
:where(.slide) .hinote-page{position:absolute;right:calc(var(--hinote-space-unit) * 4);bottom:calc(var(--hinote-space-unit) * 3);margin:0;color:var(--hinote-color-muted);font-size:var(--hinote-text-small);font-variant-numeric:tabular-nums}
`.trim();

const FRAME_CSS = `
html,body{margin:0;height:100%;overflow:hidden;background:var(--hinote-color-bg);color:var(--hinote-color-fg);font-family:var(--hinote-font-base)}
#deck{position:fixed;inset:0;display:grid;place-items:center;--hinote-scale:1}
.hinote-stage{position:relative;overflow:hidden;width:calc(var(--hinote-canvas-width) * var(--hinote-scale));height:calc(var(--hinote-canvas-height) * var(--hinote-scale))}
.slide{position:absolute;top:0;left:0;width:var(--hinote-canvas-width);height:var(--hinote-canvas-height);overflow:hidden;transform-origin:0 0;transform:scale(var(--hinote-scale))}
.slide:not(.is-active){display:none}
[data-hinote-step]{transition:opacity .2s ease,translate .3s ease,scale .3s ease}
[data-hinote-step].is-hidden{opacity:0;visibility:hidden}
[data-hinote-effect="up"].is-hidden{translate:0 .6em}
[data-hinote-effect="down"].is-hidden{translate:0 -.6em}
[data-hinote-effect="left"].is-hidden{translate:.6em 0}
[data-hinote-effect="right"].is-hidden{translate:-.6em 0}
[data-hinote-effect="zoom"].is-hidden{scale:.85}
@media (prefers-reduced-motion:reduce){[data-hinote-step]{transition:none}}
.hinote-stage{view-transition-name:hinote-stage}
::view-transition-old(root),::view-transition-new(root){animation:none}
::view-transition-image-pair(hinote-stage){overflow:clip}
::view-transition-group(*),::view-transition-old(*),::view-transition-new(*){animation-duration:var(--hinote-transition-duration,.35s);animation-timing-function:var(--hinote-transition-easing,ease)}
html[data-transition="none"]::view-transition-old(hinote-stage){animation:none;opacity:0}
html[data-transition="none"]::view-transition-new(hinote-stage){animation:none}
html:is([data-transition="slide"],[data-transition="slide-up"],[data-transition="wipe"])::view-transition-old(hinote-stage),html:is([data-transition="slide"],[data-transition="slide-up"],[data-transition="wipe"])::view-transition-new(hinote-stage){mix-blend-mode:normal}
html[data-transition="slide"]::view-transition-old(hinote-stage){animation-name:hinote-to-left}
html[data-transition="slide"]::view-transition-new(hinote-stage){animation-name:hinote-from-right}
html[data-transition="slide"][data-direction="back"]::view-transition-old(hinote-stage){animation-name:hinote-to-right}
html[data-transition="slide"][data-direction="back"]::view-transition-new(hinote-stage){animation-name:hinote-from-left}
html[data-transition="slide-up"]::view-transition-old(hinote-stage){animation-name:hinote-to-top}
html[data-transition="slide-up"]::view-transition-new(hinote-stage){animation-name:hinote-from-bottom}
html[data-transition="slide-up"][data-direction="back"]::view-transition-old(hinote-stage){animation-name:hinote-to-bottom}
html[data-transition="slide-up"][data-direction="back"]::view-transition-new(hinote-stage){animation-name:hinote-from-top}
html[data-transition="zoom"]::view-transition-old(hinote-stage){animation-name:hinote-zoom-past}
html[data-transition="zoom"]::view-transition-new(hinote-stage){animation-name:hinote-zoom-near}
html[data-transition="zoom"][data-direction="back"]::view-transition-old(hinote-stage){animation-name:hinote-zoom-away}
html[data-transition="zoom"][data-direction="back"]::view-transition-new(hinote-stage){animation-name:hinote-zoom-back}
html[data-transition="wipe"]::view-transition-old(hinote-stage){animation:none}
html[data-transition="wipe"]::view-transition-new(hinote-stage){animation-name:hinote-wipe-left}
html[data-transition="wipe"][data-direction="back"]::view-transition-new(hinote-stage){animation-name:hinote-wipe-right}
@keyframes hinote-to-left{to{transform:translateX(-100%)}}
@keyframes hinote-to-right{to{transform:translateX(100%)}}
@keyframes hinote-from-left{from{transform:translateX(-100%)}}
@keyframes hinote-from-right{from{transform:translateX(100%)}}
@keyframes hinote-to-top{to{transform:translateY(-100%)}}
@keyframes hinote-to-bottom{to{transform:translateY(100%)}}
@keyframes hinote-from-top{from{transform:translateY(-100%)}}
@keyframes hinote-from-bottom{from{transform:translateY(100%)}}
@keyframes hinote-zoom-past{to{transform:scale(1.15);opacity:0}}
@keyframes hinote-zoom-near{from{transform:scale(.85);opacity:0}}
@keyframes hinote-zoom-away{to{transform:scale(.85);opacity:0}}
@keyframes hinote-zoom-back{from{transform:scale(1.15);opacity:0}}
@keyframes hinote-wipe-left{from{clip-path:inset(0 0 0 100%)}to{clip-path:inset(0)}}
@keyframes hinote-wipe-right{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0)}}
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
#hinote-nav button,#hinote-fullscreen{all:unset;cursor:pointer;display:grid;place-items:center;width:2.25rem;height:2.25rem;border:1px solid #3a4150;border-radius:6px;color:#e4e4e7;background:rgb(17 19 24 / .85)}
#hinote-nav{position:fixed;left:50%;bottom:1rem;z-index:5;transform:translateX(-50%);display:flex;gap:.4rem}
#hinote-fullscreen{position:fixed;right:1rem;bottom:1rem;z-index:5}
#hinote-nav,#hinote-fullscreen{opacity:0;pointer-events:none}
#hinote-nav.is-shown,#hinote-fullscreen.is-shown,#hinote-nav:hover,#hinote-fullscreen:hover,#hinote-nav:focus-within,#hinote-fullscreen:focus-within{opacity:1;pointer-events:auto}
#hinote-nav button:hover,#hinote-fullscreen:hover{background:#262b36}
#hinote-nav button:focus-visible,#hinote-fullscreen:focus-visible{outline:2px solid #38bdf8;outline-offset:2px}
#hinote-nav svg,#hinote-fullscreen svg{width:1.25rem;height:1.25rem}
#hinote-fullscreen svg[data-icon="exit"]{display:none}
#hinote-fullscreen[aria-pressed="true"] svg[data-icon="enter"]{display:none}
#hinote-fullscreen[aria-pressed="true"] svg[data-icon="exit"]{display:block}
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
[data-hinote-step].is-hidden{opacity:1;visibility:visible;translate:none;scale:none}
#hinote-panel,#hinote-notes,#hinote-toolbar,#hinote-nav,#hinote-fullscreen,#hinote-overview,#hinote-pointer{display:none}
}
`.trim();

// The HTML parser ends a script at the character sequence "</script".
// Replacing every "<" would also rewrite operators such as "<=".
const SCRIPT = clientScript.replace(/<\/script/gi, "\\u003c/script");

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

// IconOven's fullscreen and exit-fullscreen (MIT), inlined so the page does not
// fetch them. https://iconoven.com/icons
const FULLSCREEN_ENTER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" data-icon="enter" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.75 8.75v-3a2 2 0 0 1 2-2h3m11.5 11.5v3a2 2 0 0 1-2 2h-3m0-16.5h3a2 2 0 0 1 2 2v3m-11.5 11.5h-3a2 2 0 0 1-2-2v-3"/></svg>`;
const FULLSCREEN_EXIT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" data-icon="exit" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8.75 3.75v3a2 2 0 0 1-2 2h-3m11.5 11.5v-3a2 2 0 0 1 2-2h3m0-6.5h-3a2 2 0 0 1-2-2v-3m-11.5 11.5h3a2 2 0 0 1 2 2v3"/></svg>`;
const CHEVRON_LEFT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 5.25L8.25 12L15 18.75"/></svg>`;
const CHEVRON_RIGHT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5.25L15.75 12L9 18.75"/></svg>`;

// The built file has no presenter, so previous and next float over the slide.
// The audience page can fill the screen. The icon switches while it has.
// Both stay hidden until the pointer moves.
function audienceChrome(page: Page) {
  if (page === "static")
    return jsx(
      "div",
      { id: "hinote-nav", role: "toolbar", "aria-label": "Slides" },
      jsx("button", {
        type: "button",
        "data-action": "prev",
        "aria-label": "Previous",
        dangerouslySetInnerHTML: { __html: CHEVRON_LEFT },
      }),
      jsx("button", {
        type: "button",
        "data-action": "next",
        "aria-label": "Next",
        dangerouslySetInnerHTML: { __html: CHEVRON_RIGHT },
      }),
    );
  return jsx("button", {
    id: "hinote-fullscreen",
    type: "button",
    "aria-pressed": "false",
    "aria-label": "Full screen",
    title: "Full screen (F)",
    dangerouslySetInnerHTML: {
      __html: FULLSCREEN_ENTER + FULLSCREEN_EXIT,
    },
  });
}

// Layers, weakest first: hinote's SLIDE_CSS, then the top-level deck (hinote-0),
// nested decks by depth (hinote-1, ...), then each slide's own (hinote-slide).
// Each layer reaches only its slides: they carry its id in data-hinote-css.
// Ids count through the whole deck, so a slide drawn by itself on its own page
// never shares an id with the slide it replaces.
async function authorCss(
  slides: readonly Slide[],
  deckCss: readonly CssSource[] | undefined,
): Promise<{
  css: string;
  slideCss: string[][];
  scopes: (string | undefined)[];
}> {
  const layers = new Map<StyleLayer, { id: string; depth: number }>();
  for (const slide of slides) {
    for (const [index, layer] of (slide.styles ?? []).entries()) {
      if (!layers.has(layer))
        layers.set(layer, { id: `d${layers.size}`, depth: index + 1 });
    }
  }
  const scope = (id: string) => `:where(.slide[data-hinote-css~="${id}"])`;
  const layerCss = new Map<StyleLayer, string>();
  for (const [layer, { id, depth }] of layers)
    layerCss.set(
      layer,
      `@layer hinote-${depth}{${scopeCss(await loadCss(layer.sources), scope(id), "Nested deck css")}}`,
    );
  const scopes: (string | undefined)[] = [];
  const slideCss: string[][] = [];
  for (const [index, slide] of slides.entries()) {
    const ids = (slide.styles ?? []).map((layer) => layers.get(layer)?.id);
    const blocks = (slide.styles ?? []).map(
      (layer) => layerCss.get(layer) ?? "",
    );
    if (slide.options.css) {
      ids.push(`s${index}`);
      blocks.push(
        `@layer hinote-slide{${scopeCss(await loadCss(slide.options.css), scope(`s${index}`), `Slide ${index + 1} css`)}}`,
      );
    }
    scopes.push(ids.length > 0 ? ids.join(" ") : undefined);
    slideCss.push(blocks);
  }
  const depth = Math.max(
    0,
    ...[...layers.values()].map((layer) => layer.depth),
  );
  const order = Array.from({ length: depth + 1 }, (_, i) => `hinote-${i}`);
  const blocks = [
    `@layer hinote,${order.join(",")},hinote-slide;`,
    `@layer hinote{${SLIDE_CSS}}`,
  ];
  if (deckCss)
    blocks.push(
      `@layer hinote-0{${scopeCss(await loadCss(deckCss), ":where(.slide)", "Deck css")}}`,
    );
  return { css: blocks.join("\n"), slideCss, scopes };
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

// Which pages a slide is drawn for. Presenter pages carry notes and titles,
// and each kind links to its own pages: "static" to the hash of the one file.
export type Drawing = "view" | "presenter" | "static";

export type DeckInput = {
  slides: readonly Slide[];
  theme?: Theme;
  title?: string;
  lang?: string;
  canvas?: { width: number; height: number };
  transition?: Transition;
  css?: readonly CssSource[];
  // Position of each slide in the whole deck, after nested decks are flattened.
  // Present only when the deck asked for page numbers. Same length as `slides`.
  pageNumbers?: readonly number[];
  pageCount?: number;
  // Slide ids of the whole deck and their flattened index, for <Link to>.
  // Rendering one slide alone still resolves links to the others.
  targets?: ReadonlyMap<string, number>;
  // Where each slide is in the whole deck and the sections as it sees them,
  // so one slide rendered alone still lists every section.
  place: (slide: Slide) => Pick<SlideContext, "contents" | "number" | "total">;
};

// What every page of a deck is made from, worked out once from all its slides:
// the stylesheet they share, each slide's own CSS, and each slide drawn.
export type DrawnDeck = {
  drawing: Drawing;
  title: string;
  lang?: string;
  canvas: { width: number; height: number };
  css: string;
  // Each slide's own layers: those of the nested decks around it, then its own.
  slideCss: readonly (readonly string[])[];
  sections: readonly string[];
  // Each slide's notes, which only presenter pages show.
  notes: readonly string[];
};

export async function drawDeck(
  input: DeckInput,
  drawing: Drawing,
): Promise<DrawnDeck> {
  const theme = mergeTheme(
    defaultTheme,
    input.theme === undefined ? undefined : parseTheme(input.theme),
  );
  const canvas = input.canvas ?? { width: 1920, height: 1080 };
  const title =
    input.title ||
    input.slides.find((slide) => slide.options.title)?.options.title ||
    "hinote";
  const author = await authorCss(input.slides, input.css);
  // Printing gives one page per slide at canvas size, which "Save as PDF" turns into a PDF.
  const css = `${themeCss(theme)}
:root{--hinote-canvas-width:${canvas.width}px;--hinote-canvas-height:${canvas.height}px;--hinote-canvas-ratio:${canvas.width} / ${canvas.height}}
@page{size:${canvas.width}px ${canvas.height}px;margin:0}
${author.css}
${FRAME_CSS}`;
  const role = drawing === "presenter" ? "presenter" : "view";
  // Slides render one after another, so an error names the first broken slide.
  const rendered: string[] = [];
  for (const [index, slide] of input.slides.entries()) {
    const html = linkSlides(
      numberSteps(
        await elementHtml(
          await slide.render({
            title: slide.options.title,
            sections: slide.sections ?? [],
            ...input.place(slide),
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
        return drawing === "static" ? slideHash(to) : slideHref(role, to);
      },
    );
    const twice = repeatedMorph(html);
    if (twice !== undefined)
      throw new HinoteError(
        `Slide ${index + 1} has two <Morph name="${twice}">, so the page cannot tell which one moves.`,
        { hint: "Give each <Morph> on a slide its own name." },
      );
    rendered.push(html);
  }
  const order = citationOrder(rendered);
  const listed = listedSources(rendered);
  // Only a deck with <References> can tell a misspelled name: a slide
  // rendered by itself may cite what another slide lists.
  if (listed.size > 0)
    for (const [index, html] of rendered.entries()) {
      const missing = citationOrder([html]).find((name) => !listed.has(name));
      if (missing !== undefined)
        throw new HinoteError(
          `Slide ${index + 1} cites "${missing}", but <References> has no source by that name.`,
          { hint: `Add "${missing}" to <References sources>.` },
        );
    }
  const sections: string[] = [];
  for (const [index, slide] of input.slides.entries()) {
    const html = numberCitations(rendered[index] ?? "", order);
    const pageNumber = input.pageNumbers?.[index];
    const pageHtml =
      pageNumber !== undefined && slide.options.pageNumber !== false
        ? `<p class="hinote-page">${pageNumber} / ${input.pageCount}</p>`
        : "";
    sections.push(
      await elementHtml(
        jsx("section", {
          class: ["slide", slide.options.class].filter(Boolean).join(" "),
          "data-hinote-slide": String(input.place(slide).number),
          "data-hinote-id": slide.options.id,
          // Notes and titles stay on the presenter page: notes in the side column,
          // titles on the overview.
          "data-notes":
            drawing === "presenter" ? (slide.options.notes ?? "") : undefined,
          "data-title":
            drawing === "presenter" ? slide.options.title : undefined,
          "data-hinote-css": author.scopes[index],
          ...transitionData(slide.options.transition ?? input.transition),
          style: slideStyle(slide),
          dangerouslySetInnerHTML: { __html: html + pageHtml },
        }),
      ),
    );
  }
  return {
    drawing,
    title,
    lang: input.lang,
    canvas,
    css,
    slideCss: author.slideCss,
    sections,
    notes: input.slides.map((slide) =>
      drawing === "presenter" ? (slide.options.notes ?? "") : "",
    ),
  };
}

// The slide on screen starts active; the page shows only that one.
function active(section: string): string {
  return section.replace(
    '<section class="slide',
    '<section class="slide is-active',
  );
}

function stage(deck: DrawnDeck, section: string | undefined) {
  return jsx(
    "div",
    { id: "deck" },
    jsx("div", {
      class: "hinote-stage",
      "data-width": String(deck.canvas.width),
      "data-height": String(deck.canvas.height),
      dangerouslySetInnerHTML: { __html: section ? active(section) : "" },
    }),
  );
}

const META = [
  jsx("meta", { charset: "utf-8" }),
  jsx("meta", {
    name: "viewport",
    content: "width=device-width, initial-scale=1",
  }),
];

// One slide's page, as the deck serves it at the slide's route. It names the
// deck root in <base href>, every slide of its kind in <link rel="hinote-slide">
// for the page to fetch, and links the stylesheet and runtime the pages share,
// so moving to the next slide fetches only that slide.
export async function slidePage(
  deck: DrawnDeck,
  index: number,
  options: {
    // `<base href>`: the deck root as seen from this page.
    base: string;
    // How the page syncs: through the deck's server, between windows of one
    // browser for pages on a static host, or only to hear `hinote dev` reload.
    sync?: Sync;
    // The routes of the shared stylesheet and runtime, relative to the root.
    stylesheet: string;
    script: string;
  },
): Promise<string> {
  const page: Page = deck.drawing === "presenter" ? "presenter" : "view";
  const count = deck.sections.length;
  const href = (slide: number) => slideHref(page, slide);
  const section = deck.sections[index];
  const own = deck.slideCss[index]?.join("\n") || undefined;
  const document = jsx(
    "html",
    {
      lang: deck.lang,
      "data-page": page,
      "data-sync": options.sync,
      "data-hinote-deck": "",
    },
    jsx(
      "head",
      {},
      ...META,
      jsx("base", { href: options.base }),
      jsx("title", {}, deck.title),
      jsx("link", { rel: "stylesheet", href: options.stylesheet }),
      own === undefined
        ? null
        : jsx("style", {
            "data-hinote-slide": String(index + 1),
            dangerouslySetInnerHTML: { __html: own },
          }),
      index > 0 ? jsx("link", { rel: "prev", href: href(index - 1) }) : null,
      index < count - 1
        ? jsx("link", { rel: "next", href: href(index + 1) })
        : null,
      Array.from({ length: count }, (_, slide) =>
        jsx("link", { rel: "hinote-slide", href: href(slide) }),
      ),
    ),
    jsx(
      "body",
      {},
      stage(deck, section),
      page === "view" ? audienceChrome(page) : null,
      page === "presenter"
        ? presenterPanel(count, deck.notes[index] ?? "")
        : null,
      options.sync === "server" || options.sync === "broadcast"
        ? jsx("div", { id: "hinote-pointer" })
        : null,
      jsx("script", { src: options.script }),
    ),
  );
  return `<!doctype html>${gatherScripts(await elementHtml(document))}`;
}

// The one file `hinote build --single` writes: every slide in one page that
// opens without a server. The first slide is on the stage and the rest wait in
// a <template> for the page to show; the stylesheet and runtime are inline.
// `only` draws just those slides, for reading one slide's page by itself.
export async function singlePage(
  deck: DrawnDeck,
  only?: readonly number[],
): Promise<string> {
  const indices = only ?? deck.sections.map((_, index) => index);
  const [first, ...rest] = indices.map((index) => deck.sections[index] ?? "");
  // A nested deck's layer is written once, however many of its slides there are.
  const css = [
    deck.css,
    ...new Set(indices.flatMap((index) => deck.slideCss[index] ?? [])),
  ].join("\n");
  const document = jsx(
    "html",
    { lang: deck.lang, "data-page": "static" },
    jsx(
      "head",
      {},
      ...META,
      jsx("title", {}, deck.title),
      jsx("style", { dangerouslySetInnerHTML: { __html: css } }),
    ),
    jsx(
      "body",
      {},
      stage(deck, first),
      rest.length > 0
        ? jsx("template", {
            id: "hinote-slides",
            dangerouslySetInnerHTML: { __html: rest.join("") },
          })
        : null,
      audienceChrome("static"),
      jsx("script", { dangerouslySetInnerHTML: { __html: SCRIPT } }),
    ),
  );
  return `<!doctype html>${gatherScripts(await elementHtml(document))}`;
}

// The runtime a served page loads from the deck, as one file every page shares.
export const CLIENT_SCRIPT = clientScript;
