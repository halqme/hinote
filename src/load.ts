import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { HinoteError } from "./errors.ts";
import { collectSlides, type Slide } from "./slide.ts";
import { parseThemeOverride, type ThemeOverride } from "./theme.ts";

export type LoadedDeck = {
  slides: Slide[];
  theme?: ThemeOverride;
};

// Bundle the deck so hinote and hono resolve from this package. The bundle is a
// second copy of hinote, so a slide is recognized by its kind and render function.
// Tree shaking stays off so a named `theme` export is kept.
export async function loadDeckFile(file: string): Promise<LoadedDeck> {
  const absolute = resolve(file);
  if (!(await Bun.file(absolute).exists()))
    throw new HinoteError(`Could not load ${absolute}: file does not exist.`);
  const built = await Bun.build({
    entrypoints: [absolute],
    format: "esm",
    target: "bun",
    packages: "bundle",
    treeShaking: false,
    jsx: { runtime: "automatic", importSource: "hono/jsx", development: false },
  });
  if (!built.success) {
    const message = built.logs.map((log) => log.message).join("\n");
    throw new HinoteError(
      `Could not load ${absolute}: ${message || "build failed."}`,
    );
  }
  const artifact = built.outputs[0];
  if (!artifact)
    throw new HinoteError(
      `Could not load ${absolute}: build produced no output.`,
    );
  const dir = await mkdtemp(join(tmpdir(), "hinote-deck-"));
  const outfile = join(dir, "deck.mjs");
  try {
    await writeFile(outfile, await artifact.text());
    const loaded = (await import(pathToFileURL(outfile).href)) as Record<
      string,
      unknown
    >;
    const theme =
      loaded.theme === undefined ? undefined : parseThemeOverride(loaded.theme);
    return { slides: collectSlides(loaded.default), theme };
  } catch (error) {
    if (error instanceof HinoteError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new HinoteError(`Could not load ${absolute}: ${message}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
