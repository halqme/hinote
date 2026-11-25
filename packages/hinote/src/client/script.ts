import { fileURLToPath } from "node:url";
import { rolldown } from "rolldown";

// The browser runtime every page inlines, bundled from main.ts when hinote
// runs from source, so it is never stale. `bun run build` replaces this
// module in dist/ with the bundled text: the package never bundles at runtime.
const build = await rolldown({
  input: fileURLToPath(new URL("main.ts", import.meta.url)),
  platform: "browser",
  logLevel: "silent",
});
const { output } = await build.generate({ format: "iife", minify: true });
await build.close();
const [chunk] = output;
if (!chunk) throw new Error("Could not bundle the client.");

export default chunk.code.trim();
