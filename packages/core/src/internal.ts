// What the hinote CLI reads from a deck beyond the public API: recognizing a
// loaded deck, the theme a slide ends up with, and what its HTML holds. It is
// for hinote, which requires this exact version of @hinote/core; nothing here
// is promised to stay between versions.
export { isDeck } from "./deck/create.ts";
export type { Canvas, Deck } from "./deck/deck.ts";
export { defaultTheme, mergeTheme } from "./deck/theme.ts";
export { transitionName } from "./deck/transition.ts";
export { stepsIn } from "./components/step.tsx";
export { HinoteError, isHinoteError } from "./errors.ts";
export { isPlainObject } from "./guards.ts";
