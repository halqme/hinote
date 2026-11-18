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
| `title`      | string                            | Its title; the first slide title becomes the page title when the deck has none |
| `notes`      | string                            | Speaker notes, shown only in the presenter view                                |
| `background` | string                            | CSS background of the slide                                                    |
| `class`      | string                            | Class on the slide's `<section>`                                               |
| `theme`      | Theme                             | Tokens for this slide only                                                     |
| `transition` | `"none"` \| `"fade"` \| `"slide"` | How it enters                                                                  |
| `css`        | string \| URL \| array            | CSS for this slide only                                                        |
| `pageNumber` | boolean                           | `false` hides the deck's page number on this slide                             |

Deck options: `title`, `theme`, `transition`, `css`, and, on the top-level deck only, `aspect` (`"16:9"` default, `"4:3"`, or any `"W:H"`), `presenter` (`true` serves the presenter view and sync outside `hinote dev`), and `pageNumber` (`true` paints `n / total` from the flattened order). An unknown option is an error.

## Components

- `<Step as="li" at={2} class="x">` reveals on a key press. Without `at`, steps count 1, 2, 3 in document order. Hidden steps keep their space.
- `<Code lang="ts">{`...`}</Code>` or `<Code lang="ts" code={source} theme={githubLight} />` highlights on the server; the JSX indentation is removed. Size from `typography.code`.
- `<Center>`, `<Row>`, `<Column>` take `gap` (a number is multiples of `spacing.unit`, or a CSS length), `align`, and `justify`. Props become `--hinote-gap` / `--hinote-align` / `--hinote-justify`; the flex rules sit on `.hinote-row` / `.hinote-column` / `.hinote-center` in `@layer hinote`, so deck or slide CSS can override them without `!important`.
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

Each token becomes a CSS variable: `colors.bg` is `--hinote-color-bg`, `typography.h1` is `--hinote-text-h1`, `fonts.mono` is `--hinote-font-mono`, `shadows.md` is `--hinote-shadow-md`, `spacing.unit` is `--hinote-space-unit`, `spacing.safe` is `--hinote-space-safe`, `radius` is `--hinote-radius`. hinote's own styles read the names above except `shadows`. `spacing.safe` defaults to `unit × 6` and is both the slide padding and the safe-area inset that `hinote snapshot` warns about. Lists use `body`. Names of your own work the same way. A preset leaves unset tokens at the default. A nested deck's or slide's theme sets only the tokens it names. Put `data-hinote-bleed` on an element (and its contents) to skip overflow and safe-area reports for intentional full-bleed.

## CSS

- `css` takes text (usually `import style from "./style.css" with { type: "text" }`), a file URL (`new URL("./style.css", import.meta.url)`, needs a file system), or an array of them.
- Selectors are scoped to the slides it belongs to; `&` is the slide's `<section>`.
- Layers: hinote defaults < deck < nested deck < slide, regardless of specificity.
- `@import` is refused; pass several files in an array.
