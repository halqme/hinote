import { expect, spyOn, test } from "bun:test";
import { reportError } from "../src/cli/output.ts";

function reported(error: unknown) {
  const log = spyOn(console, "log").mockImplementation(() => {});
  try {
    const exitCode = reportError(error, "check", true);
    const output: unknown = JSON.parse(String(log.mock.calls[0]?.[0]));
    return { exitCode, output };
  } finally {
    log.mockRestore();
  }
}

// A @hinote/* package cannot import hinote's HinoteError, so it throws a plain
// Error with the same name and fields.
test("an error named HinoteError from another package is reported with its code and hint", () => {
  const error = Object.assign(new Error("<Math> could not parse \\frac{"), {
    name: "HinoteError",
    code: "math-parse",
    hint: "Close the brace.",
  });
  expect(reported(error)).toEqual({
    exitCode: 1,
    output: {
      ok: false,
      command: "check",
      error: {
        code: "math-parse",
        message: "<Math> could not parse \\frac{",
        hint: "Close the brace.",
      },
    },
  });
});

test("any other error is reported as internal", () => {
  const { exitCode, output } = reported(new Error("boom"));
  expect(exitCode).toBe(1);
  expect(output).toMatchObject({
    error: { code: "internal", message: "boom" },
  });
});
