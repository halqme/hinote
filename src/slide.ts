import type { Child } from "hono/jsx";
import { HinoteError } from "./errors.ts";
import { cssValue, parseThemeOverride, type ThemeOverride } from "./theme.ts";

export type SlideRender = () => Child;

export type SlideOptions = {
  notes?: string;
  title?: string;
  background?: string;
  class?: string;
  theme?: ThemeOverride;
};

export type Slide = {
  readonly kind: "slide";
  readonly options: SlideOptions;
  readonly render: SlideRender;
};

export type Deck = {
  readonly kind: "deck";
  readonly slides: readonly Slide[];
};

export type SlideInput = Slide | Deck;

const OPTION_KEYS = new Set(["notes", "title", "background", "class", "theme"]);

export function isSlide(value: unknown): value is Slide {
  return (
    !!value &&
    typeof value === "object" &&
    (value as Slide).kind === "slide" &&
    typeof (value as Slide).render === "function"
  );
}

export function isDeck(value: unknown): value is Deck {
  return (
    !!value &&
    typeof value === "object" &&
    (value as Deck).kind === "deck" &&
    Array.isArray((value as Deck).slides)
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseOptions(value: Record<string, unknown>): SlideOptions {
  for (const key of Object.keys(value)) {
    if (!OPTION_KEYS.has(key))
      throw new HinoteError(`Unknown slide option "${key}".`);
  }
  const options: SlideOptions = {};
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
    options.theme = parseThemeOverride(value.theme, "slide theme");
  return options;
}

function flatten(nodes: readonly unknown[]): Slide[] {
  const slides: Slide[] = [];
  for (const node of nodes) {
    if (isSlide(node)) slides.push(node);
    else if (isDeck(node)) slides.push(...node.slides);
    else
      throw new HinoteError(
        "createSlide() arrays can only contain slides or decks.",
      );
  }
  return slides;
}

export function createSlide(render: SlideRender): Slide;
export function createSlide(options: SlideOptions, render: SlideRender): Slide;
export function createSlide(nodes: readonly SlideInput[]): Deck;
export function createSlide(first?: unknown, second?: unknown): Slide | Deck {
  if (typeof first === "function" && second === undefined) {
    return { kind: "slide", options: {}, render: first as SlideRender };
  }
  if (Array.isArray(first) && second === undefined) {
    return { kind: "deck", slides: flatten(first) };
  }
  if (
    isPlainObject(first) &&
    !isSlide(first) &&
    !isDeck(first) &&
    typeof second === "function"
  ) {
    return {
      kind: "slide",
      options: parseOptions(first),
      render: second as SlideRender,
    };
  }
  throw new HinoteError(
    "createSlide() expects a render function, options plus a render function, or an array of slides.",
  );
}

export function collectSlides(value: unknown): Slide[] {
  if (isSlide(value)) return [value];
  if (isDeck(value)) return [...value.slides];
  throw new HinoteError(
    "The deck default export must be a createSlide() result.",
  );
}
