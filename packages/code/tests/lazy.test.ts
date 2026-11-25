import { resolve } from "node:path";
import { expect, test } from "bun:test";

// Some hosts refuse to compile WebAssembly at run time. A deck that imports
// @hinote/code but shows no code must still render there; only <Code> needs
// the highlighter.
test("importing <Code> does not compile WebAssembly until a slide uses it", () => {
  const core = resolve(import.meta.dir, "../../core/src/index.ts");
  const code = resolve(import.meta.dir, "../src/index.tsx");
  const script = `
    WebAssembly.Module = function () { throw new Error("no wasm here"); };
    const { createSlide } = await import(${JSON.stringify(core)});
    const { Code } = await import(${JSON.stringify(code)});
    const { jsx } = await import("hono/jsx");
    const plain = createSlide([createSlide(() => jsx("h1", {}, "plain"))]);
    const html = await plain.render();
    const code = createSlide([createSlide(() => jsx(Code, { lang: "ts", code: "1" }))]);
    const failed = await code.render().then(() => "rendered", (error) => error.message);
    console.log(JSON.stringify({ plain: html.includes("<h1>plain</h1>"), code: failed }));
  `;
  const run = Bun.spawnSync(["bun", "-e", script], { stderr: "pipe" });
  expect(run.stderr.toString()).toBe("");
  expect(JSON.parse(run.stdout.toString())).toEqual({
    plain: true,
    code: "no wasm here",
  });
});
