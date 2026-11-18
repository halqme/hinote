import { expect, test } from "bun:test";
import {
  chooseBrowser,
  chromeExtraArgs,
  splitChromeFlags,
} from "../src/snapshot/browser.ts";

test("auto picks the first installed browser, in a fixed order", () => {
  expect(chooseBrowser("auto", ["chrome", "agent-browser"])).toBe(
    "agent-browser",
  );
  expect(chooseBrowser("auto", ["puppeteer", "chrome-for-testing"])).toBe(
    "puppeteer",
  );
  expect(chooseBrowser("auto", ["chrome-for-testing"])).toBe(
    "chrome-for-testing",
  );
  expect(chooseBrowser("chrome", ["chrome", "agent-browser"])).toBe("chrome");
});

test("a browser that is not installed is an error, and so is none at all", () => {
  expect(() => chooseBrowser("chrome", ["agent-browser"])).toThrow(
    /No chrome browser/,
  );
  expect(() => chooseBrowser("auto", [])).toThrow(/No browser is available/);
});

test("root gets --no-sandbox; HINOTE_CHROME_FLAGS appends without duplicating it", () => {
  expect(chromeExtraArgs({}, 1000)).toEqual([]);
  expect(chromeExtraArgs({}, 0)).toEqual(["--no-sandbox"]);
  expect(
    chromeExtraArgs({ HINOTE_CHROME_FLAGS: "--foo --bar=1" }, 1000),
  ).toEqual(["--foo", "--bar=1"]);
  expect(
    chromeExtraArgs(
      { HINOTE_CHROME_FLAGS: "--no-sandbox --disable-gpu" },
      0,
    ),
  ).toEqual(["--no-sandbox", "--disable-gpu"]);
  expect(splitChromeFlags("  --a   --b=c  ")).toEqual(["--a", "--b=c"]);
  expect(splitChromeFlags("")).toEqual([]);
});
