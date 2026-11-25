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

The render function receives `{ title, sections, contents, number, total }`: its own `title`, the `section` of each deck around it, outermost first, `contents`, the sections of the whole deck for a table of contents (see `<Contents>`), and `number` and `total`, its place in the flattened deck from 1, as in `/3`, and how many slides there are. A shared heading can read them instead of repeating the title in the options and the body:

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
- `<Contents slide={slide} />` lists the sections of the whole deck, each nested deck with a `section`, in order, so a table of contents needs no list of its own and follows the deck when a section is added. Each entry is the section name (`.hinote-contents-name`) and the title of its first slide (`.hinote-contents-title`), and links to that slide when it has an `id`, as `<Link>` does; without one the entry is text. Sections nested inside sections are a nested list; `depth={1}` lists only the outermost. `skipCurrent` leaves out the section the slide is in, the innermost one, such as the section a contents page sits in itself. The section the slide is in is `li.is-current` with `aria-current="true"` (an accent name), so the same component shows where the talk is on a slide inside a section. The markup is `nav.hinote-contents > ol > li.hinote-contents-item > .hinote-contents-entry`, styled in `@layer hinote`; `class` goes on the `nav`. Two nested decks with one `section` next to each other are one entry. For markup of your own, read `slide.contents`: entries of `{ name, title?, id?, first, count, current, sections }`, where `first` is the number of the section's first slide and `count` how many slides it has, nested sections included.
- `<SectionBar slide={slide} />`, `<SectionDots slide={slide} />`, and `<Progress slide={slide} />` show where the talk is, for a running head or footer. SectionBar puts the outermost sections in a row (`nav.hinote-section-bar`), each linked to its first slide when that slide has an `id`, the current one `li.is-current` in accent. SectionDots draws one dot for each slide of the innermost section the slide is in (`ol.hinote-section-dots`), this slide's `li.is-current` filled, and nothing outside every section. Progress is a bar (`.hinote-progress`, `role="progressbar"`) filled to `number / total` through `--hinote-progress`, with a tick (`.hinote-progress-tick`, at `--hinote-at`) where each outermost section after the first slide starts. They take `class`, and their rules are in `@layer hinote`.
- `<Flow emphasis={2} gap={2}>` lays its children out in a row as boxes (`.hinote-flow-box`) with an arrow (`.hinote-flow-arrow`) between each pair, so two boxes and three boxes are the same component. `emphasis` is the box to emphasize, counted from 1 (`.is-emphasis`, an accent border). The arrow is `.hinote-flow-arrow::before` content; arrows, boxes, and emphasis live in `@layer hinote`, so deck CSS can restyle them without `!important`.
- `<Table widths={[2, 1, 1]} emphasis={[2]}>` wraps ordinary `<thead>` / `<tbody>` / `<tr>` markup. `widths` is the column ratio: one `<col>` per number, each with `--hinote-column-width` as a percentage, and a fixed table layout. `emphasis` lists body rows to emphasize, counted from 1 and skipping `thead` (`tr.is-emphasis`: surface background, bold, an accent bar). Without either prop the table still gets theme borders and padding. Every rule is in `@layer hinote`, so deck CSS such as `.hinote-table col:first-child{width:50%}` overrides it without `!important`. A row number the table does not have, or a width that is not positive, is an error.
- `<Grid columns={2} gap={3}>` sets the column track count (`--hinote-grid-columns`) and gap. `<Card span={2}>` is one cell: each child is a row (`.hinote-card-cell`). Cards use `grid-template-rows: subgrid` so a band of cards shares heading/body row heights. `<Card footer={<small>Source</small>}>` adds one more row (`.hinote-card-footer`) that is always the card's last; every Card in a Grid spans the most rows any of them has (`--hinote-grid-rows`), so footers line up across columns however long the bodies are. A component that wraps a Card is not counted, so put Cards directly in the Grid (or in a `<Morph>`) when footers must align. Chrome for `.hinote-grid` / `.hinote-card` lives in `@layer hinote` (surface, border, radius, cell padding from spacing tokens); deck CSS can restyle without `!important`.
- `<Script src={new URL("./x.client.tsx", import.meta.url)} />` bundles a file for the browser (see `--ref client`).

## Theme

```ts
import { themes } from "hinote";

// themes.ink (default dark), themes.paper (warm light), themes.slate (cool light)
createSlide({ theme: themes.paper }, [/* slides */]);
```

```ts
{
  colors: { bg, fg, accent, muted, surface, border, ...yours },
  fonts: { base, heading, mono },
  typography: { h1, h2, h3, body, small, code },
  shadows: { sm, md, lg },
  spacing: { unit, safe },
  radius: "12px",
}
```

Each token becomes a CSS variable: `colors.bg` is `--hinote-color-bg`, `typography.h1` is `--hinote-text-h1`, `fonts.mono` is `--hinote-font-mono`, `shadows.md` is `--hinote-shadow-md`, `spacing.unit` is `--hinote-space-unit`, `spacing.safe` is `--hinote-space-safe`, `radius` is `--hinote-radius`. hinote's own styles read the names above except `shadows`. `spacing.safe` defaults to `unit × 6` and is both the slide padding and the safe-area inset that `hinote snapshot` warns about. Padding set in deck CSS does not change it, so set `spacing.safe` to match. Lists use `body`. Names of your own work the same way. A preset leaves unset tokens at the default. A nested deck's or slide's theme sets only the tokens it names. Put `data-hinote-bleed` on an element (and its contents) to skip overflow and safe-area reports for intentional full-bleed.

## CSS

- `css` takes text (usually `import style from "./style.css" with { type: "text" }`), a file URL (`new URL("./style.css", import.meta.url)`, needs a file system), or an array of them.
- Selectors are scoped to the slides it belongs to; `&` is the slide's `<section>`.
- Layers: hinote defaults < deck < nested deck < slide, regardless of specificity.
- `@import` is refused; pass several files in an array. `@keyframes`, `@font-face`, and similar rules work anywhere in the file.
- Without `with { type: "text" }` the import is an object, which hinote refuses with a hint. The CLI, Bun, esbuild, and Wrangler all read the attribute.
- `url()` resolves from the deck file's directory. Deck CSS never reaches the presenter panel.
