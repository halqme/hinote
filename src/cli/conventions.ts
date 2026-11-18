// Source checks for the rules in skills/core that a render cannot see.
// Only reports a pattern that is not also how a slide draws data: a `.map`
// inside a render function stays silent, and so does a `.map` that calls
// `createSlide` to build new slides from data.
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

export type SourceProblem = {
  code: string;
  message: string;
  hint: string;
};

const FLAT_HINT =
  "Pass a nested deck in the array as it is. createSlide flattens nested decks in order.";
const BROWSER_HINT =
  'hinote is a browser global. Use it in a *.client.tsx file that starts with /// <reference types="hinote/client" />, and put that file on the slide with <Script>. Do not import "hinote/client" from a slide: that types hinote for the whole program.';

type Tok = { k: "id" | "punct" | "jsx"; v: string; line: number };

function isClientFile(file: string): boolean {
  return /\.client\.tsx?$/.test(file);
}

// Comments and strings are not code. JSX text is not either: a slide may
// mention hinote.send as words. `<` after an identifier is a comparison or a
// generic, not a tag (`a < b`, `Box<T>`).
function tokenize(source: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  let line = 1;
  const bump = (n = 1) => {
    for (let j = 0; j < n; j++) if (source[i + j] === "\n") line++;
    i += n;
  };
  const skipString = (quote: string) => {
    bump(1);
    while (i < source.length && source[i] !== quote) {
      if (source[i] === "\\") bump(2);
      else bump(1);
    }
    bump(1);
  };
  const skipTemplate = () => {
    bump(1);
    while (i < source.length && source[i] !== "`") {
      if (source[i] === "\\") {
        bump(2);
        continue;
      }
      if (source[i] === "$" && source[i + 1] === "{") {
        bump(2);
        code(true);
        continue;
      }
      bump(1);
    }
    bump(1);
  };
  const skipJsx = () => {
    const start = line;
    bump(1);
    if (source[i] === ">") {
      bump(1);
      skipJsxChildren();
      out.push({ k: "jsx", v: "", line: start });
      return;
    }
    let name = "";
    while (i < source.length && /[\w$.-]/.test(source[i] ?? "")) {
      name += source[i];
      bump(1);
    }
    for (;;) {
      while (i < source.length && /\s/.test(source[i] ?? "")) bump(1);
      if (source[i] === "/" && source[i + 1] === ">") {
        bump(2);
        out.push({ k: "jsx", v: name, line: start });
        return;
      }
      if (source[i] === ">") {
        bump(1);
        skipJsxChildren();
        out.push({ k: "jsx", v: name, line: start });
        return;
      }
      if (source[i] === "{") {
        bump(1);
        code(true);
        continue;
      }
      if (source[i] === '"' || source[i] === "'") {
        skipString(source[i] ?? '"');
        continue;
      }
      bump(1);
    }
  };
  const skipJsxChildren = () => {
    while (i < source.length) {
      if (source[i] === "{") {
        bump(1);
        code(true);
        continue;
      }
      if (source[i] === "<" && source[i + 1] === "/") {
        bump(2);
        while (i < source.length && source[i] !== ">") bump(1);
        bump(1);
        return;
      }
      if (source[i] === "<") {
        skipJsx();
        continue;
      }
      bump(1);
    }
  };
  // `nested` reads one `{...}` expression and stops after its closing brace.
  // The top-level read must not: a `}` there is just the end of a block.
  // The caller consumed the opening brace without a token, so the closing one
  // gets none either; the scans below rely on balanced brackets.
  const code = (nested: boolean) => {
    let depth = nested ? 1 : 0;
    while (i < source.length) {
      const c = source[i] ?? "";
      if (c === "\n") {
        line++;
        i++;
        continue;
      }
      if (c === " " || c === "\t" || c === "\r") {
        i++;
        continue;
      }
      if (c === "/" && source[i + 1] === "/") {
        while (i < source.length && source[i] !== "\n") i++;
        continue;
      }
      if (c === "/" && source[i + 1] === "*") {
        bump(2);
        while (
          i < source.length &&
          !(source[i] === "*" && source[i + 1] === "/")
        )
          bump(1);
        bump(2);
        continue;
      }
      if (c === "'" || c === '"') {
        skipString(c);
        continue;
      }
      if (c === "`") {
        skipTemplate();
        continue;
      }
      if (c === "<" && jsxHere()) {
        skipJsx();
        continue;
      }
      if (/[A-Za-z_$]/.test(c)) {
        const at = line;
        let v = "";
        while (i < source.length && /[\w$]/.test(source[i] ?? "")) {
          v += source[i];
          bump(1);
        }
        out.push({ k: "id", v, line: at });
        continue;
      }
      if (/[0-9]/.test(c)) {
        while (i < source.length && /[0-9.]/.test(source[i] ?? "")) bump(1);
        continue;
      }
      const two = source.slice(i, i + 2);
      if (["=>", "?.", "...", "&&", "||"].includes(two)) {
        out.push({ k: "punct", v: two, line });
        bump(2);
        continue;
      }
      if (nested && c === "}" && depth === 1) {
        bump(1);
        return;
      }
      out.push({ k: "punct", v: c, line });
      bump(1);
      if (c === "{") depth++;
      else if (c === "}") depth--;
    }
  };
  // `<` opens a tag only where an expression could start, not after a value.
  const jsxHere = () => {
    const prev = out[out.length - 1];
    if (
      prev &&
      (prev.k === "jsx" ||
        prev.v === ")" ||
        prev.v === "]" ||
        (prev.k === "id" && prev.v !== "return" && prev.v !== "await"))
    )
      return false;
    const n = source[i + 1] ?? "";
    return n === ">" || n === "/" || /[A-Za-z_]/.test(n);
  };
  code(false);
  return out;
}

