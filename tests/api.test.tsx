import { describe, expect, test } from "bun:test";
import { Center, Column, Row, createSlide } from "../src/index.ts";
import { HinoteError } from "../src/errors.ts";
import { renderDeck } from "../src/render.ts";
function textSlide(text: string) {
  return createSlide(() => <p>{text}</p>);
}

describe("createSlide", () => {
  test("renders one slide and keeps Japanese text", async () => {
    const html = await renderDeck({ slides: [textSlide("こんにちは")] });
    expect(html).toContain("こんにちは");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain('class="slide is-active"');
  });

  test("puts options on the slide and escapes notes", async () => {
    const slide = createSlide(
      {
        title: "題",
        notes: "<script>alert(1)</script>",
        background: "#123456",
        class: "opening extra",
      },
      () => <h1>題</h1>,
    );
    const html = await renderDeck({ slides: [slide] });
    expect(html).toContain("<title>題</title>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("opening extra");
    expect(html).toContain("#123456");
  });

  test("flattens nested decks in order", async () => {
    const a = textSlide("AAA");
    const nested = createSlide([textSlide("BBB"), textSlide("CCC")]);
    const tail = createSlide([textSlide("DDD")]);
    const deck = createSlide([a, nested, tail]);
    const html = await renderDeck({
      slides: deck.kind === "deck" ? [...deck.slides] : [],
    });
    const positions = ["AAA", "BBB", "CCC", "DDD"].map((text) =>
      html.indexOf(text),
    );
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions]).toEqual(
      [...positions].sort((left, right) => left - right),
    );
  });

  test("renders an empty deck without inventing a slide", async () => {
    const deck = createSlide([]);
    const html = await renderDeck({ slides: [...deck.slides] });
    expect(html).not.toContain('class="slide');
    expect(html).toContain('id="deck"');
  });

  test("rejects calls that are not a slide or a deck", () => {
    const call = createSlide as (first?: unknown, second?: unknown) => unknown;
    expect(() => call()).toThrow(HinoteError);
    expect(() => call({ title: "x" })).toThrow(HinoteError);
    expect(() =>
      call(
        () => <p>x</p>,
        () => <p>y</p>,
      ),
    ).toThrow(HinoteError);
    expect(() => call(["nope"])).toThrow(HinoteError);
    expect(() => call([textSlide("A"), [textSlide("B")]])).toThrow(HinoteError);
    expect(() => call({ nope: true }, () => <p>x</p>)).toThrow(HinoteError);
  });
});

describe("layout", () => {
  test("Column, Row, and Center expose gap, align, and justify", async () => {
    const slide = createSlide(() => (
      <Column gap={2} align="center" justify="space-between">
        <Row gap="1rem" align="end">
          <p>左</p>
        </Row>
        <Center align="start">
          <p>中</p>
        </Center>
      </Column>
    ));
    const html = await renderDeck({ slides: [slide] });
    expect(html).toContain("flex-direction:column");
    expect(html).toContain("align-items:center");
    expect(html).toContain("justify-content:space-between");
    expect(html).toContain("gap:calc(var(--hinote-space) * 2)");
    expect(html).toContain("flex-direction:row");
    expect(html).toContain("align-items:end");
    expect(html).toContain("gap:1rem");
    expect(html).toContain("align-items:start");
    expect(html).toContain("justify-content:center");
    expect(html).toContain("flex:1");
  });

  test("rejects a layout value that would break out of the style attribute", async () => {
    const slide = createSlide(() => <Row align="center}" />);
    await expect(renderDeck({ slides: [slide] })).rejects.toThrow(HinoteError);
  });
});

describe("theme and build output", () => {
  test("inlines theme variables, per-slide overrides, css, and the runtime", async () => {
    const slides = [
      createSlide({ theme: { colors: { bg: "#abc123" } } }, () => <p>one</p>),
      createSlide(() => <img src="./pic.png" alt="会場" />),
    ];
    const html = await renderDeck({
      slides,
      theme: { colors: { accent: "#111111" } },
    });
    expect(html).toContain("--hinote-accent:#111111");
    expect(html).toContain("--hinote-bg:#abc123");
    expect(html).toMatch(
      /\.slide\.is-active\{[^}]*background:var\(--hinote-bg\)/,
    );
    expect(html).toMatch(/\.slide\.is-active\{[^}]*color:var\(--hinote-fg\)/);
    const first = html.indexOf("#abc123");
    const image = html.indexOf("./pic.png");
    expect(first).toBeGreaterThan(-1);
    expect(image).toBeGreaterThan(first);
    expect(html.slice(image)).not.toContain("#abc123");
    expect(html).not.toContain("data:image");
    expect(html).not.toContain("<script src");
    expect(html).not.toContain('<link rel="stylesheet"');
    expect(html).toContain("hinote-sync");
    expect(html).toContain('class="slide is-active"');
  });

  test("inlines a runtime the browser can parse", async () => {
    const html = await renderDeck({
      slides: [textSlide("x"), textSlide("y")],
      role: "presenter",
    });
    const start = html.indexOf("<script>");
    const end = html.lastIndexOf("</script>");
    const script = html.slice(start + "<script>".length, end);
    expect(script).toContain("<=");
    expect(() => new Function(script)).not.toThrow();
    expect(html).toContain('id="hinote-panel"');
    expect(html).toContain("width:1920px");
  });

  test("rejects theme values that would break out of the style tag", async () => {
    expect(() =>
      createSlide({ theme: { colors: { bg: "red</style>" } } }, () => <p>x</p>),
    ).toThrow(HinoteError);
    expect(() =>
      createSlide({ theme: { colors: { bg: "red}" } } }, () => <p>x</p>),
    ).toThrow(HinoteError);
    await expect(
      renderDeck({
        slides: [textSlide("x")],
        theme: { colors: { bg: "red</style>" } },
      }),
    ).rejects.toThrow(HinoteError);
  });

  test("a synchronous thrown slide does not produce html", async () => {
    const slide = createSlide(() => {
      throw new Error("boom");
    });
    await expect(renderDeck({ slides: [slide] })).rejects.toThrow("boom");
  });
});
