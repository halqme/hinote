import { HinoteError } from "./errors.ts";

// How the next slide enters. Steps inside a slide never animate this way.
export type Transition = "none" | "fade" | "slide";

const TRANSITIONS = new Set<string>(["none", "fade", "slide"]);

export function parseTransition(value: unknown, label: string): Transition {
  if (typeof value !== "string" || !TRANSITIONS.has(value))
    throw new HinoteError(`${label} must be "none", "fade", or "slide".`);
  return value as Transition;
}
