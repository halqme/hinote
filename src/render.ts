import { fileURLToPath } from "node:url";
import { jsx } from "hono/jsx";
import { HinoteError } from "./errors.ts";
import type { Role } from "./player.ts";
import type { Slide } from "./slide.ts";
import {
  defaultTheme,
  mergeTheme,
  parseThemeOverride,
  themeCss,
  themeDeclarations,
  type Theme,
  type ThemeOverride,
} from "./theme.ts";

// Center sets flex:1, which fills the slide only because .slide.is-active is a column flex container.
const BASE_CSS = `
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:var(--hinote-bg);color:var(--hinote-fg);font-family:var(--hinote-font);font-size:var(--hinote-body)}
body{overflow:hidden}
#deck,.hinote-stage{height:100%}
.slide{display:none}
.slide.is-active{display:flex;flex-direction:column;height:100%;min-height:100dvh;padding:calc(var(--hinote-space) * 6);background:var(--hinote-bg);color:var(--hinote-fg)}
h1,h2,h3,p{margin:0}
h1{font-family:var(--hinote-font-heading);font-size:var(--hinote-h1);line-height:1.1}
h2,h3{font-family:var(--hinote-font-heading);font-size:var(--hinote-h2);line-height:1.2}
p{font-size:var(--hinote-body);line-height:1.5}
small{font-size:var(--hinote-small);color:var(--hinote-muted)}
code,pre{font-family:var(--hinote-font-mono)}
a{color:var(--hinote-accent)}
#hinote-pointer{position:fixed;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:var(--hinote-radius);background:#ff2d2d;box-shadow:0 0 16px #ff2d2d;pointer-events:none;z-index:10;opacity:0}
#hinote-panel{display:none}
#hinote-notes{white-space:pre-wrap}
html[data-role="presenter"],html[data-role="presenter"] body{height:100vh;overflow:hidden}
html[data-role="presenter"] body{display:grid;grid-template-columns:minmax(0,1fr) minmax(14rem,22rem);background:#111318;color:#f4f4f5}
html[data-role="presenter"] #deck{height:100%;min-width:0;min-height:0;display:grid;place-items:center;padding:1.25rem;background:#0b0d12;container-type:size}
html[data-role="presenter"] .hinote-stage{width:min(100cqi,calc(100cqb * 16 / 9));aspect-ratio:16/9;height:auto;position:relative;overflow:hidden;container-type:size;box-shadow:0 18px 50px rgb(0 0 0 / .45)}
html[data-role="presenter"] .slide.is-active{position:absolute;top:0;left:0;width:1920px;height:1080px;min-height:0;transform-origin:top left;transform:scale(calc(100cqi / 1920px))}
html[data-role="presenter"] #hinote-panel{display:flex;flex-direction:column;gap:.75rem;min-height:0;margin:0;padding:1.25rem;overflow:auto;background:#181b22;border-left:1px solid #2c313c;font-size:16px;line-height:1.6}
html[data-role="presenter"] #hinote-step{margin:0;color:#a1a1aa;font-size:13px;letter-spacing:.04em}
html[data-role="presenter"] #hinote-notes{margin:0;font-size:16px;line-height:1.6}
`.trim();

let clientSource: Promise<string> | undefined;

async function clientScript(): Promise<string> {
  clientSource ??= buildClient().catch((error: unknown) => {
    clientSource = undefined;
    throw error;
  });
  return clientSource;
}

async function buildClient(): Promise<string> {
  const entry = fileURLToPath(new URL("./client.ts", import.meta.url));
  const built = await Bun.build({
    entrypoints: [entry],
    format: "iife",
    target: "browser",
    minify: false,
  });
  if (!built.success) {
    const message = built.logs.map((log) => log.message).join("\n");
    throw new HinoteError(message || "Failed to build the slide runtime.");
  }
  const file = built.outputs[0];
  if (!file) throw new HinoteError("Failed to build the slide runtime.");
  // The HTML parser ends a script at the character sequence "</script".
  // Replacing every "<" would also rewrite operators such as "<=".
  return (await file.text()).replace(/<\/script/gi, "\\u003c/script");
}

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
  role?: Role;
}): Promise<string> {
  const theme = mergeTheme(
    defaultTheme,
    input.theme === undefined ? undefined : parseThemeOverride(input.theme),
  );
  const role = input.role ?? "view";
  const script = await clientScript();
  const title =
    input.slides.find((slide) => slide.options.title)?.options.title ||
    "hinote";
  const firstNotes = input.slides[0]?.options.notes ?? "";
  const css = `${themeCss(theme)}\n${BASE_CSS}`;
  const slides = input.slides.map((slide, index) => {
    const className = [
      "slide",
      index === 0 ? "is-active" : "",
      slide.options.class,
    ]
      .filter(Boolean)
      .join(" ");
    return jsx("section", {
      class: className,
      "data-notes": slide.options.notes ?? "",
      style: slideStyle(theme, slide),
      dangerouslySetInnerHTML: { __html: elementHtml(slide.render()) },
    });
  });
  const stage =
    slides.length > 0
      ? jsx("div", { class: "hinote-stage" }, ...slides)
      : jsx("div", { class: "hinote-stage" });
  const deck = jsx("div", { id: "deck" }, stage);
  const document = jsx(
    "html",
    { "data-role": role },
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
      { "data-role": role },
      deck,
      jsx(
        "aside",
        { id: "hinote-panel" },
        jsx(
          "p",
          { id: "hinote-step" },
          slides.length > 0 ? `1 / ${slides.length}` : "",
        ),
        jsx("div", { id: "hinote-notes" }, firstNotes),
      ),
      jsx("div", { id: "hinote-pointer" }),
      jsx("script", { dangerouslySetInnerHTML: { __html: script } }),
    ),
  );
  return `<!doctype html>${elementHtml(document)}`;
}
