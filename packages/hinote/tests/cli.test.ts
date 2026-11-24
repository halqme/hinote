import {
  chmod,
  copyFile,
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
import { loadDeckFile } from "../src/build/load.ts";
import { createDevApp, resolveInside } from "../src/build/server.ts";

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

async function run(
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
) {
  const proc = Bun.spawn(["bun", cli, ...args], {
    cwd,
    env: { ...process.env, ...env },
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

// A package that loads a worker or WebAssembly from next to itself finds it
// through import.meta.url.
test("import.meta in a package the deck imports points at the package", async () => {
  const dir = await tempDir();
  try {
    const pkg = join(dir, "node_modules/near-file");
    await mkdir(pkg, { recursive: true });
    await writeFile(
      join(pkg, "package.json"),
      '{"name":"near-file","type":"module","exports":"./index.js"}',
    );
    await writeFile(join(pkg, "word.txt"), "from the package");
    await writeFile(
      join(pkg, "index.js"),
      `import { readFileSync } from "node:fs";
export const word = readFileSync(new URL("./word.txt", import.meta.url), "utf8");`,
    );
    await writeFile(
      join(dir, "deck.tsx"),
      deckSource(
        `import { word } from "near-file";\nexport default createSlide([createSlide(() => <p>{word}</p>)])`,
      ),
    );
    const html = await (await loadDeckFile(join(dir, "deck.tsx"))).render();
    expect(html).toContain("<p>from the package</p>");
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

test("CSS imported as text reaches the page, under hinote and in a server of your own", async () => {
  const dir = await tempDir();
  const probe = Bun.serve({ port: 0, fetch: () => new Response() });
  const port = probe.port;
  await probe.stop(true);
  try {
    await writeFile(join(dir, "style.css"), "h1 { color: teal; }");
    await writeFile(join(dir, "logo.svg"), "<svg/>");
    await writeFile(
      join(dir, "deck.tsx"),
      deckSource(`import style from "./style.css" with { type: "text" }
export default createSlide({ css: style }, [createSlide(() => <div><h1>x</h1><img src="./logo.svg" /></div>)])`),
    );
    const html = await (await loadDeckFile(join(dir, "deck.tsx"))).render();
    expect(html).toContain("h1 { color: teal; }");

    // The Bun server in skills/core/references/serving.md: the deck mounted next to what hinote assets copied.
    expect((await run(["assets", "deck.tsx", "-o", "public"], dir)).code).toBe(
      0,
    );
    // Bun reads JSX settings from tsconfig.json, as a project from init has.
    await writeFile(
      join(dir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { jsx: "react-jsx", jsxImportSource: "hono/jsx" },
      }),
    );
    await writeFile(
      join(dir, "server.ts"),
      `import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import deck from "./deck.tsx";
const app = new Hono();
app.route("/", deck);
app.use("/*", serveStatic({ root: "./public" }));
Bun.serve({ fetch: app.fetch, port: ${port} });`,
    );
    const proc = Bun.spawn(["bun", "server.ts"], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });
    try {
      const page = await waitFor(`http://127.0.0.1:${port}/1`, proc);
      expect(await page.text()).toContain("h1 { color: teal; }");
      expect(
        await (await fetch(`http://127.0.0.1:${port}/logo.svg`)).text(),
      ).toBe("<svg/>");
      expect((await fetch(`http://127.0.0.1:${port}/deck.tsx`)).status).toBe(
        404,
      );
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
    // A command used wrongly exits 2, apart from a deck that fails (1).
    expect(rejected.code).toBe(2);
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

test("assets copies only the files the slides refer to", async () => {
  const dir = await tempDir();
  try {
    await mkdir(join(dir, "images"));
    await writeFile(join(dir, "images/logo.svg"), "<svg/>");
    await writeFile(join(dir, "bg.png"), "png");
    await writeFile(
      join(dir, "deck.tsx"),
      deckSource(`export default createSlide({ css: "& { background: url(bg.png); }" }, [
  createSlide(() => <img src="./images/logo.svg" />),
])`),
    );
    const done = await run(["assets", "deck.tsx", "-o", "public"], dir);
    expect(done.code).toBe(0);
    expect(await readFile(join(dir, "public/images/logo.svg"), "utf8")).toBe(
      "<svg/>",
    );
    expect(await readFile(join(dir, "public/bg.png"), "utf8")).toBe("png");
    // No pages and no source: just what the slides load.
    expect(await Bun.file(join(dir, "public/index.html")).exists()).toBe(false);
    expect(await Bun.file(join(dir, "public/deck.tsx")).exists()).toBe(false);
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
      deckSource(`export default createSlide({ presenter: true }, [
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

    // Without presenter: true, the site has the audience view only, with no sync.
    await writeFile(
      join(dir, "plain.tsx"),
      deckSource(
        `export default createSlide([createSlide({ notes: "secret" }, () => <p>one</p>)])`,
      ),
    );
    expect(
      (await run(["prerender", "plain.tsx", "-o", "plain"], dir)).code,
    ).toBe(0);
    const plain = await readFile(join(dir, "plain/1/index.html"), "utf8");
    expect(plain).not.toContain("data-sync");
    expect(plain).not.toContain("secret");
    expect(
      await Bun.file(join(dir, "plain/presenter/index.html")).exists(),
    ).toBe(false);

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

test("build bundles each <Script> file once and inlines it after the runtime", async () => {
  const dir = await tempDir();
  try {
    await writeFile(
      join(dir, "chart.client.tsx"),
      `import { render } from "hono/jsx/dom";
const SIGN = "bundled-" + "client";
hinote.on("position", () => {});
for (const el of document.querySelectorAll<HTMLElement>(".slot")) render(<b>{SIGN}</b>, el);`,
    );
    await writeFile(
      join(dir, "deck.tsx"),
      deckSource(`import { Script } from ${JSON.stringify(api)}
const chart = new URL("./chart.client.tsx", import.meta.url)
export default createSlide([
  createSlide(() => <div class="slot"><Script src={chart} /></div>),
  createSlide(() => <div class="slot"><Script src={chart} /></div>),
])`),
    );
    const built = await run(["build", "deck.tsx", "-o", "out/index.html"], dir);
    expect(built.stderr).toBe("");
    const html = await readFile(join(dir, "out/index.html"), "utf8");
    expect(html).not.toContain("data-hinote-src");
    // One module for the two uses, after the runtime that defines window.hinote.
    expect(html.match(/<script type="module">/g)).toHaveLength(1);
    expect(html.indexOf("bundled-")).toBeGreaterThan(
      html.indexOf("hinote-sync"),
    );
    expect(html.indexOf('<script type="module">')).toBeGreaterThan(
      html.lastIndexOf("<script>"),
    );

    await writeFile(join(dir, "chart.client.tsx"), "export const = ;");
    const broken = await run(
      ["build", "deck.tsx", "-o", "broken/index.html"],
      dir,
    );
    expect(broken.code).toBe(1);
    expect(broken.stderr).toContain("chart.client.tsx");
    expect(await Bun.file(join(dir, "broken/index.html")).exists()).toBe(false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("init writes a deck that renders, and never overwrites", async () => {
  const dir = await tempDir();
  try {
    const project = join(dir, "talk");
    const created = await run(["init", "talk", "--no-install"], dir);
    expect(created.code).toBe(0);
    // Stand in for `bun install`: the package as `prepack` builds it, and its
    // hono, linked into the project.
    const built = join(dir, "hinote");
    const build = Bun.spawnSync(
      ["bun", "scripts/build-lib.ts", join(built, "dist")],
      { cwd: repo, stderr: "pipe" },
    );
    if (build.exitCode !== 0) throw new Error(build.stderr.toString());
    await copyFile(join(repo, "package.json"), join(built, "package.json"));
    await mkdir(join(project, "node_modules"));
    await symlink(built, join(project, "node_modules/hinote"));
    await symlink(
      join(repo, "node_modules/hono"),
      join(project, "node_modules/hono"),
    );
    const deck = await loadDeckFile(join(project, "deck.tsx"));
    const html = await deck.render();
    expect(deck.slides.length).toBeGreaterThan(1);
    expect(html).toContain('class="hinote-card"');
    // The starter deck imports its style.css.
    expect(html).toContain("--hinote-color-accent");
    const pkg = JSON.parse(
      await readFile(join(project, "package.json"), "utf8"),
    );
    expect(Object.keys(pkg.dependencies)).toEqual(["hinote", "hono"]);

    const before = await readFile(join(project, "deck.tsx"), "utf8");
    const again = await run(["init", "talk", "--no-install"], dir);
    expect(again.code).toBe(1);
    expect(await readFile(join(project, "deck.tsx"), "utf8")).toBe(before);

    // An existing package.json is the author's: init adds only the deck,
    // installs nothing, and says what to add.
    const own = join(dir, "own");
    await mkdir(own);
    await writeFile(join(own, "package.json"), "{}\n");
    const npm = await fakePackageManager(dir, "npm", 0);
    const added = await run(["init", "own"], dir, npm);
    expect(added.code).toBe(0);
    expect(added.stdout).toContain("npm install hinote hono");
    expect(added.stdout).toContain("npm install -D esbuild @hono/node-server");
    expect(await readFile(join(own, "package.json"), "utf8")).toBe("{}\n");
    expect(await Bun.file(join(own, "deck.tsx")).exists()).toBe(true);
    expect(await Bun.file(join(own, "ran-npm")).exists()).toBe(false);
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
    await busy.stop(true);
    await rm(dir, { recursive: true, force: true });
  }
});

test("dev on the network keeps the presenter off unless the deck turns it on", async () => {
  const dir = await tempDir();
  const start = async (deck: string) => {
    const probe = Bun.serve({ port: 0, fetch: () => new Response() });
    const port = probe.port;
    await probe.stop(true);
    await writeFile(join(dir, "deck.tsx"), deckSource(deck));
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
    const page = await waitFor(`http://127.0.0.1:${port}/`, proc);
    const presenter = (await fetch(`http://127.0.0.1:${port}/presenter`))
      .status;
    proc.kill();
    await proc.exited;
    return {
      html: await page.text(),
      presenter,
      out: await new Response(proc.stdout).text(),
    };
  };
  try {
    const off = await start(
      `export default createSlide([createSlide(() => <p>lan</p>)])`,
    );
    expect(off.html).toContain("lan");
    expect(off.presenter).toBe(404);
    expect(off.out).toContain("to the network");
    expect(off.out).toContain("presenter: true");

    const on = await start(
      `export default createSlide({ presenter: true }, [createSlide(() => <p>lan</p>)])`,
    );
    expect(on.presenter).toBe(200);
    expect(on.out).toContain("/presenter");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 20_000);

// A stand-in for a package manager on PATH: it records its arguments in the
// directory it runs in and exits with `code`. Returns the env that selects it.
async function fakePackageManager(dir: string, name: string, code: number) {
  const bin = join(dir, `bin-${name}-${code}`);
  await mkdir(bin, { recursive: true });
  const script = join(bin, name);
  await writeFile(
    script,
    `#!/bin/sh\necho "$@" > "$PWD/ran-${name}"\nexit ${code}\n`,
  );
  await chmod(script, 0o755);
  return {
    PATH: `${bin}:${process.env.PATH}`,
    npm_config_user_agent: `${name}/1.0.0 node/v26.0.0`,
  };
}

test("init --diff reports what differs from this version's init and changes nothing", async () => {
  const dir = await tempDir();
  try {
    const project = join(dir, "talk");
    await run(["init", "talk", "--no-install"], dir);
    const same = await run(["init", "--diff", "talk", "--json"], dir);
    expect(same.code).toBe(0);
    const clean = JSON.parse(same.stdout).data;
    expect(clean.packages).toEqual([]);
    expect(clean.files.map((file: { status: string }) => file.status)).toEqual([
      "same",
      "same",
    ]);

    const tsconfig = join(project, "tsconfig.json");
    const edited = (await readFile(tsconfig, "utf8")).replace(
      '"strict": true,',
      '"strict": false,',
    );
    await writeFile(tsconfig, edited);
    await rm(join(project, "tsconfig.client.json"));
    const pkg = JSON.parse(
      await readFile(join(project, "package.json"), "utf8"),
    );
    pkg.dependencies.hinote = "^0.0.1";
    await writeFile(join(project, "package.json"), JSON.stringify(pkg));
    const deck = await readFile(join(project, "deck.tsx"), "utf8");
    await writeFile(join(project, "deck.tsx"), `${deck}// mine\n`);

    const diff = await run(["init", "--diff", "talk", "--json"], dir);
    expect(diff.code).toBe(0);
    const report = JSON.parse(diff.stdout).data;
    expect(report.files).toEqual([
      {
        file: "tsconfig.json",
        status: "differs",
        lines: expect.arrayContaining([
          '-    "strict": false,',
          '+    "strict": true,',
        ]),
      },
      { file: "tsconfig.client.json", status: "missing" },
    ]);
    expect(report.packages).toEqual([
      expect.objectContaining({ name: "hinote", have: "^0.0.1" }),
    ]);
    // It reports and writes nothing.
    expect(await readFile(tsconfig, "utf8")).toBe(edited);
    expect(await Bun.file(join(project, "tsconfig.client.json")).exists()).toBe(
      false,
    );

    const refused = await run(["init", "talk", "--no-install"], dir);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain("hinote init --diff");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("init installs with the package manager that started it", async () => {
  const dir = await tempDir();
  try {
    const installed = await run(
      ["init", "talk"],
      dir,
      await fakePackageManager(dir, "npm", 0),
    );
    expect(installed.code).toBe(0);
    expect(installed.stdout).toContain("> npm install");
    expect(installed.stdout).toContain("npx hinote dev");
    expect(await readFile(join(dir, "talk/ran-npm"), "utf8")).toBe("install\n");
    // Outside Bun, the CLI needs these to bundle and serve.
    const pkg = JSON.parse(
      await readFile(join(dir, "talk/package.json"), "utf8"),
    );
    expect(Object.keys(pkg.devDependencies).sort()).toEqual([
      "@hono/node-server",
      "esbuild",
    ]);

    // A failed install keeps the files and says how to try again.
    const failed = await run(
      ["init", "broken"],
      dir,
      await fakePackageManager(dir, "pnpm", 3),
    );
    expect(failed.code).toBe(1);
    expect(failed.stderr).toContain("cd broken && pnpm install");
    expect(await Bun.file(join(dir, "broken/deck.tsx")).exists()).toBe(true);

    // Started from bunx, the project needs no Node packages, even if the CLI
    // itself ran on Node.
    const bun = await run(["init", "bun", "--no-install"], dir, {
      npm_config_user_agent: "bun/1.4.4 npm/? node/v24.3.0",
    });
    expect(bun.stdout).toContain("bun install && bunx hinote dev");
    const bunPkg = JSON.parse(
      await readFile(join(dir, "bun/package.json"), "utf8"),
    );
    expect(bunPkg.devDependencies).toBeUndefined();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("hinote alone and help describe every command; mistakes exit 2 with a hint", async () => {
  const dir = await tempDir();
  try {
    const bare = await run([], dir);
    expect(bare.code).toBe(0);
    // Agents are pointed at the skill first.
    expect(bare.stdout).toContain("hinote skills get core");
    for (const name of [
      "init",
      "dev",
      "build",
      "render",
      "inline",
      "check",
      "skills",
    ])
      expect(bare.stdout).toContain(`  ${name} `);

    const viaHelp = await run(["help", "build"], dir);
    const viaFlag = await run(["build", "--help"], dir);
    expect(viaHelp.code).toBe(0);
    expect(viaHelp.stdout).toContain("Usage: hinote build");
    expect(viaHelp.stdout).toContain("--output <path>");
    expect(viaFlag.stdout).toBe(viaHelp.stdout);

    const typo = await run(["biuld"], dir);
    expect(typo.code).toBe(2);
    expect(typo.stderr).toContain("hint:");
    const flag = await run(["--json", "build", "--nope"], dir);
    expect(flag.code).toBe(2);
    expect(JSON.parse(flag.stdout)).toMatchObject({
      ok: false,
      command: "build",
      error: { code: "usage", hint: "Run: hinote help build" },
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("check names each broken slide and exits 1; a sound deck exits 0", async () => {
  const dir = await tempDir();
  try {
    await writeFile(join(dir, "ok.png"), "png");
    await writeFile(join(dir, "bad.client.tsx"), "export const = ;");
    await writeFile(
      join(dir, "deck.tsx"),
      deckSource(`import { Script } from ${JSON.stringify(api)}
export default createSlide([
  createSlide(() => <img src="./ok.png" />),
  createSlide(() => { throw new Error("boom"); }),
  createSlide(() => <img src="./gone.png" />),
])`),
    );
    const broken = await run(["check", "--json"], dir);
    expect(broken.code).toBe(1);
    const report = JSON.parse(broken.stdout);
    expect(report.ok).toBe(false);
    expect(report.data.problems).toEqual([
      expect.objectContaining({ code: "render", slides: [2] }),
      expect.objectContaining({ code: "missing-file", slides: [3] }),
    ]);

    await writeFile(
      join(dir, "deck.tsx"),
      deckSource(`import { Script } from ${JSON.stringify(api)}
export default createSlide([
  createSlide(() => <div><img src="./ok.png" /><Script src={new URL("./bad.client.tsx", import.meta.url)} /></div>),
])`),
    );
    const script = await run(["check", "--json"], dir);
    expect(script.code).toBe(1);
    expect(JSON.parse(script.stdout).data.problems).toEqual([
      expect.objectContaining({ code: "script" }),
    ]);

    await writeFile(join(dir, "bad.client.tsx"), "console.log(1);");
    const fixed = await run(["check"], dir);
    expect(fixed.code).toBe(0);
    expect(fixed.stdout).toContain("ok: 1 slides");

    const missing = await run(["check", "nowhere.tsx", "--json"], dir);
    expect(missing.code).toBe(1);
    expect(JSON.parse(missing.stdout).data.problems[0].code).toBe(
      "deck-not-found",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("check warns on weak theme contrast and keeps exit 0", async () => {
  const dir = await tempDir();
  try {
    await writeFile(
      join(dir, "deck.tsx"),
      deckSource(`export default createSlide([
  createSlide(() => <h1>ink</h1>),
])`),
    );
    const ink = await run(["check", "--json"], dir);
    expect(ink.code).toBe(0);
    const inkBody = JSON.parse(ink.stdout);
    expect(inkBody.ok).toBe(true);
    expect(inkBody.data.problems).toEqual([]);
    expect(inkBody.data.warnings).toEqual([]);

    await writeFile(
      join(dir, "deck.tsx"),
      deckSource(`import { themes } from ${JSON.stringify(api)}
export default createSlide({
  theme: {
    ...themes.paper,
    colors: { ...themes.paper.colors, accent: "#b45309" },
  },
}, [
  createSlide(() => <h1>paper</h1>),
  createSlide(() => <p>two</p>),
])`),
    );
    const weak = await run(["check", "--json"], dir);
    expect(weak.code).toBe(0);
    const weakBody = JSON.parse(weak.stdout);
    expect(weakBody.ok).toBe(true);
    expect(weakBody.data.problems).toEqual([]);
    expect(weakBody.data.warnings.length).toBeGreaterThan(0);
    expect(weakBody.data.warnings[0]).toMatchObject({
      code: "contrast",
      slides: [1, 2],
      message: expect.stringContaining("4.46:1"),
      hint: expect.stringContaining("colors.accent"),
    });

    const weakText = await run(["check"], dir);
    expect(weakText.code).toBe(0);
    expect(weakText.stdout).toContain("warning contrast:");
    expect(weakText.stdout).toMatch(/\d+ warnings?/);

    await writeFile(
      join(dir, "deck.tsx"),
      deckSource(`export default createSlide({
  theme: {
    colors: {
      fg: "var(--fg)",
      muted: "color-mix(in srgb, black, white)",
      accent: "hsl(10 80% 40%)",
      bg: "#ffffff",
      surface: "rgb(255 255 255 / 0.5)",
    },
  },
}, [createSlide(() => <h1>skip</h1>)])`),
    );
    const skip = await run(["check", "--json"], dir);
    expect(skip.code).toBe(0);
    const skipBody = JSON.parse(skip.stdout);
    expect(skipBody.ok).toBe(true);
    expect(skipBody.data.problems).toEqual([]);
    expect(skipBody.data.warnings).toEqual([]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("inspect reports each slide's title, steps, notes, and files", async () => {
  const dir = await tempDir();
  try {
    await writeFile(
      join(dir, "deck.tsx"),
      deckSource(`import { Step } from ${JSON.stringify(api)}
export default createSlide({ aspect: "4:3" }, [
  createSlide({ title: "Opening", notes: "smile" }, () => <h1>ignored</h1>),
  createSlide(() => <div><h2>Agenda <em>today</em></h2><Step>a</Step><Step>b</Step><Step at={1}>c</Step></div>),
  createSlide(() => <img src="./pic.png" />),
])`),
    );
    // A directory stands for the deck.tsx in it.
    const inspected = await run(["inspect", ".", "--json"], dir);
    expect(inspected.code).toBe(0);
    const { data } = JSON.parse(inspected.stdout);
    expect(data.aspect).toBe("4:3");
    expect(data.canvas).toEqual({ width: 1440, height: 1080 });
    expect(
      data.slides.map(
        (s: {
          title?: string;
          steps: number;
          notes?: string;
          files: string[];
        }) => [s.title, s.steps, s.notes, s.files],
      ),
    ).toEqual([
      ["Opening", 0, "smile", []],
      ["Agenda today", 2, undefined, []],
      [undefined, 0, undefined, ["./pic.png"]],
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("build is render piped through inline, and refs lists what it copies", async () => {
  const dir = await tempDir();
  try {
    await writeFile(join(dir, "logo.svg"), "<svg/>");
    await writeFile(join(dir, "w.client.tsx"), `document.title = "w" + "ok";`);
    await writeFile(
      join(dir, "deck.tsx"),
      deckSource(`import { Script } from ${JSON.stringify(api)}
export default createSlide([
  createSlide(() => <div><img src="./logo.svg" /><img src="./gone.png" /><Script src={new URL("./w.client.tsx", import.meta.url)} /></div>),
])`),
    );
    expect((await run(["build", "-o", "dist/index.html"], dir)).code).toBe(0);
    const rendered = await run(["render", "-o", "page.html"], dir);
    expect(rendered.code).toBe(0);
    expect(await readFile(join(dir, "page.html"), "utf8")).toContain(
      "data-hinote-src",
    );
    const proc = Bun.spawn(["bun", cli, "inline"], {
      cwd: dir,
      stdin: Bun.file(join(dir, "page.html")),
      stdout: "pipe",
    });
    const piped = await new Response(proc.stdout).text();
    expect(await proc.exited).toBe(0);
    expect(piped).toBe(await readFile(join(dir, "dist/index.html"), "utf8"));
    expect(piped).not.toContain("data-hinote-src");
    expect(piped).toContain("wok");

    const listed = await run(["refs", "--json"], dir);
    expect(JSON.parse(listed.stdout).data).toEqual([
      { path: "./logo.svg", exists: true },
      { path: "./gone.png", exists: false },
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("skills prints the guide and its references, and names what exists when asked for what does not", async () => {
  const dir = await tempDir();
  try {
    const list = JSON.parse((await run(["skills", "--json"], dir)).stdout);
    const core = list.data.find((s: { name: string }) => s.name === "core");
    expect(core.references.length).toBeGreaterThan(0);

    const guide = await run(["skills", "get", "core"], dir);
    expect(guide.code).toBe(0);
    expect(guide.stdout).toStartWith("---\nname: hinote\n");
    // Every reference the guide routes to can be loaded.
    for (const ref of core.references) {
      const loaded = await run(["skills", "get", "core", "--ref", ref], dir);
      expect(loaded.code).toBe(0);
      expect(guide.stdout).toContain(`\`${ref}\``);
    }
    const full = await run(["skill", "get", "core", "--full"], dir);
    expect(full.stdout.length).toBeGreaterThan(guide.stdout.length);

    const wrong = await run(["skills", "get", "nope", "--json"], dir);
    expect(wrong.code).toBe(1);
    expect(JSON.parse(wrong.stdout).error).toMatchObject({
      code: "skill-not-found",
      hint: expect.stringContaining("core"),
    });
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
    await server.stop(true);
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
