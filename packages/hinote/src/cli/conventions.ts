// Source checks for mistakes a render cannot see.
// Only reports a pattern that is not also how a slide draws data: a `.map`
// inside a render function stays silent, and so does a `.map` that calls
// `createSlide` to build new slides from data.
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import {
  child,
  identifier,
  list,
  parseProgram,
  text,
  walk,
  type Node,
} from "../build/ast.ts";

export type SourceProblem = {
  code: string;
  message: string;
  hint: string;
};

const HANDLER_HINT =
  'A slide is HTML drawn on the server, so a handler on it never runs. Put the behavior in a *.client.tsx file and add it with <Script src={new URL("./x.client.tsx", import.meta.url)} />.';
const HOOK_HINT =
  "A slide renders once on the server, so state never changes and effects never run. Keep state in a *.client.tsx file added with <Script>.";
// Hooks whose point is to change the page after it renders.
const HOOKS = ["useState", "useReducer", "useEffect", "useLayoutEffect"];

const FLAT_HINT =
  "Pass a nested deck in the array as it is. createSlide flattens nested decks in order.";
const BROWSER_HINT =
  'hinote is a browser global. Use it in a *.client.tsx file that starts with /// <reference types="hinote/client" />, and put that file on the slide with <Script>. Do not import "hinote/client" from a slide: that types hinote for the whole program.';

function isClientFile(file: string): boolean {
  return /\.client\.tsx?$/.test(file);
}

function bySource<T extends { at: number }>(items: T[]): T[] {
  return items.sort((a, b) => a.at - b.at);
}

// A method is a FunctionExpression in its property or class member.
const FUNCTIONS = new Set([
  "ArrowFunctionExpression",
  "FunctionExpression",
  "FunctionDeclaration",
]);

function isMember(node: Node): boolean {
  return node.type === "MemberExpression";
}

function isCall(node: Node): boolean {
  return node.type === "CallExpression";
}

// The local names `createSlide` is imported as.
function createSlideNames(program: Node): Set<string> {
  const names = new Set<string>();
  for (const statement of list(program, "body")) {
    if (statement.type !== "ImportDeclaration") continue;
    for (const specifier of list(statement, "specifiers")) {
      if (specifier.type !== "ImportSpecifier") continue;
      const imported = child(specifier, "imported");
      const name = identifier(imported) ?? text(imported, "value");
      const local = identifier(child(specifier, "local"));
      if (name === "createSlide" && local) names.add(local);
    }
  }
  return names;
}

const FLAT = new Set(["map", "flat", "flatMap"]);

type Flat = { name: string; line: number; at: number };

function buildsSlide(node: Node, names: Set<string>): boolean {
  let found = false;
  walk(node, (inner) => {
    if (found) return false;
    if (inner.type === "JSXElement" || inner.type === "JSXFragment")
      found = true;
    else if (names.has(identifier(inner) ?? "")) found = true;
    return !found;
  });
  return found;
}

// A `.map` / `.flat` / `.flatMap` whose callback does not build a new slide.
function forbiddenFlat(call: Node, names: Set<string>): Flat | undefined {
  const callee = child(call, "callee");
  if (!callee || !isMember(callee) || callee.computed) return undefined;
  const property = child(callee, "property");
  const name = identifier(property);
  if (!property || !name || !FLAT.has(name)) return undefined;
  if (
    name !== "flat" &&
    list(call, "arguments").some((arg) => buildsSlide(arg, names))
  )
    return undefined;
  return { name, line: property.line, at: property.start };
}

// The flattening calls in `node`, leaving out function bodies, which run
// later or not at all.
function flatsIn(node: Node, names: Set<string>): Flat[] {
  const found: Flat[] = [];
  walk(node, (inner) => {
    if (FUNCTIONS.has(inner.type)) return false;
    const flat = isCall(inner) ? forbiddenFlat(inner, names) : undefined;
    if (flat) found.push(flat);
    return true;
  });
  return bySource(found);
}

// Top-level bindings whose value is built by flattening.
function bindings(program: Node, names: Set<string>): Map<string, Flat> {
  const bound = new Map<string, Flat>();
  for (const statement of list(program, "body")) {
    const declaration =
      statement.type === "ExportNamedDeclaration"
        ? child(statement, "declaration")
        : statement;
    if (declaration?.type !== "VariableDeclaration") continue;
    for (const declarator of list(declaration, "declarations")) {
      const id = identifier(child(declarator, "id"));
      const init = child(declarator, "init");
      if (!id || !init) continue;
      const flat = flatsIn(init, names)[0];
      if (flat) bound.set(id, flat);
    }
  }
  return bound;
}

// An identifier read as a value: not a property name, not a callee, and not
// the object of a member access.
function isValueRead(parent: Node | undefined, key: string | undefined) {
  if (!parent) return true;
  if (isMember(parent))
    return key === "property" ? Boolean(parent.computed) : key !== "object";
  if (isCall(parent) || parent.type === "NewExpression")
    return key !== "callee";
  if (parent.type === "Property" && key === "key")
    return Boolean(parent.computed);
  return true;
}

