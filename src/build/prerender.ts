import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { copyAssets } from "./assets.ts";
import type { Deck } from "../deck/deck.ts";
import { HinoteError } from "../errors.ts";
import { inlineScripts } from "./scripts.ts";

// "/talk" for a deck hosted under /talk/, "" at the root of a host.
export function parseBase(value: string | undefined): string {
  const base = (value ?? "").replace(/\/+$/, "");
  if (base !== "" && !/^(\/[\w.~-]+)+$/.test(base))
    throw new HinoteError(
      `--base "${value}" must be a path such as /talk, made of letters, digits, and . _ ~ -.`,
    );
  return base;
}

// Writes the pages a server would answer, as directories with an index.html,
// so any static host serves the same paths: /, /3/, and, when the deck turns
// the presenter on, /presenter/ and /presenter/3/. With no server behind them,
// those pages sync between windows of one browser.
export async function prerender(
  deck: Deck,
  deckDir: string,
  outDir: string,
  base: string,
): Promise<{ pages: string[]; copied: string[] }> {
  const pages: string[] = [];
  let html = "";
  // The presenter, and the sync it needs, only when the deck turns it on.
  const kinds = deck.presenter
    ? (["view", "presenter"] as const)
    : (["view"] as const);
  for (const page of kinds) {
    html = await inlineScripts(
      await deck.render(page, {
        base,
        sync: deck.presenter ? "broadcast" : undefined,
        directories: true,
      }),
    );
    const prefix = page === "presenter" ? "presenter" : "";
    const paths = [
      prefix,
      ...deck.slides.map((_, i) => join(prefix, String(i + 1))),
    ];
    for (const path of paths) {
      const file = join(outDir, path, "index.html");
      await mkdir(join(outDir, path), { recursive: true });
      await writeFile(file, html);
      pages.push(file);
    }
  }
  // Both pages refer to the same files, so either one names them all.
  const copied = await copyAssets(html, deckDir, outDir);
  return { pages, copied };
}
