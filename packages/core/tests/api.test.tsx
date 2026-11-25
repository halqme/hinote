import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import {
  Card,
  Center,
  Column,
  Contents,
  Flow,
  Grid,
  Link,
  Morph,
  Progress,
  Row,
  SectionBar,
  SectionDots,
  Script,
  Step,
  Steps,
  Table,
  createSlide,
  themes,
} from "../src/index.ts";
import { HinoteError } from "../src/errors.ts";

function textSlide(text: string) {
  return createSlide(() => <p>{text}</p>);
}

function deckOf(...slides: ReturnType<typeof textSlide>[]) {
  return createSlide(slides);
}

// A deck with the presenter view, sync, and pointer turned on.
function presenterDeckOf(...slides: ReturnType<typeof textSlide>[]) {
  return createSlide({ document: { presenter: true } }, slides);
}

describe("createSlide", () => {
  test("renders one slide and keeps Japanese text", async () => {
    const html = await deckOf(textSlide("こんにちは")).render();
    expect(html).toContain("こんにちは");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain('class="slide is-active"');
  });

  test("puts options on the slide, and notes on the presenter page only, escaped", async () => {
    const slide = createSlide(
      {
        title: "題",
        notes: "<script>alert(1)</script>",
        background: "#123456",
        class: "opening extra",
      },
      () => <h1>題</h1>,
    );
    const html = await deckOf(slide).render("presenter");
    expect(html).toContain("<title>題</title>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    // Notes are for the presenter: the audience view and the built file never carry them.
    for (const page of ["view", "static"] as const)
      expect(await deckOf(slide).render(page)).not.toContain("alert(1)");
    expect(html).toContain("opening extra");
    expect(html).toContain("#123456");
  });

  test("a deck title wins over slide titles", async () => {
    const deck = createSlide({ document: { title: "全体" } }, [
      createSlide({ title: "一枚目" }, () => <p>x</p>),
    ]);
    expect(await deck.render()).toContain("<title>全体</title>");
  });

  test("flattens nested decks in order", async () => {
    const nested = createSlide([textSlide("BBB"), textSlide("CCC")]);
    const deck = createSlide([
      textSlide("AAA"),
      nested,
      deckOf(textSlide("DDD")),
    ]);
    const html = await deck.render();
    const positions = ["AAA", "BBB", "CCC", "DDD"].map((text) =>
      html.indexOf(text),
    );
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions]).toEqual(
      [...positions].sort((left, right) => left - right),
    );
  });

  test("a nested deck theme reaches its slides, and a slide theme still wins", async () => {
    const nested = createSlide({ theme: { colors: { bg: "#aaaaaa" } } }, [
      textSlide("inherits"),
      createSlide({ theme: { colors: { bg: "#bbbbbb" } } }, () => <p>own</p>),
    ]);
    const html = await createSlide([textSlide("plain"), nested]).render();
    const sections = html.split("<section").slice(1);
    expect(sections[0]).not.toContain("#aaaaaa");
    expect(sections[1]).toContain("--hinote-color-bg:#aaaaaa");
    expect(sections[2]).toContain("--hinote-color-bg:#bbbbbb");
    expect(sections[2]).not.toContain("#aaaaaa");
  });

  test("a render function receives its slide title and the sections around it", async () => {
    const heading = createSlide({ title: "Results" }, ({ title, sections }) => (
      <h2>{[...sections, title].join(" / ")}</h2>
    ));
    const deck = createSlide({ section: "Talk" }, [
      createSlide({ section: "Experiment 1" }, [
        createSlide({ section: "1-1" }, [heading]),
      ]),
      createSlide(({ title, sections }) => (
        <p>{`${title ?? "untitled"} in ${sections.length}`}</p>
      )),
    ]);
    const sections = (await deck.render()).split("<section").slice(1);
    expect(sections[0]).toContain(
      "<h2>Talk / Experiment 1 / 1-1 / Results</h2>",
    );
    expect(sections[1]).toContain("<p>untitled in 1</p>");
    expect(() => createSlide({ section: 1 } as never, [])).toThrow(HinoteError);
  });

  test("a top-level lang is on every page, and a deck without one has no lang", async () => {
    const deck = createSlide({ document: { lang: "ja" } }, [textSlide("x")]);
    for (const page of ["view", "presenter", "static"] as const)
      expect(await deck.render(page)).toMatch(/<html\b[^>]*\blang="ja"/);
    expect(
      await createSlide({ document: { lang: "ja-JP" } }, [
        textSlide("x"),
      ]).render(),
    ).toMatch(/<html\b[^>]*\blang="ja-JP"/);
    expect(
      await createSlide({ document: { lang: "zh-Hans" } }, [
        textSlide("x"),
      ]).render(),
    ).toMatch(/<html\b[^>]*\blang="zh-Hans"/);
    expect(await deckOf(textSlide("こんにちは")).render()).not.toMatch(
      /<html\b[^>]*\slang=/,
    );
  });

  test("lang must be a language tag, on the top-level deck only", () => {
    expect(() =>
      createSlide({ document: { lang: "" } }, [textSlide("x")]),
    ).toThrow(HinoteError);
    expect(() =>
      createSlide({ document: { lang: "ja_JP" } }, [textSlide("x")]),
    ).toThrow(HinoteError);
    expect(() =>
      createSlide({ document: { lang: 'ja"><script>' } }, [textSlide("x")]),
    ).toThrow(HinoteError);
    expect(() =>
      createSlide({ document: { lang: 1 } } as never, [textSlide("x")]),
    ).toThrow(HinoteError);
    const inner = createSlide({ document: { lang: "en" } }, [textSlide("x")]);
    expect(() => createSlide([inner])).toThrow(HinoteError);
    expect(() => createSlide({ lang: "ja" } as never, () => <p>x</p>)).toThrow(
      HinoteError,
    );
  });

  test("Link points at a slide id and gets the URL of the page it is on", async () => {
    const deck = createSlide([
      createSlide(() => (
        <p>
          <Link to="method" class="next">
            Method
          </Link>
        </p>
      )),
      createSlide({ section: "Experiment" }, [
        createSlide(() => <p>setup</p>),
        createSlide({ id: "method" }, () => <h2>Method</h2>),
      ]),
    ]);
    const href = (html: string) =>
      /<a href="([^"]*)" data-hinote-to="method" class="next">Method<\/a>/.exec(
        html,
      )?.[1];

    const view = await deck.render();
    expect(view).toContain('data-hinote-id="method"');
    expect(href(view)).toBe("/3");
    expect(href(await deck.render("presenter"))).toBe("/presenter/3");
    expect(href(await deck.render("view", { base: "/talk" }))).toBe("/talk/3");
    expect(
      href(await deck.render("view", { base: "/talk", directories: true })),
    ).toBe("/talk/3/");
    expect(href(await deck.render("static"))).toBe("#3");
    // One slide rendered alone, as check and inspect do, still resolves.
    const [first] = await deck.renderEach();
    expect(first && "html" in first && href(first.html)).toBe("/3");
  });

  test("Contents lists the deck's sections, links each to its first slide, and marks the current one", async () => {
    const toc = createSlide({ title: "Contents" }, (slide) => (
      <Contents slide={slide} />
    ));
    const deck = createSlide([
      toc,
      createSlide({ section: "Method" }, [
        createSlide({ id: "method", title: "How we measured" }, () => <p>m</p>),
        createSlide({ section: "Setup" }, [createSlide(() => <p>s</p>)]),
      ]),
      createSlide({ section: "Results" }, [
        createSlide({ title: "What we found" }, (slide) => (
          <Contents slide={slide} depth={1} />
        )),
      ]),
    ]);
    const [first, , , last] = (await deck.render()).split("<section").slice(1);
    // Linked by the first slide's id, with its title beside the name.
    expect(first).toMatch(
      /<a href="\/2" data-hinote-to="method" class="hinote-contents-entry"><span class="hinote-contents-name">Method<\/span><span class="hinote-contents-title">How we measured<\/span><\/a>/,
    );
    // A first slide without an id gives the name without a link.
    expect(first).toContain(
      '<span class="hinote-contents-entry"><span class="hinote-contents-name">Setup</span></span>',
    );
    expect(first).not.toContain("is-current");
    // On a slide inside a section, that section is current, and depth stops nesting.
    expect(last).toMatch(
      /<li class="hinote-contents-item is-current" aria-current="true"><span class="hinote-contents-entry"><span class="hinote-contents-name">Results/,
    );
    expect(last).not.toContain("Setup");
    // Rendered alone, a slide still lists the whole deck.
    const alone = (await deck.renderEach())[3];
    expect(alone && "html" in alone && alone.html).toContain("Method");
    const flat = createSlide((slide) => <Contents slide={slide} depth={0} />);
    await expect(deckOf(flat).render()).rejects.toThrow("<Contents depth>");
  });

  test("Contents with skipCurrent leaves out the section the slide is in", async () => {
    const deck = createSlide([
      createSlide({ section: "Part" }, [
        createSlide({ section: "Contents" }, [
          createSlide((slide) => <Contents slide={slide} skipCurrent />),
        ]),
        createSlide({ section: "Method" }, [textSlide("m")]),
      ]),
    ]);
    const html = await deck.render();
    expect(html).not.toContain(">Contents<");
    // The section around it is current too, but it is not the slide's own.
    expect(html).toContain(">Part<");
    expect(html).toContain(">Method<");
  });

  test("SectionBar, SectionDots, and Progress show where the slide is in the deck", async () => {
    const indicators = createSlide((slide) => (
      <div>
        <SectionBar slide={slide} />
        <SectionDots slide={slide} />
        <Progress slide={slide} />
      </div>
    ));
    const deck = createSlide([
      textSlide("cover"),
      createSlide({ section: "Method" }, [
        createSlide({ id: "method" }, () => <p>m</p>),
        indicators,
        textSlide("m3"),
      ]),
      createSlide({ section: "Results" }, [textSlide("r")]),
    ]);
    const third = (await deck.render()).split("<section").slice(1)[2] ?? "";
    // The bar links the sections and marks the one the slide is in.
    expect(third).toMatch(
      /<li class="hinote-section-bar-item is-current" aria-current="true"><a href="\/2" data-hinote-to="method" class="hinote-section-bar-name">Method<\/a><\/li><li class="hinote-section-bar-item"><span class="hinote-section-bar-name">Results<\/span>/,
    );
    // Method has three slides, and this is its second.
    expect(third).toContain('aria-label="Method: slide 2 of 3"');
    expect(third).toContain('<li></li><li class="is-current"></li><li></li>');
    // Slide 3 of 5, with ticks where Method (slide 2) and Results (slide 5) start.
    expect(third).toContain('aria-valuenow="3"');
    expect(third).toContain("--hinote-progress:0.6");
    expect(third).toContain("--hinote-at:0.2");
    expect(third).toContain("--hinote-at:0.8");
    // Outside every section there are no dots.
    const first = createSlide([
      createSlide((slide) => <SectionDots slide={slide} />),
    ]);
    expect(await first.render()).not.toContain('hinote-section-dots"');
  });

  test("two nested decks with one section next to each other are one entry", async () => {
    const deck = createSlide([
      createSlide({ section: "Part" }, [textSlide("a")]),
      createSlide({ section: "Part" }, [textSlide("b")]),
      createSlide((slide) => <Contents slide={slide} />),
    ]);
    const html = await deck.render();
    expect(html.match(/hinote-contents-name">Part</g)).toHaveLength(1);
  });

  test("a duplicate slide id, an unknown target, or a malformed id is an error", async () => {
    const twice = createSlide([
      createSlide({ id: "a" }, () => <p>1</p>),
      createSlide([createSlide({ id: "a" }, () => <p>2</p>)]),
    ]);
    await expect(twice.render()).rejects.toThrow('both have the id "a"');
    const unknown = createSlide([
      createSlide(() => <Link to="nowhere">?</Link>),
    ]);
    await expect(unknown.render()).rejects.toThrow('"nowhere"');
    expect(() => createSlide({ id: "two words" }, () => <p />)).toThrow(
      HinoteError,
    );
    await expect(
      deckOf(createSlide(() => <Link to="a b">x</Link>)).render(),
    ).rejects.toThrow(HinoteError);
  });

  test("only the top-level deck may set document", () => {
    const inner = createSlide({ document: { aspect: "4:3" } }, [
      textSlide("x"),
    ]);
    expect(() => createSlide([inner])).toThrow(HinoteError);
    const titled = createSlide({ document: { title: "t" } }, [textSlide("x")]);
    expect(() => createSlide([titled])).toThrow(HinoteError);
    const presenting = createSlide({ document: { presenter: true } }, [
      textSlide("x"),
    ]);
    expect(() => createSlide([presenting])).toThrow(HinoteError);
    const numbered = createSlide({ document: { pageNumber: true } }, [
      textSlide("x"),
    ]);
    expect(() => createSlide([numbered])).toThrow(HinoteError);
    // The error names what was set and where it belongs.
    expect(() => createSlide([inner])).toThrow(
      expect.objectContaining({
        code: "deck-option",
        message: expect.stringContaining('"document"'),
        hint: expect.stringContaining("outermost createSlide"),
      }),
    );
  });

  test("page numbers are the flattened position, and one slide can hide its own", async () => {
    const deck = createSlide({ document: { pageNumber: true } }, [
      createSlide({ pageNumber: false }, () => <p>title</p>),
      createSlide([textSlide("b")]),
      textSlide("c"),
    ]);
    const sections = (await deck.render()).split("<section").slice(1);
    expect(sections[0]).not.toContain("hinote-page");
    expect(sections[1]).toContain("2 / 3");
    expect(sections[2]).toContain("3 / 3");
    const alone = await deck.renderEach();
    const third = alone[2];
    expect(third && "html" in third && third.html).toContain("3 / 3");
    expect(await createSlide([textSlide("x")]).render()).not.toContain(
      '<p class="hinote-page">',
    );
    expect(() =>
      createSlide({ document: { pageNumber: "yes" } } as never, [
        textSlide("x"),
      ]),
    ).toThrow(HinoteError);
    expect(() =>
      createSlide({ pageNumber: "yes" } as never, () => <p>x</p>),
    ).toThrow(HinoteError);
  });

  test("renders an empty deck without inventing a slide", async () => {
    const html = await createSlide([]).render();
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
    expect(() => call({ notes: "x" }, [textSlide("A")])).toThrow(HinoteError);
    expect(() => call({ aspect: "wide" }, [textSlide("A")])).toThrow(
      HinoteError,
    );
    expect(() => call({ aspect: "0:9" }, [textSlide("A")])).toThrow(
      HinoteError,
    );
  });
});

