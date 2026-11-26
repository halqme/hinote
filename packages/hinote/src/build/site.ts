import { mkdir, writeFile } from "node:fs/promises";
import { relative } from "node:path";
import { toSSG } from "hono/ssg";
import type { Deck } from "@hinote/core/internal";
import { copyAssets } from "./assets.ts";
import { HinoteError } from "../errors.ts";
import { inlineScripts } from "./scripts.ts";

// Writes every page the deck answers, by asking the deck for each of its
// routes as Hono's static site generation does: index.html for the first
// slide, 2.html, 3.html for the rest, and, when the deck turns the presenter
// on, presenter.html and presenter/2.html; then the stylesheet and runtime the
// pages share, under _hinote/, and the files the slides refer to. Pages link
// to each other relative to the deck root, so the site works under any path.
export async function writeSite(
  deck: Deck,
  deckDir: string,
  outDir: string,
): Promise<{ pages: string[]; copied: string[] }> {
  deck.transform = inlineScripts;
  const result = await toSSG(deck, { mkdir, writeFile }, { dir: outDir });
  if (!result.success)
    throw result.error instanceof HinoteError
      ? result.error
      : new HinoteError(
          `Could not write the site: ${result.error?.message ?? "unknown error"}`,
        );
  // Every slide is in the single page, so it names every file they load.
  const copied = await copyAssets(await deck.render(), deckDir, outDir);
  const pages = (result.files ?? [])
    .filter((file) => file.endsWith(".html"))
    .sort((a, b) =>
      relative(outDir, a).localeCompare(relative(outDir, b), "en", {
        numeric: true,
      }),
    );
  return { pages, copied };
}
