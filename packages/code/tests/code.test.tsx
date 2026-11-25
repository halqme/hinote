import { expect, test } from "bun:test";
import { Step, createSlide } from "@hinote/core";
import { Code, dedent } from "../src/index.tsx";
import { githubLight } from "../src/themes.ts";

async function render(node: () => unknown) {
  return createSlide([createSlide(node as () => never)]).render("static");
}

test("highlights code with inline colors and escapes it", async () => {
  const html = await render(() => (
    <Code lang="ts">{`const ok = 1 < 2 && "<script>";`}</Code>
  ));
  expect(html).toMatch(/<pre class="highlights"[^>]*style="[^"]*background/);
  expect(html).toMatch(/<span style="color:#[0-9a-f]{6}">const /);
  expect(html).toContain("&lt; ");
  expect(html).not.toContain('"<script>"');
});

test("takes the source from `code`, a theme, and a class", async () => {
  const dark = await render(() => <Code lang="js" code="let a = 1" />);
  const light = await render(() => (
    <Code lang="js" code="let a = 1" theme={githubLight} class="wide" />
  ));
  expect(light).toContain('class="highlights wide"');
  const colors = (html: string) => html.match(/color:#[0-9a-f]{6}/g)?.join();
  expect(colors(light)).not.toBe(colors(dark));
});

test("drops the indentation the surrounding JSX adds", () => {
  expect(
    dedent(`
      if (a) {
        b();
      }
    `),
  ).toBe("if (a) {\n  b();\n}");
  expect(dedent("")).toBe("");
});

// hinote reports these by name, like its own errors.
test("rejects an unknown language and a missing source as HinoteError", async () => {
  await expect(
    render(() => <Code lang={"klingon" as "ts"}>x</Code>),
  ).rejects.toMatchObject({ name: "HinoteError", code: "error" });
  await expect(render(() => <Code lang="ts" />)).rejects.toMatchObject({
    name: "HinoteError",
    code: "error",
  });
});

// The text of each line, and whether it is dimmed.
function lines(block: string): { text: string; dimmed: boolean }[] {
  const code = /<code>([\s\S]*?)<\/code>/.exec(block)?.[1] ?? "";
  return code.split("\n").map((line) => ({
    text: line.replace(/<[^>]*>/g, ""),
    dimmed: line.startsWith('<span style="opacity:.4">'),
  }));
}

const source = `
  const greeting = \`hello
  world\`;
  console.log(greeting);
`;

test("highlight dims every other line, with no steps", async () => {
  const html = await render(() => (
    <Code lang="ts" highlight="1-2">
      {source}
    </Code>
  ));
  expect(lines(html)).toEqual([
    { text: "const greeting = `hello", dimmed: false },
    { text: "world`;", dimmed: false },
    { text: "console.log(greeting);", dimmed: true },
  ]);
  expect(html).not.toMatch(/<pre[^>]*data-hinote-step/);
});

test("a set of lines for each step, numbered with the slide's <Step>s", async () => {
  const html = await render(() => (
    <div>
      <Step>first</Step>
      <Code lang="ts" highlight={[1, "2,3", "1-3"]}>
        {source}
      </Code>
      <Step>last</Step>
    </div>
  ));
  const blocks = [...html.matchAll(/<pre[\s\S]*?<\/pre>/g)].map(([b]) => b);
  expect(
    blocks.map((block) => /data-hinote-step="(\d+)"/.exec(block)?.[1]),
  ).toEqual([undefined, "2", "3"]);
  expect(
    blocks.map((block) => lines(block).map((line) => line.dimmed)),
  ).toEqual([
    [false, true, true],
    [true, false, false],
    [false, false, false],
  ]);
  expect(html).toContain('data-hinote-step="4">last');
  // Screen readers read the code once.
  expect(blocks.slice(1).every((b) => b.includes('aria-hidden="true"'))).toBe(
    true,
  );
});

test("rejects lines the source does not have as HinoteError", async () => {
  for (const highlight of [0, "4", "3-1", "1-", "one", []])
    await expect(
      render(() => (
        <Code lang="ts" highlight={highlight}>
          {source}
        </Code>
      )),
    ).rejects.toMatchObject({ name: "HinoteError", code: "error" });
});