describe("canvas", () => {
  async function canvasOf(aspect?: string) {
    const deck = createSlide(
      aspect ? { document: { aspect: aspect as "16:9" } } : {},
      [textSlide("x")],
    );
    const html = await deck.render();
    const width = Number(/data-width="(\d+)"/.exec(html)?.[1]);
    const height = Number(/data-height="(\d+)"/.exec(html)?.[1]);
    return { width, height };
  }

  test("is 16:9 by default and takes 4:3 or any ratio", async () => {
    const wide = await canvasOf();
    expect(wide.width / wide.height).toBeCloseTo(16 / 9, 2);
    const classic = await canvasOf("4:3");
    expect(classic.width / classic.height).toBeCloseTo(4 / 3, 2);
    const cinema = await canvasOf("2.39:1");
    expect(cinema.width / cinema.height).toBeCloseTo(2.39, 2);
  });
});

describe("transition", () => {
  // The page reads each slide's transition from data-transition when it enters.
  const transitions = (html: string) =>
    [...html.matchAll(/<section[^>]*data-transition="(\w+)"/g)].map(
      (match) => match[1],
    );

  test("slides take the deck transition unless they set their own", async () => {
    const nested = createSlide({ transition: "slide" }, [
      textSlide("lent"),
      createSlide({ transition: "none" }, () => <p>own</p>),
    ]);
    const deck = createSlide({ transition: "fade" }, [
      textSlide("deck"),
      createSlide({ transition: "slide" }, () => <p>slide</p>),
      nested,
    ]);
    expect(transitions(await deck.render())).toEqual([
      "fade",
      "slide",
      "slide",
      "none",
    ]);
    expect(transitions(await deckOf(textSlide("x")).render())).toEqual([
      "none",
    ]);
  });

  test("a transition with its own timing passes its duration and easing to the slide", async () => {
    const deck = createSlide(
      { transition: { name: "zoom", duration: 600, easing: "ease-out" } },
      [textSlide("x")],
    );
    const html = await deck.render();
    expect(html).toMatch(
      /<section[^>]*data-transition="zoom" data-transition-duration="600ms" data-transition-easing="ease-out"/,
    );
  });

  test.each([
    { name: "spin" },
    { name: "fade", duration: -1 },
    { name: "fade", easing: "ease;color:red" },
    { name: "fade", speed: 2 },
  ])("rejects the transition %j", (transition) => {
    const call = createSlide as (first?: unknown, second?: unknown) => unknown;
    expect(() => call({ transition }, () => <p>x</p>)).toThrow(HinoteError);
  });

  test("rejects unknown transitions", () => {
    const call = createSlide as (first?: unknown, second?: unknown) => unknown;
    expect(() => call({ transition: "spin" }, [textSlide("x")])).toThrow(
      HinoteError,
    );
    expect(() => call({ transition: "spin" }, () => <p>x</p>)).toThrow(
      HinoteError,
    );
  });
});

