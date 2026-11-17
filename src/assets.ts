import { existsSync, realpathSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { resolveInside } from "./server.ts";

// Relative URLs a built page loads: src, href, poster, and srcset attributes,
// and url() in <style> and style attributes. Scripts are left out, and so is
// text such as code on a slide, which the page shows but never loads.
export function referencedPaths(html: string): string[] {
  const page = html.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  const found: string[] = [];
  for (const match of page.matchAll(
    /\s(?:src|href|poster)="([^"]*)"|\ssrcset="([^"]*)"/gi,
  )) {
    if (match[1] !== undefined) found.push(match[1]);
    else
      for (const candidate of (match[2] ?? "").split(","))
        found.push(candidate.trim().split(/\s+/)[0] ?? "");
  }
  const css = [
    ...[...page.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(
      (match) => match[1] ?? "",
    ),
    ...[...page.matchAll(/\sstyle="([^"]*)"/gi)].map((match) => match[1] ?? ""),
  ];
  for (const text of css) {
    for (const match of decode(text).matchAll(
      /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi,
    ))
      found.push(match[2] ?? "");
  }
  const paths = new Set<string>();
  for (const raw of found) {
    const url = decode(raw).trim();
    // Only plain relative paths: no scheme, no //host, no root, no fragment.
    if (!url || /^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(url)) continue;
    const path = url.replace(/[?#].*$/, "");
    if (path) paths.add(path);
  }
  return [...paths];
}

function decode(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// Copies the files a built page refers to from the deck directory to the
// directory of the page, keeping their relative paths. A reference that leaves
// the deck directory, or that is not a file there, is left alone.
export async function copyAssets(
  html: string,
  deckDir: string,
  outDir: string,
): Promise<string[]> {
  const copied: string[] = [];
  for (const path of referencedPaths(html)) {
    // resolveInside decodes the URL path itself and refuses one that leaves the
    // directory, so the decoded path below stays inside outDir as well.
    const source = resolveInside(deckDir, path);
    if (!source) continue;
    const target = resolve(join(outDir, decodeURIComponent(path)));
    // Building into the deck directory itself: the file is already there.
    if (existsSync(target) && realpathSync(target) === source) continue;
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
    copied.push(target);
  }
  return copied;
}
