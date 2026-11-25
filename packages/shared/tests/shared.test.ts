import { expect, test } from "bun:test";
import { isHinoteError } from "@hinote/core/internal";
import { PackageError, dedent } from "../src/index.ts";

test("drops the indentation the surrounding JSX adds", () => {
  expect(
    dedent(`
      if (a) {
        b();
      }
    `),
  ).toBe("if (a) {\n  b();\n}");
  expect(dedent("\tx\n\t\ty")).toBe("x\n  y");
  expect(dedent("")).toBe("");
});

// hinote reports it as its own error, with the package's code and the hint.
test("a PackageError is a HinoteError to hinote", () => {
  const error = new PackageError("<D2> is not valid D2.", "d2", "Fix line 2.");
  expect(isHinoteError(error)).toBe(true);
  expect(error).toMatchObject({
    name: "HinoteError",
    code: "d2",
    hint: "Fix line 2.",
    message: "<D2> is not valid D2.",
  });
});
