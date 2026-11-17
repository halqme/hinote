import type { Child } from "hono/jsx";
import { Deck, parseDeckOptions, type DeckOptions } from "./deck.ts";
import { HinoteError } from "./errors.ts";
import { parseTransition, type Transition } from "./transition.ts";
import { cssValue, mergeTheme, parseTheme, type Theme } from "./theme.ts";

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
};

export type Slide = {
  readonly kind: "slide";
  readonly options: SlideOptions;
  readonly render: SlideRender;
};

export type SlideInput = Slide | Deck;

const OPTION_KEYS = new Set([
  "notes",
  "title",
  "background",
  "class",
  "theme",
  "transition",
]);

export function isSlide(value: unknown): value is Slide {
  return (
    !!value &&
    typeof value === "object" &&
    (value as Slide).kind === "slide" &&
    typeof (value as Slide).render === "function"
  );
}

// Duck-typed because `hinote dev` loads the deck with its own bundled copy of hinote.
export function isDeck(value: unknown): value is Deck {
  return (
    !!value &&
    typeof value === "object" &&
    (value as Deck).kind === "deck" &&
    Array.isArray((value as Deck).slides) &&
    typeof (value as Deck).fetch === "function"
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
    options.theme = parseTheme(value.theme, "slide theme");
  if (value.transition !== undefined)
    options.transition = parseTransition(
      value.transition,
      'Slide option "transition"',
    );
  return options;
}

// A nested deck lends its theme and transition to its slides; a slide's own still wins.
function nestedSlides(deck: Deck): Slide[] {
  if (deck.config.title !== undefined || deck.config.aspect !== undefined)
    throw new HinoteError(
      'Deck options "title" and "aspect" can only be set on the top-level deck.',
    );
  const { theme, transition } = deck.config;
  if (!theme && !transition) return [...deck.slides];
  return deck.slides.map((slide) => {
    const options = { ...slide.options };
    if (theme) options.theme = mergeTheme(theme, slide.options.theme);
    options.transition ??= transition;
    return { ...slide, options };
  });
}

function flatten(nodes: readonly unknown[]): Slide[] {
  const slides: Slide[] = [];
  for (const node of nodes) {
    if (isSlide(node)) slides.push(node);
    else if (isDeck(node)) slides.push(...nestedSlides(node));
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
export function createSlide(
  options: DeckOptions,
  nodes: readonly SlideInput[],
): Deck;
export function createSlide(first?: unknown, second?: unknown): Slide | Deck {
  if (typeof first === "function" && second === undefined) {
    return { kind: "slide", options: {}, render: first as SlideRender };
  }
  if (Array.isArray(first) && second === undefined) {
    return new Deck(flatten(first));
  }
  if (
    isPlainObject(first) &&
    !isSlide(first) &&
    !isDeck(first) &&
    Array.isArray(second)
  ) {
    return new Deck(flatten(second), parseDeckOptions(first));
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
    "createSlide() expects a render function or an array of slides, optionally after an options object.",
  );
}
