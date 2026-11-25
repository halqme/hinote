import { expect, test } from "bun:test";
import { createSlide } from "@hinote/core";
import { Mermaid } from "../src/index.tsx";

async function render(...nodes: (() => unknown)[]) {
  return createSlide(
    nodes.map((node) => createSlide(node as () => never)),
  ).render("static");
}

// Each diagram's own <svg>, with what is inside it.
const diagrams = (html: string) =>
  [...html.matchAll(/<svg class="hinote-mermaid-[^"]+"[\s\S]*?<\/svg>/g)].map(
    (match) => match[0],
  );

test("draws Mermaid as an inline SVG with its labels, at 2.5 times the renderer's size", async () => {
  const html = await render(() => (
    <Mermaid class="wide">{`
      sequenceDiagram
        Alice->>Bob: hello
    `}</Mermaid>
  ));
  expect(html).toContain('<div class="hinote-mermaid wide"><svg');
  expect(html).toContain(">Alice<");
  expect(html).toContain(">Bob<");
  expect(html).toContain(">hello<");
  const [, w, h, width, height] =
    /viewBox="0 0 ([\d.]+) ([\d.]+)" width="([\d.]+)" height="([\d.]+)"/.exec(
      html,
    ) ?? [];
  expect(Number(width)).toBeCloseTo(Number(w) * 2.5, 1);
  expect(Number(height)).toBeCloseTo(Number(h) * 2.5, 1);
});

test("takes its colors and fonts from the deck's theme, loads no font, and has no background", async () => {
  const [svg = ""] = diagrams(
    await render(() => <Mermaid code={"graph LR\n  a --> b"} />),
  );
  for (const token of ["bg", "fg", "accent", "muted", "surface", "border"])
    expect(svg).toContain(`--${token}:var(--hinote-color-${token})`);
  expect(svg).toContain("font-family: var(--hinote-font-base)");
  expect(svg).not.toContain("@import");
  expect(svg).not.toContain("fonts.googleapis.com");
  expect(svg).not.toMatch(/background/);
});

// Every slide is on one page: a diagram's styles must not reach other SVGs, and
// one diagram's markers must not be taken for another's.
test("keeps each diagram's styles and markers to itself, the same on every render", async () => {
  const deck = () =>
    render(
      () => <Mermaid code={"graph LR\n  a --> b"} />,
      () => <Mermaid code={"graph LR\n  c --> d"} />,
    );
  const first = await deck();
  const svgs = diagrams(first);
  expect(svgs).toHaveLength(2);
  const names = svgs.map(
    (svg) => /class="(hinote-mermaid-[^"]+)"/.exec(svg)?.[1],
  );
  expect(names[0]).not.toBe(names[1]);
  for (const [index, svg] of svgs.entries()) {
    const name = names[index] ?? "";
    // Every rule starts with this diagram's class.
    const rules = /<style>([\s\S]*?)<\/style>/.exec(svg)?.[1] ?? "";
    for (const selector of rules.matchAll(/^\s*([^\s{][^{]*)\{/gm))
      expect(selector[1]?.trim().startsWith(`.${name}`)).toBe(true);
    // Every id is this diagram's, and every reference points at one of them.
    const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1] ?? "");
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(id.startsWith(`${name}-`)).toBe(true);
    for (const [, ref = ""] of svg.matchAll(/url\(#([^)]+)\)/g))
      expect(ids).toContain(ref);
  }
  expect(await deck()).toBe(first);
});

test("draws flowcharts, state, sequence, class, ER, and XY charts", async () => {
  const sources = [
    "graph TD\n  a --> b",
    "flowchart LR\n  a --> b",
    "stateDiagram-v2\n  [*] --> Idle",
    "sequenceDiagram\n  a->>b: hi",
    "classDiagram\n  class Deck",
    "erDiagram\n  DECK ||--o{ SLIDE : has",
    "xychart-beta\n  x-axis [a, b]\n  bar [1, 2]",
  ];
  for (const code of sources) {
    const [svg] = diagrams(await render(() => <Mermaid code={code} />));
    expect(svg).toBeDefined();
  }
});

// hinote reports it by name, like its own errors.
test("rejects a diagram it cannot draw as HinoteError, naming the ones it can", async () => {
  for (const code of [
    "gantt\n  title Plan",
    'pie\n  "a": 1',
    "mindmap\n  root",
  ]) {
    await expect(render(() => <Mermaid code={code} />)).rejects.toMatchObject({
      name: "HinoteError",
      code: "mermaid",
      message: expect.stringContaining("sequenceDiagram"),
    });
  }
  await expect(
    render(() => <Mermaid code="nonsense here" />),
  ).rejects.toMatchObject({
    name: "HinoteError",
    code: "mermaid",
    message: expect.stringContaining('cannot draw "nonsense"'),
  });
  await expect(render(() => <Mermaid />)).rejects.toMatchObject({
    name: "HinoteError",
    code: "mermaid",
  });
});
