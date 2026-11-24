import { isHinoteError } from "../errors.ts";

// Where a command reports. With --json, stdout carries only JSON, one object
// per line: the result as {"ok", "command", "data"}, and, for a command that
// keeps running such as dev, {"event", "data"} lines. Otherwise it is text for
// people.
export type Output = {
  readonly json: boolean;
  // The command's result. `ok: false` reports problems the command found,
  // such as `check` finding a broken slide.
  result(data: unknown, text?: string | readonly string[], ok?: boolean): void;
  // Something that happened while a long-running command runs.
  event(name: string, data: unknown, text: string): void;
  // Output that is the product itself, such as HTML, written as is.
  raw(text: string): void;
};

export function createOutput(command: string, json: boolean): Output {
  const line = (value: unknown) => console.log(JSON.stringify(value));
  return {
    json,
    result(data, text, ok = true) {
      if (json) line({ ok, command, data });
      else if (text !== undefined)
        console.log(typeof text === "string" ? text : text.join("\n"));
    },
    event(name, data, text) {
      if (json) line({ event: name, data });
      else console.log(text);
    },
    raw(text) {
      process.stdout.write(text);
    },
  };
}

// Reports an error the way the command's output does and returns the exit
// code: the error's own, or 1 for one hinote did not expect.
export function reportError(
  error: unknown,
  command: string,
  json: boolean,
): number {
  const known = isHinoteError(error);
  const message = error instanceof Error ? error.message : String(error);
  if (json)
    console.log(
      JSON.stringify({
        ok: false,
        command,
        error: {
          code: known ? error.code : "internal",
          message,
          ...(known && error.hint ? { hint: error.hint } : {}),
        },
      }),
    );
  else {
    console.error(known ? message : error);
    if (known && error.hint) console.error(`hint: ${error.hint}`);
  }
  return known ? (error.exitCode ?? 1) : 1;
}
