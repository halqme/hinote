// `/// <reference types="hinote/client" />` in a *.client.tsx file declares
// the browser global `hinote`. The import is what brings the global in; a
// type-only re-export would not. Like @hinote/core/client, this file stays
// out of tsconfig.json, which checks server code.
import "@hinote/core/client";

export type * from "@hinote/core/client";
