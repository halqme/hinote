import type { Lang, Theme as CodeTheme, ThemeFamily } from "@pierre/highlights";
import { pierreDark } from "@pierre/highlights/themes";
import { PackageError, dedent } from "@hinote/shared";
import { raw } from "hono/html";

export { dedent } from "@hinote/shared";

export type CodeProps = {
  // Language name or alias, such as "ts" or "rust".
  lang: Lang;
  // The source. Children work too: <Code lang="ts">{`...`}</Code>.
  code?: string;
  children?: string | string[];
  // A theme from "@hinote/code/themes". Defaults to Pierre's dark theme.
  theme?: CodeTheme | ThemeFamily;
  class?: string;
};

// The highlighter compiles WebAssembly as soon as it loads, which some hosts
// refuse. It loads on the first <Code>, so a deck without code runs anywhere
// Hono runs.
let highlighter: Promise<typeof import("@pierre/highlights")> | undefined;

// Highlighted while the slide renders, with colors inline, so the page needs no
// highlighter of its own and the built file shows the same colors.
export async function Code(props: CodeProps) {
  const source =
    props.code ??
    (Array.isArray(props.children) ? props.children.join("") : props.children);
  if (typeof source !== "string")
    throw new PackageError(
      "<Code> needs its source as `code` or as text children.",
      "error",
    );
  highlighter ??= import("@pierre/highlights");
  const { codeToHtml, isSupportedLanguage } = await highlighter;
  if (!isSupportedLanguage(props.lang))
    throw new PackageError(
      `<Code lang="${String(props.lang)}"> is not a supported language.`,
      "error",
    );
  // The result is a view into WebAssembly memory that the next call reuses, so decode it now.
  const html = new TextDecoder().decode(
    codeToHtml(dedent(source), {
      lang: props.lang,
      theme: props.theme ?? pierreDark,
    }),
  );
  return raw(
    props.class
      ? html.replace(
          '<pre class="highlights"',
          `<pre class="highlights ${escapeAttribute(props.class)}"`,
        )
      : html,
  );
}

function escapeAttribute(value: string): string {
  return value.replace(/[&"<>]/g, (char) => `&#${char.charCodeAt(0)};`);
}
