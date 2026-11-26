// Compares hinote with Slidev, Marp, and hono-decks.
//   bun bench/run.ts            install, build, and dev start-up
//   bun bench/run.ts --browser  also time the first render with agent-browser
// Hinote main is this checkout, packed and installed from tarballs. Hinote
// release is hinote@latest and @hinote/code@latest from npm, fetched by the
// timed install. The other decks stay at the versions pinned in their
// package.json. A run writes bench/report/. Installs use an empty Bun cache,
// so they include downloads.
import { spawn, spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { cpus, tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const benchDir = import.meta.dir;
const repoRoot = join(benchDir, "..");
const TITLE = "週末の焙煎をコードで回す";

type Revision = "main" | "release" | "pinned";

type Tool = {
  name: string;
  dir: string;
  revision: Revision;
  runner?: string;
  build: string[];
  dev: string[];
  buildDir?: string;
  deliverable?: boolean;
  env?: Record<string, string>;
  url: string;
  versionOf: string;
};

type DeckPackage = {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

export type PackPaths = {
  hinote: string;
  code: string;
  core: string;
  types: string;
  shared: string;
};

export type ConsumerPackage = {
  name: string;
  private: true;
  type: "module";
  dependencies: Record<string, string>;
  devDependencies?: Record<string, string>;
  overrides?: Record<string, string>;
};

type Output = { files: number; kb: number; gzipKb: number };

type Row = {
  tool: string;
  revision: Revision;
  version?: string;
  packages: number;
  nodeModulesMB: number;
  installSeconds: number;
  buildSeconds?: number;
  output?: Output;
  devReadySeconds?: { first: number; warm: number };
  devRenderSeconds?: { first: number; warm: number };
  resolved?: Record<string, string | undefined>;
};

// `file:` plus an absolute path. The consumer lives in a temp directory, so a
// relative pack path would not survive the copy.
function fileDep(path: string) {
  return `file:${path}`;
}

// Adds hinote and @hinote/code to the deck's other dependencies. packs sets
// overrides for the checkout tarballs: a packed @hinote/code would otherwise
// ask npm for @hinote/shared.
function consumerPackage(options: {
  name: string;
  dependencies: Record<string, string>;
  devDependencies?: Record<string, string>;
  hinote: string;
  code: string;
  packs?: PackPaths;
}): ConsumerPackage {
  const dependencies = {
    ...options.dependencies,
    hinote: options.hinote,
    "@hinote/code": options.code,
  };
  const pkg: ConsumerPackage = {
    name: options.name,
    private: true,
    type: "module",
    dependencies,
  };
  if (
    options.devDependencies &&
    Object.keys(options.devDependencies).length > 0
  ) {
    pkg.devDependencies = { ...options.devDependencies };
  }
  if (options.packs) {
    pkg.overrides = {
      "@hinote/core": fileDep(options.packs.core),
      "@hinote/types": fileDep(options.packs.types),
      "@hinote/shared": fileDep(options.packs.shared),
    };
  }
  return pkg;
}

export function hinoteConsumer(
  deck: DeckPackage,
  source: "main" | "release",
  packs: PackPaths,
) {
  const checkout = source === "main";
  return consumerPackage({
    name: deck.name,
    dependencies: deck.dependencies ?? {},
    devDependencies: deck.devDependencies,
    hinote: checkout ? fileDep(packs.hinote) : "latest",
    code: checkout ? fileDep(packs.code) : "latest",
    packs: checkout ? packs : undefined,
  });
}

const now = () => performance.now() / 1000;
const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

function textCommand(command: string, args: string[], cwd = repoRoot) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function command(tool: Tool, cwd: string, cmd: string[]): [string, string[]] {
  const [bin = "", ...args] = cmd;
  if (bin === "sh") {
    return [
      "sh",
      ["-c", `PATH="${join(cwd, "node_modules/.bin")}:$PATH"; ${args[1]}`],
    ];
  }
  const path = join(cwd, "node_modules/.bin", bin);
  return tool.runner ? [tool.runner, [path, ...args]] : [path, args];
}

// Marp reads Markdown from stdin when stdin is not a terminal, so close it.
function run(tool: Tool, cwd: string, cmd: string[]) {
  const [file, args] = command(tool, cwd, cmd);
  const result = spawnSync(file, args, {
    cwd,
    env: { ...process.env, ...tool.env },
    stdio: ["ignore", "ignore", "pipe"],
  });
  if (result.status !== 0)
    throw new Error(`${cmd.join(" ")} failed:\n${result.stderr}`);
}

function sizeOf(dir: string): { bytes: number; gzip: number; files: number } {
  let bytes = 0;
  let gzip = 0;
  let files = 0;
  for (const entry of readdirSync(dir, { recursive: true })) {
    const path = join(dir, String(entry));
    if (!statSync(path).isFile()) continue;
    const data = readFileSync(path);
    bytes += data.length;
    gzip += gzipSync(data, { level: 9 }).length;
    files++;
  }
  return { bytes, gzip, files };
}

function diskKb(dir: string) {
  const out = spawnSync("/usr/bin/du", ["-sk", dir], {
    encoding: "utf8",
  }).stdout;
  return Number(out.split("\t")[0]);
}

function browse(...args: string[]) {
  spawnSync("agent-browser", ["--session", "hinote-bench", ...args], {
    stdio: "ignore",
    timeout: 60_000,
  });
}

async function startUp(tool: Tool, cwd: string, browser: boolean) {
  const [file, args] = command(tool, cwd, tool.dev);
  const start = now();
  const child = spawn(file, args, {
    cwd,
    env: { ...process.env, ...tool.env },
    stdio: "ignore",
    detached: true,
  });
  try {
    while (true) {
      try {
        if ((await fetch(tool.url)).ok) break;
      } catch {}
      if (now() - start > 60) throw new Error(`${tool.name} dev did not start`);
      await Bun.sleep(20);
    }
    const ready = now() - start;
    if (!browser) return { ready };
    browse("open", tool.url);
    browse("wait", "--text", TITLE);
    return { ready, render: now() - start };
  } finally {
    process.kill(-child.pid!, "SIGTERM");
    await new Promise((done) => child.once("exit", done));
    if (browser) browse("open", "about:blank");
    await Bun.sleep(500);
  }
}

function readDeck(dir: string): DeckPackage {
  return JSON.parse(readFileSync(join(benchDir, dir, "package.json"), "utf8"));
}

function readVersion(cwd: string, name: string) {
  try {
    const path = join(cwd, "node_modules", ...name.split("/"), "package.json");
    const version = JSON.parse(readFileSync(path, "utf8")).version;
    return typeof version === "string" ? version : undefined;
  } catch {
    return undefined;
  }
}

function copyProject(dir: string, dest: string) {
  const src = join(benchDir, dir);
  cpSync(src, dest, {
    recursive: true,
    filter: (path) => {
      const top = path.slice(src.length).split("/").filter(Boolean)[0];
      return (
        top !== "node_modules" &&
        top !== "dist" &&
        top !== ".hono-decks" &&
        top !== "bun.lock"
      );
    },
  });
}

function installConsumer(cwd: string, cacheRoot: string) {
  const cache = mkdtempSync(join(cacheRoot, "cache-"));
  const start = now();
  const install = spawnSync("bun", ["install"], {
    cwd,
    env: { ...process.env, BUN_INSTALL_CACHE_DIR: cache },
    encoding: "utf8",
  });
  const seconds = now() - start;
  rmSync(cache, { recursive: true, force: true });
  const output = `${install.stdout ?? ""}${install.stderr ?? ""}`;
  if (install.status !== 0)
    throw new Error(`bun install failed in ${cwd}:\n${output}`);
  const packages = /(\d+) packages? installed/.exec(output)?.[1];
  if (!packages)
    throw new Error(`bun install reported no package count:\n${output}`);
  return { packages: Number(packages), seconds };
}

// --filename takes a path; it cannot be combined with --destination.
function packCheckout(dest: string): PackPaths {
  mkdirSync(dest, { recursive: true });
  const packs = {} as PackPaths;
  for (const name of ["hinote", "core", "code", "types", "shared"] as const) {
    const filename = join(dest, `${name}.tgz`);
    const packed = spawnSync(
      "bun",
      ["pm", "pack", "--filename", filename, "--quiet"],
      {
        cwd: join(repoRoot, "packages", name),
        encoding: "utf8",
      },
    );
    if (packed.status !== 0)
      throw new Error(`bun pm pack ${name} failed:\n${packed.stderr}`);
    packs[name] = filename;
  }
  return packs;
}

const releaseSkipped =
  "The release deck was not measured: hinote@latest does not depend on @hinote/core, or @hinote/code is not on npm.";

// The deck imports hinote and @hinote/code. Published hinote has to be the
// split that depends on @hinote/core, and @hinote/code has to be on npm.
// A network or registry error is thrown; it is not treated as "not published".
async function releaseReady() {
  const [hinote, code] = await Promise.all([
    fetch("https://registry.npmjs.org/hinote/latest"),
    fetch("https://registry.npmjs.org/@hinote%2fcode"),
  ]);
  if (code.status === 404) return false;
  if (!hinote.ok || !code.ok) {
    throw new Error(
      `registry lookup failed: hinote ${hinote.status}, @hinote/code ${code.status}`,
    );
  }
  const body = (await hinote.json()) as {
    dependencies?: Record<string, string>;
  };
  return Boolean(body.dependencies?.["@hinote/core"]);
}

function hinoteVersions(cwd: string) {
  return {
    hinote: readVersion(cwd, "hinote"),
    "@hinote/code": readVersion(cwd, "@hinote/code"),
    "@hinote/core": readVersion(cwd, "@hinote/core"),
    "@hinote/types": readVersion(cwd, "@hinote/types"),
    "@hinote/shared": readVersion(cwd, "@hinote/shared"),
  };
}

function tools(release: boolean): Tool[] {
  const hinote = (
    name: string,
    dir: string,
    revision: Revision,
    runner: string,
    port: string,
  ) => ({
    name,
    dir,
    revision,
    runner,
    build: ["hinote", "build", "deck.tsx", "-o", "dist/index.html"],
    dev: ["hinote", "dev", "deck.tsx", "--port", port],
    url: `http://127.0.0.1:${port}/`,
    versionOf: "hinote",
  });
  return [
    hinote("hinote main (Bun)", "hinote", "main", "bun", "4501"),
    hinote("hinote main (Node)", "hinote-node", "main", "node", "4504"),
    ...(release
      ? [
          hinote("hinote release (Bun)", "hinote", "release", "bun", "4506"),
          hinote(
            "hinote release (Node)",
            "hinote-node",
            "release",
            "node",
            "4507",
          ),
        ]
      : []),
    {
      name: "hono-decks",
      dir: "hono-decks",
      revision: "pinned",
      build: ["hono-decks", "compile"],
      dev: ["sh", "-c", "hono-decks compile && PORT=4505 bun src/index.ts"],
      buildDir: ".hono-decks",
      deliverable: false,
      url: "http://127.0.0.1:4505/decks/talk/presentation",
      versionOf: "hono-decks",
    },
    {
      name: "slidev",
      dir: "slidev",
      revision: "pinned",
      build: ["slidev", "build", "slides.md"],
      dev: ["slidev", "slides.md", "--port", "4502"],
      url: "http://localhost:4502/",
      versionOf: "@slidev/cli",
    },
    {
      name: "marp",
      dir: "marp",
      revision: "pinned",
      build: ["marp", "slides.md", "-o", "dist/index.html"],
      dev: ["marp", "-s", "."],
      env: { PORT: "4503" },
      url: "http://localhost:4503/slides.md",
      versionOf: "@marp-team/marp-cli",
    },
  ];
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function shown(value: string | number | undefined, unit = "") {
  return value === undefined ? "—" : `${value}${unit}`;
}

type Report = {
  measuredAt: string;
  gitCommit?: string;
  bun?: string;
  node?: string;
  cpu: string;
  browser: boolean;
  releaseSkipped?: string;
  rows: Row[];
};

function renderHtml(report: Report) {
  const body = report.rows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.tool)}</td><td>${escapeHtml(shown(row.version))}</td><td>${row.packages}</td><td>${row.nodeModulesMB} MB</td><td>${row.installSeconds} s</td><td>${escapeHtml(shown(row.buildSeconds, " s"))}</td><td>${escapeHtml(shown(row.devReadySeconds?.warm, " s"))}</td><td>${escapeHtml(row.output ? `${row.output.files} files, ${row.output.kb} KB (${row.output.gzipKb} KB gzipped)` : "—")}</td></tr>`,
    )
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>hinote benchmark</title>
<style>
body{font:16px/1.5 ui-sans-serif,system-ui,sans-serif;margin:2rem auto;max-width:960px;padding:0 1rem}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}
th,td{border-bottom:1px solid #ccc;padding:.4rem .6rem;text-align:right}
th:first-child,td:first-child{text-align:left}
</style>
</head>
<body>
<h1>hinote benchmark</h1>
<p>Measured ${escapeHtml(report.measuredAt)}${report.gitCommit ? ` at <code>${escapeHtml(report.gitCommit)}</code>` : ""}. Bun ${escapeHtml(report.bun ?? "unknown")}, Node ${escapeHtml(report.node ?? "unknown")}. ${escapeHtml(report.cpu)}.</p>
<p>Hinote main is this checkout, installed from packed tarballs. Hinote release is <code>hinote@latest</code> and <code>@hinote/code@latest</code>, downloaded by the timed install. Slidev, Marp, and hono-decks stay at the versions pinned in <code>bench/</code>. The dev server column is the warm median until the server responds.</p>
${report.releaseSkipped ? `<p>${escapeHtml(report.releaseSkipped)}</p>` : ""}
<table>
<thead><tr><th>Tool</th><th>Version</th><th>Packages</th><th>node_modules</th><th>Install</th><th>Build</th><th>Dev server</th><th>Output</th></tr></thead>
<tbody>${body}</tbody>
</table>
<p>${report.browser ? "Browser timing is in latest.json." : "Browser timing was not run."} <a href="latest.json">latest.json</a></p>
</body>
</html>
`;
}

async function main() {
  const browser = process.argv.includes("--browser");
  const outputDir = join(benchDir, "report");
  const work = mkdtempSync(join(tmpdir(), "hinote-bench-"));
  if (browser) browse("open", "about:blank");

  try {
    const release = await releaseReady();
    const deckTools = tools(release);
    const packs = packCheckout(join(work, "packs"));
    const rows: Row[] = [];
    for (const tool of deckTools) {
      const cwd = join(
        work,
        "consumers",
        tool.name.replaceAll(/[^\w.-]+/g, "-"),
      );
      copyProject(tool.dir, cwd);
      if (tool.revision === "main" || tool.revision === "release") {
        writeFileSync(
          join(cwd, "package.json"),
          `${JSON.stringify(hinoteConsumer(readDeck(tool.dir), tool.revision, packs), null, 2)}\n`,
        );
      }
      const installed = installConsumer(cwd, work);
      if (tool.revision === "main") {
        const lock = readFileSync(join(cwd, "bun.lock"), "utf8");
        for (const path of [packs.core, packs.types, packs.shared]) {
          if (!lock.includes(path)) {
            throw new Error(`${tool.name} did not install ${path}`);
          }
        }
      }
      run(tool, cwd, tool.build);
      const builds: number[] = [];
      for (let index = 0; index < 5; index++) {
        rmSync(join(cwd, tool.buildDir ?? "dist"), {
          recursive: true,
          force: true,
        });
        const start = now();
        run(tool, cwd, tool.build);
        builds.push(now() - start);
      }
      const output =
        tool.deliverable === false
          ? undefined
          : sizeOf(join(cwd, tool.buildDir ?? "dist"));
      rmSync(join(cwd, "node_modules/.vite"), { recursive: true, force: true });
      const first = await startUp(tool, cwd, browser);
      const warm = [];
      for (let index = 0; index < 3; index++)
        warm.push(await startUp(tool, cwd, browser));
      const row: Row = {
        tool: tool.name,
        revision: tool.revision,
        version: readVersion(cwd, tool.versionOf),
        packages: installed.packages,
        nodeModulesMB: +(diskKb(join(cwd, "node_modules")) / 1024).toFixed(1),
        installSeconds: +installed.seconds.toFixed(1),
        buildSeconds: +median(builds).toFixed(2),
        output: output && {
          files: output.files,
          kb: Math.round(output.bytes / 1024),
          gzipKb: Math.round(output.gzip / 1024),
        },
        devReadySeconds: {
          first: +first.ready.toFixed(2),
          warm: +median(warm.map((sample) => sample.ready)).toFixed(2),
        },
        ...(tool.revision !== "pinned"
          ? { resolved: hinoteVersions(cwd) }
          : {}),
        ...(browser && {
          devRenderSeconds: {
            first: +(first.render ?? 0).toFixed(2),
            warm: +median(warm.map((sample) => sample.render ?? 0)).toFixed(2),
          },
        }),
      };
      rows.push(row);
      console.log(JSON.stringify(row));
    }

    const cpu = cpus()[0];
    const report: Report = {
      measuredAt: new Date().toISOString(),
      gitCommit: textCommand("git", ["rev-parse", "HEAD"]),
      bun: textCommand("bun", ["--version"]),
      node: textCommand("node", ["--version"]),
      cpu: cpu ? `${cpu.model} (${cpus().length} logical CPUs)` : "unknown",
      browser,
      ...(!release && { releaseSkipped }),
      rows,
    };
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(
      join(outputDir, "latest.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    writeFileSync(join(outputDir, "index.html"), renderHtml(report));
    console.log(`Wrote ${outputDir}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (import.meta.main) await main();
