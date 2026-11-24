import { expect, test } from "bun:test";
import { createSlide } from "hinote";
import { Math } from "../src/index.tsx";

async function render(node: () => unknown) {
  return createSlide([createSlide(node as () => never)]).render("static");
}

test("renders LaTeX as MathML, a block by default", async () => {
  const html = await render(() => <Math tex="\frac{a}{b}" />);
  expect(html).toContain(
    '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">',
  );
  expect(html).toContain("<mfrac>");
  // MathML only: nothing for the page to load.
  expect(html).not.toContain("katex-html");
});

test("renders inline in the surrounding text", async () => {
  const html = await render(() => (
    <p>
      Area <Math inline tex="\pi r^2" /> grows.
    </p>
  ));
  expect(html).toMatch(/<p>Area <span class="katex"><math[^>]*>/);
  expect(html).not.toContain('display="block"');
});

// hinote reports it by name, like its own errors.
test("rejects LaTeX that does not parse as HinoteError", async () => {
  await expect(render(() => <Math tex="\frac{a" />)).rejects.toMatchObject({
    name: "HinoteError",
    code: "math",
    message: expect.stringContaining(
      '<Math tex="\\frac{a"> is not valid LaTeX',
    ),
  });
});
