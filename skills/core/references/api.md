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

Deck options: `title`, `theme`, `transition`, `css`, and, on the top-level deck only, `aspect` (`"16:9"` default, `"4:3"`, or any `"W:H"`) and `presenter` (`true` serves the presenter view and sync outside `hinote dev`). An unknown option is an error.

## Components

- `<Step as="li" at={2} class="x">` reveals on a key press. Without `at`, steps count 1, 2, 3 in document order. Hidden steps keep their space.
- `<Code lang="ts">{`...`}</Code>` or `<Code lang="ts" code={source} theme={githubLight} />` highlights on the server; the JSX indentation is removed. Size from `typography.code`.
- `<Center>`, `<Row>`, `<Column>` take `gap` (a number is multiples of `spacing.unit`, or a CSS length), `align`, and `justify`.
- `<Script src={new URL("./x.client.tsx", import.meta.url)} />` bundles a file for the browser (see `--ref client`).

## Theme

```ts
{
  colors: { bg, fg, accent, muted, ...yours },
  fonts: { base, heading, mono },
  typography: { h1, h2, body, small, code },
  shadows: { sm, md, lg },
  spacing: { unit },
  radius: "12px",
}
```

Each token becomes a CSS variable: `colors.bg` is `--hinote-color-bg`, `typography.h1` is `--hinote-text-h1`, `fonts.mono` is `--hinote-font-mono`, `shadows.md` is `--hinote-shadow-md`, `spacing.unit` is `--hinote-space-unit`, `radius` is `--hinote-radius`. Names of your own work the same way. A nested deck's or slide's theme sets only the tokens it names.

## CSS

- `css` takes text (usually `import style from "./style.css" with { type: "text" }`), a file URL (`new URL("./style.css", import.meta.url)`, needs a file system), or an array of them.
- Selectors are scoped to the slides it belongs to; `&` is the slide's `<section>`.
- Layers: hinote defaults < deck < nested deck < slide, regardless of specificity.
- `@import` is refused; pass several files in an array.
