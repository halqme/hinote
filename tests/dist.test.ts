import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";

const repo = resolve(import.meta.dir, "..");

// The library has to run without Bun: as a Hono app on Node, Deno, or Workers.
// Build dist/ as `prepack` does and render a deck with Node.
test.skipIf(!Bun.which("node"))(
  "the built library renders a deck under Node",
  async () => {
    const dir = await mkdtemp(join(repo, ".tmp/dist-"));
    try {
      const pkg = join(dir, "node_modules/hinote");
      const build = Bun.spawnSync(
        ["bun", "scripts/build-lib.ts", join(pkg, "dist")],
        { cwd: repo, stderr: "pipe" },
      );
      expect(build.stderr.toString()).toBe("");
      expect(build.exitCode).toBe(0);
      await writeFile(
        join(pkg, "package.json"),
        await Bun.file(join(repo, "package.json")).text(),
      );
      await symlink(
        join(repo, "node_modules/hono"),
        join(dir, "node_modules/hono"),
      );
      await symlink(
        join(repo, "node_modules/@pierre"),
        join(dir, "node_modules/@pierre"),
      );
      await writeFile(
        join(dir, "app.mjs"),
        `import { jsx } from "hono/jsx";
import { Code, createSlide } from "hinote";
const deck = createSlide({ css: "h1{color:teal}" }, [
  createSlide(() => jsx("div", {}, jsx("h1", {}, "node"), jsx(Code, { lang: "ts", code: "let a = 1" }))),
]);
const html = await (await deck.request("/presenter/1")).text();
console.log(JSON.stringify({ node: html.includes("<h1>node</h1>"), code: html.includes('class="highlights"'), css: html.includes("h1{color:teal}") }));`,
      );
      const run = Bun.spawnSync(["node", "app.mjs"], {
        cwd: dir,
        stderr: "pipe",
      });
      expect(run.stderr.toString()).toBe("");
      expect(JSON.parse(run.stdout.toString())).toEqual({
        node: true,
        code: true,
        css: true,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  30_000,
);