describe("Morph", () => {
  test("names the element it wraps, an HTML element or a component's, and adds none of its own", async () => {
    async function Late() {
      await Promise.resolve();
      return <p>late</p>;
    }
    const html = await deckOf(
      createSlide(() => (
        <section>
          <Morph name="title">
            <h1 class="big">x</h1>
          </Morph>
          <Morph name="card">
            <Card>
              <h3>Plan</h3>
            </Card>
          </Morph>
          <Morph name="late">
            <Late />
          </Morph>
        </section>
      )),
    ).render();
    expect(html).toContain('<h1 data-hinote-morph="title" class="big">x</h1>');
    expect(html).toMatch(/<div data-hinote-morph="card" class="hinote-card"/);
    expect(html).toContain('<p data-hinote-morph="late">late</p>');
  });

  // A Grid lines up the rows of its Cards; a Morph around one must not hide it.
  test("a Grid counts the rows of a Card inside a Morph", async () => {
    const html = await deckOf(
      createSlide(() => (
        <Grid>
          <Morph name="plan">
            <Card>
              <span>i</span>
              <h3>Plan</h3>
              <p>text</p>
            </Card>
          </Morph>
          <Card>
            <h3>Other</h3>
          </Card>
        </Grid>
      )),
    ).render();
    expect(html).toContain("--hinote-grid-rows:3");
  });

  test("a step inside a Morph is numbered with the slide's others", async () => {
    const html = await deckOf(
      createSlide(() => (
        <div>
          <Step>first</Step>
          <Morph name="later">
            <Step>second</Step>
          </Morph>
        </div>
      )),
    ).render();
    expect(html).toContain(
      '<div data-hinote-morph="later" data-hinote-step="2">second</div>',
    );
  });

  test("a Grid inside a Morph is named itself and keeps its Cards' rows", async () => {
    const html = await deckOf(
      createSlide(() => (
        <Morph name="grid">
          <Grid>
            <Card>
              <h3>a</h3>
              <p>b</p>
            </Card>
            <Card>
              <h3>c</h3>
            </Card>
          </Grid>
        </Morph>
      )),
    ).render();
    expect(html).toMatch(
      /<div data-hinote-morph="grid" class="hinote-grid" style="--hinote-grid-rows:2"/,
    );
  });

  // Only one element can move into one twin; naming the first of several
  // would leave the rest behind and hide the Cards from their Grid.
  test("refuses several elements in one Morph, also when a component renders them", async () => {
    function Pair() {
      return (
        <>
          <Card>a</Card>
          <Card>b</Card>
        </>
      );
    }
    for (const inside of [
      <>
        <Card>a</Card>
        <Card>b</Card>
      </>,
      <Pair />,
      <>
        <p>a</p> and text
      </>,
    ]) {
      const slide = createSlide(() => (
        <Grid>
          <Morph name="pair">{inside}</Morph>
        </Grid>
      ));
      await expect(deckOf(slide).render()).rejects.toThrow(
        /<Morph name="pair"> needs one element inside/,
      );
    }
    // Whatever one element holds, it is still one: void, self-closed, and
    // raw-text elements included.
    const one = createSlide(() => (
      <Morph name="one">
        <figure>
          <img src="a.png" />
          <svg>
            <path d="M0 0" />
          </svg>
          <script
            type="module"
            dangerouslySetInnerHTML={{ __html: "if (1 < 2) '</p><p>';" }}
          />
        </figure>
      </Morph>
    ));
    expect(await deckOf(one).render()).toContain(
      '<figure data-hinote-morph="one">',
    );
  });

  test("refuses a name used twice on one slide, naming the slide", async () => {
    const twice = createSlide(() => (
      <>
        <Morph name="a">
          <p>1</p>
        </Morph>
        <Morph name="a">
          <p>2</p>
        </Morph>
      </>
    ));
    await expect(deckOf(textSlide("x"), twice).render()).rejects.toThrow(
      /Slide 2 has two <Morph name="a">/,
    );
  });

  test("rejects a name that is not letters, digits, _, or -, and contents that are not an element", async () => {
    const bad = createSlide(() => (
      <Morph name="a b">
        <p>x</p>
      </Morph>
    ));
    await expect(deckOf(bad).render()).rejects.toThrow(HinoteError);
    for (const inside of ["just text", undefined]) {
      const slide = createSlide(() => <Morph name="t">{inside}</Morph>);
      await expect(deckOf(slide).render()).rejects.toThrow(
        /needs one element inside/,
      );
    }
  });
});

