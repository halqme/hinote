import type { HinoteErrorLike } from "@hinote/types";

// An error hinote explains to whoever ran it, person or agent: what went
// wrong, a stable `code` to match on, and a `hint` about what to do next.
export class HinoteError extends Error implements HinoteErrorLike {
  override readonly name = "HinoteError";
  readonly code: string;
  readonly hint?: string;
  // 1 for a problem with the deck or files, 2 for a command used wrongly.
  readonly exitCode: number;

  constructor(
    message: string,
    options: { code?: string; hint?: string; exitCode?: number } = {},
  ) {
    super(message);
    this.code = options.code ?? "error";
    this.hint = options.hint;
    this.exitCode = options.exitCode ?? 1;
  }
}

// HinoteError, or one a @hinote/* package threw without importing hinote.
export function isHinoteError(error: unknown): error is HinoteErrorLike {
  return (
    error instanceof Error &&
    error.name === "HinoteError" &&
    "code" in error &&
    typeof error.code === "string"
  );
}

// A command called with arguments it does not take.
export class UsageError extends HinoteError {
  constructor(message: string, hint?: string) {
    super(message, { code: "usage", hint, exitCode: 2 });
  }
}
