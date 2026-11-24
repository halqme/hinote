import { existsSync, statSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { cssAsText } from "./css-text.ts";
import type { Deck } from "../deck/deck.ts";
import { HinoteError, isHinoteError } from "../errors.ts";
import { isPlainObject } from "../guards.ts";
import {
  bundle,
  isBun,
  loaderFor,
  readText,
  type LoadPlugin,
} from "./runtime.ts";
import { isDeck } from "../deck/create.ts";

// Bundle the deck so hinote and hono resolve from this package. The bundle is a
// second copy of hinote, so the deck is recognized by shape, not by class.
// A fresh bundle per call also makes each reload see the edited files.
// The bundle runs from a temporary file, so `import.meta.url` and friends would
// point there. In the author's own files they are fixed to each file's real
// path first, so `new URL("./data.json", import.meta.url)` still finds the data.
const META = /\bimport\.meta\.(url|dir|dirname|path|filename|file)\b/g;

const sourceMeta: LoadPlugin = {
  name: "hinote-source-meta",
  setup(build) {
    build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async ({ path }) => {
      const contents = await readText(path);
      const loader = loaderFor(path);
      if (
        path.includes(`${sep}node_modules${sep}`) ||
        !contents.includes("import.meta")
      )
        return { contents, loader };
      const values: Record<string, string> = {
        url: pathToFileURL(path).href,
        dir: dirname(path),
        dirname: dirname(path),
        path,
        filename: path,
        file: basename(path),
      };
      return {
        contents: contents.replace(META, (_, key: string) =>
          JSON.stringify(values[key]),
        ),
        loader,
      };
    });
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
    code = await bundle(
      absolute,
      isBun ? [sourceMeta, cssAsText] : [sourceMeta],
    );
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
