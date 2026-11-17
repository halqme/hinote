import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { HinoteError } from "./errors.ts";

// CSS text, or a file: `new URL("./style.css", import.meta.url)`. A file is read
// when the deck renders, so it needs a runtime with a file system; on Workers,
// import the file as text instead.
export type CssSource = string | URL;
export type CssInput = CssSource | readonly CssSource[];

// The CSS a nested deck lends to its slides. Its slides share this object, so
// the CSS is written once and every slide points at it.
export type StyleLayer = { readonly sources: readonly CssSource[] };

export function parseCss(value: unknown, label: string): readonly CssSource[] {
  const sources = Array.isArray(value) ? value : [value];
  for (const source of sources) {
    if (typeof source !== "string" && !(source instanceof URL))
      throw new HinoteError(
        `${label} must be CSS text, a file URL, or an array of them.`,
      );
  }
  return sources as CssSource[];
}

export async function loadCss(sources: readonly CssSource[]): Promise<string> {
  const texts = await Promise.all(
    sources.map(async (source) => {
      if (typeof source === "string") return source;
      try {
        return await readFile(source, "utf8");
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new HinoteError(
          `Could not read CSS ${source.protocol === "file:" ? fileURLToPath(source) : source.href}: ${reason}`,
        );
      }
    }),
  );
  return texts.join("\n");
}

// At-rules that cannot sit inside a style rule. They stay at the top so that
// animations and fonts work, and still apply to the whole page.
const TOP_LEVEL = new Set([
  "keyframes",
  "-webkit-keyframes",
  "font-face",
  "property",
  "counter-style",
  "font-feature-values",
  "font-palette-values",
  "page",
]);

// Wraps author CSS so it only reaches `scope`: `h1 {}` becomes `scope h1 {}`
// through CSS nesting, and `& {}` styles the slide itself.
export function scopeCss(css: string, scope: string, label: string): string {
  if (/<\/style/i.test(css))
    throw new HinoteError(`${label} cannot contain "</style".`);
  const top: string[] = [];
  const nested: string[] = [];
  for (const statement of statements(css, label)) {
    const head = statement.replace(/^(?:\s|\/\*[\s\S]*?\*\/)+/, "");
    const name = /^@([\w-]+)/.exec(head)?.[1]?.toLowerCase();
    if (name === "import" || name === "charset" || name === "namespace")
      throw new HinoteError(
        `${label} cannot use @${name}; pass each file to css instead.`,
      );
    if (name && TOP_LEVEL.has(name)) top.push(statement);
    else nested.push(statement);
  }
  const body = nested.length > 0 ? `${scope}{${nested.join("\n")}}` : "";
  return [...top, body].filter(Boolean).join("\n");
}

// Splits a stylesheet into its top-level rules, skipping comments and strings.
function statements(css: string, label: string): string[] {
  const result: string[] = [];
  let start = 0;
  let depth = 0;
  let i = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      if (end < 0) throw new HinoteError(`${label} has an unclosed comment.`);
      i = end + 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      i++;
      while (i < css.length && css[i] !== ch) i += css[i] === "\\" ? 2 : 1;
      if (i >= css.length)
        throw new HinoteError(`${label} has an unclosed string.`);
      i++;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth < 0) throw new HinoteError(`${label} has an extra "}".`);
    }
    if ((ch === "}" && depth === 0) || (ch === ";" && depth === 0)) {
      const text = css.slice(start, i + 1).trim();
      if (text !== ";") result.push(text);
      start = i + 1;
    }
    i++;
  }
  if (depth !== 0) throw new HinoteError(`${label} has an unclosed "{".`);
  if (
    css
      .slice(start)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .trim() !== ""
  )
    throw new HinoteError(`${label} ends in the middle of a rule.`);
  return result.filter((text) => text.replace(/\/\*[\s\S]*?\*\//g, "").trim());
}
