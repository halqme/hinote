import { existsSync, realpathSync } from "node:fs";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { resolveInside } from "./server.ts";

// The URLs a page loads: src, href, poster, and srcset attributes, and url()
// in <style> and style attributes. Text such as code on a slide is left out,
// since the page shows it but never loads it. `links` keeps <a href>, which
// is somewhere to go rather than a file; `scripts` keeps <script src>.
function loadedUrls(
  html: string,
  { links, scripts }: { links: boolean; scripts: boolean },
): string[] {
  const page = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (tag) =>
    scripts && /^<script\b[^>]*\ssrc="/i.test(tag)
      ? tag.slice(0, tag.indexOf(">") + 1)
      : "",
  );
  const found: string[] = [];
  for (const [, tag = "", attributes = ""] of page.matchAll(
    /<(\w+)\b([^>]*)>/g,
  )) {
    for (const [, name = "", value = ""] of attributes.matchAll(
      /\s(src|href|poster|srcset)="([^"]*)"/gi,
    )) {
      if (name.toLowerCase() === "srcset")
        for (const candidate of value.split(","))
          found.push(candidate.trim().split(/\s+/)[0] ?? "");
      else if (links || tag.toLowerCase() !== "a") found.push(value);
    }
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
  return found.map((raw) => decode(raw).trim());
}

// Files a page loads from the network. A page built to open without a
// server shows them only while it is online.
export function remoteUrls(html: string): string[] {
  return [
    ...new Set(
      loadedUrls(html, { links: false, scripts: true }).filter((url) =>
        /^(?:https?:)?\/\//i.test(url),
      ),
    ),
  ];
}

// Relative paths a built page loads, which hinote copies next to it.
export function referencedPaths(html: string): string[] {
  const paths = new Set<string>();
  for (const url of loadedUrls(html, { links: true, scripts: false })) {
    // Only plain relative paths: no scheme, no //host, no root, no fragment.
    if (!url || /^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(url)) continue;
    const path = url.replace(/[?#].*$/, "");
    if (path) paths.add(path);
  }
  return [...paths];
}

export function decode(text: string): string {
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

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".pdf": "application/pdf",
  ".json": "application/json",
  ".txt": "text/plain",
};

// Puts the files the page loads into the page as data: URLs, so the HTML is
// the whole deck: something to attach or send, at the cost of its size. A
// reference to a file that is not there stays as written.
export async function embedAssets(
  html: string,
  deckDir: string,
): Promise<{ html: string; embedded: string[]; bytes: number }> {
  const urls = new Map<string, string>();
  let bytes = 0;
  for (const path of referencedPaths(html)) {
    const source = resolveInside(deckDir, path);
    if (!source) continue;
    const data = await readFile(source);
    bytes += data.length;
    const type =
      TYPES[extname(source).toLowerCase()] ?? "application/octet-stream";
    urls.set(path, `data:${type};base64,${data.toString("base64")}`);
  }
  // The same places referencedPaths reads, with the URL as written there.
  const swap = (raw: string): string => {
    const url = decode(raw).trim();
    return urls.get(url.replace(/[?#].*$/, "")) ?? raw;
  };
  const out = html
    .replace(
      /(\s(?:src|href|poster)=")([^"]*)(")/gi,
      (_, before: string, url: string, after: string) =>
        before + swap(url) + after,
    )
    .replace(
      /(\ssrcset=")([^"]*)(")/gi,
      (_, before: string, list: string, after: string) =>
        before +
        list
          .split(",")
          .map((candidate) =>
            candidate.replace(
              /^(\s*)(\S+)/,
              (__, space: string, url: string) => space + swap(url),
            ),
          )
          .join(",") +
        after,
    )
    .replace(
      /url\(\s*((?:&quot;|&#39;|['"])?)([^'")&]+)\1\s*\)/gi,
      (whole: string, quote: string, url: string) =>
        urls.has(decode(url).trim())
          ? `url(${quote}${swap(url)}${quote})`
          : whole,
    );
  return { html: out, embedded: [...urls.keys()], bytes };
}
