import type { HinoteErrorLike } from "@hinote/types";

// The error a @hinote/* package throws. hinote reports an error with this
// name as its own, message and hint included, without the package importing
// hinote. `code` names the package, such as "d2".
export class PackageError extends Error implements HinoteErrorLike {
  override readonly name = "HinoteError";

  constructor(
    message: string,
    readonly code: string,
    readonly hint?: string,
  ) {
    super(message);
  }
}

// Source written inside a template literal carries the indentation of the JSX
// around it. Drop blank lines at both ends and the indentation every line shares.
export function dedent(source: string): string {
  const lines = source.replace(/\t/g, "  ").split("\n");
  while (lines.length > 0 && lines[0]?.trim() === "") lines.shift();
  while (lines.length > 0 && lines.at(-1)?.trim() === "") lines.pop();
  const indent = Math.min(
    ...lines
      .filter((line) => line.trim() !== "")
      .map((line) => line.length - line.trimStart().length),
  );
  return lines.map((line) => line.slice(indent)).join("\n");
}
