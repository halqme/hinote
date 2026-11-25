import { existsSync, realpathSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { Hono } from "hono";
import { getMimeType } from "hono/utils/mime";

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
  if (target !== rootReal && !target.startsWith(`${rootReal}${sep}`))
    return null;
  if (!existsSync(target) || !statSync(target).isFile()) return null;
  const real = realpathSync(target);
  if (real !== rootReal && !real.startsWith(`${rootReal}${sep}`)) return null;
  return real;
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
    const file = resolveInside(rootDir, new URL(c.req.url).pathname);
    if (!file) return response;
    // A type Hono does not know is a download.
    return c.body(new Uint8Array(await readFile(file)), 200, {
      "content-type": getMimeType(file) ?? "application/octet-stream",
    });
  });
  return app;
}
