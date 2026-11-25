import { existsSync, realpathSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { Hono } from "hono";
import { getMimeType } from "hono/utils/mime";

const inside = (path: string, root: string) =>
  path === root || path.startsWith(`${root}${sep}`);

const throughNodeModules = (path: string) =>
  path.split(sep).includes("node_modules");

// The file a URL path names inside `root`, or null. A symbolic link that leads
// out of `root` is refused, except where a package manager put it: a path
// through node_modules may end in a package stored in another node_modules,
// such as Bun's or pnpm's store at the workspace root.
export function resolveInside(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const relative = decoded.replace(/^[/\\]+/, "");
  if (relative === "") return null;
  const rootReal = realpathSync(root);
  const target = resolve(rootReal, relative);
  if (!inside(target, rootReal)) return null;
  if (!existsSync(target) || !statSync(target).isFile()) return null;
  const real = realpathSync(target);
  if (inside(real, rootReal)) return real;
  const linked =
    throughNodeModules(target.slice(rootReal.length)) &&
    throughNodeModules(real);
  return linked ? real : null;
}

export type FetchApp = {
  fetch(request: Request): Response | Promise<Response>;
};

// `hinote dev` serves the current deck and falls back to files next to deck.tsx,
// such as images. `current` is read per request so a reload swaps the deck in place.
export function createDevApp(current: () => FetchApp, rootDir: string) {
  const app = new Hono();
  app.all("*", async (c) => {
    const response = await current().fetch(c.req.raw);
    if (response.status !== 404 || c.req.method !== "GET") return response;
    // c.req.path decodes like decodeURI: %25 and reserved characters such as
    // %23 stay encoded, so resolveInside's own decoding still decodes once.
    const file = resolveInside(rootDir, c.req.path);
    if (!file) return response;
    // A type Hono does not know is a download.
    return c.body(new Uint8Array(await readFile(file)), 200, {
      "content-type": getMimeType(file) ?? "application/octet-stream",
    });
  });
  return app;
}
