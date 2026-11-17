import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { cssAsText } from "./css-text.ts";
import type { Deck } from "./deck.ts";
import { HinoteError } from "./errors.ts";
import { bundle, loaderFor, readText, type LoadPlugin } from "./runtime.ts";
import { isDeck } from "./slide.ts";

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

export async function loadDeckFile(file: string): Promise<Deck> {
  const absolute = resolve(file);
  if (!existsSync(absolute))
    throw new HinoteError(`Could not load ${absolute}: file does not exist.`);
  let code: string;
  try {
    code = await bundle(absolute, [sourceMeta, cssAsText]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new HinoteError(`Could not load ${absolute}: ${message}`);
  }
  const dir = await mkdtemp(join(tmpdir(), "hinote-deck-"));
  const outfile = join(dir, "deck.mjs");
  try {
    await writeFile(outfile, code);
    const loaded = (await import(pathToFileURL(outfile).href)) as Record<
      string,
      unknown
    >;
    if (!isDeck(loaded.default))
      throw new HinoteError(
        `Could not load ${absolute}: the default export must be createSlide([...]).`,
      );
    return loaded.default;
  } catch (error) {
    if (error instanceof HinoteError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new HinoteError(`Could not load ${absolute}: ${message}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
