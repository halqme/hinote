import { existsSync, realpathSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { Hono } from "hono";

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

// Types for the files a deck usually sits next to; anything else is a download.
const TYPES: Record<string, string> = {
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

function contentType(file: string): string {
  return TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
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
    return new Response(await readFile(file), {
      headers: { "content-type": contentType(file) },
    });
  });
  return app;
}
