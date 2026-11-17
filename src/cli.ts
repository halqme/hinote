#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { realpathSync, watch } from "node:fs";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { HinoteError, UsageError } from "./errors.ts";
import { parseArgs } from "./cli/args.ts";
import type { Command } from "./cli/command.ts";
import { commandHelp, overview } from "./cli/help.ts";
import { createOutput, reportError } from "./cli/output.ts";
import { check, inline, inspect, refs, render } from "./cli/plumbing.ts";
import { assets, build, dev, init, prerender } from "./cli/porcelain.ts";
import { skills } from "./cli/skills.ts";
import { hasNodePackages, isBun } from "./runtime.ts";
import pkg from "../package.json" with { type: "json" };

export const COMMANDS: readonly Command[] = [
  init,
  dev,
  build,
  prerender,
  assets,
  render,
  inline,
  refs,
  inspect,
  check,
  skills,
];

const find = (name: string | undefined) =>
  COMMANDS.find((command) => command.name === name) ??
  // "skill" is what people tend to type.
  (name === "skill" ? skills : undefined);

function unknown(name: string): UsageError {
  const near = COMMANDS.filter(
    (c) => c.name.startsWith(name.slice(0, 2)) || name.startsWith(c.name),
  ).map((c) => c.name);
  return new UsageError(
    `Unknown command "${name}".`,
    near.length > 0
      ? `Did you mean ${near.join(" or ")}? Run: hinote help`
      : "Run: hinote help",
  );
}

// Runs one command line and returns the exit code. Every error is reported
// here, as text or, with --json, as JSON.
export async function main(argv: readonly string[]): Promise<number> {
  // --json may come anywhere, even before the command.
  const json = argv.includes("--json");
  const [name, ...rest] = argv.filter((arg) => arg !== "--json");
  try {
    if (
      name === undefined ||
      name === "help" ||
      name === "--help" ||
      name === "-h"
    ) {
      const topic =
        name === "help" ? rest.find((a) => !a.startsWith("-")) : undefined;
      if (topic === undefined) {
        const text = overview(COMMANDS, pkg.version);
        if (json)
          console.log(
            JSON.stringify({
              ok: true,
              command: "help",
              data: {
                version: pkg.version,
                commands: COMMANDS.map(({ name, group, summary, args }) => ({
                  name,
                  group,
                  summary,
                  args,
                })),
              },
            }),
          );
        else process.stdout.write(text);
        return 0;
      }
      const command = find(topic);
      if (!command) throw unknown(topic);
      process.stdout.write(commandHelp(command));
      return 0;
    }
    if (name === "--version" || name === "-v" || name === "version") {
      console.log(
        json
          ? JSON.stringify({
              ok: true,
              command: "version",
              data: { version: pkg.version },
            })
          : pkg.version,
      );
      return 0;
    }
    const command = find(name);
    if (!command) throw unknown(name);
    const args = parseArgs(rest, command.flags, command.name);
    if (args.flags.help) {
      process.stdout.write(commandHelp(command));
      return 0;
    }
    if (args.positionals.length > command.maxArgs)
      throw new UsageError(
        `${command.name} takes ${command.args}, but got ${args.positionals.length} arguments.`,
        `Run: hinote help ${command.name}`,
      );
    return (await command.run(args, createOutput(command.name, json))) ?? 0;
  } catch (error) {
    return reportError(error, find(name)?.name ?? name ?? "hinote", json);
  }
}

// Under Node, dev and build need esbuild and @hono/node-server. A Bun user who
// runs the CLI through Node (bunx and package scripts follow the node shebang
// when Node is installed) has neither, so hand the run to Bun when it is there.
async function handOffToBun(argv: string[]): Promise<boolean> {
  const needsBundler =
    COMMANDS.find((command) => command.name === argv[0])?.bundles === true;
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
    .then(async (handed) => {
      if (!handed) process.exitCode = await main(argv);
    })
    .catch((error: unknown) => {
      process.exitCode = reportError(
        error,
        argv[0] ?? "hinote",
        argv.includes("--json"),
      );
    });
}
