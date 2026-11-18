import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";
import {
  findChrome,
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
    expect(data.problems).toEqual([]);
    expect(data.warnings).toEqual([]);
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

const browser =
  (findChromeForTesting() && "chrome-for-testing") ||
  (findChrome() && "chrome") ||
  (hasCommand("agent-browser") && "agent-browser") ||
  undefined;

test.skipIf(!findChromeForTesting())(
  "chrome for testing writes one canvas-sized PNG per slide",
  () => pictures("chrome-for-testing"),
  60_000,
);

test.skipIf(!findChrome())(
  "chrome writes one canvas-sized PNG per slide",
  () => pictures("chrome"),
  60_000,
);

test.skipIf(!hasCommand("agent-browser"))(
  "agent-browser writes one canvas-sized PNG per slide",
  () => pictures("agent-browser"),
  60_000,
);

test.skipIf(!browser)(
  "overflow, clipped, and safe-area land in problems and warnings",
  async () => {
    const dir = await tempDir();
    try {
      await writeFile(
        join(dir, "deck.tsx"),
        `import { createSlide, Step } from ${JSON.stringify(api)}
export default createSlide({ pageNumber: true }, [
  createSlide(() => (
    <div
      style={{
        position: "absolute",
        left: "1900px",
        top: "100px",
        width: "80px",
        height: "40px",
      }}
    >
      past the edge
    </div>
  )),
  createSlide(() => (
    <div
      style={{
        width: "200px",
        height: "40px",
        overflow: "hidden",
        whiteSpace: "nowrap",
      }}
    >
      this line is deliberately longer than the two-hundred-pixel box
    </div>
  )),
  createSlide(() => (
    <p style={{ position: "absolute", left: "8px", top: "8px", margin: 0 }}>
      in the margin
    </p>
  )),
  createSlide(() => (
    <div
      data-hinote-bleed
      style={{
        position: "absolute",
        left: "-20px",
        top: "0",
        width: "1960px",
        height: "200px",
      }}
    >
      intentional bleed
    </div>
  )),
  createSlide({ theme: { spacing: { safe: "96px" } } }, () => (
    <p style={{ position: "absolute", left: "50px", top: "50px", margin: 0 }}>
      inside default padding, outside wide safe
    </p>
  )),
  createSlide(() => (
    <div>
      <Step>
        <div
          style={{
            position: "absolute",
            left: "1900px",
            top: "400px",
            width: "80px",
          }}
        >
          revealed later
        </div>
      </Step>
    </div>
  )),
]);
`,
      );
      const shot = await run(
        ["snapshot", "--browser", browser!, "--json", "-o", "shots"],
        dir,
      );
      expect(shot.stderr).toBe("");
      const body = JSON.parse(shot.stdout);
      expect(body.ok).toBe(false);
      expect(shot.code).toBe(1);
      const { problems, warnings, files } = body.data;
      expect(files).toHaveLength(6);

      const overflow = problems.filter((p: { code: string }) => p.code === "overflow");
      expect(overflow.some((p: { slides: number[] }) => p.slides.includes(1))).toBe(
        true,
      );
      expect(overflow.some((p: { slides: number[] }) => p.slides.includes(6))).toBe(
        true,
      );
      expect(
        overflow.every((p: { slides: number[]; hint: string }) => p.hint && p.slides),
      ).toBe(true);

      const clipped = problems.filter((p: { code: string }) => p.code === "clipped");
      expect(clipped.some((p: { slides: number[] }) => p.slides.includes(2))).toBe(
        true,
      );

      // Bleed skips overflow; page numbers are never reported.
      expect(
        problems.some(
          (p: { slides: number[]; code: string; selector?: string }) =>
            p.slides.includes(4) && p.code === "overflow",
        ),
      ).toBe(false);
      expect(
        [...problems, ...warnings].some(
          (p: { selector?: string }) => p.selector?.includes("hinote-page"),
        ),
      ).toBe(false);

      expect(
        warnings.some(
          (w: { code: string; slides: number[] }) =>
            w.code === "safe-area" && w.slides.includes(3),
        ),
      ).toBe(true);
      expect(
        warnings.some(
          (w: { code: string; slides: number[] }) =>
            w.code === "safe-area" && w.slides.includes(5),
        ),
      ).toBe(true);
      // Overflow is not also a safe-area warning.
      expect(
        warnings.some((w: { slides: number[] }) => w.slides.includes(1)),
      ).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  120_000,
);

test.skipIf(!browser)(
  "safe-area warnings alone keep exit 0",
  async () => {
    const dir = await tempDir();
    try {
      await writeFile(
        join(dir, "deck.tsx"),
        `import { createSlide } from ${JSON.stringify(api)}
export default createSlide([
  createSlide(() => (
    <p style={{ position: "absolute", left: "4px", top: "4px", margin: 0 }}>
      margin only
    </p>
  )),
]);
`,
      );
      const shot = await run(
        ["snapshot", "--browser", browser!, "--json", "-o", "shots"],
        dir,
      );
      expect(shot.stderr).toBe("");
      expect(shot.code).toBe(0);
      const body = JSON.parse(shot.stdout);
      expect(body.ok).toBe(true);
      expect(body.data.problems).toEqual([]);
      expect(body.data.warnings[0]).toMatchObject({
        code: "safe-area",
        slides: [1],
        hint: expect.stringContaining("spacing.safe"),
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  60_000,
);
