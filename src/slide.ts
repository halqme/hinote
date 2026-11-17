// A slide and its options. Decks are built from slides in create.ts, which
// keeps this module free of deck.ts, since a deck renders slides.
import type { Child } from "hono/jsx";
import {
  parseCss,
  type CssInput,
  type CssSource,
  type StyleLayer,
} from "./css.ts";
import { HinoteError } from "./errors.ts";
import { parseTransition, type Transition } from "./transition.ts";
import { cssValue, parseTheme, type Theme } from "./theme.ts";

// A render function may be async, and so may the components it uses.
export type SlideRender = () => Child | Promise<Child>;

export type SlideOptions = {
  notes?: string;
  title?: string;
  background?: string;
  class?: string;
  theme?: Theme;
  // How this slide enters. Defaults to the deck's transition.
  transition?: Transition;
  // CSS for this slide only. It wins over the CSS of the decks around it.
  css?: CssInput;
};

export type Slide = {
  readonly kind: "slide";
  readonly options: Omit<SlideOptions, "css"> & {
    css?: readonly CssSource[];
  };
  readonly render: SlideRender;
  // CSS of the nested decks around this slide, outermost first.
  readonly styles?: readonly StyleLayer[];
};

const OPTION_KEYS = new Set([
  "notes",
  "title",
  "background",
  "class",
  "theme",
  "transition",
  "css",
]);

export function isSlide(value: unknown): value is Slide {
  return (
    !!value &&
    typeof value === "object" &&
    (value as Slide).kind === "slide" &&
    typeof (value as Slide).render === "function"
  );
}

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function parseSlideOptions(
  value: Record<string, unknown>,
): Slide["options"] {
  for (const key of Object.keys(value)) {
    if (!OPTION_KEYS.has(key))
      throw new HinoteError(`Unknown slide option "${key}".`);
  }
  const options: Slide["options"] = {};
  for (const key of ["notes", "title", "background"] as const) {
    const entry = value[key];
    if (entry === undefined) continue;
    if (typeof entry !== "string")
      throw new HinoteError(`Slide option "${key}" must be a string.`);
    options[key] = key === "background" ? cssValue(entry, "background") : entry;
  }
  if (value.class !== undefined) {
    if (typeof value.class !== "string")
      throw new HinoteError('Slide option "class" must be a string.');
    options.class = value.class;
  }
  if (value.theme !== undefined)
    options.theme = parseTheme(value.theme, "slide theme");
  if (value.transition !== undefined)
    options.transition = parseTransition(
      value.transition,
      'Slide option "transition"',
    );
  if (value.css !== undefined)
    options.css = parseCss(value.css, 'Slide option "css"');
  return options;
}
