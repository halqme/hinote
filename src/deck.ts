import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import { parseCss, type CssInput, type CssSource } from "./css.ts";
import { HinoteError } from "./errors.ts";
import { syncHub } from "./hub.ts";
import { parseServedPath } from "./location.ts";
import { renderDeck, type Page, type Sync } from "./render.ts";
import type { Slide } from "./slide.ts";
import { parseTheme, type Theme } from "./theme.ts";
import { parseTransition, type Transition } from "./transition.ts";

export type Aspect = "16:9" | "4:3" | `${number}:${number}`;

export type DeckOptions = {
  // Document title. Defaults to the first slide title.
  title?: string;
  theme?: Theme;
  // Canvas ratio, "16:9" by default. Only the top-level deck may set it.
  aspect?: Aspect;
  // How slides enter, "none" by default. A slide can set its own.
  transition?: Transition;
  // CSS for every slide in this deck. A nested deck's CSS and a slide's own
  // CSS win over it, whatever their selectors.
  css?: CssInput;
  // The presenter view, sync, and the pointer. They are for presenting from
  // this machine, so they are off unless a deck turns them on; `hinote dev`
  // turns them on for itself when it serves localhost. Only the top-level
  // deck may set it.
  presenter?: boolean;
  // `n / total` on each slide, counted after nested decks are flattened.
  // Only the top-level deck may set it. A slide can hide its own with
  // `pageNumber: false`.
  pageNumber?: boolean;
};

export type Canvas = { width: number; height: number };

// Slides are laid out on a canvas 1080 pixels tall and scaled to fit the window.
const CANVAS_HEIGHT = 1080;
const PING_MS = 5000;
// Sync messages are small JSON objects; anything larger is not from a hinote page.
const MAX_MESSAGE_BYTES = 4096;

export function parseAspect(aspect: string): Canvas {
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(aspect);
  const width = Number(match?.[1]);
  const height = Number(match?.[2]);
  if (!match || !(width > 0) || !(height > 0))
    throw new HinoteError(
      `aspect "${aspect}" must look like "16:9" with two positive numbers.`,
    );
  return {
    width: Math.round((CANVAS_HEIGHT * width) / height),
    height: CANVAS_HEIGHT,
  };
}

const OPTION_KEYS = new Set([
  "title",
  "theme",
  "aspect",
  "transition",
  "css",
  "presenter",
  "pageNumber",
]);

type ParsedDeckOptions = Omit<DeckOptions, "css"> & {
  css?: readonly CssSource[];
};

export function parseDeckOptions(
  value: Record<string, unknown>,
): ParsedDeckOptions {
  for (const key of Object.keys(value)) {
    if (!OPTION_KEYS.has(key))
      throw new HinoteError(`Unknown deck option "${key}".`);
  }
  const options: ParsedDeckOptions = {};
  if (value.title !== undefined) {
    if (typeof value.title !== "string")
      throw new HinoteError('Deck option "title" must be a string.');
    options.title = value.title;
  }
  if (value.aspect !== undefined) {
    if (typeof value.aspect !== "string")
      throw new HinoteError('Deck option "aspect" must be a string.');
    parseAspect(value.aspect);
    options.aspect = value.aspect as Aspect;
  }
  if (value.theme !== undefined)
    options.theme = parseTheme(value.theme, "deck theme");
  if (value.transition !== undefined)
    options.transition = parseTransition(
      value.transition,
      'Deck option "transition"',
    );
  if (value.css !== undefined)
    options.css = parseCss(value.css, 'Deck option "css"');
  if (value.presenter !== undefined) {
    if (typeof value.presenter !== "boolean")
      throw new HinoteError('Deck option "presenter" must be true or false.');
    options.presenter = value.presenter;
  }
  if (value.pageNumber !== undefined) {
    if (typeof value.pageNumber !== "boolean")
      throw new HinoteError('Deck option "pageNumber" must be true or false.');
    options.pageNumber = value.pageNumber;
  }
  return options;
}

// A deck is a Hono app: `hinote dev` serves it, and a server of your own on
// any runtime that runs Hono can mount it with `app.route("/talk", deck)`.
export class Deck extends Hono {
  readonly kind = "deck";
  readonly slides: readonly Slide[];
  readonly config: ParsedDeckOptions;
  // Whether /presenter, sync, and the pointer are served. `hinote dev` turns it
  // on when it serves localhost.
  presenter: boolean;
  // Set by `hinote dev`: pages listen for reloads even without the presenter.
  live = false;
  // Set by `hinote dev` to bundle <Script> files into each page it serves.
  transform?: (html: string) => Promise<string>;
  readonly #pages = new Map<string, Promise<string>>();

