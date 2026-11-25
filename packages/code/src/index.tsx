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
  // Lines to highlight, from 1: `3`, `"1-3"`, or `"1-3,5"`. The other lines
  // are dimmed. An array is one set for each step, the first shown before
  // any: each after the first is a step of the slide, numbered with its <Step>s.
  highlight?: Lines | readonly Lines[];
  class?: string;
};

export type Lines = number | string;

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
  const text = dedent(source);
  const sets = highlightsOf(props.highlight, text.split("\n").length);
  // The result is a view into WebAssembly memory that the next call reuses, so decode it now.
  let html = new TextDecoder().decode(
    codeToHtml(text, {
      lang: props.lang,
      theme: props.theme ?? pierreDark,
    }),
  );
  if (props.class)
    html = html.replace(
      '<pre class="highlights"',
      `<pre class="highlights ${escapeAttribute(props.class)}"`,
    );
  if (sets.length === 0) return raw(html);
  const [first, ...rest] = sets.map((lines) => dim(html, lines));
  if (rest.length === 0) return raw(first);
  // Each later set is a copy of the block laid over the one before as a step,
  // so it needs no script: a snapshot or a printout, which shows every step,
  // shows the last set, and stepping back uncovers the one before.
  const layer = (block: string, step: boolean) =>
    block.replace(
      /^<pre([^>]*?) style="([^"]*)"/,
      (_, attributes: string, style: string) =>
        `<pre${attributes}${step ? ' data-hinote-step="auto" aria-hidden="true"' : ""} style="${style};grid-area:1/1"`,
    );
  return raw(
    `<div class="hinote-code" style="display:grid">${[
      layer(first ?? "", false),
      ...rest.map((block) => layer(block, true)),
    ].join("")}</div>`,
  );
}

// The line numbers of each set, checked against the source.
function highlightsOf(
  highlight: CodeProps["highlight"],
  count: number,
): Set<number>[] {
  if (highlight === undefined) return [];
  const sets = typeof highlight === "object" ? highlight : [highlight];
  if (sets.length === 0)
    throw new PackageError(
      "<Code highlight> needs at least one set of lines.",
      "error",
    );
  return sets.map((set) => {
    const lines = new Set<number>();
    for (const part of String(set).split(",")) {
      const match = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
      const from = Number(match?.[1]);
      const to = Number(match?.[2] ?? match?.[1]);
      if (!match || from < 1 || to < from || to > count)
        throw new PackageError(
          `<Code highlight> got ${JSON.stringify(set)}: lines are numbers from 1 to ${count}, such as 3, "1-3", or "1-3,5".`,
          "error",
        );
      for (let line = from; line <= to; line++) lines.add(line);
    }
    return lines;
  });
}

const DIMMED = '<span style="opacity:.4">';

// Wraps each line not in `lines` in a dimmed span. A token can run across
// lines, so each line closes the spans still open and the next reopens them.
function dim(html: string, lines: Set<number>): string {
  const match = /^(<pre[^>]*><code[^>]*>)([\s\S]*)(<\/code><\/pre>)$/.exec(
    html,
  );
  if (!match) return html;
  const [, head = "", body = "", tail = ""] = match;
  const open: string[] = [];
  let line = 1;
  let out = "";
  const start = () => {
    if (!lines.has(line)) out += DIMMED;
    out += open.join("");
  };
  const end = () => {
    out += "</span>".repeat(open.length);
    if (!lines.has(line)) out += "</span>";
  };
  start();
  for (const [piece] of body.matchAll(/<\/span>|<[^>]*>|[^<]+/g)) {
    if (piece === "</span>") {
      open.pop();
      out += piece;
    } else if (piece.startsWith("<")) {
      open.push(piece);
      out += piece;
    } else {
      const [firstPart = "", ...more] = piece.split("\n");
      out += firstPart;
      for (const part of more) {
        end();
        out += "\n";
        line++;
        start();
        out += part;
      }
    }
  }
  end();
  return head + out + tail;
}

function escapeAttribute(value: string): string {
  return value.replace(/[&"<>]/g, (char) => `&#${char.charCodeAt(0)};`);
}
