import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import { validator } from "hono/validator";
import { contentsAt, outline } from "./contents.ts";
import { parseCss, type CssInput, type CssSource } from "./css.ts";
import { HinoteError } from "../errors.ts";
import { isPlainObject } from "../guards.ts";
import { syncHub } from "./hub.ts";
import { parseServedPath } from "../client/location.ts";
import { citationOrder, numberCitations } from "../components/cite.tsx";
import { renderDeck, type Page, type Sync } from "./render.ts";
import type { Slide } from "./slide.ts";
import type { Theme } from "@hinote/types";
import { parseTheme } from "./theme.ts";
import { parseTransition, type Transition } from "./transition.ts";

export type Aspect = "16:9" | "4:3" | `${number}:${number}`;

// What the HTML document has once: only the top-level deck, the one deck.tsx
// exports, may set it.
export type DocumentOptions = {
  // Document title. Defaults to the first slide title.
  title?: string;
  // Document language, such as "ja" or "ja-JP". `<html>` has no `lang` when
  // this is omitted.
  lang?: string;
  // Canvas ratio, "16:9" by default.
  aspect?: Aspect;
  // The presenter view, sync, and the pointer. They are for presenting from
  // this machine, so they are off unless a deck turns them on; `hinote dev`
  // turns them on for itself when it serves localhost.
  presenter?: boolean;
  // `n / total` on each slide, counted after nested decks are flattened. A
  // slide can hide its own with `pageNumber: false`.
  pageNumber?: boolean;
};

export type DeckOptions = {
  // Set once, on the top-level deck.
  document?: DocumentOptions;
  // A name for this deck's part of the talk. Each slide's render function
  // receives it in `sections`.
  section?: string;
  // The rest apply to this deck's slides. A nested deck's win over the decks
  // around it, and a slide's own win over both.
  theme?: Theme;
  // How slides enter, "none" by default.
  transition?: Transition;
  // CSS for every slide in this deck, whatever its selectors.
  css?: CssInput;
};

export type Canvas = { width: number; height: number };

// Slides are laid out on a canvas 1080 pixels tall and scaled to fit the window.
const CANVAS_HEIGHT = 1080;
const PING_MS = 5000;
// Sync messages are small JSON objects; anything larger is not from a hinote page.
const MAX_MESSAGE_BYTES = 4096;

type SyncPost = { channel: string; from: string; message: object };

function isSyncPost(body: unknown): body is SyncPost {
  return (
    typeof body === "object" &&
    body !== null &&
    "channel" in body &&
    typeof body.channel === "string" &&
    "from" in body &&
    typeof body.from === "string" &&
    "message" in body &&
    typeof body.message === "object" &&
    body.message !== null
  );
}

const ASPECT = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/;
// A short language tag: "ja", "en", "ja-JP", "zh-Hans". Not free text.
const LANGUAGE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

function isAspect(value: string): value is Aspect {
  return ASPECT.test(value);
}

export function parseAspect(aspect: string): Canvas {
  const match = ASPECT.exec(aspect);
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
  "document",
  "section",
  "theme",
  "transition",
  "css",
]);

const DOCUMENT_KEYS = new Set([
  "title",
  "lang",
  "aspect",
  "presenter",
  "pageNumber",
]);

type ParsedDeckOptions = Omit<DeckOptions, "css"> & {
  css?: readonly CssSource[];
};

function parseDocument(value: unknown): DocumentOptions {
  if (!isPlainObject(value))
    throw new HinoteError('Deck option "document" must be an object.');
  for (const key of Object.keys(value)) {
    if (!DOCUMENT_KEYS.has(key))
      throw new HinoteError(`Unknown document option "${key}".`);
  }
  const options: DocumentOptions = {};
  if (value.title !== undefined) {
    if (typeof value.title !== "string")
      throw new HinoteError('Document option "title" must be a string.');
    options.title = value.title;
  }
  if (value.lang !== undefined) {
    if (typeof value.lang !== "string")
      throw new HinoteError('Document option "lang" must be a string.');
    if (!LANGUAGE.test(value.lang))
      throw new HinoteError(
        'Document option "lang" must be a language tag like "ja" or "ja-JP".',
      );
    options.lang = value.lang;
  }
  if (value.aspect !== undefined) {
    if (typeof value.aspect !== "string")
      throw new HinoteError('Document option "aspect" must be a string.');
    parseAspect(value.aspect);
    if (isAspect(value.aspect)) options.aspect = value.aspect;
  }
  if (value.presenter !== undefined) {
    if (typeof value.presenter !== "boolean")
      throw new HinoteError(
        'Document option "presenter" must be true or false.',
      );
    options.presenter = value.presenter;
  }
  if (value.pageNumber !== undefined) {
    if (typeof value.pageNumber !== "boolean")
      throw new HinoteError(
        'Document option "pageNumber" must be true or false.',
      );
    options.pageNumber = value.pageNumber;
  }
  return options;
}

