// Launches one browser so a command can open pages and photograph them.
// `hinote snapshot` uses this. A later look at whether a slide overflows the
// canvas should use it too, instead of starting a browser of its own.
//
// `--browser auto` tries these in order and uses the first that can launch:
// agent-browser, puppeteer, Chrome (or Chromium or Edge), Chrome for Testing.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
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
import type { Canvas } from "../deck/deck.ts";
import { HinoteError } from "../errors.ts";

export const BROWSER_NAMES = [
  "agent-browser",
  "puppeteer",
  "chrome",
  "chrome-for-testing",
] as const;

export type BrowserName = (typeof BROWSER_NAMES)[number];

export type CapturePage = {
  goto(url: string): Promise<void>;
  // The expression runs in the page. A promise result is the value it fulfills
  // with, so a caller can wait for fonts or the active slide.
  evaluate<T>(expression: string): Promise<T>;
  screenshot(file: string, selector: string): Promise<void>;
};

type UsePage<T> = (page: CapturePage, browser: BrowserName) => Promise<T>;

// How long a browser gets to start, answer, or load a page.
export const READY_MS = 15_000;

const require = createRequire(import.meta.url);

export function isBrowserName(value: string): value is BrowserName {
  return (BROWSER_NAMES as readonly string[]).includes(value);
}

// Pure so a test can say which browser auto picks without launching one.
export function chooseBrowser(
  requested: BrowserName | "auto",
  available: readonly BrowserName[],
): BrowserName {
  if (requested === "auto") {
    const found = BROWSER_NAMES.find((name) => available.includes(name));
    if (!found) throw noneAvailable();
    return found;
  }
  if (!available.includes(requested)) throw browserMissing(requested);
  return requested;
}

export function hasCommand(command: string): boolean {
  const which = process.platform === "win32" ? "where" : "which";
  return spawnSync(which, [command], { stdio: "ignore" }).status === 0;
}

export function findChrome(): string | undefined {
  return (
    fileFromEnv("HINOTE_CHROME") ??
    firstExisting(CHROME_CANDIDATES) ??
    firstOnPath([
      "google-chrome",
      "google-chrome-stable",
      "chromium",
      "chromium-browser",
      "microsoft-edge",
    ])
  );
}

export function findChromeForTesting(): string | undefined {
  return fileFromEnv("HINOTE_CHROME_FOR_TESTING") ?? walkForTesting();
}

const INSTALLED: Record<BrowserName, () => boolean> = {
  "agent-browser": () => hasCommand("agent-browser"),
  puppeteer: () => hasPackage("puppeteer"),
  chrome: () => findChrome() !== undefined,
  "chrome-for-testing": () => findChromeForTesting() !== undefined,
};

export function installedBrowsers(
  names: readonly BrowserName[] = BROWSER_NAMES,
): BrowserName[] {
  return names.filter((name) => INSTALLED[name]());
}

export async function withBrowser<T>(
  requested: BrowserName | "auto",
  viewport: Canvas,
  use: UsePage<T>,
): Promise<T> {
  // A named browser is the only one worth looking for.
  const available = installedBrowsers(
    requested === "auto" ? BROWSER_NAMES : [requested],
  );
  const name = chooseBrowser(requested, available);
  if (name === "agent-browser") return withAgentBrowser(viewport, use);
  if (name === "puppeteer") return withPuppeteer(viewport, use);
  const binary = name === "chrome" ? findChrome() : findChromeForTesting();
  if (!binary) throw browserMissing(name);
  return withChrome(name, binary, viewport, use);
}

function noneAvailable(): HinoteError {
  return new HinoteError("No browser is available to take the pictures.", {
    code: "browser",
    hint: "Install one of agent-browser, puppeteer, Google Chrome, or Chrome for Testing, or pass --browser <name>.",
  });
}

function browserMissing(name: BrowserName): HinoteError {
  const env =
    name === "chrome"
      ? "HINOTE_CHROME"
      : name === "chrome-for-testing"
        ? "HINOTE_CHROME_FOR_TESTING"
        : undefined;
  const given = env ? process.env[env] : undefined;
  if (given && !existsSync(given))
    return new HinoteError(`${env} is not a file: ${given}`, {
      code: "browser",
    });
  const hint: Record<BrowserName, string> = {
    "agent-browser": "Install it with: npm install -g agent-browser",
    puppeteer: "Install it in this project with: npm install -D puppeteer",
    chrome:
      "Install Google Chrome, Chromium, or Edge, or set HINOTE_CHROME to the binary.",
    "chrome-for-testing":
      "Install Chrome for Testing, or set HINOTE_CHROME_FOR_TESTING to the binary.",
  };
  return new HinoteError(`No ${name} browser is available.`, {
    code: "browser",
    hint: hint[name],
  });
}

