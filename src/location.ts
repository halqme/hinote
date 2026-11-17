import type { Role } from "./player.ts";

// Served pages keep the slide in the path: `<base>[/presenter][/<slide>]`, counted
// from 1. Paths do not nest further, so steps stay out of the URL and a reload
// starts the slide with no step revealed. A deck mounted with
// `app.route("/talk", deck)` has base "/talk". The built single file is opened
// from file://, so it keeps the slide in the hash (`#3`) and marks the presenter
// with `?presenter`.

export type ServedLocation = { base: string; role: Role; slide?: number };

const SERVED_PATH = /^(.*?)(\/presenter)?(?:\/(\d+))?\/?$/;

export function parseServedPath(pathname: string): ServedLocation {
  const match = SERVED_PATH.exec(pathname);
  const base = match?.[1] ?? "";
  const role = match?.[2] ? "presenter" : "view";
  if (!match?.[3]) return { base, role };
  return { base, role, slide: Number(match[3]) - 1 };
}

// Prerendered pages are directories on a static host, so their paths end in "/".
export function servedPath(
  base: string,
  role: Role,
  slide: number,
  trailingSlash = false,
): string {
  const presenter = role === "presenter" ? "/presenter" : "";
  return `${base}${presenter}/${slide + 1}${trailingSlash ? "/" : ""}`;
}

export function parseHash(hash: string): number | undefined {
  const match = /^#(\d+)$/.exec(hash);
  return match ? Number(match[1]) - 1 : undefined;
}

export function slideHash(slide: number): string {
  return `#${slide + 1}`;
}
