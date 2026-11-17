#!/usr/bin/env bun
import { watch } from "node:fs";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { HinoteError } from "./errors.ts";
import { loadDeckFile } from "./load.ts";
import { createDevApp } from "./server.ts";

function usage(): string {
  return `hinote dev [deck.tsx] [--port 4321]
hinote build [deck.tsx] [-o dist/index.html]`;
}

type Args = {
  positionals: string[];
  port?: number;
  output?: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { positionals: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === "--port" || arg === "-p")
      args.port = readNumber(argv, ++i, arg);
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
  let deck = await loadDeckFile(deckFile);
  // One hub for the whole session, so open pages hear `reload` from the new deck.
  const hub = deck.hub;
  const app = createDevApp(() => deck, root);
  const server = Bun.serve({
    port,
    hostname: "127.0.0.1",
    fetch: app.fetch,
  });

  console.log(`hinote dev http://127.0.0.1:${server.port}`);
  console.log(`presenter http://127.0.0.1:${server.port}/presenter`);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let loading = Promise.resolve();
  const reload = () => {
    loading = loading.then(async () => {
      try {
        const next = await loadDeckFile(deckFile);
        next.hub = hub;
        deck = next;
        hub.broadcast({ type: "reload" });
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
    server.stop(true);
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
  const html = await deck.render("static");
  await mkdir(dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.tmp`;
  await writeFile(temporary, html);
  try {
    await rename(temporary, output);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
  console.log(output);
}

export async function main(argv: string[]): Promise<void> {
  if (argv.length === 0) throw new HinoteError(usage());
  if (argv[0] === "--help" || argv[0] === "help") {
    console.log(usage());
    return;
  }
  const [command, ...rest] = argv;
  if (command === "dev") await devCommand(rest);
  else if (command === "build") await buildCommand(rest);
  else throw new HinoteError(`Unknown command "${command}".\n${usage()}`);
}

if (import.meta.path === Bun.main) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof HinoteError ? error.message : error);
    process.exitCode = 1;
  });
}