describe("Step", () => {
  test("numbers steps in document order unless `at` is given", async () => {
    const slide = createSlide(() => (
      <ul>
        <Step as="li">a</Step>
        <Step as="li">b</Step>
        <Step at={1}>with a</Step>
        <Step>c</Step>
      </ul>
    ));
    const html = await deckOf(slide).render();
    const steps = [...html.matchAll(/data-hinote-step="(\d+)"/g)].map((match) =>
      Number(match[1]),
    );
    expect(steps).toEqual([1, 2, 1, 3]);
    expect(html).toContain('<li data-hinote-step="1">a</li>');
  });

  test("restarts numbering on every slide", async () => {
    const one = createSlide(() => <Step>a</Step>);
    const two = createSlide(() => <Step>b</Step>);
    const html = await deckOf(one, two).render();
    expect(html.match(/data-hinote-step="1"/g)).toHaveLength(2);
  });

  test("an effect is written on the step for the page to animate", async () => {
    const html = await deckOf(
      createSlide(() => <Step effect="up">x</Step>),
    ).render();
    expect(html).toContain('data-hinote-effect="up"');
  });

  test("rejects bad props", async () => {
    const effect = createSlide(() => <Step effect={"spin" as never}>x</Step>);
    await expect(deckOf(effect).render()).rejects.toThrow(HinoteError);
    const bad = createSlide(() => <Step at={0}>x</Step>);
    await expect(deckOf(bad).render()).rejects.toThrow(HinoteError);
    const tag = createSlide(() => <Step as={"li onclick" as never}>x</Step>);
    await expect(deckOf(tag).render()).rejects.toThrow(HinoteError);
  });

  test("numbers steps in document order across async components", async () => {
    async function Late() {
      await Bun.sleep(5);
      return <Step>late</Step>;
    }
    const slide = createSlide(() => (
      <div>
        <Late />
        <Step>after</Step>
      </div>
    ));
    const html = await deckOf(slide).render();
    expect(html).toContain('<div data-hinote-step="1">late</div>');
    expect(html).toContain('<div data-hinote-step="2">after</div>');
  });
});

