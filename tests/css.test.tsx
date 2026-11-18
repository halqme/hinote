import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "bun:test";
import { scopeCss } from "../src/deck/css.ts";
import { HinoteError } from "../src/errors.ts";
import { Row, createSlide } from "../src/index.ts";
import {
  findChrome,
  findChromeForTesting,
  hasCommand,
  withBrowser,
} from "../src/snapshot/browser.ts";

const slide = (text: string, options = {}) =>
  createSlide(options, () => <p>{text}</p>);

// The layer order the page declares, weakest first.
const layerOrder = (html: string) =>
  /@layer ([\w-]+(?:,[\w-]+)*);/.exec(html)?.[1]?.split(",");

test("deck, nested deck, and slide CSS land in layers from weakest to strongest", async () => {
  const deck = createSlide({ css: "h2{color:red}" }, [
    slide("a"),
    createSlide({ css: "h2{color:green}" }, [
      slide("b"),
      slide("c", { css: "h2{color:blue}" }),
    ]),
  ]);
  const html = await deck.render();
  expect(layerOrder(html)).toEqual([
    "hinote",
    "hinote-0",
    "hinote-1",
    "hinote-slide",
  ]);
  expect(html).toMatch(
    /@layer hinote-0\{:where\(\.slide\)\{h2\{color:red\}\}\}/,
  );
  // The nested deck's CSS is written once and reaches its two slides only.
  expect(html.match(/h2\{color:green\}/g)).toHaveLength(1);
  const scopes = (html.match(/<section[^>]*>/g) ?? []).map(
    (tag) => /data-hinote-css="([^"]*)"/.exec(tag)?.[1],
  );
  expect(scopes[0]).toBeUndefined();
  expect(scopes[1]).toBe("d0");
  expect(scopes[2]).toBe("d0 s2");
});

test("reads CSS files when the deck renders", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hinote-css-"));
  try {
    const file = join(dir, "deck.css");
    await writeFile(file, "h1 { color: teal; }");
    const deck = createSlide({ css: [pathToFileURL(file), "p{margin:1em}"] }, [
      slide("x"),
    ]);
    const html = await deck.render();
    expect(html).toContain("h1 { color: teal; }");
    expect(html).toContain("p{margin:1em}");

    const missing = createSlide({ css: pathToFileURL(join(dir, "nope.css")) }, [
      slide("x"),
    ]);
    await expect(missing.render()).rejects.toThrow(HinoteError);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("keeps at-rules that cannot nest at the top, and scopes the rest", () => {
  const css = `
    /* spin */ @keyframes spin { to { transform: rotate(1turn); } }
    @font-face { font-family: X; src: url(x.woff2); }
    @media print { h1 { color: black; } }
    & { padding: 0; }
    .a::before { content: "}"; }
  `;
  const out = scopeCss(css, ".s", "css");
  expect(out.startsWith("/* spin */ @keyframes spin")).toBe(true);
  expect(out).toContain("@font-face { font-family: X;");
  // Everything else sits inside the scope, braces in strings included.
  const scoped = out.slice(out.indexOf(".s{"));
  expect(scoped).toContain("@media print { h1 { color: black; } }");
  expect(scoped).toContain("& { padding: 0; }");
  expect(scoped).toContain('.a::before { content: "}"; }');
  expect(scoped.endsWith("}")).toBe(true);
});

test("rejects CSS it cannot place safely", () => {
  for (const css of [
    "h1{color:red}</style><script>",
    "h1{color:red",
    "h1{color:red}}",
    '@import "x.css";',
    "/* open",
  ])
    expect(() => scopeCss(css, ".s", "css")).toThrow(HinoteError);
  expect(() => createSlide({ css: 1 } as never, [slide("x")])).toThrow(
    HinoteError,
  );
});

const browser =
  (hasCommand("agent-browser") && "agent-browser") ||
  (findChromeForTesting() && "chrome-for-testing") ||
  (findChrome() && "chrome") ||
  undefined;

test.skipIf(!browser)(
  "deck CSS overrides Row gap without !important",
  async () => {
    const plain = await createSlide([
      createSlide(() => (
        <Row gap="40px">
          <span>a</span>
          <span>b</span>
        </Row>
      )),
    ]).render("static");
    const overridden = await createSlide({ css: ".hinote-row{gap:0}" }, [
      createSlide(() => (
        <Row gap="40px">
          <span>a</span>
          <span>b</span>
        </Row>
      )),
    ]).render("static");

    const dir = await mkdtemp(join(tmpdir(), "hinote-layout-"));
    try {
      const plainFile = join(dir, "plain.html");
      const overriddenFile = join(dir, "overridden.html");
      await writeFile(plainFile, plain);
      await writeFile(overriddenFile, overridden);

      const gaps = await withBrowser(
        browser!,
        { width: 1920, height: 1080 },
        async (page) => {
          await page.goto(pathToFileURL(plainFile).href);
          const before = await page.evaluate(
            `getComputedStyle(document.querySelector(".hinote-row")).columnGap`,
          );
          await page.goto(pathToFileURL(overriddenFile).href);
          const after = await page.evaluate(
            `getComputedStyle(document.querySelector(".hinote-row")).columnGap`,
          );
          return { before, after };
        },
      );

      expect(gaps.before).toBe("40px");
      expect(gaps.after).toBe("0px");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  30_000,
);
