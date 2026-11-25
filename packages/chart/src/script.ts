import { fileURLToPath } from "node:url";
import { rolldown } from "rolldown";

// The code that animates the charts on a page, bundled from client.ts with
// TanStack's motion when the package runs from source, so it is never stale.
// `bun run build` replaces this module in dist/ with the bundled text: the
// package never bundles at runtime, so a deck animates its charts without the
// hinote CLI, in any server that renders it.
const build = await rolldown({
  input: fileURLToPath(new URL("client.ts", import.meta.url)),
  platform: "browser",
  logLevel: "silent",
});
const { output } = await build.generate({ format: "iife", minify: true });
await build.close();
const [chunk] = output;
if (!chunk) throw new Error("Could not bundle the chart client.");

export default chunk.code.trim();
