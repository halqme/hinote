import { fileURLToPath } from "node:url";

// The browser runtime every page inlines, bundled from main.ts when hinote
// runs from source, so it is never stale. `bun run build` replaces this
// module in dist/ with the bundled text: the package never bundles at runtime.
const built = await Bun.build({
  entrypoints: [fileURLToPath(new URL("main.ts", import.meta.url))],
  format: "iife",
  target: "browser",
  minify: true,
});
const output = built.success ? built.outputs[0] : undefined;
if (!output)
  throw new Error(
    `Could not bundle the client: ${built.logs.map((log) => log.message).join("\n")}`,
  );

export default (await output.text()).trim();
