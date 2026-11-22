import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "bun:test";
import { scopeCss } from "../src/deck/css.ts";
import { HinoteError } from "../src/errors.ts";
import { Card, Flow, Grid, Row, Table, createSlide } from "../src/index.ts";
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

test.skipIf(!browser)(
  "Grid cards with uneven headings share height and body start",
  async () => {
    const html = await createSlide([
      createSlide(() => (
        <Grid columns={2} gap={3}>
          <Card>
            <h3>Short</h3>
            <p>Body A</p>
          </Card>
          <Card>
            <h3>
              A much longer heading that wraps to more lines than the other card
              so the row heights would diverge without subgrid
            </h3>
            <p>Body B</p>
          </Card>
        </Grid>
      )),
    ]).render("static");

    const dir = await mkdtemp(join(tmpdir(), "hinote-card-align-"));
    try {
      const file = join(dir, "cards.html");
      await writeFile(file, html);
      const measured = (await withBrowser(
        browser!,
        { width: 1920, height: 1080 },
        async (page) => {
          await page.goto(pathToFileURL(file).href);
          return page.evaluate(`(() => {
            const cards = [...document.querySelectorAll(".hinote-card")];
            const boxes = cards.map((el) => el.getBoundingClientRect());
            const bodies = cards.map((el) =>
              el.querySelectorAll(".hinote-card-cell")[1].getBoundingClientRect(),
            );
            // h3 content height (not the subgrid cell) shows the titles differ;
            // cell boxes match because of subgrid.
            const titleHeights = cards.map((el) =>
              el.querySelector("h3").getBoundingClientRect().height,
            );
            return {
              heights: boxes.map((b) => b.height),
              bodyTops: bodies.map((b) => b.top),
              titleHeights,
            };
          })()`);
        },
      )) as {
        heights: number[];
        bodyTops: number[];
        titleHeights: number[];
      };

      expect(measured.titleHeights[0]).toBeLessThan(measured.titleHeights[1]!);
      expect(measured.heights[0]).toBe(measured.heights[1]);
      expect(measured.bodyTops[0]).toBe(measured.bodyTops[1]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  30_000,
);

test.skipIf(!browser)(
  "Card footers line up across columns whatever the body above them",
  async () => {
    const html = await createSlide([
      createSlide(() => (
        <Grid columns={3} gap={3}>
          <Card footer={<small>Source: Bender et al.</small>}>
            <h3>Long</h3>
            <p>
              A body long enough to wrap over several lines of the card, far
              more than the other cards have.
            </p>
            <p>And a second paragraph.</p>
          </Card>
          <Card footer={<small>Source: short</small>}>
            <h3>Short</h3>
            <p>One line.</p>
          </Card>
          <Card>
            <h3>No footer</h3>
            <p>Plain body.</p>
          </Card>
        </Grid>
      )),
    ]).render("static");
    const dir = await mkdtemp(join(tmpdir(), "hinote-card-footer-"));
    try {
      const file = join(dir, "cards.html");
      await writeFile(file, html);
      const measured = (await withBrowser(
        browser!,
        { width: 1920, height: 1080 },
        async (page) => {
          await page.goto(pathToFileURL(file).href);
          return page.evaluate(`(() => {
            const cards = [...document.querySelectorAll(".hinote-card")];
            const top = (el) => el ? Math.round(el.getBoundingClientRect().top) : null;
            return {
              footers: cards.map((c) => top(c.querySelector(".hinote-card-footer small"))),
              bodies: cards.map((c) => top(c.querySelectorAll(".hinote-card-cell")[1])),
              bottoms: cards.map((c) => Math.round(c.getBoundingClientRect().bottom)),
            };
          })()`);
        },
      )) as { footers: (number | null)[]; bodies: number[]; bottoms: number[] };
      expect(measured.footers[2]).toBeNull();
      expect(measured.footers[0]).toBe(measured.footers[1]);
      expect(new Set(measured.bodies).size).toBe(1);
      expect(new Set(measured.bottoms).size).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  30_000,
);

test.skipIf(!browser)(
  "deck CSS overrides Card surface without !important",
  async () => {
    const plain = await createSlide([
      createSlide(() => (
        <Grid>
          <Card>
            <h3>A</h3>
            <p>one</p>
          </Card>
        </Grid>
      )),
    ]).render("static");
    const overridden = await createSlide(
      { css: ".hinote-card{background:rgb(255, 0, 0)}" },
      [
        createSlide(() => (
          <Grid>
            <Card>
              <h3>A</h3>
              <p>one</p>
            </Card>
          </Grid>
        )),
      ],
    ).render("static");

    const dir = await mkdtemp(join(tmpdir(), "hinote-card-css-"));
    try {
      const plainFile = join(dir, "plain.html");
      const overriddenFile = join(dir, "overridden.html");
      await writeFile(plainFile, plain);
      await writeFile(overriddenFile, overridden);
      const colors = await withBrowser(
        browser!,
        { width: 1920, height: 1080 },
        async (page) => {
          await page.goto(pathToFileURL(plainFile).href);
          const before = await page.evaluate(
            `getComputedStyle(document.querySelector(".hinote-card")).backgroundColor`,
          );
          await page.goto(pathToFileURL(overriddenFile).href);
          const after = await page.evaluate(
            `getComputedStyle(document.querySelector(".hinote-card")).backgroundColor`,
          );
          return { before, after };
        },
      );
      expect(colors.before).not.toBe("rgb(255, 0, 0)");
      expect(colors.after).toBe("rgb(255, 0, 0)");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  30_000,
);

test.skipIf(!browser)(
  "Japanese decks break slide text at phrases, other decks and code do not",
  async () => {
    const page = (lang?: string) =>
      createSlide(lang ? { lang } : {}, [
        createSlide(() => (
          <div>
            <p>どうかよろしくお願いします</p>
            <pre>const どうか = 1;</pre>
          </div>
        )),
      ]).render("static");
    const dir = await mkdtemp(join(tmpdir(), "hinote-lang-"));
    try {
      const langs = ["ja", "ja-JP", "en", undefined];
      const files = await Promise.all(
        langs.map(async (lang, i) => {
          const file = join(dir, `${i}.html`);
          await writeFile(file, await page(lang));
          return file;
        }),
      );
      const breaks = await withBrowser(
        browser!,
        { width: 1920, height: 1080 },
        async (tab) => {
          const seen: unknown[] = [];
          for (const file of files) {
            await tab.goto(pathToFileURL(file).href);
            seen.push(
              await tab.evaluate(
                `["p", "pre"].map((s) => getComputedStyle(document.querySelector(".slide " + s)).wordBreak).join()`,
              ),
            );
          }
          return seen;
        },
      );
      expect(breaks).toEqual([
        "auto-phrase,normal",
        "auto-phrase,normal",
        "normal,normal",
        "normal,normal",
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  30_000,
);

test.skipIf(!browser)(
  "deck CSS redraws Flow arrows and emphasis without !important",
  async () => {
    const page = (css?: string) =>
      createSlide(css ? { css } : {}, [
        createSlide(() => (
          <Flow emphasis={2}>
            <p>ask</p>
            <p>answer</p>
          </Flow>
        )),
      ]).render("static");
    const dir = await mkdtemp(join(tmpdir(), "hinote-flow-"));
    try {
      const plainFile = join(dir, "plain.html");
      const styledFile = join(dir, "styled.html");
      await writeFile(plainFile, await page());
      await writeFile(
        styledFile,
        await page(
          '.hinote-flow-arrow::before{content:"⇒"} .hinote-flow-box.is-emphasis{border-color:rgb(255, 0, 0)}',
        ),
      );
      const read = `[
        getComputedStyle(document.querySelector(".hinote-flow-arrow"), "::before").content,
        getComputedStyle(document.querySelector(".hinote-flow-box.is-emphasis")).borderTopColor,
        getComputedStyle(document.querySelector(".hinote-flow-box:not(.is-emphasis)")).borderTopColor,
      ].join("|")`;
      const seen = await withBrowser(
        browser!,
        { width: 1920, height: 1080 },
        async (tab) => {
          await tab.goto(pathToFileURL(plainFile).href);
          const plain = await tab.evaluate(read);
          await tab.goto(pathToFileURL(styledFile).href);
          return { plain, styled: await tab.evaluate(read) };
        },
      );
      const [arrow, emphasized, other] = String(seen.plain).split("|");
      expect(arrow).toBe('"→"');
      expect(emphasized).not.toBe(other);
      const [newArrow, newEmphasis] = String(seen.styled).split("|");
      expect(newArrow).toBe('"⇒"');
      expect(newEmphasis).toBe("rgb(255, 0, 0)");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  30_000,
);

test.skipIf(!browser)(
  "Table widths set the column ratio, and deck CSS overrides it without !important",
  async () => {
    const page = (css?: string) =>
      createSlide(css ? { css } : {}, [
        createSlide(() => (
          <Table widths={[3, 1]} emphasis={[1]}>
            <tbody>
              <tr>
                <td>wide</td>
                <td>narrow</td>
              </tr>
            </tbody>
          </Table>
        )),
      ]).render("static");
    const dir = await mkdtemp(join(tmpdir(), "hinote-table-"));
    try {
      const plainFile = join(dir, "plain.html");
      const styledFile = join(dir, "styled.html");
      await writeFile(plainFile, await page());
      await writeFile(
        styledFile,
        await page(".hinote-table col:first-child{width:50%}"),
      );
      const ratio = `(() => {
        const [a, b] = document.querySelectorAll(".hinote-table td");
        return Math.round((a.getBoundingClientRect().width / b.getBoundingClientRect().width) * 10) / 10;
      })()`;
      const seen = await withBrowser(
        browser!,
        { width: 1920, height: 1080 },
        async (tab) => {
          await tab.goto(pathToFileURL(plainFile).href);
          const plain = await tab.evaluate(ratio);
          await tab.goto(pathToFileURL(styledFile).href);
          return { plain, styled: await tab.evaluate(ratio) };
        },
      );
      // 50% against the untouched 25%.
      expect(seen).toEqual({ plain: 3, styled: 2 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  30_000,
);
