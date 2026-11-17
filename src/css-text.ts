import { readText, type LoadPlugin } from "./runtime.ts";

// Bun imports a .css file as a CSS module, which is an empty object here, and
// esbuild bundles it as CSS. hinote wants the text, so
// `import style from "./style.css"` gives a string: `hinote dev` and `build`
// bundle with this plugin, and `bun deck.tsx` loads it through
// `preload = ["hinote/preload"]` in bunfig.toml.
export const cssAsText: LoadPlugin = {
  name: "hinote-css-text",
  setup(build) {
    build.onLoad({ filter: /\.css$/ }, async ({ path }) => ({
      contents: `export default ${JSON.stringify(await readText(path))};`,
      loader: "js",
    }));
  },
};
