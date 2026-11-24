// Browser runtime inlined into every page. `bun run build:client` turns it into
// main.generated.ts, so rendering a deck never needs a bundler at runtime.
import { boot } from "./boot.ts";

boot();
