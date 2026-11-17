import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";
import { Hono } from "hono";
import { loadDeckFile } from "../src/load.ts";
import { createDevApp, resolveInside } from "../src/server.ts";

const cli = resolve(import.meta.dir, "../src/cli.ts");
const api = resolve(import.meta.dir, "../src/index.ts");
const repo = resolve(import.meta.dir, "..");

async function tempDir() {
  const scratch = join(import.meta.dir, "../.tmp");
  await mkdir(scratch, { recursive: true });
  return mkdtemp(join(scratch, "hinote-"));
}

function deckSource(body: string): string {
  return `import { createSlide } from ${JSON.stringify(api)}\n${body}\n`;
}

async function run(args: string[], cwd: string) {
  const proc = Bun.spawn(["bun", cli, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, code };
}

test("loads a changed deck again instead of the cached module", async () => {
  const dir = await tempDir();
  try {
    const file = join(dir, "deck.tsx");
    await writeFile(
      file,
      deckSource(`export default createSlide([createSlide(() => <p>one</p>)])`),
    );
    const first = await (await loadDeckFile(file)).render();
    await writeFile(
      file,
      deckSource(`export default createSlide([createSlide(() => <p>two</p>)])`),
    );
    const second = await (await loadDeckFile(file)).render();
    expect(first).toContain("one");
    expect(first).not.toContain(">two<");
    expect(second).toContain("two");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("import.meta in deck files points at the files, not the bundle", async () => {
  const dir = await tempDir();
  try {
    await mkdir(join(dir, "slides"));
    await mkdir(join(dir, "data"));
    await writeFile(join(dir, "data/talk.json"), '{"title":"from data"}');
    await writeFile(
      join(dir, "slides/data.tsx"),
      deckSource(`
async function Title() {
  const data = await Bun.file(new URL("../data/talk.json", import.meta.url)).json();
  return <h1>{data.title}</h1>;
}
export default createSlide(() => <div><Title /><p>{import.meta.dir}</p></div>)`),
    );
    await writeFile(
      join(dir, "deck.tsx"),
      deckSource(
        `import data from "./slides/data.tsx"\nexport default createSlide([data])`,
      ),
    );
    const html = await (await loadDeckFile(join(dir, "deck.tsx"))).render();
    expect(html).toContain("<h1>from data</h1>");
    expect(html).toContain(`<p>${join(dir, "slides")}</p>`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("CSS imported as text reaches the page, under hinote and under bun deck.tsx", async () => {
  const dir = await tempDir();
  const probe = Bun.serve({ port: 0, fetch: () => new Response() });
  const port = probe.port;
  probe.stop(true);
  try {
    await writeFile(join(dir, "style.css"), "h1 { color: teal; }");
    await writeFile(
      join(dir, "deck.tsx"),
      deckSource(`import style from "./style.css" with { type: "text" }
export default createSlide({ css: style }, [createSlide(() => <h1>x</h1>)])`),
    );
    const html = await (await loadDeckFile(join(dir, "deck.tsx"))).render();
    expect(html).toContain("h1 { color: teal; }");

    // bun deck.tsx needs no setup for it. It reads JSX settings from
    // tsconfig.json, as a project from init has.
    await writeFile(
      join(dir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { jsx: "react-jsx", jsxImportSource: "hono/jsx" },
      }),
    );
    const proc = Bun.spawn(["bun", "deck.tsx"], {
      cwd: dir,
      env: { ...process.env, PORT: String(port) },
      stdout: "pipe",
      stderr: "pipe",
    });
    try {
      const page = await waitFor(`http://127.0.0.1:${port}/`, proc);
      expect(await page.text()).toContain("h1 { color: teal; }");
    } finally {
      proc.kill();
      await proc.exited;
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("CSS imported as an object says how to import it as text", async () => {
  const { createSlide } = await import("../src/index.ts");
  expect(() => createSlide({ css: {} as never }, [])).toThrow(
    'with { type: "text" }',
  );
});

test("a default export that is not a deck is refused", async () => {
  const dir = await tempDir();
  try {
    const file = join(dir, "deck.tsx");
    await writeFile(
      file,
      deckSource(`export default createSlide(() => <p>x</p>)`),
    );
    await expect(loadDeckFile(file)).rejects.toThrow("createSlide([...])");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("build writes one html file and leaves nothing behind on failure", async () => {
  const dir = await tempDir();
  try {
    await writeFile(
      join(dir, "deck.tsx"),
      deckSource(
        `export default createSlide({ theme: { colors: { accent: "#222222" } } }, [createSlide(() => <h1>Built</h1>)])`,
      ),
    );
    const built = await run(
      ["build", "deck.tsx", "-o", "site/index.html"],
      dir,
    );
    expect(built.code).toBe(0);
    const html = await readFile(join(dir, "site/index.html"), "utf8");
    expect(html).toContain("Built");
    expect(html).toContain("--hinote-color-accent:#222222");
    expect(html).not.toContain("<script src");
    expect(html).not.toContain('id="hinote-panel"');

    const missing = join(dir, "missing.html");
    const failed = await run(
      ["build", "missing.tsx", "-o", "missing.html"],
      dir,
    );
    expect(failed.code).toBe(1);
    expect(await Bun.file(missing).exists()).toBe(false);

    const thrown = join(dir, "thrown.html");
    await writeFile(
      join(dir, "bad.tsx"),
      deckSource(
        `export default createSlide([createSlide(() => { throw new Error("boom") })])`,
      ),
    );
    const boom = await run(["build", "bad.tsx", "-o", "thrown.html"], dir);
    expect(boom.code).toBe(1);
    expect(await Bun.file(thrown).exists()).toBe(false);

    const rejected = await run(
      ["build", "deck.tsx", "--nope", "-o", "nope.html"],
      dir,
    );
    expect(rejected.code).toBe(1);
    expect(await Bun.file(join(dir, "nope.html")).exists()).toBe(false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("build copies the files the page refers to, and only those", async () => {
  const dir = await tempDir();
  try {
    await mkdir(join(dir, "images"));
    await writeFile(join(dir, "images/logo.svg"), "<svg/>");
    await writeFile(join(dir, "images/unused.svg"), "<svg/>");
    await writeFile(join(dir, "bg.png"), "png");
    await writeFile(join(dir, "secret.txt"), "secret");
    await writeFile(
      join(dir, "deck.tsx"),
      deckSource(`export default createSlide({ css: "& { background: url(bg.png); }" }, [
  createSlide(() => <div><img src="./images/logo.svg" /><img src="../outside.png" /><a href="secret.txt#x">s</a></div>),
])`),
    );
    const built = await run(["build", "deck.tsx", "-o", "out/index.html"], dir);
    expect(built.code).toBe(0);
    expect(built.stdout).toContain("copied 3 files");
    expect(await readFile(join(dir, "out/images/logo.svg"), "utf8")).toBe(
      "<svg/>",
    );
    expect(await Bun.file(join(dir, "out/bg.png")).exists()).toBe(true);
    expect(await Bun.file(join(dir, "out/secret.txt")).exists()).toBe(true);
    expect(await Bun.file(join(dir, "out/images/unused.svg")).exists()).toBe(
      false,
    );

    // Building next to the deck copies nothing onto itself.
    const beside = await run(["build", "deck.tsx", "-o", "index.html"], dir);
    expect(beside.code).toBe(0);
    expect(beside.stdout).not.toContain("copied");
    expect(await readFile(join(dir, "images/logo.svg"), "utf8")).toBe("<svg/>");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("prerender writes every page a static host needs, under a base path", async () => {
  const dir = await tempDir();
  try {
    await writeFile(join(dir, "logo.svg"), "<svg/>");
    await writeFile(
      join(dir, "deck.tsx"),
      deckSource(`export default createSlide([
  createSlide(() => <img src="./logo.svg" />),
  createSlide(() => <p>two</p>),
])`),
    );
    const done = await run(
      ["prerender", "deck.tsx", "-o", "site", "--base", "/talk/"],
      dir,
    );
    expect(done.code).toBe(0);
    for (const path of [
      "",
      "1",
      "2",
      "presenter",
      "presenter/1",
      "presenter/2",
    ]) {
      const html = await readFile(
        join(dir, "site", path, "index.html"),
        "utf8",
      );
      expect(html).toContain('<base href="/talk/"');
      expect(html).toContain('data-sync="broadcast"');
    }
    expect(
      await readFile(join(dir, "site/presenter/2/index.html"), "utf8"),
    ).toContain('id="hinote-panel"');
    expect(
      await readFile(join(dir, "site/2/index.html"), "utf8"),
    ).not.toContain('id="hinote-panel"');
    expect(await readFile(join(dir, "site/logo.svg"), "utf8")).toBe("<svg/>");

    const bad = await run(
      ["prerender", "deck.tsx", "-o", "bad", "--base", "talk"],
      dir,
    );
    expect(bad.code).toBe(1);
    expect(await Bun.file(join(dir, "bad")).exists()).toBe(false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("init writes a deck that renders, and never overwrites", async () => {
  const dir = await tempDir();
  try {
    const project = join(dir, "talk");
    const created = await run(["init", "talk"], dir);
    expect(created.code).toBe(0);
    // Stand in for `bun install`: link this package and its hono into the project.
    await mkdir(join(project, "node_modules"));
    await symlink(repo, join(project, "node_modules/hinote"));
    await symlink(
      join(repo, "node_modules/hono"),
      join(project, "node_modules/hono"),
    );
    const deck = await loadDeckFile(join(project, "deck.tsx"));
    const html = await deck.render();
    expect(deck.slides.length).toBeGreaterThan(1);
    expect(html).toContain('<pre class="highlights"');
    // The starter deck imports its style.css.
    expect(html).toContain("--hinote-color-accent");
    const pkg = JSON.parse(
      await readFile(join(project, "package.json"), "utf8"),
    );
    expect(Object.keys(pkg.dependencies)).toEqual(["hinote", "hono"]);

    const before = await readFile(join(project, "deck.tsx"), "utf8");
    const again = await run(["init", "talk"], dir);
    expect(again.code).toBe(1);
    expect(await readFile(join(project, "deck.tsx"), "utf8")).toBe(before);

    // An existing package.json is the author's; init adds only the deck.
    const own = join(dir, "own");
    await mkdir(own);
    await writeFile(join(own, "package.json"), "{}\n");
    expect((await run(["init", "own"], dir)).code).toBe(0);
    expect(await readFile(join(own, "package.json"), "utf8")).toBe("{}\n");
    expect(await Bun.file(join(own, "deck.tsx")).exists()).toBe(true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("dev explains a port that is already in use", async () => {
  const dir = await tempDir();
  const busy = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () => new Response("busy"),
  });
  try {
    await writeFile(
      join(dir, "deck.tsx"),
      deckSource(`export default createSlide([createSlide(() => <p>x</p>)])`),
    );
    const result = await run(
      ["dev", "deck.tsx", "--port", String(busy.port)],
      dir,
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`Port ${busy.port} is in use`);
  } finally {
    busy.stop(true);
    await rm(dir, { recursive: true, force: true });
  }
});

test("dev --host 0.0.0.0 listens on the network and says so", async () => {
  const dir = await tempDir();
  const probe = Bun.serve({ port: 0, fetch: () => new Response() });
  const port = probe.port;
  probe.stop(true);
  await writeFile(
    join(dir, "deck.tsx"),
    deckSource(`export default createSlide([createSlide(() => <p>lan</p>)])`),
  );
  const proc = Bun.spawn(
    [
      "bun",
      cli,
      "dev",
      "deck.tsx",
      "--port",
      String(port),
      "--host",
      "0.0.0.0",
    ],
    { cwd: dir, stdout: "pipe", stderr: "pipe" },
  );
  try {
    expect(
      await (await waitFor(`http://127.0.0.1:${port}/`, proc)).text(),
    ).toContain("lan");
    proc.kill();
    const out = await new Response(proc.stdout).text();
    expect(out).toContain(`http://127.0.0.1:${port}/presenter`);
    expect(out).toContain("to the network");
  } finally {
    proc.kill();
    await proc.exited;
    await rm(dir, { recursive: true, force: true });
  }
});

test("help succeeds and a missing command fails", async () => {
  const dir = await tempDir();
  try {
    const help = await run(["--help"], dir);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain("hinote dev");
    const none = await run([], dir);
    expect(none.code).toBe(1);
    expect(none.stderr).toContain("hinote build");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test(
  "dev serves slides, presenter mode, and files inside the deck directory",
  async () => {
    const dir = await tempDir();
    const root = join(dir, "deck");
    await mkdir(root);
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: () => new Response("busy"),
    });
    const port = server.port;
    server.stop(true);
    const deck = join(root, "deck.tsx");
    await writeFile(
      deck,
      deckSource(
        `export default createSlide([createSlide({ title: "Live", notes: "台本" }, () => <h1>Live</h1>)])`,
      ),
    );
    await writeFile(join(root, "pic.txt"), "picture");
    await writeFile(join(dir, "secret.txt"), "secret");
    await symlink(join(dir, "secret.txt"), join(root, "leak.txt"));

    const proc = Bun.spawn(
      ["bun", cli, "dev", "deck.tsx", "--port", String(port)],
      {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    try {
      const view = await waitFor(`http://127.0.0.1:${port}/`, proc);
      expect(view.status).toBe(200);
      const html = await view.text();
      expect(html).toContain("Live");
      expect(html).not.toContain('id="hinote-panel"');

      const presenter = await fetch(`http://127.0.0.1:${port}/presenter`);
      expect(await presenter.text()).toContain('id="hinote-panel"');
      expect(
        await (await fetch(`http://127.0.0.1:${port}/pic.txt`)).text(),
      ).toBe("picture");
      expect((await fetch(`http://127.0.0.1:${port}/leak.txt`)).status).toBe(
        404,
      );
      expect(
        (await fetch(`http://127.0.0.1:${port}/%2e%2e/secret.txt`)).status,
      ).toBe(404);

      // Saving the deck reloads it and tells open pages to reload.
      const events = await fetch(
        `http://127.0.0.1:${port}/_hinote/events?id=page`,
      );
      const reader = events.body!.getReader();
      await writeFile(
        deck,
        deckSource(
          `export default createSlide([createSlide(() => <h1>Edited</h1>)])`,
        ),
      );
      let received = "";
      const decoder = new TextDecoder();
      while (!received.includes('"reload"')) {
        const chunk = await reader.read();
        if (chunk.done) break;
        received += decoder.decode(chunk.value);
      }
      expect(received).toContain('{"type":"reload"}');
      await reader.cancel();
      expect(await (await fetch(`http://127.0.0.1:${port}/`)).text()).toContain(
        "Edited",
      );

      // A deck that fails to load keeps the last one serving.
      await writeFile(deck, deckSource(`export default createSlide(`));
      await Bun.sleep(500);
      expect(await (await fetch(`http://127.0.0.1:${port}/`)).text()).toContain(
        "Edited",
      );
    } finally {
      proc.kill();
      await proc.exited;
      await rm(dir, { recursive: true, force: true });
    }
  },
  { timeout: 15_000 },
);

test("static paths cannot escape the deck directory", async () => {
  const dir = await tempDir();
  try {
    const root = join(dir, "public");
    await mkdir(root);
    await writeFile(join(dir, "secret.txt"), "secret");
    await writeFile(join(root, "ok.txt"), "ok");
    await symlink(join(dir, "secret.txt"), join(root, "leak.txt"));
    expect(resolveInside(root, "/../secret.txt")).toBeNull();
    expect(resolveInside(root, "/%2e%2e/secret.txt")).toBeNull();
    expect(resolveInside(root, "/leak.txt")).toBeNull();
    expect(resolveInside(root, "/ok.txt")).toBe(
      await realpathFile(join(root, "ok.txt")),
    );

    const deck = new Hono().get("/", (c) => c.text("deck"));
    const app = createDevApp(() => deck, root);
    expect(await (await app.request("http://local/")).text()).toBe("deck");
    expect(await (await app.request("http://local/ok.txt")).text()).toBe("ok");
    expect((await app.request("http://local/missing-file")).status).toBe(404);
    expect((await app.request("http://local/leak.txt")).status).toBe(404);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the example deck renders every slide, including its data", async () => {
  const deck = await loadDeckFile(
    resolve(import.meta.dir, "../examples/deck.tsx"),
  );
  const html = await deck.render();
  expect(deck.slides).toHaveLength(7);
  expect(html).toContain('<pre class="highlights"');
  expect(html).toContain("data-hinote-step");
  // The chart reads data/roasts.json next to the deck while it renders.
  expect(html).toMatch(/手動 <b>\d+秒<\/b>/);
  expect(html).toContain("./images/setup.svg");
});

async function realpathFile(file: string): Promise<string> {
  const { realpath } = await import("node:fs/promises");
  return realpath(file);
}

async function waitFor(url: string, proc?: Bun.Subprocess): Promise<Response> {
  const started = Date.now();
  let last = "server did not start";
  while (Date.now() - started < 8000) {
    if (proc && proc.exitCode !== null) {
      const stderr = proc.stderr;
      const text =
        typeof stderr === "object" && stderr
          ? await new Response(stderr).text()
          : "";
      throw new Error(text || `dev server exited ${proc.exitCode}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      last = `${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await Bun.sleep(50);
  }
  throw new Error(last);
}
