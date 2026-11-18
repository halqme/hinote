import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";
import {
  findChromeForTesting,
  hasCommand,
  installedBrowsers,
} from "../src/snapshot/browser.ts";

const cli = resolve(import.meta.dir, "../src/cli.ts");
const api = resolve(import.meta.dir, "../src/index.ts");

async function tempDir() {
  const scratch = join(import.meta.dir, "../.tmp");
  await mkdir(scratch, { recursive: true });
  return mkdtemp(join(scratch, "hinote-"));
}

async function run(args: string[], cwd: string) {
  const proc = Bun.spawn(["bun", cli, ...args], {
    cwd,
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

const deck = `import { createSlide } from ${JSON.stringify(api)}
export default createSlide([
  createSlide(() => <p>one</p>),
  createSlide(() => <p>two</p>),
]);
`;

test("an unknown browser is a usage error", async () => {
  const dir = await tempDir();
  try {
    const bad = await run(["snapshot", "--browser", "lynx", "--json"], dir);
    expect(bad.code).toBe(2);
    expect(JSON.parse(bad.stdout).error.code).toBe("usage");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a browser that is not installed names itself", async () => {
  const installed = await installedBrowsers();
  if (installed.includes("puppeteer")) return;
  const dir = await tempDir();
  try {
    await writeFile(join(dir, "deck.tsx"), deck);
    const missing = await run(
      ["snapshot", "--browser", "puppeteer", "--json"],
      dir,
    );
    expect(missing.code).toBe(1);
    expect(JSON.parse(missing.stdout).error).toMatchObject({
      code: "browser",
      hint: expect.stringContaining("puppeteer"),
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

async function pictures(browser: string) {
  const dir = await tempDir();
  try {
    await writeFile(join(dir, "deck.tsx"), deck);
    const shot = await run(
      ["snapshot", "--browser", browser, "--json", "-o", "shots"],
      dir,
    );
    expect(shot.stderr).toBe("");
    expect(shot.code).toBe(0);
    const data = JSON.parse(shot.stdout).data;
    expect(data.browser).toBe(browser);
    expect(data.canvas).toEqual({ width: 1920, height: 1080 });
    expect(data.files).toEqual(["shots/1.png", "shots/2.png"]);
    const first = await readFile(join(dir, "shots/1.png"));
    const second = await readFile(join(dir, "shots/2.png"));
    expect(first.readUInt32BE(16)).toBe(1920);
    expect(first.readUInt32BE(20)).toBe(1080);
    expect(second.readUInt32BE(16)).toBe(1920);
    expect(second.readUInt32BE(20)).toBe(1080);
    expect(Buffer.compare(first, second)).not.toBe(0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test.skipIf(!findChromeForTesting())(
  "chrome for testing writes one canvas-sized PNG per slide",
  () => pictures("chrome-for-testing"),
  60_000,
);

test.skipIf(!hasCommand("agent-browser"))(
  "agent-browser writes one canvas-sized PNG per slide",
  () => pictures("agent-browser"),
  60_000,
);
