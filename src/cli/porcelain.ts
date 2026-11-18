// The commands people run day to day. Each is a few plumbing steps in a row;
// its help names them.
import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, relative, resolve, sep } from "node:path";
import { copyAssets } from "../build/assets.ts";
import { isBrowserName } from "../snapshot/browser.ts";
import type { Deck } from "../deck/deck.ts";
import { HinoteError, UsageError } from "../errors.ts";
import {
  COMMANDS,
  initProject,
  NODE_DEV_PACKAGES,
  packageManager,
} from "./init.ts";
import { deckPath, loadDeckFile } from "../build/load.ts";
import { takeSnapshots } from "../snapshot/snapshot.ts";
import { parseBase, prerender as prerenderDeck } from "../build/prerender.ts";
import { serve } from "../build/runtime.ts";
import { inlineScripts } from "../build/scripts.ts";
import { createDevApp } from "../build/server.ts";
import type { Command } from "./command.ts";
import { DECK_ARG, OUTPUT_FLAG, writeOutput } from "./plumbing.ts";

const files = (n: number) => `${n} file${n === 1 ? "" : "s"}`;

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

export const init: Command = {
  name: "init",
  group: "porcelain",
  summary: "Create a deck project and install it",
  args: "[dir]",
  maxArgs: 1,
  description: `Writes deck.tsx, style.css, tsconfig.json, and package.json into the directory (the current one by default), then installs with the package manager that ran hinote: bunx runs bun install, npx runs npm install. It never overwrites a file. Where a package.json already exists it is left alone, nothing is installed, and the packages to add are printed.`,
  flags: {
    install: {
      type: "boolean",
      description: "Install the packages. --no-install only writes the files.",
      default: "true",
    },
  },
  examples: [
    "bunx hinote init my-talk",
    "npx hinote init my-talk --no-install",
  ],
  async run(args, out) {
    const dir = args.positionals[0] ?? ".";
    const pm = packageManager();
    const commands = COMMANDS[pm];
    const { files: written, wrotePackage } = await initProject(dir, pm);
    const install = commands.install.join(" ");
    const next = `${commands.hinote} dev`;
    const guide =
      "Hands-on: node_modules/hinote/docs/hands-on.md (日本語: hands-on.ja.md)";
    const report = (
      installed: boolean,
      steps: string[],
      extra: string[] = [],
    ) =>
      out.result({ files: written, installed, next: steps }, [
        ...written,
        ...extra,
        `\nNext: ${steps.join(" && ")}\n${guide}`,
      ]);

    // Someone else's package.json: say what to add instead of changing it.
    if (!wrotePackage) {
      const add = [`${commands.add} hinote hono`];
      if (pm !== "bun")
        add.push(`${commands.addDev} ${NODE_DEV_PACKAGES.join(" ")}`);
      report(
        false,
        [...add, next],
        [
          `\npackage.json already exists, so add the packages yourself:`,
          ...add.map((line) => `  ${line}`),
        ],
      );
      return;
    }
    if (args.flags.install === false) {
      report(false, [`cd ${dir}`, install, next]);
      return;
    }

    if (!out.json) console.log(`\n> ${install}`);
    const [bin = "", ...rest] = commands.install;
    const code = await new Promise<number>((done) => {
      // With --json, stdout is for JSON only, so the installer's output goes
      // to stderr.
      const child = spawn(bin, rest, {
        cwd: resolve(dir),
        stdio: ["ignore", out.json ? 2 : "inherit", "inherit"],
      });
      child.on("error", () => done(1));
      child.on("exit", (status) => done(status ?? 1));
    });
    if (code !== 0)
      // The files stay: installing again is all that is left.
      throw new HinoteError(`${install} failed. The files are in place.`, {
        code: "install-failed",
        hint: `cd ${dir} && ${install}`,
      });
    report(true, [`cd ${dir}`, next]);
  },
};

