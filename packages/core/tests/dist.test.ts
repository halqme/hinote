import {
  mkdir,
  mkdtemp,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const repo = resolve(import.meta.dir, "..");
const node = Bun.which("node");

// @hinote/core has to work without a bundler: as a Hono app on Node, Deno,
// or Workers, and inside an app that bundles it with its own tools. These
// tests build dist/ as `prepack` does and run it with Node in a project that
// has only what installing @hinote/core brings: no rolldown, no hinote.
describe.skipIf(!node)("the built package under Node", () => {
  let dir: string;
  let app: string;

  beforeAll(async () => {
    // Outside the repository, so Node cannot find the repository's own
    // packages by walking up from the project.
    dir = await mkdtemp(join(tmpdir(), "hinote-core-dist-"));
    // The tarball npm gets: `prepack` builds dist/, and the catalog and
    // workspace ranges in package.json become plain versions.
    const tarball = join(dir, "core.tgz");
    const packed = Bun.spawnSync(
      ["bun", "pm", "pack", "--filename", tarball, "--quiet"],
      { cwd: repo, stderr: "pipe" },
    );
    if (packed.exitCode !== 0) throw new Error(packed.stderr.toString());
    const untar = Bun.spawnSync(["tar", "xzf", tarball, "-C", dir], {
      stderr: "pipe",
    });
    if (untar.exitCode !== 0) throw new Error(untar.stderr.toString());
    app = join(dir, "app");
    await mkdir(join(app, "node_modules/@hinote"), { recursive: true });
    await rename(join(dir, "package"), join(app, "node_modules/@hinote/core"));
    await symlink(
      join(repo, "node_modules/hono"),
      join(app, "node_modules/hono"),
    );
  }, 60_000);

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("the library serves a deck", async () => {
    await writeFile(
      join(app, "app.mjs"),
      `import { jsx } from "hono/jsx";
import { createSlide } from "@hinote/core";
const deck = createSlide([createSlide(() => jsx("h1", {}, "library"))]);
console.log(await (await deck.request("/1")).text());`,
    );
    const run = Bun.spawnSync([node!, "app.mjs"], {
      cwd: app,
      stderr: "pipe",
    });
    expect(run.stderr.toString()).toBe("");
    // Rendering a page inlines the browser runtime, which the package
    // carries already bundled: there is no rolldown here to bundle it.
    expect(run.stdout.toString()).toContain("<h1>library</h1>");
  });

  // A page that only lays out, such as one rendered by an app of its own,
  // should not carry the deck renderer and the presenter's browser script.
  test("a bundle that imports one component leaves out the rest", async () => {
    await writeFile(
      join(app, "row.mjs"),
      `import { Row } from "@hinote/core";\nconsole.log(Row);`,
    );
    const built = await Bun.build({
      entrypoints: [join(app, "row.mjs")],
      target: "node",
      external: ["hono", "hono/*"],
    });
    const text = await built.outputs[0]!.text();
    expect(text).toContain("hinote-row");
    expect(text).not.toContain("hinote-stage");
    expect(text).not.toContain("createSlide");
  });
});
