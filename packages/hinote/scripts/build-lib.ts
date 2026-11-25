// Builds dist/: every file in src/ as JavaScript with declarations, as the
// other packages do, plus the CSS module declaration. The package ships only
// dist/, so Bun and Node load the same files.
//   bun run build
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildPackage } from "../../../scripts/build-package.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
// tests/dist.test.ts builds into a temporary directory instead.
const dist = await buildPackage(root, process.argv[2]);

// tsc does not emit a .d.ts input, and keeps index.d.ts pointing at the one
// in src/, which the package does not ship. Without it, a deck's
// `import style from "./style.css"` fails to typecheck.
await copyFile(`${root}src/css-module.d.ts`, `${dist}/css-module.d.ts`);
const index = `${dist}/index.d.ts`;
const types = await readFile(index, "utf8");
const fixed = types.replace(
  /(<reference path=")[^"]*css-module\.d\.ts"/,
  '$1./css-module.d.ts"',
);
if (fixed === types) {
  console.error(`${index} does not reference css-module.d.ts.`);
  process.exit(1);
}
await writeFile(index, fixed);

// From source, client/script.ts bundles the browser runtime when it loads.
// The package carries the bundled text instead, so Node, Deno, and Workers
// render without a bundler.
const { default: clientScript } = await import("../src/client/script.ts");
await writeFile(
  `${dist}/client/script.js`,
  `export default ${JSON.stringify(clientScript)};\n`,
);
// The source checks parse with Babel, which the package does not depend on:
// tsc leaves `export { parse } from "@babel/parser"` as it is, so the parser
// is bundled in its place, with its license. Tree shaking keeps nearly all of
// it, because Babel picks its syntax plugins by name at runtime.
const babel = fileURLToPath(
  new URL("../node_modules/@babel/parser/", import.meta.url),
);
const license = await readFile(`${babel}LICENSE`, "utf8");
const parser = await Bun.build({
  entrypoints: [`${root}src/cli/parse.ts`],
  target: "node",
  format: "esm",
  minify: true,
  banner: `/*! @babel/parser\n${license.replaceAll("*/", "* /")}*/`,
});
const [output] = parser.outputs;
if (!parser.success || !output) {
  for (const log of parser.logs) console.error(log.message);
  process.exit(1);
}
await writeFile(`${dist}/cli/parse.js`, await output.text());
console.log(dist);