const OPENERS = new Set(["(", "{", "["]);
const CLOSERS = new Set([")", "}", "]"]);

// How a token changes the bracket depth. Source that parses is balanced, so
// one count for all three kinds says when a scan is back at its own level.
function nest(v: string | undefined): number {
  if (v === undefined) return 0;
  return OPENERS.has(v) ? 1 : CLOSERS.has(v) ? -1 : 0;
}

function matching(
  tokens: Tok[],
  open: number,
  from: string,
  to: string,
): number {
  let depth = 0;
  for (let i = open; i < tokens.length; i++) {
    if (tokens[i]?.v === from) depth++;
    else if (tokens[i]?.v === to) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return tokens.length - 1;
}

function createSlideNames(tokens: Tok[]): Set<string> {
  const names = new Set<string>();
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i]?.v !== "import" && tokens[i]?.v !== "export") continue;
    const brace = tokens.findIndex((tok, at) => at > i && tok.v === "{");
    const from = tokens.findIndex((tok, at) => at > i && tok.v === "from");
    if (brace < 0 || from < 0 || brace > from) continue;
    for (let j = brace + 1; j < from; j++) {
      const tok = tokens[j];
      if (tok?.k !== "id") continue;
      if (tok.v === "as") continue;
      const next = tokens[j + 1];
      const alias = next?.v === "as" ? tokens[j + 2] : undefined;
      if (tok.v === "createSlide")
        names.add(alias?.k === "id" ? alias.v : tok.v);
    }
    i = from;
  }
  return names;
}

const FLAT = new Set(["map", "flat", "flatMap"]);

function callContainsSlide(
  tokens: Tok[],
  open: number,
  close: number,
): boolean {
  for (let i = open + 1; i < close; i++) {
    const tok = tokens[i];
    if (tok?.v === "createSlide" || tok?.k === "jsx") return true;
  }
  return false;
}

// A `.map` / `.flat` / `.flatMap` whose callback does not build a new slide.
function forbiddenFlat(tokens: Tok[], dot: number): string | undefined {
  const name = tokens[dot + 1];
  const open = tokens[dot + 2];
  if (name?.k !== "id" || !FLAT.has(name.v) || open?.v !== "(") return;
  const close = matching(tokens, dot + 2, "(", ")");
  if (name.v !== "flat" && callContainsSlide(tokens, dot + 2, close)) return;
  return name.v;
}

