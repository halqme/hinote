import { existsSync, statSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { type Deck, isDeck, isPlainObject } from "@hinote/core/internal";
import { HinoteError, isHinoteError } from "../errors.ts";
import type { Plugin } from "rolldown";
import { bundle } from "./runtime.ts";
import { child, identifier, parseProgram, walk, type Node } from "./ast.ts";

// Bundle the deck so hinote and hono resolve from this package. The bundle is a
// second copy of hinote, so the deck is recognized by shape, not by class.
// A fresh bundle per call also makes each reload see the edited files.
// The bundle runs from a temporary file, so `import.meta.url` and friends would
// point there. In every bundled file they are fixed to that file's real path
// first, so `new URL("./data.json", import.meta.url)` still finds the data, in
// the author's files and in packages that load a worker or WebAssembly from
// next to themselves. Only code is rewritten: the same words in a string, a
// comment, or a slide's text stay as written.
const META_KEYS = new Set([
  "url",
  "dir",
  "dirname",
  "path",
  "filename",
  "file",
]);

export function fixImportMeta(
  source: string,
  values: Record<string, string>,
  jsx: boolean,
): string {
  const program = parseProgram(source, jsx);
  if (!program) return source;
  const found: Node[] = [];
  walk(program, (node) => {
    const meta = child(node, "object");
    const key = identifier(child(node, "property"));
    if (
      node.type === "MemberExpression" &&
      !node.computed &&
      meta?.type === "MetaProperty" &&
      identifier(child(meta, "meta")) === "import" &&
      key !== undefined &&
      META_KEYS.has(key)
    )
      found.push(node);
    return true;
  });
  let result = "";
  let from = 0;
  for (const node of found.sort((a, b) => a.start - b.start)) {
    const key = identifier(child(node, "property")) ?? "";
    result += source.slice(from, node.start) + JSON.stringify(values[key]);
    from = node.end;
  }
  return result + source.slice(from);
}

const sourceMeta: Plugin = {
  name: "hinote-source-meta",
  transform: {
    filter: { id: /\.[cm]?[jt]sx?$/, code: "import.meta" },
    handler(code, path) {
      const values: Record<string, string> = {
        url: pathToFileURL(path).href,
        dir: dirname(path),
        dirname: dirname(path),
        path,
        filename: path,
        file: basename(path),
      };
      return fixImportMeta(code, values, path.endsWith("x"));
    },
  },
};

// A directory stands for the deck.tsx in it.
export function deckPath(file = "deck.tsx"): string {
  const absolute = resolve(file);
  return existsSync(absolute) && statSync(absolute).isDirectory()
    ? join(absolute, "deck.tsx")
    : absolute;
}

export async function loadDeckFile(file: string): Promise<Deck> {
  const absolute = deckPath(file);
  if (!existsSync(absolute))
    throw new HinoteError(`Could not load ${absolute}: file does not exist.`, {
      code: "deck-not-found",
      hint: "Pass the deck file (hinote check talk/deck.tsx), or create one with hinote init.",
    });
  let code: string;
  try {
    code = await bundle(absolute, [sourceMeta]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new HinoteError(`Could not load ${absolute}: ${message}`, {
      code: "deck-load",
    });
  }
  const dir = await mkdtemp(join(tmpdir(), "hinote-deck-"));
  const outfile = join(dir, "deck.mjs");
  try {
    await writeFile(outfile, code);
    const loaded: unknown = await import(pathToFileURL(outfile).href);
    const deck = isPlainObject(loaded) ? loaded.default : undefined;
    if (!isDeck(deck))
      throw new HinoteError(
        `Could not load ${absolute}: the default export must be createSlide([...]).`,
        {
          code: "deck-export",
          hint: "End deck.tsx with: export default createSlide([...])",
        },
      );
    return deck;
  } catch (error) {
    if (isHinoteError(error)) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new HinoteError(`Could not load ${absolute}: ${message}`, {
      code: "deck-load",
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
