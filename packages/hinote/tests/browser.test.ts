import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "bun:test";
import {
  chromeExtraArgs,
  findBrowser,
  splitChromeFlags,
} from "../src/snapshot/browser.ts";

async function files(root: string, paths: string[]) {
  for (const path of paths) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), "");
    await chmod(join(root, path), 0o755);
  }
}

test("the first place that has a browser wins, and HINOTE_CHROME before all", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hinote-places-"));
  try {
    await files(dir, ["bin/chrome"]);
    const places = [
      { file: join(dir, "missing/chrome") },
      { file: join(dir, "bin/chrome") },
      { cache: join(dir, "cache") },
    ];
    expect(findBrowser(places, {})).toBe(join(dir, "bin/chrome"));
    expect(findBrowser(places, { HINOTE_CHROME: "/my/chrome" })).toBe(
      "/my/chrome",
    );
    expect(findBrowser([{ file: join(dir, "missing") }], {})).toBeUndefined();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// Laid out as Playwright and agent-browser keep their downloads.
test("a cache gives its newest Chromium build, not a helper app", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hinote-cache-"));
  const app = "Google Chrome for Testing.app/Contents";
  try {
    await files(dir, [
      `chrome-155.0.1/${app}/MacOS/Google Chrome for Testing`,
      `chrome-156.0.8/${app}/MacOS/Google Chrome for Testing`,
      `chrome-156.0.8/${app}/Frameworks/Helper.app/Google Chrome for Testing`,
      `chrome-156.0.8/${app}/MacOS/Google Chrome for Testing Helper`,
      "chrome-156.0.8/notes.txt",
    ]);
    expect(findBrowser([{ cache: dir }], {})).toBe(
      join(dir, `chrome-156.0.8/${app}/MacOS/Google Chrome for Testing`),
    );
    await rm(join(dir, "chrome-155.0.1"), { recursive: true });
    await rm(join(dir, "chrome-156.0.8"), { recursive: true });
    await files(dir, ["chromium_headless_shell-1248/x/chrome-headless-shell"]);
    expect(findBrowser([{ cache: dir }], {})).toBe(
      join(dir, "chromium_headless_shell-1248/x/chrome-headless-shell"),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("root gets --no-sandbox; HINOTE_CHROME_FLAGS appends without duplicating it", () => {
  expect(chromeExtraArgs({}, 1000)).toEqual([]);
  expect(chromeExtraArgs({}, 0)).toEqual(["--no-sandbox"]);
  expect(
    chromeExtraArgs({ HINOTE_CHROME_FLAGS: "--foo --bar=1" }, 1000),
  ).toEqual(["--foo", "--bar=1"]);
  expect(
    chromeExtraArgs({ HINOTE_CHROME_FLAGS: "--no-sandbox --disable-gpu" }, 0),
  ).toEqual(["--no-sandbox", "--disable-gpu"]);
  expect(splitChromeFlags("  --a   --b=c  ")).toEqual(["--a", "--b=c"]);
  expect(splitChromeFlags("")).toEqual([]);
});
