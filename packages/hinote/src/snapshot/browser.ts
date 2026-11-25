// Launches one Chromium and drives it over the Chrome DevTools Protocol, so
// a command can open pages, photograph them, and measure layout. `hinote
// snapshot` uses this for both the PNGs and the overflow / clipped /
// safe-area report. CDP is all hinote speaks: any browser that answers it
// can take the pictures.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  type Dirent,
} from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";
import { type Canvas, isPlainObject } from "@hinote/core/internal";
import { HinoteError } from "../errors.ts";

export type CapturePage = {
  goto(url: string): Promise<void>;
  // The expression runs in the page. A promise result is the value it fulfills
  // with, so a caller can wait for fonts or the active slide. The value comes
  // back as JSON, so the caller checks its shape.
  evaluate(expression: string): Promise<unknown>;
  screenshot(file: string, selector: string): Promise<void>;
};

// How long a browser gets to start, answer, or load a page.
export const READY_MS = 15_000;

// Where hinote looks for a Chromium, in order; the first one found is used.
// `file` is a binary at that path, `command` a name on PATH, and `cache` a
// directory a tool downloads Chromium builds into, where the newest build
// wins. To look somewhere else, add a line.
export type Place = { file: string } | { command: string } | { cache: string };

const home = (path: string) => join(homedir(), path);

export const PLACES: readonly Place[] = [
  { file: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" },
  { file: home("Applications/Google Chrome.app/Contents/MacOS/Google Chrome") },
  { file: "/Applications/Chromium.app/Contents/MacOS/Chromium" },
  { file: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" },
  { file: "/usr/bin/google-chrome" },
  { file: "/usr/bin/google-chrome-stable" },
  { file: "/usr/bin/chromium" },
  { file: "/usr/bin/chromium-browser" },
  { file: "/usr/bin/microsoft-edge" },
  { command: "google-chrome" },
  { command: "google-chrome-stable" },
  { command: "chromium" },
  { command: "chromium-browser" },
  { command: "microsoft-edge" },
  {
    file: "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  },
  {
    file: home(
      "Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    ),
  },
  // Playwright, and Vitest's browser mode through it.
  { cache: home("Library/Caches/ms-playwright") },
  { cache: home(".cache/ms-playwright") },
  { cache: home("Library/Caches/puppeteer") },
  { cache: home(".cache/puppeteer") },
  { cache: home(".agent-browser/browsers") },
  { cache: home("Library/Caches/Google/Chrome for Testing") },
];

// The Chromium binaries a cache holds, by file name. The helper apps inside a
// macOS bundle have other names.
const BINARIES = new Set([
  "Google Chrome for Testing",
  "Chromium",
  "chrome",
  "chrome.exe",
  "chrome-headless-shell",
  "chrome-headless-shell.exe",
]);

// HINOTE_CHROME, when set, is the binary; otherwise the first of `places`.
export function findBrowser(
  places: readonly Place[] = PLACES,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (env.HINOTE_CHROME) return env.HINOTE_CHROME;
  for (const place of places) {
    const found =
      "file" in place
        ? existsSync(place.file)
          ? place.file
          : undefined
        : "command" in place
          ? hasCommand(place.command)
            ? place.command
            : undefined
          : newestIn(place.cache);
    if (found) return found;
  }
  return undefined;
}

function hasCommand(command: string): boolean {
  const which = process.platform === "win32" ? "where" : "which";
  return spawnSync(which, [command], { stdio: "ignore" }).status === 0;
}

// Caches keep each build under a versioned directory, several levels down.
// Paths sort by that version, numbers as numbers, so the last one is the
// newest build.
function newestIn(cache: string): string | undefined {
  const found: string[] = [];
  walk(cache, 0, found);
  return found
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .at(-1);
}

function walk(dir: string, depth: number, found: string[]): void {
  if (depth > 7 || !existsSync(dir)) return;
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "Frameworks" || entry.name === "Resources") continue;
      walk(path, depth + 1, found);
    } else if (BINARIES.has(basename(path))) found.push(path);
  }
}

export async function withBrowser<T>(
  viewport: Canvas,
  use: (page: CapturePage, browser: string) => Promise<T>,
): Promise<T> {
  const given = process.env.HINOTE_CHROME;
  if (given && !existsSync(given))
    throw new HinoteError(`HINOTE_CHROME is not a file: ${given}`, {
      code: "browser",
    });
  const binary = findBrowser();
  if (!binary) throw noneAvailable();
  return withChrome(binary, viewport, (page) => use(page, binary));
}

function noneAvailable(): HinoteError {
  return new HinoteError("No browser is available to take the pictures.", {
    code: "browser",
    hint: "Install Google Chrome, Chromium, or Edge, or download Chromium with a tool hinote looks in (npx playwright install chromium), or set HINOTE_CHROME to a Chromium binary.",
  });
}

// Asks `ready` every 50 ms until it says yes, for up to READY_MS.
export async function poll(
  ready: () => boolean | Promise<boolean>,
  timedOut: () => Error | Promise<Error>,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < READY_MS) {
    if (await ready()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw await timedOut();
}

// What a CDP method returns. Each caller checks the fields it reads.
type CdpResult = Record<string, unknown>;

class Cdp {
  #ws: WebSocket;
  #next = 0;
  #pending = new Map<
    number,
    { resolve: (value: CdpResult) => void; reject: (error: Error) => void }
  >();

  private constructor(ws: WebSocket) {
    this.#ws = ws;
    ws.addEventListener("message", (event) => {
      const message: unknown = JSON.parse(String(event.data));
      if (!isPlainObject(message) || typeof message.id !== "number") return;
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      if (isPlainObject(message.error))
        pending.reject(new Error(String(message.error.message)));
      else pending.resolve(isPlainObject(message.result) ? message.result : {});
    });
    ws.addEventListener("close", () => {
      for (const pending of this.#pending.values())
        pending.reject(new Error("Chrome closed."));
      this.#pending.clear();
    });
  }

  static connect(url: string): Promise<Cdp> {
    const ws = new WebSocket(url);
    return new Promise((resolve, reject) => {
      ws.addEventListener("open", () => resolve(new Cdp(ws)));
      ws.addEventListener("error", () =>
        reject(new Error("Could not connect to Chrome.")),
      );
    });
  }

  send(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
  ): Promise<CdpResult> {
    const id = ++this.#next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Chrome did not answer ${method}.`));
      }, READY_MS);
      this.#pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      const message: Record<string, unknown> = { id, method, params };
      if (sessionId) message.sessionId = sessionId;
      this.#ws.send(JSON.stringify(message));
    });
  }

  close(): void {
    this.#ws.close();
  }
}

