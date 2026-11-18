import { HinoteError } from "../errors.ts";

// How the next slide enters. Steps inside a slide never animate this way.
export type Transition = "none" | "fade" | "slide";

const TRANSITIONS: readonly Transition[] = ["none", "fade", "slide"];

export function parseTransition(value: unknown, label: string): Transition {
  const transition = TRANSITIONS.find((name) => name === value);
  if (!transition)
    throw new HinoteError(`${label} must be "none", "fade", or "slide".`);
  return transition;
}
