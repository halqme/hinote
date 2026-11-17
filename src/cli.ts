#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { realpathSync, watch } from "node:fs";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { copyAssets } from "./assets.ts";
import { HinoteError } from "./errors.ts";
import {
  COMMANDS,
  initProject,
  NODE_DEV_PACKAGES,
  packageManager,
} from "./init.ts";
import type { Deck } from "./deck.ts";
import { loadDeckFile } from "./load.ts";
import { hasNodePackages, isBun, serve } from "./runtime.ts";
import { inlineScripts } from "./scripts.ts";
import { createDevApp } from "./server.ts";
import { parseBase, prerender } from "./prerender.ts";

function usage(): string {
  return `hinote init [dir] [--no-install]
hinote dev [deck.tsx] [--port 4321] [--host 127.0.0.1]
hinote build [deck.tsx] [-o dist/index.html]
hinote prerender [deck.tsx] [-o dist] [--base /path]`;
}

type Args = {
  positionals: string[];
  port?: number;
  host?: string;
  output?: string;
  base?: string;
  install?: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { positionals: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === "--port" || arg === "-p")
      args.port = readNumber(argv, ++i, arg);
    else if (arg === "--host") args.host = readValue(argv, ++i, arg);
    else if (arg === "--base") args.base = readValue(argv, ++i, arg);
    else if (arg === "--no-install") args.install = false;
    else if (arg === "--output" || arg === "-o")
      args.output = readValue(argv, ++i, arg);
    else if (arg.startsWith("-"))
      throw new HinoteError(`Unknown option "${arg}".`);
    else args.positionals.push(arg);
  }
  return args;
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value || value.startsWith("-"))
    throw new HinoteError(`${flag} needs a value.`);
  return value;
}

function readNumber(argv: string[], index: number, flag: string): number {
  const value = readValue(argv, index, flag);
  if (!/^\d+$/.test(value))
    throw new HinoteError(`${flag} must be an integer.`);
  return Number(value);
}

