import { expect, test } from "bun:test";
import {
  CONTRAST_MIN,
  contrastRatio,
  contrastWarningsForTheme,
  parseCssColor,
} from "../src/cli/contrast.ts";
import { themes } from "@hinote/core";
import { defaultTheme, mergeTheme } from "@hinote/core/internal";

test("parseCssColor reads #rgb, #rrggbb, and opaque rgb()", () => {
  expect(parseCssColor("#abc")).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc });
  expect(parseCssColor("#a1a1aa")).toEqual({ r: 0xa1, g: 0xa1, b: 0xaa });
  expect(parseCssColor("rgb(180, 83, 9)")).toEqual({ r: 180, g: 83, b: 9 });
  expect(parseCssColor("rgb(180 83 9)")).toEqual({ r: 180, g: 83, b: 9 });
  expect(parseCssColor("rgb(50% 0% 100%)")).toEqual({
    r: 127.5,
    g: 0,
    b: 255,
  });
});

test("parseCssColor skips var(), color-mix(), alpha, and unknowns", () => {
  expect(parseCssColor("var(--hinote-color-fg)")).toBeUndefined();
  expect(parseCssColor("color-mix(in srgb, red 50%, blue)")).toBeUndefined();
  expect(parseCssColor("hsl(0 0% 50%)")).toBeUndefined();
  expect(parseCssColor("rgb(0 0 0 / 0.5)")).toBeUndefined();
  expect(parseCssColor("rgb(0, 0, 0, 50%)")).toBeUndefined();
  expect(parseCssColor("red")).toBeUndefined();
});

test("paper's old accent is about 4.46:1 on paper bg", () => {
  const accent = parseCssColor("#b45309")!;
  const bg = parseCssColor(themes.paper.colors.bg)!;
  expect(contrastRatio(accent, bg)).toBeCloseTo(4.46, 2);
});

test("default, paper, and slate themes have no contrast warnings", () => {
  expect(contrastWarningsForTheme(defaultTheme)).toEqual([]);
  expect(
    contrastWarningsForTheme(mergeTheme(defaultTheme, themes.paper)),
  ).toEqual([]);
  expect(
    contrastWarningsForTheme(mergeTheme(defaultTheme, themes.slate)),
  ).toEqual([]);
});

test("a weak accent warns with code contrast and a token hint", () => {
  const warnings = contrastWarningsForTheme(
    mergeTheme(defaultTheme, {
      colors: {
        ...themes.paper.colors,
        accent: "#b45309",
      },
    }),
  );
  expect(warnings.every((w) => w.code === "contrast")).toBe(true);
  const vsBg = warnings.find((w) =>
    w.message.startsWith("colors.accent on colors.bg "),
  );
  expect(vsBg).toBeDefined();
  expect(vsBg!.message).toInclude("4.46:1");
  expect(vsBg!.message).toInclude(`need ${CONTRAST_MIN}:1`);
  expect(vsBg!.hint).toInclude("colors.accent");
});

test("unparseable colors produce no contrast warnings", () => {
  expect(
    contrastWarningsForTheme(
      mergeTheme(defaultTheme, {
        colors: {
          fg: "var(--x)",
          muted: "color-mix(in srgb, black, white)",
          accent: "hsl(10 80% 40%)",
          bg: "#ffffff",
          surface: "rgb(0 0 0 / 0.2)",
        },
      }),
    ),
  ).toEqual([]);
});