export const dev: Command = {
  name: "dev",
  group: "porcelain",
  summary: "Serve the deck, reload on edits, with the presenter view",
  args: DECK_ARG,
  maxArgs: 1,
  description: `Serves the deck at / and, on this machine, the presenter view at /presenter, and reloads open pages when a file in the deck directory changes. A deck that fails to load is reported, and the last one keeps serving. It runs until stopped.

With --json it prints one {"event", "data"} line per event: listening (the URLs), notice (a warning about serving the network), reloaded, and reload-failed (the error).

--host 0.0.0.0 serves the network too. Every file in the deck directory can then be fetched, and the presenter view stays off unless the deck sets presenter: true.`,
  flags: {
    port: {
      type: "number",
      alias: "p",
      value: "port",
      default: "4321",
      description: "Port to listen on.",
    },
    host: {
      type: "string",
      value: "host",
      default: "127.0.0.1",
      description: "Address to listen on.",
    },
  },
  examples: ["hinote dev", "hinote dev talk/deck.tsx --port 5000 --json"],
  bundles: true,
  async run(args, out) {
    const deckFile = deckPath(args.positionals[0]);
    const root = dirname(deckFile);
    const port = (args.flags.port as number | undefined) ?? 4321;
    if (port < 1 || port > 65535)
      throw new UsageError("--port must be from 1 to 65535.");
    // Only this machine by default. --host 0.0.0.0 lets a phone or another
    // laptop on the network open the deck and follow along.
    const host = (args.flags.host as string | undefined) ?? "127.0.0.1";
    // The presenter view, sync, and pointer are for presenting from this
    // machine. On localhost dev turns them on; on the network only a deck that
    // says presenter: true gets them, since anyone who can reach the server
    // could read the notes and drive the slides.
    const prepare = (loaded: Deck) => {
      loaded.live = true;
      loaded.transform = inlineScripts;
      if (isLoopback(host)) loaded.presenter = true;
      return loaded;
    };
    let deck = prepare(await loadDeckFile(deckFile));
    const app = createDevApp(() => deck, root);
    const server = await serve({ port, hostname: host, fetch: app.fetch });

    const urls = reachableAddresses(host).map((address) => ({
      deck: `http://${address}:${server.port}/`,
      presenter: deck.presenter
        ? `http://${address}:${server.port}/presenter`
        : undefined,
    }));
    out.event(
      "listening",
      { file: deckFile, urls },
      urls
        .flatMap((url) => [
          `hinote dev ${url.deck.slice(0, -1)}`,
          ...(url.presenter ? [`presenter ${url.presenter}`] : []),
        ])
        .join("\n"),
    );
    // Agents need these as much as people do, so they are events, not notes.
    if (!isLoopback(host)) {
      const notice = (message: string) =>
        out.event("notice", { message }, message);
      notice(
        `Serving ${root} to the network: every file in it can be fetched.`,
      );
      if (!deck.presenter)
        notice(
          "The presenter view, sync, and pointer are off on the network. Set presenter: true on the deck to turn them on.",
        );
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    let loading = Promise.resolve();
    const reload = () => {
      loading = loading.then(async () => {
        try {
          // Building the new deck tells open pages to reload (see deck/hub.ts).
          deck = prepare(await loadDeckFile(deckFile));
          out.event("reloaded", { file: deckFile }, "reloaded");
        } catch (error) {
          // Keep serving the last deck that loaded.
          const message =
            error instanceof Error ? error.message : String(error);
          if (out.json) out.event("reload-failed", { message }, message);
          else console.error(error instanceof HinoteError ? message : error);
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
  },
};

export const build: Command = {
  name: "build",
  group: "porcelain",
  summary: "Write the deck as one HTML file",
  args: DECK_ARG,
  maxArgs: 1,
  description: `Writes the audience view as one HTML file that opens without a server, and copies the files the slides refer to next to it. No presenter view, no sync; the slide is in the hash (#3).

The same as:
  hinote render --page static | hinote inline -o dist/index.html
  hinote assets -o dist`,
  flags: { output: OUTPUT_FLAG("The HTML file to write.", "dist/index.html") },
  examples: ["hinote build", "hinote check && hinote build -o out/talk.html"],
  bundles: true,
  async run(args, out) {
    const deckFile = deckPath(args.positionals[0]);
    const output = resolve((args.flags.output as string) ?? "dist/index.html");
    const deck = await loadDeckFile(deckFile);
    const html = await inlineScripts(await deck.render("static"));
    await writeOutput(output, html);
    // The page keeps relative URLs, so bring the files they name along.
    const copied = await copyAssets(html, dirname(deckFile), dirname(output));
    out.result({ output, copied }, [
      output,
      ...(copied.length > 0 ? [`copied ${files(copied.length)}`] : []),
    ]);
  },
};

export const prerender: Command = {
  name: "prerender",
  group: "porcelain",
  summary: "Write every page a static host serves",
  args: DECK_ARG,
  maxArgs: 1,
  description: `Writes index.html at / and at /3/ for every slide, plus the files the slides refer to, for GitHub Pages, Cloudflare Pages, Netlify, or any static host. With presenter: true on the deck it also writes /presenter/ and /presenter/3/, which sync with the audience pages in the same browser. Anyone can open those and read the notes.`,
  flags: {
    output: OUTPUT_FLAG("The directory to write.", "dist"),
    base: {
      type: "string",
      value: "/path",
      description:
        "The path the site lives under, such as /repo for a GitHub Pages project site.",
    },
  },
  examples: ["hinote prerender", "hinote prerender -o site --base /talk"],
  bundles: true,
  async run(args, out) {
    const deckFile = deckPath(args.positionals[0]);
    const outDir = resolve((args.flags.output as string) ?? "dist");
    const base = parseBase(args.flags.base as string | undefined);
    const deck = await loadDeckFile(deckFile);
    const { pages, copied } = await prerenderDeck(
      deck,
      dirname(deckFile),
      outDir,
      base,
    );
    out.result({ output: outDir, pages, copied }, [
      outDir,
      `${pages.length} pages` +
        (copied.length > 0 ? `, copied ${files(copied.length)}` : ""),
    ]);
  },
};

export const assets: Command = {
  name: "assets",
  group: "porcelain",
  summary: "Copy the files the slides refer to, for a server of your own",
  args: DECK_ARG,
  maxArgs: 1,
  description: `Copies only the files the slides refer to (see hinote refs) into one directory, keeping their paths. Serve that directory beside the deck: serveStatic({ root: "./public" }) on Bun and Node, or [assets] directory = "./public" in wrangler.toml. Nothing else in the deck directory, such as its source, ends up there.`,
  flags: { output: OUTPUT_FLAG("The directory to copy into.", "public") },
  examples: ["hinote assets", "hinote assets talk/deck.tsx -o talk/public"],
  bundles: true,
  async run(args, out) {
    const deckFile = deckPath(args.positionals[0]);
    const outDir = resolve((args.flags.output as string) ?? "public");
    const deck = await loadDeckFile(deckFile);
    const copied = await copyAssets(
      await deck.render("static"),
      dirname(deckFile),
      outDir,
    );
    out.result(
      { output: outDir, copied },
      copied.length > 0 ? copied : "The slides refer to no files.",
    );
  },
};

export const snapshot: Command = {
  name: "snapshot",
  group: "porcelain",
  summary: "Write one PNG per slide and report layout problems",
  args: DECK_ARG,
  maxArgs: 1,
  description: `Serves the deck on this machine, opens each slide in a browser with every step revealed, and writes shots/1.png, shots/2.png, and so on. Each picture is the canvas (1920×1080 at 16:9), not the window. The same pass reports layout issues: elements that leave the canvas (\`overflow\`) or whose content is clipped inside a box (\`clipped\`) are problems; elements that cross the safe area (\`safe-area\`, the theme's \`spacing.safe\` inset) are warnings. Problems exit 1; warnings alone exit 0. Mark intentional bleed with \`data-hinote-bleed\`. The server stops when the pictures are written. Presenter pages are not included. Default \`hinote check\` still does not open a browser.

--browser chooses who takes them: agent-browser, puppeteer, chrome, or chrome-for-testing. auto, the default, uses the first of those that is installed. puppeteer means the puppeteer package in this project, which downloads its own browser. chrome is Google Chrome, Chromium, or Edge (or HINOTE_CHROME). chrome-for-testing is Chrome for Testing (or HINOTE_CHROME_FOR_TESTING).`,
  flags: {
    output: OUTPUT_FLAG("The directory to write the PNGs into.", "shots"),
    browser: {
      type: "string",
      value: "name",
      default: "auto",
      description:
        "Which browser takes the pictures: auto, agent-browser, puppeteer, chrome, or chrome-for-testing. auto uses the first one installed, in that order.",
    },
  },
  examples: [
    "hinote snapshot",
    "hinote snapshot --browser chrome -o shots",
    "hinote snapshot --json",
  ],
  bundles: true,
  async run(args, out) {
    const requested = (args.flags.browser as string | undefined) ?? "auto";
    if (requested !== "auto" && !isBrowserName(requested))
      throw new UsageError(
        `--browser ${requested} is not a browser hinote knows.`,
        "Use auto, agent-browser, puppeteer, chrome, or chrome-for-testing.",
      );
    const deckFile = deckPath(args.positionals[0]);
    const outDir = resolve((args.flags.output as string) ?? "shots");
    const shot = await takeSnapshots(deckFile, outDir, requested);
    const ok = shot.problems.length === 0;
    const lines = [
      ...shot.files,
      ...shot.problems.flatMap((p) => [
        `slide ${p.slides.join(", ")}: ${p.code}: ${p.message}`,
        ...(p.hint ? [`  hint: ${p.hint}`] : []),
      ]),
      ...shot.warnings.flatMap((w) => [
        `slide ${w.slides.join(", ")}: warning ${w.code}: ${w.message}`,
        ...(w.hint ? [`  hint: ${w.hint}`] : []),
      ]),
    ];
    if (!ok)
      lines.push(
        `${shot.problems.length} problem${shot.problems.length > 1 ? "s" : ""}`,
      );
    else if (shot.warnings.length > 0)
      lines.push(
        `${shot.warnings.length} warning${shot.warnings.length > 1 ? "s" : ""}`,
      );
    out.result(shot, lines, ok);
    return ok ? 0 : 1;
  },
};
