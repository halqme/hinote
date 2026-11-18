// Lets `/// <reference types="hinote/client" />` resolve while working in this
// repository. An installed hinote resolves that name through package exports;
// this package is not installed inside itself, and a triple-slash type
// reference does not follow tsconfig paths. The import is what brings the
// global `hinote` in; a type-only re-export would not.
import "../../src/client-global.ts";

export type { HinoteClient, Position, Role } from "../../src/client-global.ts";
