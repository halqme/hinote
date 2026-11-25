import { HinoteError } from "@hinote/core/internal";

export { HinoteError, isHinoteError } from "@hinote/core/internal";

// A command called with arguments it does not take.
export class UsageError extends HinoteError {
  constructor(message: string, hint?: string) {
    super(message, { code: "usage", hint, exitCode: 2 });
  }
}
