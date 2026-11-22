# hinote API

Everything comes from `import { ... } from "hinote"`; code themes from `"hinote/code-themes"`.

## createSlide

| Call                                | Result                                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------------------- |
| `createSlide(render)`               | A slide                                                                                      |
| `createSlide(slideOptions, render)` | A slide with options                                                                         |
| `createSlide([slide, deck, ...])`   | A deck; nested decks are flattened in order. Pass a deck as it is; do not map it into slides |
| `createSlide(deckOptions, [...])`   | A deck with options                                                                          |

Slide options:

| Option       | Type                              | Meaning                                                                        |
| ------------ | --------------------------------- | ------------------------------------------------------------------------------ |
| `id`         | string                            | A name `<Link to>` points at: letters, digits, `_`, `-`; unique in the deck    |
| `title`      | string                            | Its title; the first slide title becomes the page title when the deck has none |
| `notes`      | string                            | Speaker notes, shown only in the presenter view                                |
| `background` | string                            | CSS background of the slide                                                    |
| `class`      | string                            | Class on the slide's `<section>`                                               |
| `theme`      | Theme                             | Tokens for this slide only                                                     |
| `transition` | `"none"` \| `"fade"` \| `"slide"` | How it enters                                                                  |
| `css`        | string \| URL \| array            | CSS for this slide only                                                        |
| `pageNumber` | boolean                           | `false` hides the deck's page number on this slide                             |

The render function receives `{ title, sections }`: its own `title`, and the `section` of each deck around it, outermost first. A shared heading can read them instead of repeating the title in the options and the body:

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

Deck options: `title`, `section` (a name its slides receive in `sections`), `theme`, `transition`, `css`, and, on the top-level deck only, `lang` (a language tag such as `"ja"` or `"ja-JP"`; `<html>` has no `lang` when it is omitted; when its primary subtag is `ja`, slide text breaks between phrases with `word-break: auto-phrase`, while `pre` and `code` keep normal breaking), `aspect` (`"16:9"` default, `"4:3"`, or any `"W:H"`), `presenter` (`true` serves the presenter view and sync outside `hinote dev`), and `pageNumber` (`true` paints `n / total` from the flattened order). An unknown option is an error.

## Components

- `<Step as="li" at={2} class="x">` reveals on a key press. Without `at`, steps count 1, 2, 3 in document order, also inside async components. Hidden steps keep their space (`opacity: 0`, `visibility: hidden`) and fade in over 0.2 s. `→` reveals the next step, then moves on; `←` hides them in reverse, and from the first step lands on the previous slide with every step shown. Printing and `snapshot` show every step; `transition` does not animate steps, and nothing animates under reduced motion.
- `<Code lang="ts">{`...`}</Code>` or `<Code lang="ts" code={source} theme={githubLight} />` highlights on the server with `@pierre/highlights`, colors inline, so the page runs no highlighter; the JSX indentation is removed. Themes come from `hinote/code-themes`; the default is Pierre's dark theme. Size from `typography.code`. The highlighter is WebAssembly, loaded on the first `<Code>`, so a deck without code runs on hosts that refuse WebAssembly.
- `<Center>`, `<Row>`, `<Column>` take `gap` (a number is multiples of `spacing.unit`, or a CSS length), `align`, and `justify`. Props become `--hinote-gap` / `--hinote-align` / `--hinote-justify`; the flex rules sit on `.hinote-row` / `.hinote-column` / `.hinote-center` in `@layer hinote`, so deck or slide CSS can override them without `!important`.
- `<Link to="method">Method</Link>` links to the slide whose `id` option is `"method"`, wherever it is, including inside a nested deck, so the link survives slides being added before it. The href is the URL of that slide on the page being rendered (`/3`, `/presenter/3`, a mounted base such as `/talk/3`, `/3/` when prerendered, `#3` in the built file). A plain click moves there without reloading; a modified or middle click opens it in a new tab. Two slides with one id, or a link to an id no slide has, is an error when the deck renders.
- `<Flow emphasis={2} gap={2}>` lays its children out in a row as boxes (`.hinote-flow-box`) with an arrow (`.hinote-flow-arrow`) between each pair, so two boxes and three boxes are the same component. `emphasis` is the box to emphasize, counted from 1 (`.is-emphasis`, an accent border). The arrow is `.hinote-flow-arrow::before` content; arrows, boxes, and emphasis live in `@layer hinote`, so deck CSS can restyle them without `!important`.
- `<Table widths={[2, 1, 1]} emphasis={[2]}>` wraps ordinary `<thead>` / `<tbody>` / `<tr>` markup. `widths` is the column ratio: one `<col>` per number, each with `--hinote-column-width` as a percentage, and a fixed table layout. `emphasis` lists body rows to emphasize, counted from 1 and skipping `thead` (`tr.is-emphasis`: surface background, bold, an accent bar). Without either prop the table still gets theme borders and padding. Every rule is in `@layer hinote`, so deck CSS such as `.hinote-table col:first-child{width:50%}` overrides it without `!important`. A row number the table does not have, or a width that is not positive, is an error.
- `<Grid columns={2} gap={3}>` sets the column track count (`--hinote-grid-columns`) and gap. `<Card span={2}>` is one cell: each child is a row (`.hinote-card-cell`). Cards use `grid-template-rows: subgrid` so a band of cards shares heading/body row heights. `<Card footer={<small>Source</small>}>` adds one more row (`.hinote-card-footer`) that is always the card's last; every Card in a Grid spans the most rows any of them has (`--hinote-grid-rows`), so footers line up across columns however long the bodies are. A component that wraps a Card is not counted, so put Cards directly in the Grid when footers must align. Chrome for `.hinote-grid` / `.hinote-card` lives in `@layer hinote` (surface, border, radius, cell padding from spacing tokens); deck CSS can restyle without `!important`.
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
