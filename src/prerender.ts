import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { copyAssets } from "./assets.ts";
import type { Deck } from "./deck.ts";
import { HinoteError } from "./errors.ts";

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
// so any static host serves the same paths: /, /3/, /presenter/, /presenter/3/.
// With no server behind them, the pages sync between windows of one browser.
export async function prerender(
  deck: Deck,
  deckDir: string,
  outDir: string,
  base: string,
): Promise<{ pages: string[]; copied: string[] }> {
  const pages: string[] = [];
  let html = "";
  for (const page of ["view", "presenter"] as const) {
    html = await deck.render(page, base, "broadcast");
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
