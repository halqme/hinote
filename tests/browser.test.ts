import { expect, test } from "bun:test";
import { chooseBrowser } from "../src/snapshot/browser.ts";

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
