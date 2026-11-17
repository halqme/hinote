// An error hinote explains to whoever ran it, person or agent: what went
// wrong, a stable `code` to match on, and a `hint` about what to do next.
export class HinoteError extends Error {
  readonly code: string;
  readonly hint?: string;
  // 1 for a problem with the deck or files, 2 for a command used wrongly.
  readonly exitCode: number;

  constructor(
    message: string,
    options: { code?: string; hint?: string; exitCode?: number } = {},
  ) {
    super(message);
    this.name = "HinoteError";
    this.code = options.code ?? "error";
    this.hint = options.hint;
    this.exitCode = options.exitCode ?? 1;
  }
}

// A command called with arguments it does not take.
export class UsageError extends HinoteError {
  constructor(message: string, hint?: string) {
    super(message, { code: "usage", hint, exitCode: 2 });
  }
}
