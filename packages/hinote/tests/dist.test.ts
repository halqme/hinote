import {
  cp,
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
// Tools shared by the workspace are installed at its root.
const workspace = resolve(repo, "../..");
const node = Bun.which("node");

// hinote has to work without Bun: the library as a Hono app on Node, Deno, or
// Workers, and the CLI on Node. These tests build dist/ as `prepack` does and
// run it with Node in a project that has what installing hinote brings.
describe.skipIf(!node)("the built package under Node", () => {
  let dir: string;
  let app: string;

  async function project(path: string, packages: string[]) {
    await mkdir(join(path, "node_modules/@hono"), { recursive: true });
    await cp(join(dir, "hinote"), join(path, "node_modules/hinote"), {
      recursive: true,
    });
    for (const name of packages)
      await symlink(
        join(repo, "node_modules", name),
        join(path, "node_modules", name),
      );
    await writeFile(
      join(path, "deck.tsx"),
      `import { Script, createSlide } from "hinote";
import style from "./style.css" with { type: "text" };
export default createSlide({ css: style }, [
  createSlide(() => <div><h1>node</h1>
    <Script src={new URL("./widget.client.tsx", import.meta.url)} /></div>),
]);`,
    );
    await writeFile(
      join(path, "widget.client.tsx"),
      `import { render } from "hono/jsx/dom";
render(<i>{"widget-" + "on-node"}</i>, document.body);`,
    );
    await writeFile(join(path, "style.css"), "h1 { color: teal; }");
  }

  function hinote(
    cwd: string,
    args: string[],
    env: Record<string, string> = {},
  ) {
    return Bun.spawnSync([node!, "node_modules/hinote/dist/cli.js", ...args], {
      cwd,
      env: { ...process.env, ...env },
      stdout: "pipe",
      stderr: "pipe",
    });
  }

  beforeAll(async () => {
    // Outside the repository, so Node cannot find the repository's own
    // packages by walking up from the project.
    dir = await mkdtemp(join(tmpdir(), "hinote-dist-"));
    // The tarball npm gets: `prepack` builds dist/, and the catalog and
    // workspace ranges in package.json become plain versions.
    const tarball = join(dir, "hinote.tgz");
    const packed = Bun.spawnSync(
      ["bun", "pm", "pack", "--filename", tarball, "--quiet"],
      { cwd: repo, stderr: "pipe" },
    );
    if (packed.exitCode !== 0) throw new Error(packed.stderr.toString());
    const untar = Bun.spawnSync(["tar", "xzf", tarball, "-C", dir], {
      stderr: "pipe",
    });
    if (untar.exitCode !== 0) throw new Error(untar.stderr.toString());
    await rename(join(dir, "package"), join(dir, "hinote"));
    app = join(dir, "app");
    await project(app, ["hono", "@hinote", "rolldown"]);
  }, 60_000);

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("the library renders a deck", async () => {
    await writeFile(
      join(app, "app.mjs"),
      `import { jsx } from "hono/jsx";
import { createSlide } from "hinote";
const deck = createSlide([createSlide(() => jsx("h1", {}, "library"))]);
console.log(await (await deck.request("/1")).text());`,
    );
    const run = Bun.spawnSync([node!, "app.mjs"], {
      cwd: app,
      stderr: "pipe",
    });
    expect(run.stderr.toString()).toBe("");
    expect(run.stdout.toString()).toContain("<h1>library</h1>");
  });

  // A page that only lays out, such as one rendered by an app of its own,
  // should not carry the deck renderer and the presenter's browser script.
  test("a bundle that imports one component leaves out the rest", async () => {
    await writeFile(
      join(app, "row.mjs"),
      `import { Row } from "hinote";\nconsole.log(Row);`,
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

  test("the CLI finds its skills and checks a deck under Node", async () => {
    const guide = hinote(app, ["skills", "get", "core"]);
    expect(guide.exitCode).toBe(0);
    expect(guide.stdout.toString()).toContain("name: hinote");
    const checked = hinote(app, ["check", "--json"]);
    expect(checked.exitCode).toBe(0);
    expect(JSON.parse(checked.stdout.toString()).ok).toBe(true);
  });

  test("the CLI builds and serves on Node", async () => {
    const built = hinote(app, ["build", "deck.tsx", "-o", "out/index.html"]);
    expect(built.stderr.toString()).toBe("");
    const html = await Bun.file(join(app, "out/index.html")).text();
    expect(html).toContain("<h1>node</h1>");
    expect(html).toContain("h1 { color: teal; }");
    // <Script> bundled for the browser.
    expect(html).toContain("widget-");
    expect(html).not.toContain("data-hinote-src");

    const probe = Bun.serve({ port: 0, fetch: () => new Response() });
    const port = probe.port;
    await probe.stop(true);
    const dev = Bun.spawn(
      [node!, "node_modules/hinote/dist/cli.js", "dev", "--port", String(port)],
      { cwd: app, stdout: "pipe", stderr: "pipe" },
    );
    try {
      let page = "";
      for (let i = 0; i < 100 && !page; i++) {
        page = await fetch(`http://127.0.0.1:${port}/presenter/1`)
          .then((response) => response.text())
          .catch(() => "");
        if (!page) await Bun.sleep(50);
      }
      expect(page).toContain("<h1>node</h1>");
    } finally {
      dev.kill();
      await dev.exited;
    }
  }, 30_000);

  test("the deck init writes typechecks with tsc, CSS import included", async () => {
    const made = hinote(app, ["init", "typed", "--no-install"]);
    expect(made.exitCode).toBe(0);
    const typed = join(app, "typed");
    await symlink(join(app, "node_modules"), join(typed, "node_modules"));
    const tsc = Bun.spawnSync(
      [join(workspace, "node_modules/.bin/tsc"), "-p", "tsconfig.json"],
      { cwd: typed, stdout: "pipe", stderr: "pipe" },
    );
    expect(tsc.stdout.toString()).toBe("");
    expect(tsc.exitCode).toBe(0);
  }, 30_000);
});
