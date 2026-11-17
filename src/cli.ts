#!/usr/bin/env bun
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { HinoteError } from "./errors.ts";
import { insertIntoDeck } from "./insert.ts";
import { loadDeckFile } from "./load.ts";
import { renderDeck } from "./render.ts";
import { createDevApp } from "./server.ts";

function usage(): string {
  return `hinote dev [deck.tsx] [--port 4321]
hinote build [deck.tsx] [-o dist/index.html]
hinote insert <Name> [--deck deck.tsx] [--at N]`;
}

type Args = {
  positionals: string[];
  port?: number;
  output?: string;
  deck?: string;
  at?: number;
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
    else if (arg === "--deck") args.deck = readValue(argv, ++i, arg);
    else if (arg === "--at") args.at = readNumber(argv, ++i, arg);
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

function slideTemplate(name: string): string {
  return `import { Center, createSlide } from "hinote"

export default createSlide({ title: "${name}" }, () => (
  <Center>
    <h1>${name}</h1>
  </Center>
))
`;
}

async function devCommand(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  if (args.positionals.length > 1)
    throw new HinoteError("dev accepts one deck file.");
  const deckFile = resolve(args.positionals[0] ?? "deck.tsx");
  const port = args.port ?? 4321;
  if (port < 1 || port > 65535)
    throw new HinoteError("--port must be from 1 to 65535.");
  const loaded = await loadDeckFile(deckFile);
  const view = await renderDeck({ ...loaded, role: "view" });
  const presenter = await renderDeck({ ...loaded, role: "presenter" });
  const app = createDevApp({ view, presenter }, dirname(deckFile));
  const server = Bun.serve({
    port,
    hostname: "127.0.0.1",
    fetch: app.fetch,
  });

  console.log(`hinote dev http://127.0.0.1:${server.port}`);
  console.log(`presenter http://127.0.0.1:${server.port}/presenter`);

  const shutdown = () => {
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
  const loaded = await loadDeckFile(deckFile);
  const html = await renderDeck({ ...loaded, role: "view" });
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

async function insertCommand(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const name = args.positionals[0];
  if (!name || args.positionals.length !== 1)
    throw new HinoteError("insert needs one slide name.");
  const deckFile = resolve(args.deck ?? "deck.tsx");
  if (!(await Bun.file(deckFile).exists()))
    throw new HinoteError(`Could not read ${deckFile}.`);
  const source = await Bun.file(deckFile).text();
  const next = insertIntoDeck(source, name, `./slides/${name}.tsx`, args.at);
  const slideFile = resolve(dirname(deckFile), "slides", `${name}.tsx`);
  if (await Bun.file(slideFile).exists())
    throw new HinoteError(`${slideFile} already exists.`);
  await mkdir(dirname(slideFile), { recursive: true });
  const temporary = `${deckFile}.${process.pid}.tmp`;
  try {
    await writeFile(slideFile, slideTemplate(name));
    await writeFile(temporary, next);
    await rename(temporary, deckFile);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    await unlink(slideFile).catch(() => {});
    throw error;
  }
  console.log(slideFile);
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
  else if (command === "insert") await insertCommand(rest);
  else throw new HinoteError(`Unknown command "${command}".\n${usage()}`);
}

if (import.meta.path === Bun.main) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof HinoteError ? error.message : error);
    process.exitCode = 1;
  });
}
