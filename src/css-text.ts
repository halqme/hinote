import type { BunPlugin } from "bun";

// Bun imports a .css file as a CSS module, which is an empty object here.
// hinote wants the text, so `import style from "./style.css"` gives a string:
// `hinote dev` and `build` bundle with this plugin, and `bun deck.tsx` loads it
// through `preload = ["hinote/preload"]` in bunfig.toml.
export const cssAsText: BunPlugin = {
  name: "hinote-css-text",
  setup(build) {
    build.onLoad({ filter: /\.css$/ }, async ({ path }) => ({
      contents: `export default ${JSON.stringify(await Bun.file(path).text())};`,
      loader: "js",
    }));
  },
};
