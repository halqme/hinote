import { UsageError } from "../errors.ts";

export type FlagSpec = {
  type: "string" | "number" | "boolean";
  alias?: string;
  // Shown by `hinote help <command>`: what the value is, and what it is when
  // the flag is left out.
  description: string;
  value?: string;
  default?: string;
};

export type Parsed = {
  positionals: string[];
  flags: Record<string, string | number | boolean>;
};

// Parses `argv` against the flags a command declares. Every command also takes
// --json and --help. A boolean flag can be turned off with --no-<name>.
export function parseArgs(
  argv: readonly string[],
  spec: Record<string, FlagSpec>,
  command: string,
): Parsed {
  const all: Record<string, FlagSpec> = {
    ...spec,
    json: { type: "boolean", description: "Print machine-readable JSON." },
    help: { type: "boolean", alias: "h", description: "Show this help." },
  };
  const byAlias = new Map(
    Object.entries(all).flatMap(([name, flag]) =>
      flag.alias ? [[flag.alias, name] as const] : [],
    ),
  );
  const parsed: Parsed = { positionals: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg === "--") {
      parsed.positionals.push(...argv.slice(i + 1));
      break;
    }
    if (!arg.startsWith("-") || arg === "-") {
      parsed.positionals.push(arg);
      continue;
    }
    const [raw = "", inline] = arg.replace(/^--?/, "").split(/=(.*)/s, 2);
    const negated =
      raw.startsWith("no-") && all[raw.slice(3)]?.type === "boolean";
    const name = negated
      ? raw.slice(3)
      : arg.startsWith("--")
        ? raw
        : (byAlias.get(raw) ?? raw);
    const flag = all[name];
    if (!flag)
      throw new UsageError(
        `${command} has no option "${arg}".`,
        `Run: hinote help ${command}`,
      );
    if (flag.type === "boolean") {
      parsed.flags[name] = !negated;
      continue;
    }
    const value = inline ?? argv[++i];
    if (value === undefined || (inline === undefined && value.startsWith("-")))
      throw new UsageError(
        `${arg} needs a value.`,
        `Run: hinote help ${command}`,
      );
    if (flag.type === "number") {
      if (!/^\d+$/.test(value))
        throw new UsageError(`${arg} must be a whole number.`);
      parsed.flags[name] = Number(value);
    } else parsed.flags[name] = value;
  }
  return parsed;
}
