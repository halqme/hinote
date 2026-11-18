// Builds dist/: the library as JavaScript with type declarations. The package
// ships only dist/, so Bun and Node load the same files.
//   bun run build:lib
import { copyFile, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
// tests/dist.test.ts builds into a temporary directory instead.
const dist = process.argv[2] ?? `${root}dist`;

await rm(dist, { recursive: true, force: true });
const built = await Bun.build({
  // The CLI too, so `npx hinote` runs on Node; bin points at dist/cli.js.
  entrypoints: [
    `${root}src/index.ts`,
    `${root}src/code-themes.ts`,
    `${root}src/client-global.ts`,
    `${root}src/cli.ts`,
  ],
  outdir: dist,
  root: `${root}src`,
  format: "esm",
  target: "node",
  // Code shared by the entry points goes in one chunk, not a copy in each.
  splitting: true,
  // hono and @pierre/highlights stay imports, so the app shares one Hono.
  packages: "external",
  jsx: { runtime: "automatic", importSource: "hono/jsx", development: false },
});
if (!built.success) {
  console.error(built.logs.map((log) => log.message).join("\n"));
  process.exit(1);
}

const tsc = Bun.spawnSync(
  ["bun", "x", "tsc", "-p", "tsconfig.build.json", "--outDir", dist],
  {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
  },
);
if (tsc.exitCode !== 0) process.exit(tsc.exitCode ?? 1);

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
console.log(dist);
