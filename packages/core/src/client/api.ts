// What a page offers scripts in the browser as `window.hinote`. The types are
// in @hinote/types, so a package can use them without depending on hinote.
// The global itself is declared in client-global.ts (`@hinote/core/client`).
// Declaring it here would type `hinote` in every file that imports "hinote",
// including slide render functions, which run on the server.
export type { HinoteClient, Observed, Position, Role } from "@hinote/types";
