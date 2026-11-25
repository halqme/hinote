import { HinoteError } from "../errors.ts";
import { closest, didYouMean } from "../suggest.ts";
import { isPlainObject } from "../guards.ts";

// How the next slide enters. Steps inside a slide never animate this way.
// Forward moves go left or up; going back runs them the other way.
export type TransitionName =
  "none" | "fade" | "slide" | "slide-up" | "zoom" | "wipe";

// A name, or a name with its own timing. `duration` is in milliseconds and
// `easing` is a CSS easing function, such as "ease-out" or
// "cubic-bezier(.2, 0, 0, 1)".
export type Transition =
  TransitionName | { name: TransitionName; duration?: number; easing?: string };

const NAMES: readonly TransitionName[] = [
  "none",
  "fade",
  "slide",
  "slide-up",
  "zoom",
  "wipe",
];

const NAME_LIST = NAMES.map((name) => `"${name}"`).join(", ");

// An easing function is one CSS value, so it may not close the declaration it sits in.
const EASING = /^[\w\s(),.-]+$/;

function parseName(value: unknown, label: string): TransitionName {
  const name = NAMES.find((entry) => entry === value);
  if (!name) {
    const near = typeof value === "string" ? closest(value, NAMES) : undefined;
    throw new HinoteError(`${label} must be one of ${NAME_LIST}.`, {
      hint: near && `Did you mean "${near}"?`,
    });
  }
  return name;
}

export function parseTransition(value: unknown, label: string): Transition {
  if (!isPlainObject(value)) return parseName(value, label);
  for (const key of Object.keys(value)) {
    if (key !== "name" && key !== "duration" && key !== "easing")
      throw new HinoteError(`${label} has an unknown key "${key}".`, {
        hint: didYouMean(key, ["name", "duration", "easing"]),
      });
  }
  const transition: Exclude<Transition, string> = {
    name: parseName(value.name, `${label} "name"`),
  };
  if (value.duration !== undefined) {
    if (
      typeof value.duration !== "number" ||
      !Number.isFinite(value.duration) ||
      value.duration < 0
    )
      throw new HinoteError(
        `${label} "duration" must be milliseconds, a number of 0 or more.`,
      );
    transition.duration = value.duration;
  }
  if (value.easing !== undefined) {
    if (typeof value.easing !== "string" || !EASING.test(value.easing))
      throw new HinoteError(
        `${label} "easing" must be a CSS easing function, such as "ease-out".`,
      );
    transition.easing = value.easing;
  }
  return transition;
}

// The attributes a slide carries for the page to read when it enters.
export function transitionData(
  transition: Transition | undefined,
): Record<string, string | undefined> {
  if (transition === undefined || typeof transition === "string")
    return { "data-transition": transition ?? "none" };
  return {
    "data-transition": transition.name,
    "data-transition-duration":
      transition.duration === undefined
        ? undefined
        : `${transition.duration}ms`,
    "data-transition-easing": transition.easing,
  };
}

export function transitionName(transition: Transition): TransitionName {
  return typeof transition === "string" ? transition : transition.name;
}
