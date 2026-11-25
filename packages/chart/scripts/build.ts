// Builds dist/ like the other packages, then puts the bundled browser code in
// dist/script.js in place of the module that bundles it from source.
//   bun run build
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildPackage } from "../../../scripts/build-package.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = await buildPackage(root, process.argv[2]);
const { default: code } = await import("../src/script.ts");
await writeFile(
  `${dist}/script.js`,
  `export default ${JSON.stringify(code)};\n`,
);
console.log(dist);