function isFunctionExpr(tokens: Tok[], start: number, end: number): boolean {
  let i = start;
  if (tokens[i]?.v === "async") i++;
  if (tokens[i]?.k === "id" && tokens[i + 1]?.v === "=>") return true;
  if (tokens[i]?.v === "function") return true;
  if (tokens[i]?.v !== "(") return false;
  const close = matching(tokens, i, "(", ")");
  return close < end && tokens[close + 1]?.v === "=>";
}

function splitArgs(
  tokens: Tok[],
  open: number,
): { start: number; end: number }[] {
  const close = matching(tokens, open, "(", ")");
  const args: { start: number; end: number }[] = [];
  let start = open + 1;
  let depth = 0;
  for (let i = open + 1; i < close; i++) {
    const v = tokens[i]?.v;
    depth += nest(v);
    if (v === "," && depth === 0) {
      args.push({ start, end: i });
      start = i + 1;
    }
  }
  if (start < close) args.push({ start, end: close });
  return args;
}

function skipFunction(tokens: Tok[], arrow: number): number {
  const body = arrow + 1;
  const tok = tokens[body];
  if (tok?.v === "{") return matching(tokens, body, "{", "}");
  // A concise body ends at the next comma or closer of the surrounding call.
  let depth = 0;
  for (let i = body; i < tokens.length; i++) {
    const v = tokens[i]?.v;
    if (depth === 0 && (v === "," || (v !== undefined && CLOSERS.has(v))))
      return i - 1;
    depth += nest(v);
  }
  return tokens.length - 1;
}

function flatsIn(
  tokens: Tok[],
  start: number,
  end: number,
): { name: string; line: number }[] {
  const found: { name: string; line: number }[] = [];
  for (let i = start; i < end; i++) {
    const tok = tokens[i];
    if (tok?.v === "=>") {
      i = skipFunction(tokens, i);
      continue;
    }
    if (tok?.v === "function") {
      const brace = tokens.findIndex((item, at) => at > i && item.v === "{");
      if (brace >= 0) i = matching(tokens, brace, "{", "}");
      continue;
    }
    if (tok?.v === "." || tok?.v === "?.") {
      const name = forbiddenFlat(tokens, i);
      if (name) found.push({ name, line: tokens[i + 1]?.line ?? tok.line });
    }
  }
  return found;
}

// Tokens that end a top-level declaration's initializer.
const STATEMENT_START = new Set([
  ";",
  "const",
  "let",
  "var",
  "import",
  "export",
  "function",
  "class",
]);

function bindings(tokens: Tok[]): Map<string, { line: number; name: string }> {
  const bound = new Map<string, { line: number; name: string }>();
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const v = tokens[i]?.v;
    depth += nest(v);
    if (depth !== 0) continue;
    if (v !== "const" && v !== "let" && v !== "var") continue;
    const id = tokens[i + 1];
    if (id?.k !== "id" || tokens[i + 2]?.v !== "=") continue;
    let end = i + 3;
    let inner = 0;
    for (let j = i + 3; j < tokens.length; j++) {
      const n = tokens[j]?.v;
      if (inner === 0 && n !== undefined && STATEMENT_START.has(n)) {
        end = j;
        break;
      }
      inner += nest(n);
      end = j + 1;
    }
    const flat = flatsIn(tokens, i + 3, end)[0];
    if (flat) bound.set(id.v, flat);
    i = Math.max(i, end - 1);
  }
  return bound;
}

