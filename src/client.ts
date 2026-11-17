// Browser runtime inlined into every page. `bun run build:client` turns it into
// client.generated.ts, so rendering a deck never needs a bundler at runtime.
import { boot } from "./client-boot.ts";

boot();
