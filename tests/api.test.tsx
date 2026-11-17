import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { Center, Column, Row, Step, createSlide } from "../src/index.ts";
import { HinoteError } from "../src/errors.ts";

function textSlide(text: string) {
  return createSlide(() => <p>{text}</p>);
}

function deckOf(...slides: ReturnType<typeof textSlide>[]) {
  return createSlide(slides);
}

describe("createSlide", () => {
  test("renders one slide and keeps Japanese text", async () => {
    const html = await deckOf(textSlide("こんにちは")).render();
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
    const html = await deckOf(slide).render();
    expect(html).toContain("<title>題</title>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("opening extra");
    expect(html).toContain("#123456");
  });

  test("a deck title wins over slide titles", async () => {
    const deck = createSlide({ title: "全体" }, [
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
    expect(sections[1]).toContain("--hinote-bg:#aaaaaa");
    expect(sections[2]).toContain("--hinote-bg:#bbbbbb");
    expect(sections[2]).not.toContain("#aaaaaa");
  });

  test("only the top-level deck may set title or aspect", () => {
    const inner = createSlide({ aspect: "4:3" }, [textSlide("x")]);
    expect(() => createSlide([inner])).toThrow(HinoteError);
    const titled = createSlide({ title: "t" }, [textSlide("x")]);
    expect(() => createSlide([titled])).toThrow(HinoteError);
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
    const deck = createSlide(aspect ? { aspect: aspect as "16:9" } : {}, [
      textSlide("x"),
    ]);
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

  test("rejects use outside a slide and bad props", async () => {
    expect(() => (<Step>x</Step>).toString()).toThrow(HinoteError);
    const bad = createSlide(() => <Step at={0}>x</Step>);
    await expect(deckOf(bad).render()).rejects.toThrow(HinoteError);
    const tag = createSlide(() => <Step as="li onclick">x</Step>);
    await expect(deckOf(tag).render()).rejects.toThrow(HinoteError);
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
    const html = await deckOf(slide).render();
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
    await expect(deckOf(slide).render()).rejects.toThrow(HinoteError);
  });
});

describe("theme and output", () => {
  test("inlines theme variables, per-slide overrides, css, and the runtime", async () => {
    const deck = createSlide({ theme: { colors: { accent: "#111111" } } }, [
      createSlide({ theme: { colors: { bg: "#abc123" } } }, () => <p>one</p>),
      createSlide(() => <img src="./pic.png" alt="会場" />),
    ]);
    const html = await deck.render("view", "static");
    expect(html).toContain("--hinote-accent:#111111");
    expect(html).toContain("--hinote-bg:#abc123");
    const first = html.indexOf("#abc123");
    const image = html.indexOf("./pic.png");
    expect(first).toBeGreaterThan(-1);
    expect(image).toBeGreaterThan(first);
    expect(html.slice(image)).not.toContain("#abc123");
    expect(html).not.toContain("data:image");
    expect(html).not.toContain("<script src");
    expect(html).not.toContain('<link rel="stylesheet"');
    expect(html).toContain('data-mode="static"');
  });

  test("inlines a runtime the browser can parse", async () => {
    const html = await deckOf(textSlide("x"), textSlide("y")).render(
      "presenter",
    );
    const start = html.indexOf("<script>");
    const end = html.lastIndexOf("</script>");
    const script = html.slice(start + "<script>".length, end);
    expect(script).not.toContain("</script");
    expect(() => new Function(script)).not.toThrow();
    expect(html).toContain('id="hinote-panel"');
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
  test("serves the view, the presenter, and each slide by number", async () => {
    const deck = deckOf(textSlide("one"), textSlide("two"));
    for (const path of ["/", "/2", "/presenter", "/presenter/2"]) {
      const response = await deck.request(path);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
      const html = await response.text();
      expect(html).toContain("two");
      expect(html).toContain('data-mode="serve"');
    }
    expect(await (await deck.request("/presenter")).text()).toContain(
      'data-role="presenter"',
    );
    // Paths do not nest below the slide number.
    expect((await deck.request("/2/1")).status).toBe(404);
  });

  test("keeps Hono routing, including routes the author adds and mounting", async () => {
    const deck = deckOf(textSlide("one"));
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
  async function listen(deck: ReturnType<typeof deckOf>, id: string) {
    const controller = new AbortController();
    const response = await deck.request(`/_hinote/events?id=${id}`, {
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

  const send = (deck: ReturnType<typeof deckOf>, body: string) =>
    deck.request("/_hinote/sync", { method: "POST", body });

  test("relays a message to the other pages, not back to the sender", async () => {
    const deck = deckOf(textSlide("x"));
    const a = await listen(deck, "a");
    const b = await listen(deck, "b");
    try {
      const message = { type: "navigate", slide: 1, step: 0 };
      const sent = await send(deck, JSON.stringify({ from: "a", message }));
      expect(sent.status).toBe(204);
      expect(await b.next()).toEqual(message);
      const reply = { type: "hello" };
      await send(deck, JSON.stringify({ from: "b", message: reply }));
      // a's first message is b's reply, so a never saw its own navigate.
      expect(await a.next()).toEqual(reply);
    } finally {
      a.close();
      b.close();
    }
  });

  test("refuses bodies that are not sync messages", async () => {
    const deck = deckOf(textSlide("x"));
    expect((await send(deck, "nope")).status).toBe(400);
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
