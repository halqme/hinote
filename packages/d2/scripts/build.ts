// Builds dist/: JavaScript for Bun and Node, with type declarations.
//   bun run build
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = `${root}dist`;

await rm(dist, { recursive: true, force: true });
const built = await Bun.build({
  entrypoints: [`${root}src/index.tsx`],
  outdir: dist,
  root: `${root}src`,
  format: "esm",
  target: "node",
  // hono and @terrastruct/d2 stay imports, so the deck shares one Hono.
  packages: "external",
  jsx: { runtime: "automatic", importSource: "hono/jsx", development: false },
});
if (!built.success) {
  console.error(built.logs.map((log) => log.message).join("\n"));
  process.exit(1);
}

const tsc = Bun.spawnSync(["bun", "x", "tsc", "-p", "tsconfig.build.json"], {
  cwd: root,
  stdout: "inherit",
  stderr: "inherit",
});
if (tsc.exitCode !== 0) process.exit(tsc.exitCode ?? 1);
console.log(dist);