function browserProblems(
  source: string,
  program: Node,
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
      /^\s*\/\/\/\s*<reference\s+types\s*=\s*["'](?:@hinote\/core|hinote)\/client["']/.test(
        line,
      )
    )
      problems.push({
        code: "browser-global",
        message: `${file}:${index + 1}: this file references hinote/client, which types the browser global for the whole program.`,
        hint: BROWSER_HINT,
      });
    else if (
      /^\s*(import|export)\b/.test(code) &&
      /["'](?:@hinote\/core|hinote)\/client["']/.test(code)
    )
      problems.push({
        code: "browser-global",
        message: `${file}:${index + 1}: a slide file imports "hinote/client".`,
        hint: BROWSER_HINT,
      });
  }
  // `hinote.x` and `window.hinote`.
  const uses: { line: number; at: number }[] = [];
  walk(program, (node) => {
    if (!isMember(node)) return true;
    const object = child(node, "object");
    const property = child(node, "property");
    if (object && identifier(object) === "hinote")
      uses.push({ line: object.line, at: object.start });
    else if (
      property &&
      identifier(object) === "window" &&
      !node.computed &&
      identifier(property) === "hinote"
    )
      uses.push({ line: property.line, at: property.start });
    return true;
  });
  for (const use of bySource(uses))
    problems.push({
      code: "browser-global",
      message: `${file}:${use.line}: hinote is used outside a *.client.tsx file.`,
      hint: BROWSER_HINT,
    });
  return problems;
}

function flattenProblems(program: Node, file: string): SourceProblem[] {
  const names = createSlideNames(program);
  if (names.size === 0) return [];
  const bound = bindings(program, names);
  const problems: SourceProblem[] = [];
  walk(program, (call) => {
    if (!isCall(call) || !names.has(identifier(child(call, "callee")) ?? ""))
      return true;
    const args = list(call, "arguments");
    const slots = args.length >= 2 ? args.slice(1) : args;
    for (const arg of slots) {
      if (FUNCTIONS.has(arg.type) || arg.type === "ObjectExpression") continue;
      for (const flat of flatsIn(arg, names))
        problems.push({
          code: "flattened-deck",
          message: `${file}:${flat.line}: createSlide receives an array built with .${flat.name}().`,
          hint: FLAT_HINT,
        });
      const reads: { name: string; flat: Flat; line: number; at: number }[] =
        [];
      walk(arg, (node, parent, key) => {
        if (FUNCTIONS.has(node.type)) return false;
        const name = identifier(node);
        const flat = name === undefined ? undefined : bound.get(name);
        if (name && flat && isValueRead(parent, key))
          reads.push({ name, flat, line: node.line, at: node.start });
        return true;
      });
      for (const read of bySource(reads))
        problems.push({
          code: "flattened-deck",
          message: `${file}:${read.line}: createSlide receives "${read.name}", built with .${read.flat.name}().`,
          hint: FLAT_HINT,
        });
    }
    // A createSlide call inside is part of this deck, already read above.
    return false;
  });
  return problems;
}

function jsxName(node: Node | undefined): string {
  if (node?.type === "JSXIdentifier") return text(node, "name") ?? "";
  if (node?.type === "JSXNamespacedName")
    return `${jsxName(child(node, "namespace"))}:${jsxName(child(node, "name"))}`;
  if (node?.type === "JSXMemberExpression")
    return `${jsxName(child(node, "object"))}.${jsxName(child(node, "property"))}`;
  return "";
}

// Behavior written on a slide: an event handler on an HTML element, or a
// hook that would change the page. Both are silently inert on the server.
function serverOnlyProblems(
  source: string,
  program: Node,
  file: string,
): SourceProblem[] {
  if (isClientFile(file)) return [];
  const problems: SourceProblem[] = [];
  walk(program, (node) => {
    if (node.type !== "JSXOpeningElement") return true;
    const tag = jsxName(child(node, "name"));
    if (!/^[a-z]/.test(tag)) return true;
    for (const attr of list(node, "attributes")) {
      if (attr.type !== "JSXAttribute") continue;
      const name = jsxName(child(attr, "name"));
      if (/^on[A-Z]/.test(name))
        problems.push({
          code: "server-handler",
          message: `${file}:${attr.line}: <${tag} ${name}> is on a slide, where it never runs.`,
          hint: HANDLER_HINT,
        });
    }
    return true;
  });
  for (const match of source.matchAll(
    /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["'](hono\/jsx(?:\/dom)?|react)["']/g,
  )) {
    if (/^import\s*type\b/.test(match[0])) continue;
    const names = (match[1] ?? "")
      .split(",")
      .map((part) =>
        part
          .trim()
          .split(/\s+as\s+/)[0]
          ?.replace(/^type\s+/, ""),
      )
      .filter((name): name is string => !!name && HOOKS.includes(name));
    if (names.length === 0) continue;
    const line = source.slice(0, match.index).split("\n").length;
    problems.push({
      code: "server-hook",
      message: `${file}:${line}: a slide file imports ${names.join(", ")} from "${match[2]}", which never update a slide.`,
      hint: HOOK_HINT,
    });
  }
  return problems;
}

export function problemsInSource(
  source: string,
  file: string,
): SourceProblem[] {
  const program = parseProgram(source, !/\.[cm]?ts$/.test(file));
  if (!program) return [];
  return [
    ...flattenProblems(program, file),
    ...browserProblems(source, program, file),
    ...serverOnlyProblems(source, program, file),
  ];
}

function resolveImport(
  fromFile: string,
  spec: string,
  root: string,
): string | undefined {
  if (!spec.startsWith(".")) return undefined;
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
  return undefined;
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