describe("Steps", () => {
  test("reserves steps for the element, numbered with the slide's <Step>s", async () => {
    const slide = createSlide(() => (
      <div>
        <Step>before</Step>
        <Steps count={2} class="chart">
          drawn
        </Steps>
        <Step>after</Step>
      </div>
    ));
    const html = await deckOf(slide).render();
    expect(html).toContain('<div data-hinote-step="1">before</div>');
    expect(html).toContain(
      '<div data-hinote-steps="2-3" class="chart">drawn</div>',
    );
    expect(html).toContain('<div data-hinote-step="4">after</div>');
  });

  test("rejects a count that is not a positive integer", async () => {
    for (const count of [0, 1.5, -1]) {
      const slide = createSlide(() => <Steps count={count}>x</Steps>);
      await expect(deckOf(slide).render()).rejects.toThrow(HinoteError);
    }
  });
});

describe("async rendering", () => {
  test("a slide may await data and use async components", async () => {
    async function Count(props: { of: Promise<string[]> }) {
      return <p>{(await props.of).length} items</p>;
    }
    const slide = createSlide(async () => {
      const title = await Promise.resolve("非同期");
      return (
        <div>
          <h2>{title}</h2>
          <Count of={Promise.resolve(["a", "b"])} />
        </div>
      );
    });
    const deck = deckOf(slide);
    const html = await deck.render();
    expect(html).toContain("<h2>非同期</h2>");
    expect(html).toContain("<p>2 items</p>");
    expect(await (await deck.request("/")).text()).toContain("2 items");
  });

  test("a rejected async component fails the render", async () => {
    async function Broken(): Promise<never> {
      throw new Error("no data");
    }
    const slide = createSlide(() => <Broken />);
    await expect(deckOf(slide).render()).rejects.toThrow("no data");
  });
});

describe("Script", () => {
  test("marks a file for the CLI to bundle, or loads a URL as is", async () => {
    const file = new URL("file:///deck/chart.client.tsx");
    const html = await deckOf(
      createSlide(() => (
        <div>
          <Script src={file} />
          <Script src="/js/built.js" />
        </div>
      )),
    ).render();
    expect(html).toContain(
      '<script type="module" data-hinote-src="file:///deck/chart.client.tsx"></script>',
    );
    expect(html).toContain(
      '<script type="module" src="/js/built.js"></script>',
    );
  });

  // The browser would request the source as it is and fail.
  test("rejects a string src that names a source file, and says to pass a URL", async () => {
    for (const src of ["./widget.client.tsx", "./w.ts", "./w.jsx"]) {
      const slide = createSlide(() => <Script src={src} />);
      await expect(deckOf(slide).render()).rejects.toMatchObject({
        code: "script-src",
        hint: expect.stringContaining("import.meta.url"),
      });
    }
  });

  // Only the CLI bundles a file; a page that would carry a script that never
  // runs is refused instead, with how to pass a built one.
  test("a deck served on its own refuses a page whose <Script> file was never bundled", async () => {
    const deck = deckOf(
      createSlide(() => (
        <Script src={new URL("file:///deck/poll.client.tsx")} />
      )),
    );
    let error: unknown;
    deck.onError((err, c) => {
      error = err;
      return c.text("failed", 500);
    });
    expect((await deck.request("/")).status).toBe(500);
    expect(error).toMatchObject({
      name: "HinoteError",
      code: "script-unbundled",
      hint: expect.stringContaining('<Script src="'),
    });

    const built = deckOf(createSlide(() => <Script src="/js/poll.js" />));
    expect((await built.request("/")).status).toBe(200);
  });

  test("a script a package put in several slides runs once, at the end of the page", async () => {
    const packaged =
      '<script type="module" data-hinote-script="pkg">window.n=(window.n||0)+1</script>';
    const slide = () =>
      createSlide(() => <div dangerouslySetInnerHTML={{ __html: packaged }} />);
    const html = await deckOf(slide(), slide()).render();
    expect(html.split(packaged)).toHaveLength(2);
    expect(html.endsWith(`${packaged}</body></html>`)).toBe(true);
  });

  test("rejects a URL that is not a file and an empty src", async () => {
    for (const src of [new URL("https://example.com/x.js"), ""]) {
      const slide = createSlide(() => <Script src={src} />);
      await expect(deckOf(slide).render()).rejects.toThrow(HinoteError);
    }
  });
});

