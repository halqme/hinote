import type { Position, Role } from "./player.ts";

export type { Position, Role };

// What a page offers scripts in the browser as `window.hinote`.
// The global itself is declared in client-global.ts (`hinote/client`).
// Declaring it here would type `hinote` in every file that imports "hinote",
// including slide render functions, which run on the server.
export type HinoteClient = {
  // "presenter" on the presenter view, "view" everywhere else.
  readonly role: Role;
  // How events reach other pages: through the deck's server, between windows
  // of one browser (prerender), or not at all (the built file, or a deck
  // without the presenter), where send() only reaches this page.
  readonly sync: "server" | "broadcast" | "none";
  // The slide (from 0) and how many of its steps are shown.
  readonly position: Position;
  // Calls `handler` for every event with this name, from this page or another
  // one. "position" is hinote's own: it fires at once with the current
  // position, then on every slide or step change. Returns a function that stops it.
  on(name: string, handler: (data: unknown) => void): () => void;
  on(name: "position", handler: (position: Position) => void): () => void;
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
