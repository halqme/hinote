import { expect, test } from "bun:test";
import { HinoteError } from "../src/errors.ts";
import { insertIntoDeck } from "../src/insert.ts";

const deck = `// header
import { createSlide } from "hinote"

const extra = 1

export default createSlide([
  // keep
  alpha,
  createSlide({ title: "]" }, () => <p>{\`a[\${"]"}]\`}</p>),
  beta, // ]
])
`;

test("inserts an import and keeps existing entries in order", () => {
  const next = insertIntoDeck(deck, "Gamma", "./slides/Gamma.tsx", 2);
  expect(next).toContain('import Gamma from "./slides/Gamma.tsx"');
  expect(next.indexOf("import Gamma")).toBeLessThan(
    next.indexOf("export default"),
  );
  expect(next).toContain("const extra = 1");
  expect(next).toContain("// keep");
  expect(next).toContain('title: "]"');
  const alpha = next.indexOf("alpha,");
  const gamma = next.indexOf("Gamma,");
  const beta = next.indexOf("beta,");
  expect(alpha).toBeGreaterThan(-1);
  expect(alpha).toBeLessThan(gamma);
  expect(gamma).toBeLessThan(beta);
});

test("appends when no position is given and rejects a bad position without a partial edit", () => {
  const appended = insertIntoDeck(deck, "Tail", "./slides/Tail.tsx");
  expect(appended.lastIndexOf("Tail,")).toBeGreaterThan(
    appended.indexOf("beta,"),
  );
  expect(() => insertIntoDeck(deck, "Nope", "./slides/Nope.tsx", 9)).toThrow(
    HinoteError,
  );
  expect(() => insertIntoDeck(deck, "2bad", "./slides/Nope.tsx")).toThrow(
    HinoteError,
  );
  expect(() => insertIntoDeck(deck, "alpha", "./slides/alpha.tsx")).toThrow(
    /already/,
  );
  expect(() =>
    insertIntoDeck(
      `import { Beta } from "./slides/Beta.tsx"\n${deck}`,
      "Beta",
      "./slides/Beta.tsx",
    ),
  ).toThrow(/already imported/);
  expect(() =>
    insertIntoDeck(
      `export default createSlide(() => <p />)\n`,
      "Name",
      "./slides/Name.tsx",
    ),
  ).toThrow(/createSlide/);
  expect(() =>
    insertIntoDeck(
      `${deck}\nexport default createSlide([other])\n`,
      "Name",
      "./slides/Name.tsx",
    ),
  ).toThrow(/more than one/);
});

test("places a multiline import before the next statement", () => {
  const source = `/* lead */
import {
  createSlide
} from "hinote"
export default createSlide([
  alpha,
])
`;
  const next = insertIntoDeck(source, "Beta", "./slides/Beta.tsx");
  expect(next.indexOf('import Beta from "./slides/Beta.tsx"')).toBeGreaterThan(
    next.indexOf('from "hinote"'),
  );
  expect(next.indexOf("import Beta")).toBeLessThan(
    next.indexOf("export default"),
  );
});
