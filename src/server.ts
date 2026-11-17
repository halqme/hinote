import { existsSync, realpathSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
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

export function createDevApp(
  pages: { view: string; presenter: string },
  rootDir: string,
) {
  const app = new Hono();
  app.get("/", () => html(pages.view));
  app.get("/presenter", () => html(pages.presenter));
  app.get("*", (c) => {
    const file = resolveInside(rootDir, new URL(c.req.url).pathname);
    if (!file) return c.notFound();
    return new Response(Bun.file(file));
  });
  return app;
}

function html(body: string): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
