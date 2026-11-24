import type { FlagSpec, Parsed } from "./args.ts";
import type { Output } from "./output.ts";

// "porcelain" commands are what people run; each is made of "plumbing"
// commands, which do one step each and can be run on their own.
export type Group = "porcelain" | "plumbing" | "agent";

export type Command = {
  name: string;
  group: Group;
  // One line for the command list.
  summary: string;
  // The arguments after the name, as `hinote help` shows them.
  args: string;
  // At most this many arguments.
  maxArgs: number;
  // Paragraphs for `hinote help <command>`.
  description: string;
  flags: Record<string, FlagSpec>;
  examples: string[];
  // Bundles TSX, which on Node needs esbuild (see handOffToBun in cli.ts).
  bundles?: boolean;
  // Returns the exit code; nothing means 0.
  run(args: Parsed, out: Output): Promise<number | void>;
};
