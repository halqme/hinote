import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const repo = resolve(import.meta.dir, "..");
const node = Bun.which("node");

// hinote has to work without Bun: the library as a Hono app on Node, Deno, or
// Workers, and the CLI on Node with esbuild and @hono/node-server. These tests
// build dist/ as `prepack` does and run it with Node in two projects, one with
// those packages installed and one without.
describe.skipIf(!node)("the built package under Node", () => {
  let dir: string;
  let full: string;
  let bare: string;

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
      `import { Code, Script, createSlide } from "hinote";
import style from "./style.css" with { type: "text" };
export default createSlide({ css: style }, [
  createSlide(() => <div><h1>node</h1><Code lang="ts">{"let a = 1"}</Code>
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
    // esbuild by walking up from these projects.
    dir = await mkdtemp(join(tmpdir(), "hinote-dist-"));
    const pkg = join(dir, "hinote");
    const build = Bun.spawnSync(
      ["bun", "scripts/build-lib.ts", join(pkg, "dist")],
      { cwd: repo, stderr: "pipe" },
    );
    if (build.exitCode !== 0) throw new Error(build.stderr.toString());
    await cp(join(repo, "package.json"), join(pkg, "package.json"));
    await cp(join(repo, "skills"), join(pkg, "skills"), { recursive: true });
    full = join(dir, "full");
    bare = join(dir, "bare");
    await project(full, ["hono", "@pierre", "esbuild", "@hono/node-server"]);
    await project(bare, ["hono", "@pierre"]);
  }, 60_000);

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("the library renders a deck", async () => {
    await writeFile(
      join(bare, "app.mjs"),
      `import { jsx } from "hono/jsx";
import { createSlide } from "hinote";
const deck = createSlide([createSlide(() => jsx("h1", {}, "library"))]);
console.log(await (await deck.request("/1")).text());`,
    );
    const run = Bun.spawnSync([node!, "app.mjs"], {
      cwd: bare,
      stderr: "pipe",
    });
    expect(run.stderr.toString()).toBe("");
    expect(run.stdout.toString()).toContain("<h1>library</h1>");
  });

  test("the CLI finds its skills and checks a deck under Node", async () => {
    const guide = hinote(bare, ["skills", "get", "core"]);
    expect(guide.exitCode).toBe(0);
    expect(guide.stdout.toString()).toContain("name: hinote");
    const checked = hinote(full, ["check", "--json"]);
    expect(checked.exitCode).toBe(0);
    expect(JSON.parse(checked.stdout.toString()).ok).toBe(true);
  });

  test("the CLI builds and serves with esbuild and @hono/node-server", async () => {
    const built = hinote(full, ["build", "deck.tsx", "-o", "out/index.html"]);
    expect(built.stderr.toString()).toBe("");
    const html = await Bun.file(join(full, "out/index.html")).text();
    expect(html).toContain("<h1>node</h1>");
    expect(html).toContain('class="highlights"');
    expect(html).toContain("h1 { color: teal; }");
    // <Script> bundled for the browser by esbuild.
    expect(html).toContain("widget-");
    expect(html).not.toContain("data-hinote-src");

    const probe = Bun.serve({ port: 0, fetch: () => new Response() });
    const port = probe.port;
    await probe.stop(true);
    const dev = Bun.spawn(
      [node!, "node_modules/hinote/dist/cli.js", "dev", "--port", String(port)],
      { cwd: full, stdout: "pipe", stderr: "pipe" },
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

  test("without those packages, the CLI hands the run to Bun", async () => {
    const built = hinote(bare, ["build", "deck.tsx", "-o", "bun/index.html"]);
    expect(built.exitCode).toBe(0);
    expect(await Bun.file(join(bare, "bun/index.html")).text()).toContain(
      "<h1>node</h1>",
    );
  }, 30_000);

  test("started from bunx but running on Node, init adds no Node packages", async () => {
    const made = hinote(bare, ["init", "from-bunx", "--no-install"], {
      npm_config_user_agent: "bun/1.4.4 npm/? node/v24.3.0",
    });
    expect(made.stderr.toString()).toBe("");
    const pkg = JSON.parse(
      await Bun.file(join(bare, "from-bunx/package.json")).text(),
    );
    expect(pkg.devDependencies).toBeUndefined();
  });

  test("the deck init writes typechecks with tsc, CSS import included", async () => {
    const made = hinote(bare, ["init", "typed", "--no-install"]);
    expect(made.exitCode).toBe(0);
    const typed = join(bare, "typed");
    await symlink(join(bare, "node_modules"), join(typed, "node_modules"));
    const tsc = Bun.spawnSync(
      [join(repo, "node_modules/.bin/tsc"), "-p", "tsconfig.json"],
      { cwd: typed, stdout: "pipe", stderr: "pipe" },
    );
    expect(tsc.stdout.toString()).toBe("");
    expect(tsc.exitCode).toBe(0);
  }, 30_000);

  test("without those packages or Bun, the CLI says what to install", async () => {
    const onlyNode = join(dir, "only-node");
    await mkdir(onlyNode);
    await symlink(node!, join(onlyNode, "node"));
    const built = hinote(bare, ["build", "deck.tsx", "-o", "none/index.html"], {
      PATH: `${onlyNode}:/usr/bin:/bin`,
    });
    expect(built.exitCode).toBe(1);
    expect(built.stderr.toString()).toContain(
      "npm install -D esbuild @hono/node-server",
    );
    expect(await Bun.file(join(bare, "none/index.html")).exists()).toBe(false);
  });
});
