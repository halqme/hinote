// Source read as a syntax tree, with the parser Rolldown bundles with: the
// source checks and the import.meta rewrite read code this way, so a word in
// a string, a comment, or a slide's text is never mistaken for code.
import { parseAst } from "rolldown/parseAst";

// A node of the ESTree that Rolldown's parser returns, read only through the
// fields used here. `start` and `end` are offsets into the source, and `line`
// is added after parsing.
export type Node = {
  type: string;
  start: number;
  end: number;
  line: number;
  [key: string]: unknown;
};

export function isNode(value: unknown): value is Node {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string"
  );
}

export function child(node: Node, field: string): Node | undefined {
  const value = node[field];
  return isNode(value) ? value : undefined;
}

export function list(node: Node, field: string): Node[] {
  const value = node[field];
  return Array.isArray(value) ? value.filter(isNode) : [];
}

export function text(
  node: Node | undefined,
  field: string,
): string | undefined {
  const value = node?.[field];
  return typeof value === "string" ? value : undefined;
}

export function identifier(node: Node | undefined): string | undefined {
  return node?.type === "Identifier" ? text(node, "name") : undefined;
}

// Fields that hold no code: types.
const NOT_CODE = new Set([
  "typeAnnotation",
  "typeParameters",
  "typeArguments",
  "superTypeArguments",
  "returnType",
]);

// Visits `node` and what it contains, in source order. `visit` returns
// whether to go inside the node.
export function walk(
  node: Node,
  visit: (node: Node, parent?: Node, key?: string) => boolean,
  parent?: Node,
  key?: string,
): void {
  if (!visit(node, parent, key)) return;
  for (const [field, value] of Object.entries(node)) {
    if (NOT_CODE.has(field)) continue;
    if (Array.isArray(value)) {
      for (const item of value)
        if (isNode(item)) walk(item, visit, node, field);
    } else if (isNode(value)) walk(value, visit, node, field);
  }
}

// The program in `source`, or undefined when it does not parse: bundling
// reports that error, with where it is.
// Without `jsx`, as in a .ts file, `<T>(x) => x` is a generic, not a tag.
export function parseProgram(source: string, jsx: boolean): Node | undefined {
  let program: unknown;
  try {
    program = parseAst(source, { lang: jsx ? "tsx" : "ts" });
  } catch {
    return undefined;
  }
  if (!isNode(program)) return undefined;
  const starts = [0];
  for (let i = source.indexOf("\n"); i >= 0; i = source.indexOf("\n", i + 1))
    starts.push(i + 1);
  walk(program, (node) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if ((starts[mid] ?? 0) <= node.start) low = mid;
      else high = mid - 1;
    }
    node.line = low + 1;
    return true;
  });
  return program;
}
