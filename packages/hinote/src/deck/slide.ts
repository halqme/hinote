// A slide and its options. Decks are built from slides in create.ts, which
// keeps this module free of deck.ts, since a deck renders slides.
import type { SlideContext, Theme } from "@hinote/types";
import type { Child } from "hono/jsx";
import {
  parseCss,
  type CssInput,
  type CssSource,
  type StyleLayer,
} from "./css.ts";
import { SLIDE_ID } from "../components/link.tsx";
import { HinoteError } from "../errors.ts";
import { isPlainObject } from "../guards.ts";
import { parseTransition, type Transition } from "./transition.ts";
import { cssValue, parseTheme } from "./theme.ts";

// A render function may be async, and so may the components it uses.
export type SlideRender = (slide: SlideContext) => Child | Promise<Child>;

export type SlideOptions = {
  // A name that <Link to> points at. Unique in the deck.
  id?: string;
  notes?: string;
  title?: string;
  background?: string;
  class?: string;
  theme?: Theme;
  // How this slide enters. Defaults to the deck's transition.
  transition?: Transition;
  // CSS for this slide only. It wins over the CSS of the decks around it.
  css?: CssInput;
  // `false` hides the deck's page number on this slide. `true` does nothing
  // unless the deck turned page numbers on.
  pageNumber?: boolean;
};

export type Slide = {
  readonly kind: "slide";
  readonly options: Omit<SlideOptions, "css"> & {
    css?: readonly CssSource[];
  };
  readonly render: SlideRender;
  // CSS of the nested decks around this slide, outermost first.
  readonly styles?: readonly StyleLayer[];
  // Sections of the decks around this slide, outermost first.
  readonly sections?: readonly string[];
};

const OPTION_KEYS = new Set([
  "id",
  "notes",
  "title",
  "background",
  "class",
  "theme",
  "transition",
  "css",
  "pageNumber",
]);

export function isSlide(value: unknown): value is Slide {
  return (
    isPlainObject(value) &&
    value.kind === "slide" &&
    typeof value.render === "function"
  );
}

export function isRender(value: unknown): value is SlideRender {
  return typeof value === "function";
}

export function parseSlideOptions(
  value: Record<string, unknown>,
): Slide["options"] {
  for (const key of Object.keys(value)) {
    if (!OPTION_KEYS.has(key))
      throw new HinoteError(`Unknown slide option "${key}".`);
  }
  const options: Slide["options"] = {};
  if (value.id !== undefined) {
    if (typeof value.id !== "string" || !SLIDE_ID.test(value.id))
      throw new HinoteError(
        'Slide option "id" must be letters, digits, "_", or "-", such as "method".',
      );
    options.id = value.id;
  }
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
  if (value.pageNumber !== undefined) {
    if (typeof value.pageNumber !== "boolean")
      throw new HinoteError('Slide option "pageNumber" must be true or false.');
    options.pageNumber = value.pageNumber;
  }
  return options;
}