async function withChrome<T>(
  binary: string,
  viewport: Canvas,
  runPage: (page: CapturePage) => Promise<T>,
): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "hinote-chrome-"));
  const child = spawn(
    binary,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--mute-audio",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      // Otherwise macOS asks for "Chromium Safe Storage" in the keychain, and
      // the page waits on that dialog until the navigation times out.
      "--use-mock-keychain",
      "--password-store=basic",
      "--remote-debugging-port=0",
      "--remote-allow-origins=*",
      "--force-device-scale-factor=1",
      `--user-data-dir=${dir}`,
      `--window-size=${viewport.width},${viewport.height}`,
      ...chromeExtraArgs(),
    ],
    // Keep stderr: when Chrome dies on start (sandbox, missing libs, …) the
    // message is the diagnosis. stdout stays ignored; CDP talks over the port.
    { stdio: ["ignore", "ignore", "pipe"], detached: true },
  );
  const stderr = collectStderr(child);
  let cdp: Cdp | undefined;
  try {
    const port = await debugPort(
      join(dir, "DevToolsActivePort"),
      child,
      stderr,
    );
    const version: unknown = await (
      await fetch(`http://127.0.0.1:${port}/json/version`)
    ).json();
    const url = isPlainObject(version)
      ? version.webSocketDebuggerUrl
      : undefined;
    if (typeof url !== "string" || !url)
      throw chromeStartError(
        "Chrome did not open a debugging port.",
        await stderr.tail(),
      );
    cdp = await Cdp.connect(url);
    return await runPage(await chromePage(cdp, viewport));
  } finally {
    cdp?.close();
    killProcess(child);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function chromePage(cdp: Cdp, viewport: Canvas): Promise<CapturePage> {
  const created = await cdp.send("Target.createTarget", {
    url: "about:blank",
  });
  const attached = await cdp.send("Target.attachToTarget", {
    targetId: created.targetId,
    flatten: true,
  });
  const sessionId = attached.sessionId;
  if (typeof sessionId !== "string" || !sessionId)
    throw new HinoteError("Chrome did not open a page.", { code: "browser" });
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send(
    "Emulation.setDeviceMetricsOverride",
    { ...viewport, deviceScaleFactor: 1, mobile: false },
    sessionId,
  );
  const run = (expression: string) => evaluate(cdp, sessionId, expression);
  return {
    async goto(url) {
      await cdp.send("Page.navigate", { url }, sessionId);
      await poll(
        async () => (await run("document.readyState")) === "complete",
        () => new HinoteError("The page did not load.", { code: "browser" }),
      );
    },
    evaluate: run,
    async screenshot(file, selector) {
      const box = await run(
        `(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return null;
          const box = el.getBoundingClientRect();
          return { x: box.x, y: box.y, width: box.width, height: box.height };
        })()`,
      );
      if (!isPlainObject(box))
        throw new HinoteError(`The page has no ${selector}.`, {
          code: "browser",
        });
      const shot = await cdp.send(
        "Page.captureScreenshot",
        {
          format: "png",
          captureBeyondViewport: true,
          clip: { ...box, scale: 1 },
        },
        sessionId,
      );
      if (typeof shot.data !== "string" || !shot.data)
        throw new HinoteError("Chrome did not return a picture.", {
          code: "browser",
        });
      await writeFile(file, Buffer.from(shot.data, "base64"));
    },
  };
}

async function evaluate(
  cdp: Cdp,
  sessionId: string,
  expression: string,
): Promise<unknown> {
  const result = await cdp.send(
    "Runtime.evaluate",
    { expression, awaitPromise: true, returnByValue: true },
    sessionId,
  );
  const details = result.exceptionDetails;
  if (isPlainObject(details)) {
    const exception = isPlainObject(details.exception)
      ? details.exception.description
      : undefined;
    const message = [exception, details.text].find(
      (text): text is string => typeof text === "string" && text !== "",
    );
    throw new HinoteError(message ?? "The page threw.", {
      code: "browser",
    });
  }
  return isPlainObject(result.result) ? result.result.value : undefined;
}

async function debugPort(
  file: string,
  child: ChildProcess,
  stderr: StderrBuffer,
): Promise<number> {
  let port = 0;
  await poll(
    async () => {
      if (child.exitCode != null)
        throw chromeStartError(
          "Chrome exited before it opened a debugging port.",
          await stderr.tail(),
        );
      // Chrome writes the file once the port is listening.
      const text = await readFile(file, "utf8").catch(() => "");
      port = Number(text.trim().split("\n")[0]);
      return port > 0;
    },
    async () =>
      chromeStartError(
        "Chrome did not open a debugging port.",
        await stderr.tail(),
      ),
  );
  return port;
}

function killProcess(child: ChildProcess): void {
  if (child.pid == null) return;
  if (process.platform !== "win32") {
    try {
      process.kill(-child.pid, "SIGKILL");
      return;
    } catch {
      // The process had already exited, or it was not a group leader.
    }
  }
  child.kill("SIGKILL");
}

// Flags from the environment, so root/container and odd Chromium builds get
// what they need without a CLI option.
export function chromeExtraArgs(
  env: NodeJS.ProcessEnv = process.env,
  uid: number | null = typeof process.getuid === "function"
    ? process.getuid()
    : null,
): string[] {
  const args: string[] = [];
  // Chromium refuses its sandbox as root; that is the usual container case.
  if (uid === 0) args.push("--no-sandbox");
  const raw = env.HINOTE_CHROME_FLAGS;
  if (raw) {
    for (const flag of splitChromeFlags(raw)) {
      if (!args.includes(flag)) args.push(flag);
    }
  }
  return args;
}

// Chromium flags are space-separated tokens (`--foo`, `--bar=baz`). Values with
// spaces are rare; quote a wrapper script through HINOTE_CHROME instead.
export function splitChromeFlags(raw: string): string[] {
  return raw.trim().split(/\s+/).filter(Boolean);
}

type StderrBuffer = { tail(): Promise<string | undefined> };

function collectStderr(child: ChildProcess): StderrBuffer {
  let text = "";
  let ended = child.stderr == null;
  if (child.stderr) {
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      text += chunk;
    });
    child.stderr.on("end", () => {
      ended = true;
    });
    child.stderr.on("error", () => {
      ended = true;
    });
  }
  return {
    async tail() {
      if (!ended && child.stderr) {
        await Promise.race([
          new Promise<void>((resolve) => child.stderr!.once("end", resolve)),
          new Promise<void>((resolve) => setTimeout(resolve, 200)),
        ]);
      }
      const trimmed = text.trim();
      if (!trimmed) return undefined;
      // The useful Chromium line is usually at the end.
      return trimmed.length > 800 ? trimmed.slice(-800) : trimmed;
    },
  };
}

function chromeStartError(message: string, stderr?: string): HinoteError {
  return new HinoteError(message, {
    code: "browser",
    hint: stderr,
  });
}