describe("layout", () => {
  test("Column, Row, and Center expose gap, align, and justify as CSS variables", async () => {
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
    const html = await deckOf(slide).render();
    expect(html).toContain('class="hinote-column"');
    expect(html).toContain('class="hinote-row"');
    expect(html).toContain('class="hinote-center"');
    expect(html).toContain("--hinote-gap:calc(var(--hinote-space-unit) * 2)");
    expect(html).toContain("--hinote-align:center");
    expect(html).toContain("--hinote-justify:space-between");
    expect(html).toContain("--hinote-gap:1rem");
    expect(html).toContain("--hinote-align:end");
    expect(html).toContain("--hinote-align:start");
    // Flex rules live in @layer hinote, not on the style attribute.
    expect(html).toContain(
      ".hinote-row{flex-direction:row;align-items:var(--hinote-align,stretch);justify-content:var(--hinote-justify,start)}",
    );
    expect(html).toContain(
      ".hinote-column{flex-direction:column;align-items:var(--hinote-align,stretch);justify-content:var(--hinote-justify,start)}",
    );
    expect(html).toContain(
      ".hinote-center{flex:1;flex-direction:column;align-items:var(--hinote-align,center);justify-content:var(--hinote-justify,center)}",
    );
    // Props set variables only; gap / flex-direction stay out of the style attribute.
    for (const style of html.matchAll(/\bstyle="([^"]*)"/g)) {
      expect(style[1]).not.toMatch(/(?:^|;)\s*gap:/);
      expect(style[1]).not.toMatch(/flex-direction:/);
    }
  });

  test("rejects a layout value that would break out of the style attribute", async () => {
    const slide = createSlide(() => <Row align={"center}" as never} />);
    await expect(deckOf(slide).render()).rejects.toThrow(HinoteError);
  });

  // CSS drops a length without a unit, so the items would touch.
  test("rejects a gap string without a unit, and says how to write it", async () => {
    const slide = createSlide(() => <Column gap={"2" as never} />);
    await expect(deckOf(slide).render()).rejects.toMatchObject({
      code: "gap",
      hint: expect.stringContaining("gap={2}"),
    });
  });

  test("Grid and Card expose columns, gap, span, and one cell per child", async () => {
    const slide = createSlide(() => (
      <Grid columns={3} gap={2}>
        <Card span={2}>
          <h3>Title</h3>
          <p>Body</p>
        </Card>
        <Card>
          <h3>Other</h3>
        </Card>
      </Grid>
    ));
    const html = await deckOf(slide).render();
    expect(html).toContain('class="hinote-grid"');
    expect(html).toContain('class="hinote-card"');
    expect(html).toContain("--hinote-grid-columns:3");
    expect(html).toContain("--hinote-gap:calc(var(--hinote-space-unit) * 2)");
    expect(html).toContain("--hinote-card-span:2");
    expect(html).toContain("--hinote-card-rows:2");
    expect(html).toContain("--hinote-card-rows:1");
    expect(html).toContain("--hinote-grid-rows:2");
    expect(html.match(/class="hinote-card-cell"/g)?.length).toBe(3);
    expect(html).toContain(
      ".hinote-card{display:grid;grid-template-rows:subgrid;grid-row:span max(var(--hinote-card-rows,1),var(--hinote-grid-rows,1));grid-column:span var(--hinote-card-span,1);",
    );
  });

  test("a Card footer is one more row, and Grid spans the most rows any Card takes", async () => {
    const html = await deckOf(
      createSlide(() => (
        <Grid>
          <Card footer={<small>Source A</small>}>
            <h3>A</h3>
            <p>one</p>
            <p>two</p>
          </Card>
          <Card footer={<small>Source B</small>}>
            <h3>B</h3>
          </Card>
          <Card>
            <h3>C</h3>
          </Card>
        </Grid>
      )),
    ).render();
    expect(html).toContain("--hinote-grid-rows:4");
    expect(html.match(/--hinote-card-rows:(\d)/g)).toEqual([
      "--hinote-card-rows:4",
      "--hinote-card-rows:2",
      "--hinote-card-rows:1",
    ]);
    expect(
      html.match(/<div class="hinote-card-cell hinote-card-footer">/g),
    ).toHaveLength(2);
    expect(html).toContain(
      '<div class="hinote-card-cell hinote-card-footer"><small>Source B</small></div></div>',
    );
  });

  test("Flow puts an arrow between each pair of boxes and emphasizes one", async () => {
    const flow = async (count: number, emphasis?: number) => {
      const html = await deckOf(
        createSlide(() => (
          <Flow emphasis={emphasis} gap={4}>
            {["one", "two", "three"].slice(0, count).map((word) => (
              <p>{word}</p>
            ))}
          </Flow>
        )),
      ).render();
      const flowHtml =
        /<div class="hinote-flow"[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";
      return {
        html,
        order: [
          ...flowHtml.matchAll(/class="hinote-flow-(box|arrow)[^"]*"/g),
        ].map((m) => m[1]),
        emphasized: [
          ...flowHtml.matchAll(/class="hinote-flow-box is-emphasis"><p>(\w+)/g),
        ].map((m) => m[1]),
      };
    };
    const two = await flow(2);
    expect(two.order).toEqual(["box", "arrow", "box"]);
    expect(two.emphasized).toEqual([]);
    const three = await flow(3, 2);
    expect(three.order).toEqual(["box", "arrow", "box", "arrow", "box"]);
    expect(three.emphasized).toEqual(["two"]);
    expect(three.html).toContain(
      "--hinote-gap:calc(var(--hinote-space-unit) * 4)",
    );
    expect(three.html).toContain('.hinote-flow-arrow::before{content:"→"}');

    for (const emphasis of [0, 4, 1.5])
      await expect(flow(3, emphasis)).rejects.toThrow(HinoteError);
  });

  test("Table turns widths into columns and marks emphasized body rows", async () => {
    const table = (props: { widths?: number[]; emphasis?: number[] }) =>
      deckOf(
        createSlide(() => (
          <Table {...props}>
            <thead>
              <tr>
                <th>Model</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>A</td>
                <td>1</td>
              </tr>
              <tr class="mine">
                <td>B</td>
                <td>2</td>
              </tr>
            </tbody>
          </Table>
        )),
      ).render();

    const plain = await table({});
    expect(plain).toContain('<table class="hinote-table"><thead>');
    expect(plain).not.toContain("<colgroup>");
    expect(plain).toContain('<tr class="mine"><td>B</td>');

    const html = await table({ widths: [3, 1], emphasis: [2] });
    expect(html).toContain(
      '<table class="hinote-table" data-hinote-widths=""><colgroup><col style="--hinote-column-width:75%"/><col style="--hinote-column-width:25%"/></colgroup>',
    );
    expect(html).toContain('<tr class="mine is-emphasis"><td>B</td>');
    expect(html.match(/<tr class="[^"]*is-emphasis"/g)).toHaveLength(1);
    expect(html).toContain(
      ".hinote-table col{width:var(--hinote-column-width,auto)}",
    );

    for (const bad of [
      { emphasis: [3] },
      { emphasis: [0] },
      { widths: [1, 0] },
    ])
      await expect(table(bad)).rejects.toThrow(HinoteError);
  });

  test("rejects a non-positive Grid columns or Card span", async () => {
    await expect(
      deckOf(createSlide(() => <Grid columns={0} />)).render(),
    ).rejects.toThrow(HinoteError);
    await expect(
      deckOf(createSlide(() => <Card span={0} />)).render(),
    ).rejects.toThrow(HinoteError);
  });
});

describe("theme and output", () => {
  test("a named preset replaces the default palette, and ink is that default", async () => {
    const slide = createSlide(() => <p>x</p>);
    const bare = await createSlide([slide]).render();
    const ink = await createSlide({ theme: themes.ink }, [slide]).render();
    const paper = await createSlide({ theme: themes.paper }, [slide]).render();
    const slate = await createSlide({ theme: themes.slate }, [slide]).render();
    const token = (html: string, name: string) =>
      new RegExp(`${name}:([^;}]+)`).exec(html)?.[1];
    expect(token(ink, "--hinote-color-bg")).toBe(
      token(bare, "--hinote-color-bg"),
    );
    expect(token(paper, "--hinote-color-bg")).not.toBe(
      token(bare, "--hinote-color-bg"),
    );
    expect(token(slate, "--hinote-color-bg")).not.toBe(
      token(paper, "--hinote-color-bg"),
    );
    // A preset leaves out the type scale, so the default sizes remain.
    expect(token(paper, "--hinote-text-h1")).toBe(
      token(bare, "--hinote-text-h1"),
    );
    expect(token(paper, "--hinote-font-heading")).not.toBe(
      token(bare, "--hinote-font-heading"),
    );
    expect(bare).toContain("font-size:var(--hinote-text-h3)");
    expect(bare).toContain(":is(ul,ol)");
    expect(bare).toContain("var(--hinote-color-surface)");
    expect(bare).toContain("var(--hinote-color-border)");
    const overridden = await createSlide({ theme: themes.paper }, [
      createSlide({ theme: { colors: { bg: "#123456" } } }, () => <p>x</p>),
    ]).render();
    const paperBg = token(paper, "--hinote-color-bg");
    const section = overridden.split("<section")[1] ?? "";
    expect(paperBg).toBeTruthy();
    expect(section).toContain("--hinote-color-bg:#123456");
    expect(section).not.toContain(paperBg ?? "");
  });

  test("inlines theme variables, per-slide overrides, css, and the runtime", async () => {
    const deck = createSlide({ theme: { colors: { accent: "#111111" } } }, [
      createSlide({ theme: { colors: { bg: "#abc123" } } }, () => <p>one</p>),
      createSlide(() => <img src="./pic.png" alt="会場" />),
    ]);
    const html = await deck.render("static");
    expect(html).toContain("--hinote-color-accent:#111111");
    expect(html).toContain("--hinote-color-bg:#abc123");
    const first = html.indexOf("#abc123");
    const image = html.indexOf("./pic.png");
    expect(first).toBeGreaterThan(-1);
    expect(image).toBeGreaterThan(first);
    expect(html.slice(image)).not.toContain("#abc123");
    expect(html).not.toContain("data:image");
    expect(html).not.toContain("<script src");
    expect(html).not.toContain('<link rel="stylesheet"');
    // The single file is an audience view only.
    expect(html).not.toContain('id="hinote-panel"');
  });

  test("inlines a runtime the browser can parse", async () => {
    const html = await deckOf(textSlide("x"), textSlide("y")).render(
      "presenter",
    );
    const start = html.indexOf("<script>");
    const end = html.lastIndexOf("</script>");
    const script = html.slice(start + "<script>".length, end);
    expect(script).not.toContain("</script");
    // Parses the inlined client script without running it.
    // oxlint-disable-next-line typescript/no-implied-eval
    expect(() => new Function(script)).not.toThrow();
    expect(html).toContain('id="hinote-panel"');
  });

  test("spacing.safe is the default slide padding", async () => {
    const html = await deckOf(textSlide("x")).render();
    expect(html).toContain(
      "--hinote-space-safe:calc(var(--hinote-space-unit) * 6)",
    );
    expect(html).toContain("padding:var(--hinote-space-safe)");
  });

  test("tokens beyond the built-in names become CSS variables too", async () => {
    const deck = createSlide(
      { theme: { colors: { brand: "#ff5500" }, spacing: { gutter: "3rem" } } },
      [
        createSlide({ theme: { colors: { brand: "#00aa55" } } }, () => (
          <p style="color:var(--hinote-color-brand)">x</p>
        )),
      ],
    );
    const html = await deck.render();
    expect(html).toContain("--hinote-color-brand:#ff5500");
    expect(html).toContain("--hinote-space-gutter:3rem");
    const section = html.split("<section")[1] ?? "";
    expect(section).toContain("--hinote-color-brand:#00aa55");
    // A slide theme declares only what it changes.
    expect(section).not.toContain("--hinote-color-fg");
  });

  test("rejects theme groups and token names it cannot turn into variables", () => {
    const deckWith = (theme: unknown) => () =>
      createSlide({ theme } as never, [textSlide("x")]);
    expect(deckWith({ palette: { a: "red" } })).toThrow(HinoteError);
    expect(deckWith({ colors: { "my color": "red" } })).toThrow(HinoteError);
    expect(deckWith({ colors: { "1st": "red" } })).toThrow(HinoteError);
    expect(deckWith({ colors: { bg: 1 } })).toThrow(HinoteError);
    expect(deckWith({ radius: { md: "4px" } })).toThrow(HinoteError);
  });

  test("rejects theme values that would break out of the style tag", () => {
    expect(() =>
      createSlide({ theme: { colors: { bg: "red</style>" } } }, () => <p>x</p>),
    ).toThrow(HinoteError);
    expect(() =>
      createSlide({ theme: { colors: { bg: "red}" } } }, () => <p>x</p>),
    ).toThrow(HinoteError);
    expect(() =>
      createSlide({ theme: { colors: { bg: "red</style>" } } }, []),
    ).toThrow(HinoteError);
  });

  test("a synchronous thrown slide does not produce html", async () => {
    const slide = createSlide(() => {
      throw new Error("boom");
    });
    await expect(deckOf(slide).render()).rejects.toThrow("boom");
  });
});

describe("deck as a Hono app", () => {
  test("keeps the presenter view, sync, and pointer off unless the deck turns them on", async () => {
    const deck = createSlide([
      createSlide({ notes: "secret notes" }, () => <p>one</p>),
    ]);
    expect((await deck.request("/1")).status).toBe(200);
    for (const path of ["/presenter", "/presenter/1", "/_hinote/events"])
      expect((await deck.request(path)).status).toBe(404);
    const sync = await deck.request("/_hinote/sync", {
      method: "POST",
      body: JSON.stringify({
        channel: "",
        from: "a",
        message: { type: "hello" },
      }),
    });
    expect(sync.status).toBe(404);
    const view = await (await deck.request("/")).text();
    expect(view).not.toContain("secret notes");
    expect(view).not.toContain('id="hinote-pointer"');
    expect(view).not.toContain("data-sync");
  });

  test("serves the view, the presenter, and each slide by number", async () => {
    const deck = presenterDeckOf(textSlide("one"), textSlide("two"));
    for (const path of ["/", "/2", "/presenter", "/presenter/2"]) {
      const response = await deck.request(path);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
      const html = await response.text();
      expect(html).toContain("two");
    }
    expect(await (await deck.request("/presenter")).text()).toContain(
      'id="hinote-panel"',
    );
    expect(await (await deck.request("/")).text()).not.toContain(
      'id="hinote-panel"',
    );
    // Paths do not nest below the slide number.
    expect((await deck.request("/2/1")).status).toBe(404);
  });

  test("relative URLs in slides resolve against the deck root on every page", async () => {
    const deck = presenterDeckOf(
      createSlide(() => <img src="./pic.png" alt="" />),
    );
    const baseOf = async (
      app: { request(path: string): Response | Promise<Response> },
      path: string,
    ) =>
      /<base href="([^"]*)"/.exec(await (await app.request(path)).text())?.[1];
    for (const path of ["/", "/1", "/presenter", "/presenter/1"])
      expect(
        new URL(
          "./pic.png",
          new URL((await baseOf(deck, path)) ?? "", `http://h${path}`),
        ).pathname,
      ).toBe("/pic.png");
    const app = new Hono().route("/talk", deck);
    expect(await baseOf(app, "/talk/presenter/1")).toBe("/talk/");
    // The built file resolves images next to itself.
    expect(await deck.render("static")).not.toContain("<base");
  });

  test("keeps Hono routing, including routes the author adds and mounting", async () => {
    const deck = presenterDeckOf(textSlide("one"));
    deck.get("/hello", (c) => c.text("hi"));
    deck.options("/hello", (c) => c.body(null, 204));
    expect(await (await deck.request("/hello")).text()).toBe("hi");
    expect((await deck.request("/hello", { method: "OPTIONS" })).status).toBe(
      204,
    );

    const app = new Hono().route("/talk", deck);
    expect(await (await app.request("/talk/presenter/1")).text()).toContain(
      "one",
    );
  });

  test("a render error answers 500 and the next request renders again", async () => {
    let fail = true;
    const deck = deckOf(
      createSlide(() => {
        if (fail) throw new Error("boom");
        return <p>recovered</p>;
      }),
    );
    expect((await deck.request("/")).status).toBe(500);
    fail = false;
    expect(await (await deck.request("/")).text()).toContain("recovered");
  });
});

