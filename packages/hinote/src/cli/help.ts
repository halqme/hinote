import type { FlagSpec } from "./args.ts";
import type { Command, Group } from "./command.ts";

const GROUPS: Record<Group, string> = {
  porcelain: "Commands:",
  plumbing: "Plumbing (the steps the commands above are made of):",
  agent: "Agents:",
};

const GLOBAL_FLAGS: Record<string, FlagSpec> = {
  json: {
    type: "boolean",
    description:
      'Print JSON on stdout: {"ok", "command", "data"}, or {"ok": false, "error": {"code", "message", "hint"}}.',
  },
  help: { type: "boolean", alias: "h", description: "Show this help." },
};

export const EXIT_CODES =
  "Exit codes: 0 success, 1 a problem with the deck or its files, 2 a command used wrongly.";

// What `hinote` alone, `hinote help`, and `hinote --help` print.
export function overview(
  commands: readonly Command[],
  version: string,
): string {
  const width =
    Math.max(...commands.map((c) => `${c.name} ${c.args}`.length)) + 2;
  const sections = Object.entries(GROUPS).map(([group, label]) =>
    [
      label,
      ...commands
        .filter((c) => c.group === group)
        .map((c) => `  ${`${c.name} ${c.args}`.padEnd(width)}${c.summary}`),
    ].join("\n"),
  );
  return `hinote ${version} - slides written in TSX, served as a Hono app

Usage: hinote <command> [args] [options]

For AI agents, read this first:
  hinote skills get core        How to write and check a deck, for this version
  hinote <command> --help       Options and examples for one command
  --json on any command         JSON on stdout, errors with a code and a hint

${sections.join("\n\n")}
  ${"help [command]".padEnd(width)}Show this, or one command's help

${EXIT_CODES}
`;
}

function flagLines(flags: Record<string, FlagSpec>): string[] {
  const rows = Object.entries(flags).map(([name, flag]) => {
    const names = `${flag.alias ? `-${flag.alias}, ` : ""}--${name}${flag.value ? ` <${flag.value}>` : ""}`;
    const fallback =
      flag.default !== undefined && flag.type !== "boolean"
        ? ` (default: ${flag.default})`
        : "";
    return [names, `${flag.description}${fallback}`] as const;
  });
  const width = Math.max(...rows.map(([names]) => names.length)) + 2;
  return rows.map(([names, text]) => `  ${names.padEnd(width)}${text}`);
}

// What `hinote help <command>` and `hinote <command> --help` print.
export function commandHelp(command: Command): string {
  const flags = flagLines({ ...command.flags, ...GLOBAL_FLAGS });
  const dynamic = command.dynamicHelp?.() ?? { sections: [], examples: [] };
  const sections = dynamic.sections
    .map((section) => `\n${section.title}:\n${section.lines.join("\n")}\n`)
    .join("");
  const examples = [...command.examples, ...dynamic.examples];
  return `hinote ${command.name} - ${command.summary}

Usage: hinote ${command.name} ${command.args}${Object.keys(command.flags).length > 0 ? " [options]" : ""}

${command.description}
${sections}
Options:
${flags.join("\n")}

Examples:
${examples.map((e) => `  ${e}`).join("\n")}
`;
}
