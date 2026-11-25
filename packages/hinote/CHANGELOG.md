# Changelog

What changed in each published version of hinote. Newest first. The GitHub release for a version uses that version's section as its body.

## Unreleased

- `<D2>` no longer paints its theme's background, which was white with the default theme and could not be changed from deck CSS: the slide shows through the diagram. `background` keeps the theme's.
- A relative path through `node_modules` may name a file of an installed package, such as a font, even when the package manager links it from a store outside the deck directory (Bun, pnpm). Other links that lead out of the deck directory are still refused.
- `<Morph name="title">` moves and resizes an element into the one with the same name on the next slide, with the View Transitions API. Pairs morph whatever the slide's transition, and the rest of the slide follows the transition.
- Slide transitions add `"slide-up"`, `"zoom"`, and `"wipe"`, and take their own timing as `{ name, duration, easing }`.
- `<Step effect>` moves a step into place as it fades in: `"up"`, `"down"`, `"left"`, `"right"`, or `"zoom"`. Steps no longer fade under reduced motion.
- `hinote skills get talk` is a guide to planning a talk before and while writing the deck: how many slides the time allows, the order of the story, what goes on one slide, layout, color, and steps. `--ref delivery` covers rehearsal, the day of the talk, and questions.
- The CLI bundles decks and `<Script>` files with Rolldown on Bun and Node alike, and hinote installs it. On Node it serves with `node:http`. `esbuild` and `@hono/node-server` are no longer peer dependencies, `hinote init` no longer adds them, and the CLI no longer hands a run to Bun when they are missing. A deck that installed them for hinote can remove them.
- `hinote check` no longer hangs on JSX written in a prop after a sibling element, such as `<p>lead</p><Card footer={<p>2020</p>}>`. The source checks read the file with the parser Rolldown comes with.
- `hinote build` floats previous and next icons over the slide. They reveal a step before moving on, and stay hidden until the pointer moves. The audience page (`/`) enters full screen from the fullscreen icon or `F`. The icon switches to leave full screen, and stays hidden until the pointer moves. The presenter has neither.
- The presenter view puts the timer, a progress mark for each slide, a preview of the next key press, and the notes in the side column. Notes are the same size as the panel text and take no space when a slide has none. Prev, Next, Overview, and Laser sit under the slide. `P` and `←` go back, `N` and `→` go forward, `O` opens the overview, and `L` toggles the laser. Those letters and arrows are underlined on the buttons. The overview lists titles.
- Layout props are typed to what renders: `align` and `justify` take their CSS keywords, `gap` a number or a length with its unit (`"1.5rem"`, `var(...)`, `calc(...)`), and `<Step as>` and `<Steps as>` an HTML element. A misspelled keyword or a unitless `gap="2"` is a type error, and `gap="2"` is also an error at render with how to write it. A nested deck that sets a top-level option names it, with code `deck-option` and where it belongs.
- `hinote inspect` shows the outline: each slide indented under the sections of its nested decks, with its `id` and transition. The JSON has `sections` and `id`.
- `hinote build --embed` puts the files the slides load into the HTML as data: URLs, so the one file is the whole deck. `check` warns (`remote-file`) about files a slide loads from the network, which a built page shows only online.
- `hinote check` reports more mistakes that otherwise pass in silence, each with how to fix it: an `on*` handler on a slide (`server-handler`), a state or effect hook in a slide file (`server-hook`), `<Script src>` given a source file as a string (`script-src`), and a `<Step>` in a list without `as="li"` (warning `step-in-list`). `createSlide(<Title />)` is reported as `slide-shape` with the fix, a relative `new URL()` without a base gets a hint, and an error a component throws keeps its own code and hint.
- A deck or `<Script>` that does not bundle is reported with the bundler's reason, such as the import that does not exist, instead of "Bundle failed".
- `<Math tex="\\frac{1}{2}">` is rejected with a hint: in a JSX attribute the backslash is already literal, so the doubled one was a line break and the word "frac".
- Breaking: `<Code>` moved to the new package `@hinote/code`, and its themes to `@hinote/code/themes`. `hinote` no longer exports `Code`, `CodeProps`, or `hinote/code-themes`, and no longer installs `@pierre/highlights`. Add `@hinote/code` and change the import.
- `hinote` and every `@hinote/*` package share one version and are released together.
- New package `@hinote/katex`: `<Math tex="...">` renders LaTeX as MathML while the slide renders, as a block or `inline`.
- `hinote.observe(element, handler)` reports `{ active, step, steps }`: whether the element's slide is shown, and how many of its steps are out. A copy outside the deck, such as in the presenter's previews, is never active.
- `<Steps count={n}>` takes the next n steps of the slide for code in the page to play, numbered with its `<Step>`s and hidden by nothing; `hinote.observe` counts them for the element.
- `<Script src>` can name a `.js` file by the name it compiles to: when it does not exist, its `.ts` or `.tsx` source is bundled, as TypeScript resolves imports.
- `HinoteClient`, `Position`, `Role`, and the markup `<Script>`, `<Step>`, and `<Steps>` write are described in `@hinote/types`, so a package can put code in the page without importing hinote. `hinote/client` still exports the same types.
- The `@hinote/*` component packages depend on `hono` (and `@hinote/chart` on `@tanstack/charts`) instead of asking the deck for it as a peer.
- `hinote skills get code`, `katex`, `d2`, and `chart` print the guide to each package, also before it is installed, and say when the deck has a different version of the package. The core guide lists the packages and what each is for.
- New package `@hinote/chart`: `<Chart>` draws a TanStack Charts chart as SVG while the slide renders and animates it in the page, with `bars`, `lines`, `areas`, and `dots` for the common charts, and TanStack's `defineChart`, marks, and scales exported for the rest, so a deck needs no `@tanstack/charts` of its own. `steps={[...]}` moves to the next chart at each step.
- New package `@hinote/d2`: `<D2>` draws a D2 diagram as SVG while the slide renders, with `theme`, `sketch`, `layout`, and `scale`.
- The package is built file for file instead of bundled, and declares no side effects, so a bundle keeps only what it imports. Importing only `Row` adds about 0.5 KB gzipped instead of 8 KB.
- `hinote init` writes a deck with no `<Code>`, so a new deck needs only `hinote` and `hono`.
- An error a `@hinote/*` package throws is reported like hinote's own, with its code and hint.
- A package the deck imports that loads a worker or WebAssembly from next to itself through `import.meta.url` now finds it. Before, it looked in the temporary directory the deck runs from.
- `Theme` and `SlideContext` are defined in the new `@hinote/types` package, which hinote now depends on. `hinote` still exports both, so existing imports keep working.

