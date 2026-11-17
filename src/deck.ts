import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { HinoteError } from "./errors.ts";
import { syncHub } from "./hub.ts";
import { renderDeck, type Page } from "./render.ts";
import type { Slide } from "./slide.ts";
import { parseTheme, type Theme } from "./theme.ts";

export type Aspect = "16:9" | "4:3" | `${number}:${number}`;

export type DeckOptions = {
  // Document title. Defaults to the first slide title.
  title?: string;
  theme?: Theme;
  // Canvas ratio, "16:9" by default. Only the top-level deck may set it.
  aspect?: Aspect;
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

const OPTION_KEYS = new Set(["title", "theme", "aspect"]);

export function parseDeckOptions(value: Record<string, unknown>): DeckOptions {
  for (const key of Object.keys(value)) {
    if (!OPTION_KEYS.has(key))
      throw new HinoteError(`Unknown deck option "${key}".`);
  }
  const options: DeckOptions = {};
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
  return options;
}

// A deck is a Hono app, so anything that runs Hono can serve it:
// `export default deck` for `bun deck.tsx`, or `app.route("/talk", deck)`.
export class Deck extends Hono {
  readonly kind = "deck";
  readonly slides: readonly Slide[];
  readonly config: DeckOptions;
  readonly #pages = new Map<Page, Promise<string>>();

  constructor(slides: readonly Slide[], options: DeckOptions = {}) {
    super();
    this.slides = slides;
    this.config = options;
    // A deck built while pages are open is an edited deck (`bun --hot`, `hinote dev`).
    syncHub().reloadAll();

    const page = (kind: "view" | "presenter") => async () => {
      let html = this.#pages.get(kind);
      if (!html) {
        html = this.render(kind);
        this.#pages.set(kind, html);
        html.catch(() => this.#pages.delete(kind));
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
  render(page: Page = "view") {
    return renderDeck({
      slides: this.slides,
      theme: this.config.theme,
      title: this.config.title,
      canvas: this.canvas,
      page,
    });
  }
}