function hasPackage(name: string): boolean {
  try {
    require.resolve(name);
    return true;
  } catch {
    return false;
  }
}

function fileFromEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && existsSync(value) ? value : undefined;
}

function firstExisting(paths: readonly string[]): string | undefined {
  return paths.find((path) => existsSync(path));
}

function firstOnPath(commands: readonly string[]): string | undefined {
  for (const command of commands) if (hasCommand(command)) return command;
  return undefined;
}

const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  join(
    homedir(),
    "Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ),
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/microsoft-edge",
];

const TESTING_CANDIDATES = [
  "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  join(
    homedir(),
    "Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  ),
];

const TESTING_ROOTS = [
  join(homedir(), "Library/Caches/ms-playwright"),
  join(homedir(), ".cache/ms-playwright"),
  join(homedir(), "Library/Caches/puppeteer"),
  join(homedir(), ".cache/puppeteer"),
  join(homedir(), "Library/Caches/Google/Chrome for Testing"),
];

// Playwright and Puppeteer drop the binary several directories down, under a
// versioned cache. Skip the framework copies inside the .app bundle.
function walkForTesting(): string | undefined {
  const found: string[] = [];
  for (const path of TESTING_CANDIDATES) if (existsSync(path)) found.push(path);
  for (const root of TESTING_ROOTS) walk(root, 0, found);
  found.sort((a, b) => a.localeCompare(b));
  return found.at(-1);
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
      continue;
    }
    if (isTestingBinary(path)) found.push(path);
  }
}

function isTestingBinary(file: string): boolean {
  if (file.includes("Helper")) return false;
  const name = basename(file);
  if (name === "Google Chrome for Testing") return true;
  return (
    (name === "chrome" || name === "chrome.exe") &&
    /chrome|chromium/i.test(file)
  );
}