function browserProblems(
  source: string,
  tokens: Tok[],
  file: string,
): SourceProblem[] {
  if (isClientFile(file)) return [];
  const problems: SourceProblem[] = [];
  const lines = source.split("\n");
  for (const [index, line] of lines.entries()) {
    const code = line
      .replace(/\/\/(?!\/).*$/, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    if (
      /^\s*\/\/\/\s*<reference\s+types\s*=\s*["']hinote\/client["']/.test(line)
    )
      problems.push({
        code: "browser-global",
        message: `${file}:${index + 1}: this file references hinote/client, which types the browser global for the whole program.`,
        hint: BROWSER_HINT,
      });
    else if (
      /^\s*(import|export)\b/.test(code) &&
      /["']hinote\/client["']/.test(code)
    )
      problems.push({
        code: "browser-global",
        message: `${file}:${index + 1}: a slide file imports "hinote/client".`,
        hint: BROWSER_HINT,
      });
  }
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const next = tokens[i + 1];
    const prev = tokens[i - 1];
    const uses =
      (tok?.k === "id" && tok.v === "hinote" && next?.v === ".") ||
      (prev?.v === "." &&
        prev.k === "punct" &&
        tokens[i - 2]?.v === "window" &&
        tok?.v === "hinote");
    if (tok && uses)
      problems.push({
        code: "browser-global",
        message: `${file}:${tok.line}: hinote is used outside a *.client.tsx file.`,
        hint: BROWSER_HINT,
      });
  }
  return problems;
}

function flattenProblems(tokens: Tok[], file: string): SourceProblem[] {
  const names = createSlideNames(tokens);
  if (names.size === 0) return [];
  const bound = bindings(tokens);
  const problems: SourceProblem[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok?.k !== "id" || !names.has(tok.v) || tokens[i + 1]?.v !== "(")
      continue;
    const args = splitArgs(tokens, i + 1);
    const slots =
      args.length >= 2 ? args.slice(1) : args.length === 1 ? args : [];
    for (const arg of slots) {
      if (isFunctionExpr(tokens, arg.start, arg.end)) continue;
      if (tokens[arg.start]?.v === "{") continue;
      for (const flat of flatsIn(tokens, arg.start, arg.end))
        problems.push({
          code: "flattened-deck",
          message: `${file}:${flat.line}: createSlide receives an array built with .${flat.name}().`,
          hint: FLAT_HINT,
        });
      for (let j = arg.start; j < arg.end; j++) {
        const id = tokens[j];
        if (id?.k !== "id") continue;
        if (tokens[j + 1]?.v === "." || tokens[j + 1]?.v === "(") continue;
        const hit = bound.get(id.v);
        if (!hit) continue;
        problems.push({
          code: "flattened-deck",
          message: `${file}:${id.line}: createSlide receives "${id.v}", built with .${hit.name}().`,
          hint: FLAT_HINT,
        });
      }
    }
    i = matching(tokens, i + 1, "(", ")");
  }
  return problems;
}

export function problemsInSource(
  source: string,
  file: string,
): SourceProblem[] {
  const tokens = tokenize(source);
  return [
    ...flattenProblems(tokens, file),
    ...browserProblems(source, tokens, file),
  ];
}

function resolveImport(
  fromFile: string,
  spec: string,
  root: string,
): string | undefined {
  if (!spec.startsWith(".")) return;
  const base = resolve(dirname(fromFile), spec);
  const candidates = [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    `${base}.jsx`,
    `${base}.js`,
    `${base}${sep}index.tsx`,
    `${base}${sep}index.ts`,
  ];
  for (const candidate of candidates) {
    if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) continue;
    if (!existsSync(candidate) || !statSync(candidate).isFile()) continue;
    return candidate;
  }
  return;
}

const IMPORT_FROM =
  /(?:import|export)\s+(?:type\s+)?[^"'`]*?\sfrom\s*["'](\.[^"']+)["']/g;
const IMPORT_SIDE = /import\s*["'](\.[^"']+)["']/g;

// The deck file and the local files it imports, so a section file that
// flattens a deck is reported too. Nothing outside the deck directory.
export function conventionProblems(entry: string): SourceProblem[] {
  const root = dirname(resolve(entry));
  const seen = new Set<string>();
  const problems: SourceProblem[] = [];
  const queue = [resolve(entry)];
  while (queue.length > 0) {
    const file = queue.pop();
    if (!file || seen.has(file)) continue;
    seen.add(file);
    let source: string;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const shown = relative(root, file) || file;
    problems.push(
      ...problemsInSource(source, shown.startsWith(".") ? shown : `./${shown}`),
    );
    for (const pattern of [IMPORT_FROM, IMPORT_SIDE]) {
      for (const match of source.matchAll(pattern)) {
        const next = resolveImport(file, match[1] ?? "", root);
        if (next && !seen.has(next)) queue.push(next);
      }
    }
  }
  return problems;
}
