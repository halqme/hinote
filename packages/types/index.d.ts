// Types shared by hinote and the @hinote/* packages. Types only: there is no
// JavaScript, so import them with `import type`.

// Each group holds named tokens. The listed names are the ones hinote's own CSS
// reads; any other name is allowed and becomes a CSS variable the same way.
type Tokens<Known extends string> = { [K in Known]?: string } & {
  [name: string]: string | undefined;
};

export type Theme = {
  colors?: Tokens<"bg" | "fg" | "accent" | "muted" | "surface" | "border">;
  fonts?: Tokens<"base" | "heading" | "mono">;
  typography?: Tokens<"h1" | "h2" | "h3" | "body" | "small" | "code">;
  shadows?: Tokens<"sm" | "md" | "lg">;
  spacing?: Tokens<"unit" | "safe">;
  radius?: string;
};

// What a render function is told about its own slide, so a shared heading can
// read the title once instead of repeating it.
export type SlideContext = {
  title?: string;
  // The `section` of each deck around this slide, outermost first.
  sections: readonly string[];
};

// An error hinote reports as its own: the message, a stable `code` to match
// on, and a `hint` about what to do next, instead of a stack trace. Any Error
// whose `name` is "HinoteError" and that has a string `code` counts, so a
// package can throw one without importing hinote.
export interface HinoteErrorLike extends Error {
  name: "HinoteError";
  code: string;
  hint?: string;
  // 1 for a problem with the deck or files, 2 for a command used wrongly.
  // 1 when left out.
  exitCode?: number;
}

// The browser side: what a page offers its scripts as `window.hinote`. A
// package declares the global itself (`declare const hinote: HinoteClient`)
// rather than importing hinote.

// "presenter" on the presenter view, "view" everywhere else.
export type Role = "view" | "presenter";

// The slide (from 0) and how many of its steps are shown.
export type Position = { slide: number; step: number };

// What hinote.observe reports about one element.
export type Observed = {
  // Its slide is the one shown.
  active: boolean;
  // How many of its steps are shown: of the ones it reserved with
  // `data-hinote-steps` (or <Steps>), else of its slide's. 0 while inactive.
  step: number;
  // How many steps it has: the ones it reserved, else its slide's.
  steps: number;
};

export type HinoteClient = {
  readonly role: Role;
  // How events reach other pages: through the deck's server, between windows
  // of one browser (prerender), or not at all (the built file, or a deck
  // without the presenter), where send() only reaches this page.
  readonly sync: "server" | "broadcast" | "none";
  readonly position: Position;
  // Calls `handler` for every event with this name, from this page or another
  // one. "position" is hinote's own: it fires at once with the current
  // position, then on every slide or step change. Returns a function that stops it.
  on(name: string, handler: (data: unknown) => void): () => void;
  on(name: "position", handler: (position: Position) => void): () => void;
  // Calls `handler` at once, then whenever the element's slide is shown or
  // hidden or one of its steps changes. An element outside the deck, such as
  // in a presenter's preview, is never active. Returns a function that stops it.
  observe(element: Element, handler: (state: Observed) => void): () => void;
  // Sends an event to every page of the deck, this one included. Pages that
  // do not sync (the built file, or a deck without the presenter) only reach
  // themselves. `data` must survive JSON and stay small (a few KB).
  send(name: string, data?: unknown): void;
  // A pointer position in canvas pixels of the current slide (1080 tall).
  toCanvas(event: { clientX: number; clientY: number }): {
    x: number;
    y: number;
  };
};

// What a component writes into a slide for the hinote CLI, so a package can
// write it without importing hinote:
// - `<script type="module" data-hinote-src="file:///...">` is bundled and
//   inlined once per page, after window.hinote exists (what <Script> writes).
// - `data-hinote-step="auto"` is a step, numbered in document order (<Step>).
// - `data-hinote-effect` on a step moves it into place as it fades in.
// - `data-hinote-steps="auto:N"` reserves the next N steps for the element
//   (<Steps>); hinote.observe reports them.
// - `data-hinote-morph="name"` moves the element into the one with the same
//   name on the slide shown next (<Morph>).
export type SlideMarkup = {
  "data-hinote-src": `file:${string}`;
  "data-hinote-step": "auto" | `${number}`;
  "data-hinote-effect": "up" | "down" | "left" | "right" | "zoom";
  "data-hinote-steps": `auto:${number}`;
  "data-hinote-morph": string;
};
