import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { inflateSync } from "node:zlib";
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

async function run(
  args: string[],
  cwd: string,
  env: Record<string, string | undefined> = {},
) {
  const proc = Bun.spawn(["bun", cli, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env },
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

test("--slides that are not slide numbers, or not in the deck, are usage errors", async () => {
  const dir = await tempDir();
  try {
    await writeFile(join(dir, "deck.tsx"), deck);
    for (const slides of ["", "0", "2,x", "1-2", "3", "1,3"]) {
      const bad = await run(["snapshot", "--slides", slides, "--json"], dir);
      expect(bad.code).toBe(2);
      expect(JSON.parse(bad.stdout).error.code).toBe("usage");
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a browser that is not installed names itself", async () => {
  const installed = installedBrowsers();
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

test("when chrome dies on start, the error hint carries its stderr", async () => {
  const dir = await tempDir();
  try {
    await writeFile(join(dir, "deck.tsx"), deck);
    const fake = join(dir, "fake-chrome");
    await writeFile(
      fake,
      "#!/bin/sh\necho 'Running as root without --no-sandbox is not supported.' >&2\nexit 1\n",
    );
    await chmod(fake, 0o755);
    const failed = await run(
      ["snapshot", "--browser", "chrome", "--json"],
      dir,
      {
        HINOTE_CHROME: fake,
      },
    );
    expect(failed.code).toBe(1);
    expect(JSON.parse(failed.stdout).error).toMatchObject({
      code: "browser",
      message: expect.stringMatching(/Chrome exited|debugging port/),
      hint: expect.stringContaining("without --no-sandbox"),
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 30_000);

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

      const overflow = problems.filter(
        (p: { code: string }) => p.code === "overflow",
      );
      expect(
        overflow.some((p: { slides: number[] }) => p.slides.includes(1)),
      ).toBe(true);
      expect(
        overflow.some((p: { slides: number[] }) => p.slides.includes(6)),
      ).toBe(true);
      expect(
        overflow.every(
          (p: { slides: number[]; hint: string }) => p.hint && p.slides,
        ),
      ).toBe(true);

      const clipped = problems.filter(
        (p: { code: string }) => p.code === "clipped",
      );
      expect(
        clipped.some((p: { slides: number[] }) => p.slides.includes(2)),
      ).toBe(true);

      // Bleed skips overflow; page numbers are never reported.
      expect(
        problems.some(
          (p: { slides: number[]; code: string; selector?: string }) =>
            p.slides.includes(4) && p.code === "overflow",
        ),
      ).toBe(false);
      expect(
        [...problems, ...warnings].some((p: { selector?: string }) =>
          p.selector?.includes("hinote-page"),
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
  "--slides photographs and reports only those slides, named by their number",
  async () => {
    const dir = await tempDir();
    try {
      const edge = (label: string) =>
        `createSlide(() => <p style={{ position: "absolute", left: "1900px", margin: 0 }}>${label}</p>)`;
      await writeFile(
        join(dir, "deck.tsx"),
        `import { createSlide } from ${JSON.stringify(api)}
export default createSlide([
  ${edge("one")},
  createSlide(() => <p>two</p>),
  ${edge("three")},
]);
`,
      );
      const shot = await run(
        [
          "snapshot",
          "--browser",
          browser!,
          "--json",
          "-o",
          "shots",
          "--slides",
          "3,2",
        ],
        dir,
      );
      expect(shot.stderr).toBe("");
      expect(shot.code).toBe(1);
      const { files, problems } = JSON.parse(shot.stdout).data;
      expect(files).toEqual(["shots/2.png", "shots/3.png"]);
      expect(await Bun.file(join(dir, "shots/1.png")).exists()).toBe(false);
      expect(problems.length).toBeGreaterThan(0);
      expect(
        problems.every((p: { slides: number[] }) => p.slides.join() === "3"),
      ).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  60_000,
);

test.skipIf(!browser)(
  "a title on two lines is a title-wrap warning, and one line is not",
  async () => {
    const dir = await tempDir();
    try {
      await writeFile(
        join(dir, "deck.tsx"),
        `import { createSlide } from ${JSON.stringify(api)}
export default createSlide([
  createSlide(() => <h1>Short title</h1>),
  createSlide(() => (
    <h1 style={{ width: "600px" }}>
      A title far too long for the six hundred pixels it is given
    </h1>
  )),
  createSlide({ title: "Option only" }, () => (
    <div>
      <h2>Fits</h2>
      <h3 style={{ width: "200px" }}>A later heading that wraps is not the title</h3>
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
      expect(shot.code).toBe(0);
      const { problems, warnings } = JSON.parse(shot.stdout).data;
      expect(problems).toEqual([]);
      expect(
        warnings.filter((w: { code: string }) => w.code === "title-wrap"),
      ).toEqual([
        expect.objectContaining({
          code: "title-wrap",
          slides: [2],
          selector: "h1",
        }),
      ]);
      const help = await run(["help", "snapshot"], dir);
      expect(help.stdout).toContain("title-wrap");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  60_000,
);

test.skipIf(!browser)(
  "one character alone on a line is a lone-character warning, a short word is not",
  async () => {
    const dir = await tempDir();
    try {
      // Monospace letters are 1ch each, so a 5ch box holds five per line on
      // any machine; Japanese glyph widths depend on the fonts installed.
      await writeFile(
        join(dir, "deck.tsx"),
        `import { createSlide } from ${JSON.stringify(api)}
const box = { width: "5ch", fontFamily: "monospace", wordBreak: "break-all" } as const;
export default createSlide([
  createSlide(() => <p style={box}>abcdef</p>),
  createSlide(() => (
    <div>
      <p style={box}>abcdefg</p>
      <p style={{ width: "6em" }}>wonderful day to go</p>
      <p>A</p>
      <pre style={{ ...box, whiteSpace: "pre-wrap" }}>abcdef</pre>
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
      expect(shot.code).toBe(0);
      const { warnings } = JSON.parse(shot.stdout).data;
      expect(
        warnings.filter((w: { code: string }) => w.code === "lone-character"),
      ).toEqual([
        expect.objectContaining({
          slides: [1],
          selector: "p",
          text: "abcdef",
        }),
      ]);
      const help = await run(["help", "snapshot"], dir);
      expect(help.stdout).toContain("lone-character");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  60_000,
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

test.skipIf(!browser)(
  "default Grid and Card slides report no snapshot problems",
  async () => {
    const dir = await tempDir();
    try {
      await writeFile(
        join(dir, "deck.tsx"),
        `import { Card, Grid, createSlide } from ${JSON.stringify(api)}
export default createSlide([
  createSlide(() => (
    <Grid columns={2} gap={3}>
      <Card>
        <h3>Short</h3>
        <p>Finding A</p>
      </Card>
      <Card>
        <h3>A longer heading that wraps further than the other card</h3>
        <p>Finding B</p>
      </Card>
    </Grid>
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
      expect(body.data.warnings).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  60_000,
);

// A solid #ff00aa block only paints when its <Step> is revealed (and fully
// opaque). Counting near-magenta pixels proves the PNG shows every step.
function nearMagentaCount(png: Buffer): number {
  const rgb = decodePngRgb(png);
  let hits = 0;
  for (let i = 0; i + 2 < rgb.length; i += 3) {
    const r = rgb[i]!;
    const g = rgb[i + 1]!;
    const b = rgb[i + 2]!;
    if (r > 200 && g < 40 && b > 140) hits++;
  }
  return hits;
}

// Chrome's canvas screenshots are 8-bit RGB (color type 2), one filter byte per row.
function decodePngRgb(png: Buffer): Uint8Array {
  if (png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a")
    throw new Error("not a png");
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const color = png[25];
  if (png[24] !== 8 || (color !== 2 && color !== 6))
    throw new Error(`unsupported png ${png[24]}/${color}`);
  const channels = color === 6 ? 4 : 3;
  const idats: Buffer[] = [];
  let offset = 8;
  while (offset + 8 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IDAT") idats.push(Buffer.from(data));
    offset += 12 + length;
  }
  const inflated = inflateSync(Buffer.concat(idats));
  const stride = width * channels;
  const out = new Uint8Array(width * height * 3);
  let src = 0;
  let dst = 0;
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = inflated[src++]!;
    const row = inflated.subarray(src, src + stride);
    src += stride;
    const recon = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const x = row[i]!;
      const a = i >= channels ? recon[i - channels]! : 0;
      const b = prev[i]!;
      const c = i >= channels ? prev[i - channels]! : 0;
      let value = x;
      if (filter === 1) value = (x + a) & 255;
      else if (filter === 2) value = (x + b) & 255;
      else if (filter === 3) value = (x + Math.floor((a + b) / 2)) & 255;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        value = (x + pr) & 255;
      }
      recon[i] = value;
    }
    for (let i = 0; i < width; i++) {
      const o = i * channels;
      out[dst++] = recon[o]!;
      out[dst++] = recon[o + 1]!;
      out[dst++] = recon[o + 2]!;
    }
    prev = recon;
  }
  return out;
}

test.skipIf(!browser)(
  "PNG shows every Step fully opaque, not mid-fade",
  async () => {
    const dir = await tempDir();
    try {
      await writeFile(
        join(dir, "deck.tsx"),
        `import { createSlide, Step } from ${JSON.stringify(api)}
export default createSlide([
  createSlide(() => (
    <div>
      <p>always visible</p>
      <Step>
        <div
          style={{
            width: "200px",
            height: "200px",
            background: "#ff00aa",
          }}
        >
          step marker
        </div>
      </Step>
    </div>
  )),
  createSlide(() => <p>no steps here</p>),
]);
`,
      );
      const shot = await run(
        ["snapshot", "--browser", browser!, "--json", "-o", "shots"],
        dir,
      );
      expect(shot.stderr).toBe("");
      expect(shot.code).toBe(0);
      const withStep = await readFile(join(dir, "shots/1.png"));
      const without = await readFile(join(dir, "shots/2.png"));
      // A 200×200 solid marker yields tens of thousands of magenta pixels when
      // fully opaque; mid-fade or hidden would leave far fewer / none.
      expect(nearMagentaCount(withStep)).toBeGreaterThan(10_000);
      expect(nearMagentaCount(without)).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  60_000,
);
