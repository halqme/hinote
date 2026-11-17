// Rewrites the single `export default createSlide([...])` array and adds one import.
// Entry text is kept, including a comment in that entry's segment. A comment-only
// segment is dropped. Any other deck shape is left untouched and refused.
import { HinoteError } from "./errors.ts";

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function insertIntoDeck(
  source: string,
  name: string,
  specifier: string,
  at?: number,
): string {
  if (!IDENTIFIER.test(name))
    throw new HinoteError(
      `Slide name "${name}" must be a JavaScript identifier.`,
    );
  if (hasNamedImport(source, name))
    throw new HinoteError(`"${name}" is already imported.`);
  const edited = insertNameIntoDefaultArray(source, name, at);
  return insertImport(edited, `import ${name} from "${specifier}"\n`);
}

function hasNamedImport(source: string, name: string): boolean {
  return new RegExp(`^import\\b[^\\n]*\\b${name}\\b`, "m").test(source);
}

function insertNameIntoDefaultArray(
  source: string,
  name: string,
  at: number | undefined,
): string {
  const opening = findDefaultArray(source);
  const { close, items } = scanArray(source, opening);
  if (items.some((item) => slideEntry(item) === name)) {
    throw new HinoteError(`Slide "${name}" is already in the deck.`);
  }
  const index = at === undefined ? items.length : at - 1;
  if (
    at !== undefined &&
    (!Number.isInteger(at) || index < 0 || index > items.length)
  ) {
    throw new HinoteError(`--at must be from 1 to ${items.length + 1}.`);
  }
  items.splice(index, 0, name);
  const body = items.map((item) => `  ${item},`).join("\n");
  return `${source.slice(0, opening)}[\n${body}\n]${source.slice(close + 1)}`;
}

function findDefaultArray(source: string): number {
  const matches = [...source.matchAll(/export default createSlide\s*\(\s*\[/g)];
  if (matches.length !== 1) {
    throw new HinoteError(
      matches.length === 0
        ? "deck.tsx needs `export default createSlide([...])` before hinote insert can update it."
        : "deck.tsx has more than one default createSlide array; update it manually.",
    );
  }
  const match = matches[0];
  if (match?.index === undefined)
    throw new HinoteError("Could not find the default slide array.");
  return match.index + match[0].length - 1;
}

function scanArray(
  source: string,
  open: number,
): { close: number; items: string[] } {
  if (source[open] !== "[")
    throw new HinoteError("Could not find the default slide array.");
  const items: string[] = [];
  let itemStart = open + 1;
  let depth = 0;
  let i = open;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "/" && source[i + 1] === "/") {
      const newline = source.indexOf("\n", i);
      i = newline < 0 ? source.length : newline + 1;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      if (end < 0) throw new HinoteError("Unclosed comment in deck.tsx.");
      i = end + 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      i = skipString(source, i);
      continue;
    }
    if (ch === "[" || ch === "(" || ch === "{") {
      depth++;
      i++;
      continue;
    }
    if (ch === "]" || ch === ")" || ch === "}") {
      depth--;
      if (depth === 0) {
        pushItem(source, items, itemStart, i);
        return { close: i, items };
      }
      i++;
      continue;
    }
    if (ch === "," && depth === 1) {
      pushItem(source, items, itemStart, i);
      itemStart = i + 1;
      i++;
      continue;
    }
    i++;
  }
  throw new HinoteError("The default createSlide([...]) array is not closed.");
}

function pushItem(source: string, items: string[], start: number, end: number) {
  const text = source.slice(start, end).trim();
  if (text && !isCommentOnly(text)) items.push(text);
}

function slideEntry(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .trim();
}

function isCommentOnly(text: string): boolean {
  return slideEntry(text) === "";
}

function skipString(source: string, start: number): number {
  const quote = source[start];
  let i = start + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (quote === "`" && ch === "$" && source[i + 1] === "{") {
      i = skipBalanced(source, i + 1) + 1;
      continue;
    }
    if (ch === quote) return i + 1;
    i++;
  }
  throw new HinoteError("Unclosed string in deck.tsx.");
}

function skipBalanced(source: string, open: number): number {
  const closing = source[open] === "{" ? "}" : source[open] === "[" ? "]" : ")";
  let i = open + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "/" && source[i + 1] === "/") {
      const newline = source.indexOf("\n", i);
      i = newline < 0 ? source.length : newline + 1;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      if (end < 0) throw new HinoteError("Unclosed comment in deck.tsx.");
      i = end + 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      i = skipString(source, i);
      continue;
    }
    if (ch === "{" || ch === "[" || ch === "(") {
      i = skipBalanced(source, i) + 1;
      continue;
    }
    if (ch === closing) return i;
    i++;
  }
  throw new HinoteError("Unclosed bracket in deck.tsx.");
}

function insertImport(source: string, line: string): string {
  const at = importInsertionIndex(source);
  return `${source.slice(0, at)}${line}${source.slice(at)}`;
}

function importInsertionIndex(source: string): number {
  let i = 0;
  while (i < source.length) {
    const next = skipSpaceAndComments(source, i);
    if (
      source.startsWith("import", next) &&
      isIdentifierBoundary(source[next + "import".length])
    ) {
      i = endOfImport(source, next);
      continue;
    }
    return next;
  }
  return source.length;
}

function isIdentifierBoundary(char: string | undefined): boolean {
  return char === undefined || !/[A-Za-z0-9_$]/.test(char);
}

function skipSpaceAndComments(source: string, index: number): number {
  let i = index;
  while (i < source.length) {
    const ch = source[i];
    if (ch !== undefined && /\s/.test(ch)) {
      i++;
      continue;
    }
    if (source.startsWith("//", i)) {
      const newline = source.indexOf("\n", i);
      i = newline < 0 ? source.length : newline + 1;
      continue;
    }
    if (source.startsWith("/*", i)) {
      const end = source.indexOf("*/", i + 2);
      if (end < 0) throw new HinoteError("Unclosed comment in deck.tsx.");
      i = end + 2;
      continue;
    }
    break;
  }
  return i;
}

function endOfImport(source: string, start: number): number {
  let i = start;
  let depth = 0;
  let seenFrom = false;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "'" || ch === '"' || ch === "`") {
      const end = skipString(source, i);
      if (depth === 0 && (seenFrom || isImportTerminator(source, end)))
        return consumeLineEnd(source, end);
      i = end;
      continue;
    }
    if (ch === "/" && source[i + 1] === "/") {
      const newline = source.indexOf("\n", i);
      i = newline < 0 ? source.length : newline + 1;
      continue;
    }
    if (ch === "{" || ch === "(") depth++;
    else if ((ch === "}" || ch === ")") && depth > 0) depth--;
    else if (
      depth === 0 &&
      source.startsWith("from", i) &&
      isIdentifierBoundary(source[i + 4])
    )
      seenFrom = true;
    else if (ch === ";" && depth === 0) return consumeLineEnd(source, i + 1);
    i++;
  }
  return i;
}

function isImportTerminator(source: string, index: number): boolean {
  let i = index;
  if (source[i] === ";") return true;
  if (source[i] === "\r") i++;
  return source[i] === "\n" || source[i] === undefined;
}

function consumeLineEnd(source: string, index: number): number {
  let i = index;
  if (source[i] === ";") i++;
  if (source[i] === "\r") i++;
  if (source[i] === "\n") i++;
  return i;
}
