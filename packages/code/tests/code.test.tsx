import { expect, test } from "bun:test";
import { createSlide } from "@hinote/core";
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
