// createSlide builds both slides and decks, so it depends on deck.ts, which
// depends on slide.ts; neither of those depends back on this module.
import { Deck, parseDeckOptions, type DeckOptions } from "./deck.ts";
import type { StyleLayer } from "./css.ts";
import { HinoteError } from "../errors.ts";
import { isPlainObject } from "../guards.ts";
import {
  isRender,
  isSlide,
  parseSlideOptions,
  type Slide,
  type SlideOptions,
  type SlideRender,
} from "./slide.ts";
import { mergeTheme } from "./theme.ts";

export type SlideInput = Slide | Deck;

// Duck-typed because `hinote dev` loads the deck with its own bundled copy of hinote.
export function isDeck(value: unknown): value is Deck {
  return (
    isPlainObject(value) &&
    value.kind === "deck" &&
    Array.isArray(value.slides) &&
    typeof value.fetch === "function"
  );
}

// A nested deck lends its theme, transition, and CSS to its slides; a slide's own still wins.
function nestedSlides(deck: Deck): Slide[] {
  if (
    deck.config.title !== undefined ||
    deck.config.lang !== undefined ||
    deck.config.aspect !== undefined ||
    deck.config.presenter !== undefined ||
    deck.config.pageNumber !== undefined
  )
    throw new HinoteError(
      'Deck options "title", "lang", "aspect", "presenter", and "pageNumber" can only be set on the top-level deck.',
    );
  const { theme, transition, css } = deck.config;
  if (!theme && !transition && !css) return [...deck.slides];
  const layer: StyleLayer | undefined = css && { sources: css };
  return deck.slides.map((slide) => {
    const options = { ...slide.options };
    if (theme) options.theme = mergeTheme(theme, slide.options.theme);
    options.transition ??= transition;
    const styles = layer ? [layer, ...(slide.styles ?? [])] : slide.styles;
    return { ...slide, options, styles };
  });
}

function inSection(slides: Slide[], section: string | undefined): Slide[] {
  if (section === undefined) return slides;
  return slides.map((slide) => ({
    ...slide,
    sections: [section, ...(slide.sections ?? [])],
  }));
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
/** A deck. Nested decks in `nodes` are flattened in order. Pass a deck as it is; do not map or flatMap it into slides yourself. */
export function createSlide(nodes: readonly SlideInput[]): Deck;
/** A deck with options. Nested decks in `nodes` are flattened in order. Pass a deck as it is; do not map or flatMap it into slides yourself. */
export function createSlide(
  options: DeckOptions,
  nodes: readonly SlideInput[],
): Deck;
export function createSlide(first?: unknown, second?: unknown): Slide | Deck {
  if (isRender(first) && second === undefined) {
    return { kind: "slide", options: {}, render: first };
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
    const options = parseDeckOptions(first);
    return new Deck(inSection(flatten(second), options.section), options);
  }
  if (
    isPlainObject(first) &&
    !isSlide(first) &&
    !isDeck(first) &&
    isRender(second)
  ) {
    return {
      kind: "slide",
      options: parseSlideOptions(first),
      render: second,
    };
  }
  throw new HinoteError(
    "createSlide() expects a render function or an array of slides, optionally after an options object.",
  );
}
