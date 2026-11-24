// Browser-only types. Importing this module, or referencing it with
// `/// <reference types="hinote/client" />`, declares the global `hinote`.
// A global augmentation covers the whole program, so the deck tsconfig
// excludes this file and `*.client.tsx`. A slide that imported it would
// start seeing `hinote` in every render function.
import type { HinoteClient } from "./client/api.ts";

export type { HinoteClient, Observed } from "./client/api.ts";
export type { Position, Role } from "./client/player.ts";

declare global {
  // Also window.hinote. The page defines it before any <Script> runs.
  var hinote: HinoteClient;
}