// Asks `ready` every 50 ms until it says yes, for up to READY_MS.
export async function poll(
  ready: () => boolean | Promise<boolean>,
  timedOut: () => Error,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < READY_MS) {
    if (await ready()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw timedOut();
}

function spawnCommand(
  command: string,
  args: string[],
  env?: Record<string, string>,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: env ? { ...process.env, ...env } : process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function withAgentBrowser<T>(
  viewport: Canvas,
  runPage: UsePage<T>,
): Promise<T> {
  // A named session so a browser the person already has open is left alone.
  const session = `hinote-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const agent = async (args: string[]): Promise<string> => {
    const result = await spawnCommand(
      "agent-browser",
      ["--session", session, "--json", ...args],
      { AGENT_BROWSER_DEFAULT_TIMEOUT: String(READY_MS) },
    );
    if (result.code !== 0)
      throw new HinoteError(`agent-browser ${args[0] ?? ""} failed.`, {
        code: "browser",
        hint: (result.stderr || result.stdout).trim().slice(0, 500),
      });
    return result.stdout;
  };
  const page: CapturePage = {
    async goto(url) {
      await agent(["open", url]);
      await agent(["wait", "--load", "load"]);
    },
    async evaluate(expression) {
      return agentValue(await agent(["eval", expression])) as never;
    },
    async screenshot(file, selector) {
      await agent(["screenshot", selector, file]);
    },
  };
  try {
    await agent([
      "set",
      "viewport",
      String(viewport.width),
      String(viewport.height),
      "1",
    ]);
    return await runPage(page, "agent-browser");
  } finally {
    await agent(["close"]).catch(() => {});
  }
}

// agent-browser --json wraps the value. The shape has varied by command, so
// accept the envelopes it has used and fall back to the text.
function agentValue(stdout: string): unknown {
  const text = stdout.trim();
  if (!text) return undefined;
  try {
    const parsed = JSON.parse(text) as {
      data?: { result?: unknown };
      result?: unknown;
    };
    if (parsed && typeof parsed === "object") {
      if (parsed.data && "result" in parsed.data) return parsed.data.result;
      if ("result" in parsed) return parsed.result;
    }
    return parsed;
  } catch {
    return text;
  }
}

type PuppeteerPage = {
  goto(
    url: string,
    options: { waitUntil: "load"; timeout: number },
  ): Promise<unknown>;
  evaluate<T>(
    pageFunction: (code: string) => unknown,
    code: string,
  ): Promise<T>;
  $(selector: string): Promise<{
    screenshot(options: { path: string }): Promise<unknown>;
  } | null>;
  close(): Promise<void>;
};

type PuppeteerBrowser = {
  newPage(): Promise<PuppeteerPage>;
  close(): Promise<void>;
};

async function withPuppeteer<T>(
  viewport: Canvas,
  runPage: UsePage<T>,
): Promise<T> {
  // Through a variable, so a bundler leaves the optional package alone.
  const name = "puppeteer";
  let loaded: {
    default?: { launch(options: object): Promise<PuppeteerBrowser> };
    launch?(options: object): Promise<PuppeteerBrowser>;
  };
  try {
    loaded = (await import(name)) as typeof loaded;
  } catch {
    throw browserMissing("puppeteer");
  }
  const puppeteer = loaded.default ?? loaded;
  if (!puppeteer.launch) throw browserMissing("puppeteer");
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
    },
    args: ["--hide-scrollbars", "--force-device-scale-factor=1"],
  });
  try {
    const opened = await browser.newPage();
    const page: CapturePage = {
      goto(url) {
        return opened
          .goto(url, { waitUntil: "load", timeout: READY_MS })
          .then(() => {});
      },
      // A string is the source of an expression, not a function. puppeteer
      // would otherwise treat it as the body of one.
      evaluate(expression) {
        return opened.evaluate(
          // oxlint-disable-next-line no-eval -- hinote's own page script, not input
          (code: string) => (0, eval)(code) as unknown,
          expression,
        ) as Promise<never>;
      },
      async screenshot(file, selector) {
        const handle = await opened.$(selector);
        if (!handle)
          throw new HinoteError(`The page has no ${selector}.`, {
            code: "browser",
          });
        await handle.screenshot({ path: file });
      },
    };
    return await runPage(page, "puppeteer");
  } finally {
    await browser.close();
  }
}

type CdpResult = {
  result?: { value?: unknown };
  exceptionDetails?: { text?: string; exception?: { description?: string } };
  data?: string;
};

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
      const message = JSON.parse(String(event.data)) as {
        id?: number;
        result?: CdpResult;
        error?: { message: string };
      };
      if (message.id == null) return;
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result ?? {});
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
  name: BrowserName,
  binary: string,
  viewport: Canvas,
  runPage: UsePage<T>,
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
    ],
    { stdio: "ignore", detached: true },
  );
  let cdp: Cdp | undefined;
  try {
    const port = await debugPort(join(dir, "DevToolsActivePort"), child);
    const version = (await (
      await fetch(`http://127.0.0.1:${port}/json/version`)
    ).json()) as { webSocketDebuggerUrl?: string };
    if (!version.webSocketDebuggerUrl)
      throw new HinoteError("Chrome did not open a debugging port.", {
        code: "browser",
      });
    cdp = await Cdp.connect(version.webSocketDebuggerUrl);
    return await runPage(await chromePage(cdp, viewport), name);
  } finally {
    cdp?.close();
    killProcess(child);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function chromePage(cdp: Cdp, viewport: Canvas): Promise<CapturePage> {
  const created = (await cdp.send("Target.createTarget", {
    url: "about:blank",
  })) as { targetId?: string };
  const attached = (await cdp.send("Target.attachToTarget", {
    targetId: created.targetId,
    flatten: true,
  })) as { sessionId?: string };
  const sessionId = attached.sessionId;
  if (!sessionId)
    throw new HinoteError("Chrome did not open a page.", { code: "browser" });
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send(
    "Emulation.setDeviceMetricsOverride",
    { ...viewport, deviceScaleFactor: 1, mobile: false },
    sessionId,
  );
  const run = <T>(expression: string) =>
    evaluate<T>(cdp, sessionId, expression);
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
      const box = await run<{
        x: number;
        y: number;
        width: number;
        height: number;
      } | null>(
        `(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return null;
          const box = el.getBoundingClientRect();
          return { x: box.x, y: box.y, width: box.width, height: box.height };
        })()`,
      );
      if (!box)
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
      if (!shot.data)
        throw new HinoteError("Chrome did not return a picture.", {
          code: "browser",
        });
      await writeFile(file, Buffer.from(shot.data, "base64"));
    },
  };
}

async function evaluate<T>(
  cdp: Cdp,
  sessionId: string,
  expression: string,
): Promise<T> {
  const result = await cdp.send(
    "Runtime.evaluate",
    { expression, awaitPromise: true, returnByValue: true },
    sessionId,
  );
  const details = result.exceptionDetails;
  if (details)
    throw new HinoteError(
      details.exception?.description || details.text || "The page threw.",
      { code: "browser" },
    );
  return result.result?.value as T;
}

async function debugPort(file: string, child: ChildProcess): Promise<number> {
  let port = 0;
  await poll(
    async () => {
      if (child.exitCode != null)
        throw new HinoteError(
          "Chrome exited before it opened a debugging port.",
          { code: "browser" },
        );
      // Chrome writes the file once the port is listening.
      const text = await readFile(file, "utf8").catch(() => "");
      port = Number(text.trim().split("\n")[0]);
      return port > 0;
    },
    () =>
      new HinoteError("Chrome did not open a debugging port.", {
        code: "browser",
      }),
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
