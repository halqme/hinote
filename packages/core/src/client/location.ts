import type { Role } from "./player.ts";

// Each slide is a route of the deck, counted from 1: `/1`, `/2`, and
// `/presenter/1`, `/presenter/2` for the presenter. The deck root, `/` and
// `/presenter`, answers with the first slide too. Paths do not nest further,
// so steps stay out of the URL and a reload starts the slide with no step
// revealed.
//
// A page names the deck root in `<base href>` and links to slides relative to
// it, so the same pages work wherever the deck is: mounted with
// `app.route("/talk", deck)`, or written out by `hinote build` for a static
// host under any path. Links name slides by number, never the root, since
// `/talk/` with its trailing slash is not a route of a deck mounted at `/talk`.
// The built single file keeps the slide in the hash (`#3`), since it is one page.

// The route of a slide, from the deck root.
export function slideRoute(role: Role, slide: number): string {
  return `${role === "presenter" ? "/presenter" : ""}/${slide + 1}`;
}

// The deck root, which answers with the first slide.
export function rootRoute(role: Role): string {
  return role === "presenter" ? "/presenter" : "/";
}

// The href of a slide, relative to the deck root.
export function slideHref(role: Role, slide: number): string {
  return slideRoute(role, slide).slice(1);
}

// `<base href>` for a page served at `path`, which ends in `route`. Relative
// where it can be, so a page written to a static host under /repo still finds
// its deck root. The root itself without its trailing slash, `/talk`, has no
// directory to be relative to, so it is named in full.
export function baseHref(path: string, route: string): string {
  if (route === "/") return path.endsWith("/") ? "./" : `${path}/`;
  const depth = route.split("/").length - 2;
  return depth === 0 ? "./" : "../".repeat(depth);
}

export function parseHash(hash: string): number | undefined {
  const match = /^#(\d+)$/.exec(hash);
  return match ? Number(match[1]) - 1 : undefined;
}

export function slideHash(slide: number): string {
  return `#${slide + 1}`;
}