  constructor(slides: readonly Slide[], options: ParsedDeckOptions = {}) {
    super();
    this.slides = slides;
    this.config = options;
    this.presenter = options.presenter === true;
    // A deck built while pages are open is an edited deck (`bun --hot`, `hinote dev`).
    syncHub().reloadAll();

    const page = (kind: "view" | "presenter") => async (c: Context) => {
      if (kind === "presenter" && !this.presenter) return c.notFound();
      // Relative URLs in slides resolve against the deck root, not /presenter/3.
      const base = parseServedPath(new URL(c.req.url).pathname).base;
      const sync: Sync | undefined = this.presenter
        ? "server"
        : this.live
          ? "reload"
          : undefined;
      const key = `${kind} ${base} ${sync}`;
      let html = this.#pages.get(key);
      if (!html) {
        const transform = this.transform;
        html = this.render(kind, { base, sync }).then((rendered) =>
          transform ? transform(rendered) : rendered,
        );
        this.#pages.set(key, html);
        html.catch(() => this.#pages.delete(key));
      }
      return new Response(await html, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    };
    // Every slide serves the same page; the client reads the slide from the path.
    this.get("/", page("view"));
    this.get("/:slide{[0-9]+}", page("view"));
    this.get("/presenter", page("presenter"));
    this.get("/presenter/:slide{[0-9]+}", page("presenter"));

    this.get("/_hinote/events", (c) => {
      if (!this.presenter && !this.live) return c.notFound();
      const id = c.req.query("id") ?? crypto.randomUUID();
      const channel = c.req.query("channel") ?? "";
      return streamSSE(c, async (stream) => {
        const disconnect = syncHub().connect(channel, id, (message) => {
          void stream.writeSSE({ data: JSON.stringify(message) });
        });
        stream.onAbort(disconnect);
        try {
          // Comments keep idle connections open on servers with short idle timeouts.
          while (!stream.aborted) {
            await stream.write(": ping\n\n");
            await stream.sleep(PING_MS);
          }
        } finally {
          disconnect();
        }
      });
    });

    this.post("/_hinote/sync", async (c) => {
      if (!this.presenter) return c.notFound();
      const text = await c.req.text();
      if (text.length > MAX_MESSAGE_BYTES) return c.body(null, 413);
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        return c.body(null, 400);
      }
      if (!body || typeof body !== "object") return c.body(null, 400);
      const { channel, from, message } = body as {
        channel?: unknown;
        from?: unknown;
        message?: unknown;
      };
      if (
        typeof channel !== "string" ||
        typeof from !== "string" ||
        !message ||
        typeof message !== "object"
      )
        return c.body(null, 400);
      syncHub().broadcast(channel, message, from);
      return c.body(null, 204);
    });
  }

  get canvas(): Canvas {
    return parseAspect(this.config.aspect ?? "16:9");
  }

  // Renders the whole deck as one HTML document.
  // `base` is the path the deck is served under; served pages resolve relative
  // URLs against it. The static file resolves them against itself.
  render(
    page: Page = "view",
    options: { base?: string; sync?: Sync; directories?: boolean } = {},
  ) {
    return this.#renderSlides(this.slides, page, options);
  }

  // Renders each slide as a page of its own, so a slide that fails can be
  // named (`hinote check`, `hinote inspect`). A failure is kept, not thrown.
  async renderEach(
    page: Page = "view",
  ): Promise<({ html: string } | { error: unknown })[]> {
    const results: ({ html: string } | { error: unknown })[] = [];
    for (const slide of this.slides) {
      try {
        results.push({ html: await this.#renderSlides([slide], page, {}) });
      } catch (error) {
        results.push({ error });
      }
    }
    return results;
  }

  #renderSlides(
    slides: readonly Slide[],
    page: Page,
    options: { base?: string; sync?: Sync; directories?: boolean },
  ) {
    // Numbers come from the whole deck, so rendering one slide still says "2 / 12".
    const pageNumbers =
      this.config.pageNumber === true
        ? slides.map((slide) => this.slides.indexOf(slide) + 1)
        : undefined;
    return renderDeck({
      ...options,
      slides,
      theme: this.config.theme,
      title: this.config.title,
      canvas: this.canvas,
      transition: this.config.transition,
      css: this.config.css,
      page,
      pageNumbers,
      pageCount: pageNumbers && this.slides.length,
    });
  }
}