## 0.5.2

- A top-level deck can set `lang` to a language tag such as `"ja"`. It is written on `<html lang>` of the audience page, the presenter page, and the built file.
- The published package includes `CHANGELOG.md`.
- `hinote snapshot --slides 2,5,8` photographs and reports only those slides. Pictures keep their slide number.
- `hinote snapshot` warns with `title-wrap` when a slide's first heading takes more than one line.
- A deck whose `lang` is `ja` or `ja-*` breaks slide text between phrases (`word-break: auto-phrase`), and `hinote snapshot` warns with `lone-character` when wrapped text leaves one character alone on a line.
- `<Flow>` lays out boxes with an arrow between each pair and can emphasize one of them.
- `<Card footer={...}>` pins a footer, such as a source, to the card's last row. Cards in a Grid now all span the band's largest row count, so footers line up across columns.
- `<Table widths={[2, 1]} emphasis={[1]}>` styles a table from the theme, sets the column ratio, and emphasizes body rows.
- A slide can take an `id` option, and `<Link to="id">` links to it with the right URL for dev, a mounted base, prerender, and the built file. A click moves there without reloading.
- Speaker notes take a small part of Markdown (headings, lists, paragraphs, strong, emphasis, code), shown with that structure in the presenter view. Plain notes read as before, and HTML in a note stays text.

## 0.5.1

- Nothinig changed in package.

## 0.5.0

- Bump the "dependencies" group with 1 update across multiple ecosystems
- Fix leftovers after removing examples/ and docs/
- Report canvas overflow and reveal Steps in snapshot
- Improve Chrome snapshot launch for containers
- Darken paper and slate text colors to 7:1 contrast
- Allow deck CSS to override Row / Column / Center
- Warn on theme contrast below 7:1 in hinote check
- Add Grid and Card with subgrid-aligned rows
- Add section context, init --diff, type-aware lint, and design guidance