function isLoopback(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

// The addresses to print for a host. A wildcard host listens on every
// interface, so list this machine's network addresses as well.
function reachableAddresses(host: string): string[] {
  if (host !== "0.0.0.0" && host !== "::")
    return [host.includes(":") ? `[${host}]` : host];
  const lan = Object.values(networkInterfaces())
    .flat()
    .filter((net) => net && net.family === "IPv4" && !net.internal)
    .map((net) => net!.address);
  return ["127.0.0.1", ...lan];
}

// Edits under these directories do not change the deck.
const IGNORED_DIRS = new Set(["node_modules", ".git", ".tmp", "dist"]);

function isIgnored(root: string, file: string): boolean {
  const path = relative(root, resolve(root, file));
  return path.split(sep).some((part) => IGNORED_DIRS.has(part));
}

async function devCommand(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  if (args.positionals.length > 1)
    throw new HinoteError("dev accepts one deck file.");
  const deckFile = resolve(args.positionals[0] ?? "deck.tsx");
  const root = dirname(deckFile);
  const port = args.port ?? 4321;
  if (port < 1 || port > 65535)
    throw new HinoteError("--port must be from 1 to 65535.");
  // Only this machine by default. --host 0.0.0.0 lets a phone or another
  // laptop on the network open the deck and follow along.
  const host = args.host ?? "127.0.0.1";
  // The presenter view, sync, and pointer are for presenting from this
  // machine. On localhost dev turns them on; on the network only a deck that
  // says presenter: true gets them, since anyone who can reach the server could
  // read the notes and drive the slides.
  const prepare = (loaded: Deck) => {
    loaded.live = true;
    loaded.transform = inlineScripts;
    if (isLoopback(host)) loaded.presenter = true;
    return loaded;
  };
  let deck = prepare(await loadDeckFile(deckFile));
  const app = createDevApp(() => deck, root);
  const server = await serve({ port, hostname: host, fetch: app.fetch });

  for (const address of reachableAddresses(host)) {
    console.log(`hinote dev http://${address}:${server.port}`);
    if (deck.presenter)
      console.log(`presenter http://${address}:${server.port}/presenter`);
  }
  if (!isLoopback(host)) {
    console.log(
      `Serving ${root} to the network: every file in it can be fetched.`,
    );
    if (!deck.presenter)
      console.log(
        "The presenter view, sync, and pointer are off on the network. Set presenter: true on the deck to turn them on.",
      );
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  let loading = Promise.resolve();
  const reload = () => {
    loading = loading.then(async () => {
      try {
        // Building the new deck tells open pages to reload (see hub.ts).
        deck = prepare(await loadDeckFile(deckFile));
        console.log("reloaded");
      } catch (error) {
        // Keep serving the last deck that loaded.
        console.error(error instanceof HinoteError ? error.message : error);
      }
    });
  };
  const watcher = watch(root, { recursive: true }, (_event, file) => {
    if (file && isIgnored(root, file)) return;
    clearTimeout(timer);
    timer = setTimeout(reload, 100);
  });

  const shutdown = () => {
    watcher.close();
    server.stop();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function buildCommand(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  if (args.positionals.length > 1)
    throw new HinoteError("build accepts one deck file.");
  const deckFile = resolve(args.positionals[0] ?? "deck.tsx");
  const output = resolve(args.output ?? "dist/index.html");
  const deck = await loadDeckFile(deckFile);
  const html = await inlineScripts(await deck.render("static"));
  const outDir = dirname(output);
  await mkdir(dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.tmp`;
  await writeFile(temporary, html);
  try {
    await rename(temporary, output);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
  // The page keeps relative URLs, so bring the files they name along.
  const copied = await copyAssets(html, dirname(deckFile), outDir);
  console.log(output);
  if (copied.length > 0)
    console.log(`copied ${copied.length} file${copied.length > 1 ? "s" : ""}`);
}

async function initCommand(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  if (args.positionals.length > 1)
    throw new HinoteError("init accepts one directory.");
  const dir = args.positionals[0] ?? ".";
  const pm = packageManager();
  const commands = COMMANDS[pm];
  const { files, wrotePackage } = await initProject(dir, pm);
  for (const file of files) console.log(file);
  const install = commands.install.join(" ");
  const next = `${commands.hinote} dev`;
  const guide =
    "Hands-on: node_modules/hinote/docs/hands-on.md (日本語: hands-on.ja.md)";

  // Someone else's package.json: say what to add instead of changing it.
  if (!wrotePackage) {
    console.log(`\npackage.json already exists, so add the packages yourself:`);
    console.log(`  ${commands.add} hinote hono`);
    if (pm !== "bun")
      console.log(`  ${commands.addDev} ${NODE_DEV_PACKAGES.join(" ")}`);
    console.log(`\nNext: ${next}\n${guide}`);
    return;
  }
  if (args.install === false) {
    console.log(`\nNext: cd ${dir} && ${install} && ${next}\n${guide}`);
    return;
  }

  console.log(`\n> ${install}`);
  const [bin = "", ...rest] = commands.install;
  const code = await new Promise<number>((done) => {
    const child = spawn(bin, rest, { cwd: resolve(dir), stdio: "inherit" });
    child.on("error", () => done(1));
    child.on("exit", (status) => done(status ?? 1));
  });
  if (code !== 0)
    // The files stay: installing again is all that is left.
    throw new HinoteError(
      `${install} failed. The files are in place; to try again: cd ${dir} && ${install}`,
    );
  console.log(`\nNext: cd ${dir} && ${next}\n${guide}`);
}

async function prerenderCommand(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  if (args.positionals.length > 1)
    throw new HinoteError("prerender accepts one deck file.");
  const deckFile = resolve(args.positionals[0] ?? "deck.tsx");
  const outDir = resolve(args.output ?? "dist");
  const base = parseBase(args.base);
  const deck = await loadDeckFile(deckFile);
  const { pages, copied } = await prerender(
    deck,
    dirname(deckFile),
    outDir,
    base,
  );
  console.log(outDir);
  console.log(
    `${pages.length} pages` +
      (copied.length > 0
        ? `, copied ${copied.length} file${copied.length > 1 ? "s" : ""}`
        : ""),
  );
}

export async function main(argv: string[]): Promise<void> {
  if (argv.length === 0) throw new HinoteError(usage());
  if (argv[0] === "--help" || argv[0] === "help") {
    console.log(usage());
    return;
  }
  const [command, ...rest] = argv;
  if (command === "init") await initCommand(rest);
  else if (command === "dev") await devCommand(rest);
  else if (command === "build") await buildCommand(rest);
  else if (command === "prerender") await prerenderCommand(rest);
  else throw new HinoteError(`Unknown command "${command}".\n${usage()}`);
}

// Under Node, dev and build need esbuild and @hono/node-server. A Bun user who
// runs the CLI through Node (bunx and package scripts follow the node shebang
// when Node is installed) has neither, so hand the run to Bun when it is there.
async function handOffToBun(argv: string[]): Promise<boolean> {
  const needsBundler =
    argv[0] === "dev" || argv[0] === "build" || argv[0] === "prerender";
  if (isBun || !needsBundler || (await hasNodePackages())) return false;
  const probe = spawnSync("bun", ["--version"], { stdio: "ignore" });
  if (probe.status !== 0) return false;
  const child = spawn("bun", [fileURLToPath(import.meta.url), ...argv], {
    stdio: "inherit",
  });
  const code = await new Promise<number>((done) =>
    child.on("exit", (status) => done(status ?? 1)),
  );
  process.exitCode = code;
  return true;
}

function isMain(): boolean {
  const script = process.argv[1];
  if (!script) return false;
  try {
    return (
      realpathSync(script) === realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
}

if (isMain()) {
  const argv = process.argv.slice(2);
  handOffToBun(argv)
    .then((handed) => (handed ? undefined : main(argv)))
    .catch((error: unknown) => {
      console.error(error instanceof HinoteError ? error.message : error);
      process.exitCode = 1;
    });
}
