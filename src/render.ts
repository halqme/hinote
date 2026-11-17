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
  parseThemeOverride,
  themeCss,
  themeDeclarations,
  type Theme,
  type ThemeOverride,
} from "./theme.ts";

// Every slide is laid out on a fixed canvas and scaled as a whole, so a slide looks
// the same in any window. The client sets --hinote-scale to fit the canvas in #deck.
// rem stays the browser default; theme sizes in rem are relative to it, not to each other.
// Center sets flex:1, which fills the slide only because .slide is a column flex container.
const BASE_CSS = `
*{box-sizing:border-box}
html,body{margin:0;height:100%;overflow:hidden;background:var(--hinote-bg);color:var(--hinote-fg);font-family:var(--hinote-font)}
#deck{position:fixed;inset:0;display:grid;place-items:center;--hinote-scale:1}
.hinote-stage{position:relative;overflow:hidden;width:calc(var(--hinote-canvas-width) * var(--hinote-scale));height:calc(var(--hinote-canvas-height) * var(--hinote-scale))}
.slide{display:none;position:absolute;top:0;left:0;width:var(--hinote-canvas-width);height:var(--hinote-canvas-height);overflow:hidden;flex-direction:column;padding:calc(var(--hinote-space) * 6);transform-origin:0 0;transform:scale(var(--hinote-scale));background:var(--hinote-bg);color:var(--hinote-fg);font-size:var(--hinote-body)}
.slide.is-active{display:flex}
[data-hinote-step]{transition:opacity .2s ease}
[data-hinote-step].is-hidden{opacity:0;visibility:hidden}
h1,h2,h3,p{margin:0}
h1{font-family:var(--hinote-font-heading);font-size:var(--hinote-h1);line-height:1.1}
h2,h3{font-family:var(--hinote-font-heading);font-size:var(--hinote-h2);line-height:1.2}
p{font-size:var(--hinote-body);line-height:1.5}
small{font-size:var(--hinote-small);color:var(--hinote-muted)}
code,pre{font-family:var(--hinote-font-mono)}
a{color:var(--hinote-accent)}
#hinote-pointer{position:fixed;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:#ff2d2d;box-shadow:0 0 16px #ff2d2d;pointer-events:none;z-index:10;opacity:0}
#hinote-notes{white-space:pre-wrap}
html[data-page="presenter"] body{display:grid;grid-template-columns:minmax(0,1fr) minmax(14rem,22rem);background:#111318;color:#f4f4f5}
html[data-page="presenter"] #deck{position:relative;inset:auto;min-width:0;min-height:0;padding:1.25rem;background:#0b0d12}
html[data-page="presenter"] .hinote-stage{box-shadow:0 18px 50px rgb(0 0 0 / .45)}
html[data-page="presenter"] #hinote-panel{display:flex;flex-direction:column;gap:.75rem;min-height:0;margin:0;padding:1.25rem;overflow:auto;background:#181b22;border-left:1px solid #2c313c;font-size:16px;line-height:1.6}
html[data-page="presenter"] #hinote-step{margin:0;color:#a1a1aa;font-size:13px;letter-spacing:.04em}
html[data-page="presenter"] #hinote-notes{margin:0;font-size:16px;line-height:1.6}
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

function slideStyle(theme: Theme, slide: Slide): Record<string, string> {
  const style: Record<string, string> = {};
  if (slide.options.theme)
    Object.assign(
      style,
      themeDeclarations(mergeTheme(theme, slide.options.theme)),
    );
  if (slide.options.background) style.background = slide.options.background;
  return style;
}

export async function renderDeck(input: {
  slides: readonly Slide[];
  theme?: ThemeOverride;
  title?: string;
  canvas?: { width: number; height: number };
  page?: Page;
}): Promise<string> {
  const theme = mergeTheme(
    defaultTheme,
    input.theme === undefined ? undefined : parseThemeOverride(input.theme),
  );
  const page = input.page ?? "view";
  const canvas = input.canvas ?? { width: 1920, height: 1080 };
  const title =
    input.title ||
    input.slides.find((slide) => slide.options.title)?.options.title ||
    "hinote";
  const firstNotes = input.slides[0]?.options.notes ?? "";
  const css = `${themeCss(theme)}\n:root{--hinote-canvas-width:${canvas.width}px;--hinote-canvas-height:${canvas.height}px}\n${BASE_CSS}`;
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
      style: slideStyle(theme, slide),
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
      page === "presenter"
        ? jsx(
            "aside",
            { id: "hinote-panel" },
            jsx(
              "p",
              { id: "hinote-step" },
              slides.length > 0 ? `1 / ${slides.length}` : "",
            ),
            jsx("div", { id: "hinote-notes" }, firstNotes),
          )
        : null,
      page === "static" ? null : jsx("div", { id: "hinote-pointer" }),
      jsx("script", { dangerouslySetInnerHTML: { __html: SCRIPT } }),
    ),
  );
  return `<!doctype html>${elementHtml(document)}`;
}
