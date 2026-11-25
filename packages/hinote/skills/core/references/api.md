# hinote API

Everything comes from `import { ... } from "hinote"`. Components that need a larger dependency are in packages of their own; `hinote skills` lists their guides.

## createSlide

| Call                                | Result                                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------------------- |
| `createSlide(render)`               | A slide                                                                                      |
| `createSlide(slideOptions, render)` | A slide with options                                                                         |
| `createSlide([slide, deck, ...])`   | A deck; nested decks are flattened in order. Pass a deck as it is; do not map it into slides |
| `createSlide(deckOptions, [...])`   | A deck with options                                                                          |

Slide options:

| Option       | Type                                 | Meaning                                                                                                           |
| ------------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `id`         | string                               | A name `<Link to>` points at: letters, digits, `_`, `-`; unique in the deck                                       |
| `title`      | string                               | Its title, shown in the presenter's overview. The first slide title becomes the page title when the deck has none |
| `notes`      | string                               | Speaker notes, shown only in the presenter view; a Markdown subset, see below                                     |
| `background` | string                               | CSS background of the slide                                                                                       |
| `class`      | string                               | Class on the slide's `<section>`                                                                                  |
| `theme`      | Theme                                | Tokens for this slide only                                                                                        |
| `transition` | name \| `{ name, duration, easing }` | How it enters; see Transitions below                                                                              |
| `css`        | string \| URL \| array               | CSS for this slide only                                                                                           |
| `pageNumber` | boolean                              | `false` hides the deck's page number on this slide                                                                |

The render function receives `{ title, sections, contents }`: its own `title`, the `section` of each deck around it, outermost first, and `contents`, the sections of the whole deck for a table of contents (see `<Contents>`). A shared heading can read them instead of repeating the title in the options and the body:

```tsx
const Heading = ({ title, sections }: SlideContext) => (
  <h2>{[...sections, title].join("　")}</h2>
);
const results = createSlide({ title: "結果" }, (slide) => (
  <Column>
    <Heading {...slide} />
  </Column>
));
export default createSlide({ section: "実験1-1" }, [results]);
```

### Transitions

`transition` is one of `"none"` (default), `"fade"`, `"slide"` (the next slide pushes in from the right), `"slide-up"` (from below), `"zoom"` (the old slide grows and fades past, the next one grows into place), or `"wipe"` (the next slide is revealed from the right edge over the old one). Going back runs a transition the other way. `{ name: "zoom", duration: 600, easing: "ease-out" }` sets its own timing: `duration` in milliseconds (0.35 s by default) and `easing` a CSS easing function (`ease` by default). The slide entering decides, so a slide's own transition wins over the deck's. Transitions use the View Transitions API; a browser without it, and a reader who prefers reduced motion, gets an instant change.

Notes are plain text with a small part of Markdown: `#` headings, `-` / `*` / `+` and `1.` lists, blank lines between paragraphs, and `**strong**`, `*em*`, and `` `code` `` inside a line. Notes without any of that look as before, line breaks included. HTML in a note is shown as text and never runs. `inspect --json` returns the note string as written.

Deck options: `section` (a name its slides receive in `sections`), `theme`, `transition`, and `css`, which a nested deck lends to its slides and a slide's own win over, and `document`, which only the top-level deck, the one `deck.tsx` exports, may set. A nested deck that sets `document` is an error (`deck-option`).

```tsx
export default createSlide(
  { document: { title: "Talk", lang: "ja", pageNumber: true }, theme, css },
  [cover, results],
);
```

`document` holds what the page has once: `title` (the page title; the first slide title when omitted), `lang` (a language tag such as `"ja"` or `"ja-JP"`; `<html>` has no `lang` when it is omitted; when its primary subtag is `ja`, slide text breaks between phrases with `word-break: auto-phrase`, while `pre` and `code` keep normal breaking), `aspect` (`"16:9"` default, `"4:3"`, or any `"W:H"`), `presenter` (`true` serves the presenter view and sync outside `hinote dev`), and `pageNumber` (`true` paints `n / total` from the flattened order). An unknown option, in the deck or in `document`, is an error.

