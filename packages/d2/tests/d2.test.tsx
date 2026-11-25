import { resolve } from "node:path";
import { expect, test } from "bun:test";
import { createSlide } from "@hinote/core";
import { D2 } from "../src/index.tsx";

async function render(...nodes: (() => unknown)[]) {
  return createSlide(
    nodes.map((node) => createSlide(node as () => never)),
  ).render("static");
}

test("draws D2 as an inline SVG at twice D2's size", async () => {
  const html = await render(() => (
    <D2 class="wide">{`
      client -> server: request
    `}</D2>
  ));
  expect(html).toContain('<div class="hinote-d2 wide"><svg');
  expect(html).not.toContain("<?xml");
  const [, w, h, width, height] =
    /viewBox="0 0 (\d+) (\d+)" width="(\d+)" height="(\d+)"/.exec(html) ?? [];
  expect([Number(width), Number(height)]).toEqual([
    Number(w) * 2,
    Number(h) * 2,
  ]);
  expect(html).toContain(">client<");
  expect(html).toContain(">request<");
});

// The first shape inside D2's own <svg>: the theme's background when D2 paints one.
const firstShape = (html: string) =>
  /<svg class="d2-\d+ d2-svg"[^>]*>(<[a-z]+[^>]*>)/.exec(html)?.[1] ?? "";

test("the slide shows through the diagram unless background asks for the theme's", async () => {
  for (const sketch of [false, true]) {
    const plain = await render(() => <D2 code="a -> b" sketch={sketch} />);
    expect(firstShape(plain)).not.toContain("fill-N7");
    expect(plain).toContain(">a<");
    const kept = await render(() => (
      <D2 code="a -> b" sketch={sketch} theme={200} background />
    ));
    expect(firstShape(kept)).toMatch(/^<rect [^>]*class=" fill-N7"/);
  }
});

// Every slide is on one page, so ids inside two SVGs must differ, and the same
// deck must render the same each time.
test("gives each diagram its own ids, the same on every render", async () => {
  const deck = () =>
    render(
      () => <D2 code="a -> b" />,
      () => <D2 code="a -> b" theme={200} />,
    );
  const first = await deck();
  const classes = [...first.matchAll(/class="(d2-\d+) d2-svg"/g)].map(
    (match) => match[1],
  );
  expect(classes).toHaveLength(2);
  expect(classes[0]).not.toBe(classes[1]);
  expect(await deck()).toBe(first);
});

test("draws diagrams on slides rendered at the same time", async () => {
  const [one, two] = await Promise.all([
    render(() => <D2 code="alpha -> beta" />),
    render(() => <D2 code="gamma -> delta" />),
  ]);
  expect(one).toContain(">alpha<");
  expect(one).not.toContain(">gamma<");
  expect(two).toContain(">gamma<");
});

// hinote reports it by name, like its own errors.
test("rejects source that is not D2 as HinoteError, with the line", async () => {
  await expect(render(() => <D2 code="a -> {" />)).rejects.toMatchObject({
    name: "HinoteError",
    code: "d2",
    message: expect.stringContaining(
      "<D2> is not valid D2: line 1:1: connection missing destination",
    ),
  });
  await expect(render(() => <D2 />)).rejects.toMatchObject({
    name: "HinoteError",
  });
});

// The compiler runs in a worker thread, which must not keep `hinote build`
// running once the deck is written.
test("a process that drew a diagram exits on its own", () => {
  const index = resolve(import.meta.dir, "../src/index.tsx");
  const run = Bun.spawnSync(
    [
      "bun",
      "-e",
      `const { D2 } = await import(${JSON.stringify(index)});
       const svg = String(await D2({ code: "a -> b" }));
       console.log(svg.includes("<svg"));`,
    ],
    { stderr: "pipe", timeout: 30_000 },
  );
  expect(run.exitCode).toBe(0);
  expect(run.stdout.toString().trim()).toBe("true");
});
