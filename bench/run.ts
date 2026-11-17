// Compares hinote with Slidev and Marp CLI on the same five slides.
//   bun bench/run.ts            install, build, and dev start-up
//   bun bench/run.ts --browser  also time the first render with agent-browser
// Installs go through Bun with an empty cache, so they include downloads.
import { spawn, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const root = import.meta.dir;
const browser = process.argv.includes("--browser");
const TITLE = "週末の焙煎をコードで回す";

type Tool = {
  name: string;
  // Directory under bench/, when it differs from the name.
  dir?: string;
  // Runs the bin with this runtime instead of its shebang.
  runner?: string;
  build: string[];
  dev: string[];
  env?: Record<string, string>;
  url: string;
};

const tools: Tool[] = [
  {
    name: "hinote (Bun)",
    dir: "hinote",
    runner: "bun",
    build: ["hinote", "build", "deck.tsx", "-o", "dist/index.html"],
    dev: ["hinote", "dev", "deck.tsx", "--port", "4501"],
    url: "http://127.0.0.1:4501/",
  },
  {
    name: "hinote (Node)",
    dir: "hinote-node",
    runner: "node",
    build: ["hinote", "build", "deck.tsx", "-o", "dist/index.html"],
    dev: ["hinote", "dev", "deck.tsx", "--port", "4504"],
    url: "http://127.0.0.1:4504/",
  },
  {
    name: "slidev",
    build: ["slidev", "build", "slides.md"],
    dev: ["slidev", "slides.md", "--port", "4502"],
    url: "http://localhost:4502/",
  },
  {
    name: "marp",
    build: ["marp", "slides.md", "-o", "dist/index.html"],
    dev: ["marp", "-s", "."],
    env: { PORT: "4503" },
    url: "http://localhost:4503/slides.md",
  },
];

const now = () => performance.now() / 1000;
const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

// The command for a bin in the project, run by `runner` when one is given.
function command(tool: Tool, cwd: string, cmd: string[]): [string, string[]] {
  const [bin = "", ...args] = cmd;
  const path = join(cwd, "node_modules/.bin", bin);
  return tool.runner ? [tool.runner, [path, ...args]] : [path, args];
}

// Marp reads Markdown from stdin when stdin is not a terminal, so close it.
function run(tool: Tool, cwd: string, cmd: string[]) {
  const [file, args] = command(tool, cwd, cmd);
  const env = tool.env ?? {};
  const result = spawnSync(file, args, {
    cwd,
    env: { ...process.env, ...env },
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

function diskKb(dir: string): number {
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

async function startUp(tool: Tool, cwd: string) {
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

// Launch the browser first so the first tool does not pay for it.
if (browser) browse("open", "about:blank");

// --filename takes a path; it cannot be combined with --destination.
mkdirSync(join(root, ".pack"), { recursive: true });
const packed = spawnSync(
  "bun",
  ["pm", "pack", "--filename", join(root, ".pack/hinote.tgz"), "--quiet"],
  { cwd: join(root, ".."), encoding: "utf8" },
);
if (packed.status !== 0)
  throw new Error(`bun pm pack failed:\n${packed.stderr}`);

for (const tool of tools) {
  const cwd = join(root, tool.dir ?? tool.name);
  rmSync(join(cwd, "node_modules"), { recursive: true, force: true });
  rmSync(join(cwd, "bun.lock"), { force: true });
  const cache = mkdtempSync(join(root, ".cache-"));
  let start = now();
  const install = spawnSync("bun", ["install"], {
    cwd,
    env: { ...process.env, BUN_INSTALL_CACHE_DIR: cache },
    encoding: "utf8",
  });
  const installSeconds = now() - start;
  rmSync(cache, { recursive: true, force: true });
  const packages = /(\d+) packages? installed/.exec(
    install.stdout + install.stderr,
  )?.[1];

  run(tool, cwd, tool.build); // warm-up
  const builds: number[] = [];
  for (let i = 0; i < 5; i++) {
    rmSync(join(cwd, "dist"), { recursive: true, force: true });
    start = now();
    run(tool, cwd, tool.build);
    builds.push(now() - start);
  }
  const out = sizeOf(join(cwd, "dist"));

  rmSync(join(cwd, "node_modules/.vite"), { recursive: true, force: true });
  const first = await startUp(tool, cwd);
  const warm = [];
  for (let i = 0; i < 3; i++) warm.push(await startUp(tool, cwd));

  console.log(
    JSON.stringify({
      tool: tool.name,
      packages: Number(packages),
      nodeModulesMB: +(diskKb(join(cwd, "node_modules")) / 1024).toFixed(1),
      installSeconds: +installSeconds.toFixed(1),
      buildSeconds: +median(builds).toFixed(2),
      output: {
        files: out.files,
        kb: Math.round(out.bytes / 1024),
        gzipKb: Math.round(out.gzip / 1024),
      },
      devReadySeconds: {
        first: +first.ready.toFixed(2),
        warm: +median(warm.map((w) => w.ready)).toFixed(2),
      },
      ...(browser && {
        devRenderSeconds: {
          first: +(first.render ?? 0).toFixed(2),
          warm: +median(warm.map((w) => w.render ?? 0)).toFixed(2),
        },
      }),
    }),
  );
}