## Components

- `<Step as="li" at={2} class="x">` reveals on a key press. Without `at`, steps count 1, 2, 3 in document order, also inside async components. Hidden steps keep their space (`opacity: 0`, `visibility: hidden`) and fade in over 0.2 s. `effect` adds motion to the fade: `"up"`, `"down"`, `"left"`, and `"right"` move it 0.6 em that way into place, and `"zoom"` grows it from 85 %. They use CSS `translate` and `scale`, so an inline element such as `<Step as="span">` only fades; give it `display: inline-block` to move. A hand-written step takes the same `data-hinote-effect="up"`. `→` reveals the next step, then moves on; `←` hides them in reverse, and from the first step lands on the previous slide with every step shown. Printing and `snapshot` show every step; `transition` does not animate steps, and nothing animates under reduced motion.
- `<Morph name="title"><h1>…</h1></Morph>` names the one element inside, an HTML element or a component's such as `<Card>`, `<Code>`, or `<D2>`, so it moves and resizes into the element of the same name on the slide you go to, as Keynote's Magic Move does, while the rest of the slide follows the transition. It adds no element of its own: the wrapped element keeps its place in the layout, and a Grid still counts a Card inside it. It pairs only elements shown on both sides, so one in a step not yet revealed is left out. Pairs morph even when the slide's transition is `"none"`. The element itself is what moves, so name the box you see, not a full-width wrapper: a block `<div>` around a small picture morphs as a wide strip. Names are letters, digits, `_`, and `-`; one slide using a name twice, or a Morph around text, nothing, or more than one element (a component that renders several counts as several), is an error when it renders. Wrapping a Grid names the Grid itself; its Cards keep their rows. A hand-written element takes the same `data-hinote-morph="title"`. Under reduced motion or without the View Transitions API the slide changes at once.
- `<Steps count={2} class="x">` takes the next steps in document order for code in the page to play, such as a chart that changes at each, and hides nothing. Its script reads them with `hinote.observe`.
- `<Center>`, `<Row>`, `<Column>` take `gap` (a number is multiples of `spacing.unit`, or a CSS length), `align`, and `justify`. Props become `--hinote-gap` / `--hinote-align` / `--hinote-justify`; the flex rules sit on `.hinote-row` / `.hinote-column` / `.hinote-center` in `@layer hinote`, so deck or slide CSS can override them without `!important`.
- `<Link to="method">Method</Link>` links to the slide whose `id` option is `"method"`, wherever it is, including inside a nested deck, so the link survives slides being added before it. The href is the URL of that slide on the page being rendered (`/3`, `/presenter/3`, a mounted base such as `/talk/3`, `/3/` when prerendered, `#3` in the built file). A plain click moves there without reloading; a modified or middle click opens it in a new tab. Two slides with one id, or a link to an id no slide has, is an error when the deck renders.
- `<Contents slide={slide} />` lists the sections of the whole deck, each nested deck with a `section`, in order, so a table of contents needs no list of its own and follows the deck when a section is added. Each entry is the section name (`.hinote-contents-name`) and the title of its first slide (`.hinote-contents-title`), and links to that slide when it has an `id`, as `<Link>` does; without one the entry is text. Sections nested inside sections are a nested list; `depth={1}` lists only the outermost. The section the slide is in is `li.is-current` with `aria-current="true"` (an accent name), so the same component shows where the talk is on a slide inside a section. The markup is `nav.hinote-contents > ol > li.hinote-contents-item > .hinote-contents-entry`, styled in `@layer hinote`; `class` goes on the `nav`. Two nested decks with one `section` next to each other are one entry. For markup of your own, read `slide.contents`: entries of `{ name, title?, id?, current, sections }`.
