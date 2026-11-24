import { readText, type LoadPlugin } from "./runtime.ts";

// `import style from "./style.css" with { type: "text" }` gives text in Bun,
// esbuild, and Wrangler alike, but Bun.build drops the attribute and hands back
// a CSS module object. When `hinote dev` and `build` bundle with Bun, this
// plugin loads .css as text instead.
export const cssAsText: LoadPlugin = {
  name: "hinote-css-text",
  setup(build) {
    build.onLoad({ filter: /\.css$/ }, async ({ path }) => ({
      contents: `export default ${JSON.stringify(await readText(path))};`,
      loader: "js",
    }));
  },
};