describe("sync over the deck server", () => {
  async function listen(
    deck: ReturnType<typeof presenterDeckOf>,
    id: string,
    channel = "",
  ) {
    const controller = new AbortController();
    const query = new URLSearchParams({ id, channel });
    const response = await deck.request(`/_hinote/events?${query}`, {
      signal: controller.signal,
    });
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const next = async (): Promise<unknown> => {
      while (true) {
        const data = /^data: (.*)$/m.exec(buffer);
        if (data) {
          buffer = buffer.slice(data.index + data[0].length);
          return JSON.parse(data[1] ?? "null");
        }
        const chunk = await reader.read();
        if (chunk.done) throw new Error("stream closed");
        buffer += decoder.decode(chunk.value);
      }
    };
    return { next, close: () => controller.abort() };
  }

  const send = (deck: ReturnType<typeof presenterDeckOf>, body: string) =>
    deck.request("/_hinote/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });

  test("relays a message to the other pages, not back to the sender", async () => {
    const deck = presenterDeckOf(textSlide("x"));
    const a = await listen(deck, "a");
    const b = await listen(deck, "b");
    try {
      const message = { type: "navigate", slide: 1, step: 0 };
      const sent = await send(
        deck,
        JSON.stringify({ channel: "", from: "a", message }),
      );
      expect(sent.status).toBe(204);
      expect(await b.next()).toEqual(message);
      const reply = { type: "hello" };
      await send(
        deck,
        JSON.stringify({ channel: "", from: "b", message: reply }),
      );
      // a's first message is b's reply, so a never saw its own navigate.
      expect(await a.next()).toEqual(reply);
    } finally {
      a.close();
      b.close();
    }
  });

  test("pages on another channel do not follow", async () => {
    const deck = presenterDeckOf(textSlide("x"));
    const talk = await listen(deck, "talk", "/talk");
    const other = await listen(deck, "other", "/other");
    try {
      const message = { type: "navigate", slide: 1, step: 0 };
      await send(
        deck,
        JSON.stringify({ channel: "/other", from: "x", message }),
      );
      expect(await other.next()).toEqual(message);
      const own = { type: "hello" };
      await send(
        deck,
        JSON.stringify({ channel: "/talk", from: "x", message: own }),
      );
      // The first message on /talk is its own, not the one sent to /other.
      expect(await talk.next()).toEqual(own);
    } finally {
      talk.close();
      other.close();
    }
  });

  test("building a deck while pages are open tells them to reload", async () => {
    const deck = presenterDeckOf(textSlide("old"));
    const page = await listen(deck, "page", "/talk");
    try {
      // What `bun --hot` and `hinote dev` do when deck.tsx changes.
      deckOf(textSlide("new"));
      expect(await page.next()).toEqual({ type: "reload" });
    } finally {
      page.close();
    }
  });

  test("refuses bodies that are not sync messages", async () => {
    const deck = presenterDeckOf(textSlide("x"));
    expect((await send(deck, "nope")).status).toBe(400);
    // The page sends JSON; a form or a plain text body is not a message.
    const plain = await deck.request("/_hinote/sync", {
      method: "POST",
      body: JSON.stringify({ channel: "", from: "a", message: {} }),
    });
    expect(plain.status).toBe(400);
    expect((await send(deck, JSON.stringify({ message: {} }))).status).toBe(
      400,
    );
    expect(
      (
        await send(
          deck,
          JSON.stringify({ from: "a", message: "x".repeat(5000) }),
        )
      ).status,
    ).toBe(413);
  });
});
