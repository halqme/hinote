import {
  Center,
  Morph,
  Progress,
  SectionDots,
  createSlide,
  type SlideContext,
} from "hinote";
import type { Child } from "hono/jsx";

// A printed page: warm paper, ink, and one ultramarine. Headlines are set in
// Instrument Serif, text in Geist, and code in Geist Mono (fonts in style.css).
export const theme = {
  colors: {
    bg: "#f3efe6",
    fg: "#151412",
    accent: "#1f2fc4",
    muted: "#4f4b44",
    surface: "#fbf9f4",
    border: "#d6d0c4",
  },
  fonts: {
    base: "'Geist Variable', system-ui, sans-serif",
    heading: "'Instrument Serif', Georgia, serif",
    mono: "'Geist Mono Variable', ui-monospace, monospace",
  },
  typography: { h1: "8rem", h2: "5.5rem", h3: "3.5rem", body: "2.125rem" },
  spacing: { safe: "calc(var(--hinote-space-unit) * 11)" },
  radius: "2px",
};

// The door inverts the page: ink ground, paper type. Only the tokens it names
// change, so the fonts stay the deck's.
const doorTheme = {
  colors: {
    bg: "#151412",
    fg: "#f3efe6",
    accent: "#b7c0ff",
    muted: "#c9c3b6",
    surface: "#221f1b",
    border: "#3d3933",
  },
};

// Slide CSS, so the size of the section name does not leak onto later pages.
const doorCss = `
  .door-name {
    max-width: 12ch;
    font-family: var(--hinote-font-heading);
    font-style: italic;
    font-size: 11rem;
    line-height: 0.85;
    letter-spacing: -0.04em;
  }

  .door-line {
    max-width: 22ch;
    color: var(--hinote-color-muted);
    font-family: var(--hinote-font-heading);
    font-size: var(--hinote-text-h3);
    line-height: 1.15;
  }
`;

export type Section = {
  // The slide id a contents link points at. The door carries it.
  to: string;
  // `section` on this nested deck. The running head and the door read it back.
  name: string;
  // The door's claim. As the door's title, <Contents> puts it beside the name.
  line: string;
};

// A section opener: its own background, theme, and CSS, and no page number.
// The name is the section the slide receives, not a string copied into the body.
export function door(section: Section) {
  return createSlide(
    {
      id: section.to,
      title: section.line,
      background: "linear-gradient(145deg, #151412 0%, #1c2260 100%)",
      theme: doorTheme,
      css: doorCss,
      pageNumber: false,
      transition: "fade",
      notes:
        "Its own background, theme, and CSS. The page number is hidden here.",
    },
    (slide) => (
      <Center gap={5} align="start" justify="end">
        <p class="door-name">{slide.sections.join(" — ")}</p>
        <p class="door-line">{slide.title}</p>
      </Center>
    ),
  );
}

// The wordmark. <Morph> pairs the slide you leave with the one you enter,
// so this name carries it from the cover into the contents running head.
export const Brand = () => (
  <Morph name="brand">
    <div class="brand">hinote</div>
  </Morph>
);

// The running head. The section name is what the nested deck passed in,
// outermost first, so a slide does not repeat it. The dots count the slides
// of the section, and the rule under the head fills as the talk goes on.
export function Head(props: { slide: SlideContext; brand?: boolean }) {
  return (
    <header class="head">
      <div class="head-row">
        {props.brand ? <Brand /> : <span class="brand is-quiet">hinote</span>}
        <span class="where">
          <span class="section">{props.slide.sections.join(" — ")}</span>
          <SectionDots slide={props.slide} />
        </span>
      </div>
      <Progress slide={props.slide} class="head-rule" />
    </header>
  );
}

// A content page: the running head, a headline with its standfirst, and the
// figure. `wide` puts the figure under the headline instead of beside it.
export function Page(props: {
  slide: SlideContext;
  headline: Child;
  standfirst?: Child;
  wide?: boolean;
  brand?: boolean;
  children?: Child;
}) {
  return (
    <div class="page">
      <Head slide={props.slide} brand={props.brand} />
      <div class={props.wide ? "spread is-wide" : "spread"}>
        {/* The figure comes first in the HTML, so its steps are numbered
            before a step in the standfirst that comments on them. */}
        <figure class="figure">{props.children}</figure>
        <div class="text">
          {props.headline}
          {props.standfirst}
        </div>
      </div>
    </div>
  );
}