export function parseDeckOptions(
  value: Record<string, unknown>,
): ParsedDeckOptions {
  for (const key of Object.keys(value)) {
    if (!OPTION_KEYS.has(key))
      throw new HinoteError(`Unknown deck option "${key}".`);
  }
  const options: ParsedDeckOptions = {};
  if (value.document !== undefined)
    options.document = parseDocument(value.document);
  if (value.section !== undefined) {
    if (typeof value.section !== "string")
      throw new HinoteError('Deck option "section" must be a string.');
    options.section = value.section;
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
    this.presenter = options.document?.presenter === true;
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
        html = this.render(kind, { base, sync }).then((rendered) => {
          if (transform) return transform(rendered);
          // Only the hinote CLI bundles a <Script> file. Served as it is, the
          // page would carry a script that never runs.
          if (rendered.includes(" data-hinote-src="))
            throw new HinoteError(
              "A slide has <Script src> with a file URL, which only the hinote CLI bundles.",
              {
                code: "script-unbundled",
                hint: 'In a server of your own, bundle the file yourself and pass its URL as a string: <Script src="/scripts/poll.js" />.',
              },
            );
          return rendered;
        });
        this.#pages.set(key, html);
        html.catch(() => this.#pages.delete(key));
      }
      return c.html(await html, 200, { "cache-control": "no-store" });
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

    // A JSON body of at most MAX_MESSAGE_BYTES. Without the JSON content type
    // the body is not read, so the message is refused.
    this.post(
      "/_hinote/sync",
      (c, next) => (this.presenter ? next() : c.notFound()),
      bodyLimit({
        maxSize: MAX_MESSAGE_BYTES,
        onError: (c) => c.body(null, 413),
      }),
      validator("json", (body: unknown, c) =>
        isSyncPost(body) ? body : c.body(null, 400),
      ),
      (c) => {
        const { channel, from, message } = c.req.valid("json");
        syncHub().broadcast(channel, message, from);
        return c.body(null, 204);
      },
    );
  }

  get canvas(): Canvas {
    return parseAspect(this.config.document?.aspect ?? "16:9");
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
    // Citations are numbered for the whole deck, as a link resolves to it.
    const order = citationOrder(
      results.flatMap((result) => ("html" in result ? [result.html] : [])),
    );
    return results.map((result) =>
      "html" in result ? { html: numberCitations(result.html, order) } : result,
    );
  }

  // Where each slide id is in the whole deck. Two slides with one id would
  // make a link ambiguous, so that is an error instead of the first match.
  #targets(): Map<string, number> {
    const targets = new Map<string, number>();
    for (const [index, slide] of this.slides.entries()) {
      const id = slide.options.id;
      if (id === undefined) continue;
      const first = targets.get(id);
      if (first !== undefined)
        throw new HinoteError(
          `Slides ${first + 1} and ${index + 1} both have the id "${id}".`,
          { hint: "Give each slide its own id." },
        );
      targets.set(id, index);
    }
    return targets;
  }

  async #renderSlides(
    slides: readonly Slide[],
    page: Page,
    options: { base?: string; sync?: Sync; directories?: boolean },
  ) {
    // Numbers come from the whole deck, so rendering one slide still says "2 / 12".
    const pageNumbers =
      this.config.document?.pageNumber === true
        ? slides.map((slide) => this.slides.indexOf(slide) + 1)
        : undefined;
    const sections = outline(this.slides);
    return renderDeck({
      ...options,
      slides,
      targets: this.#targets(),
      place: (slide) => {
        const index = this.slides.indexOf(slide);
        return {
          contents: contentsAt(sections, index),
          number: index + 1,
          total: this.slides.length,
        };
      },
      theme: this.config.theme,
      title: this.config.document?.title,
      lang: this.config.document?.lang,
      canvas: this.canvas,
      transition: this.config.transition,
      css: this.config.css,
      page,
      pageNumbers,
      pageCount: pageNumbers && this.slides.length,
    });
  }
}
