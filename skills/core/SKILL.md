---
name: hinote
description: Write, check, and ship slide decks with hinote, where each slide is a Hono JSX component rendered on the server and the deck is a Hono app. Use when a project has a deck.tsx that imports from "hinote", or when asked to make slides with hinote.
---

# hinote

A deck is a TSX file whose default export is `createSlide([...])`. Slides render on the server into one HTML page; nothing on a slide runs in the browser unless it goes through `<Script>`. This guide matches the installed hinote, so prefer it over memory.

## The loop

1. Edit the deck (`deck.tsx`, usually with one file per slide under `slides/`).
2. `hinote check --json`: loads the deck, renders each slide alone, looks for the files slides load, and bundles each `<Script>`. Exit 1 lists problems with a `code` and the slide numbers. Fix them before anything else.
3. `hinote inspect --json`: what each slide holds (title, steps, notes, files). Use it to confirm the deck says what you meant without opening a browser.
4. Look at it. Run `hinote dev --json` in the background; its first line is `{"event":"listening","data":{"urls":[{"deck":...,"presenter":...}]}}`. Open `/<n>` for slide n and take a screenshot if you can drive a browser. Text that fits in JSX can still overflow the canvas, so look before calling a slide done.
5. Ship: `hinote build` (one HTML file), `hinote prerender` (a static site), or `hinote assets` beside a server of your own. `hinote check && hinote build` stops on a broken deck.

Every command takes `--json` and `--help`. Errors come as `{"ok":false,"error":{"code","message","hint"}}`; the hint is usually the next command to run. Exit 2 means the command line was wrong: read `hinote help <command>`.

## Deck shape

```tsx
// deck.tsx
import { createSlide } from "hinote";
import style from "./style.css" with { type: "text" };
import title from "./slides/title.tsx";
import agenda from "./slides/agenda.tsx";

export default createSlide({ title: "Talk", aspect: "16:9", css: style }, [
  title,
  agenda,
  createSlide({ transition: "fade" }, [
    /* a nested deck: its slides, in order */
  ]),
]);
```

```tsx
// slides/agenda.tsx
import { Step, createSlide } from "hinote";

export default createSlide({ notes: "Say why before how." }, () => (
  <section>
    <h2>Agenda</h2>
    <ul>
      <Step as="li">Why</Step>
      <Step as="li">How</Step>
    </ul>
  </section>
));
```

- `createSlide(render)` or `createSlide(options, render)` is one slide; `createSlide([...])` or `createSlide(options, [...])` is a deck. Decks nest and are flattened in order. Pass a nested deck in the array as it is. Do not `.map`, `.flat()`, or `.flatMap()` it into slides yourself. Slide numbers in URLs and in `check` count from 1 across the flattened deck.
- The canvas is 1080 px tall; 16:9 is 1920 x 1080 and 4:3 is 1440 x 1080. Size text and images for that canvas, not for a browser window.
- JSX is `hono/jsx`: write `class`, `style` as a string or object, and plain HTML elements. React hooks and event handlers do nothing on a slide.
- Render functions may be `async` (read a file, fetch data).

## Rules that are easy to get wrong

- Import CSS as text: `import style from "./style.css" with { type: "text" }`. Without the attribute hinote refuses it.
- Start from a palette instead of writing one: `import { themes } from "hinote"`, then `theme: themes.ink` (dark, also the default), `themes.paper` (warm light), or `themes.slate` (cool light). Use CSS for layout, not for picking a palette.
- CSS reaches only its own slides. Use `& { ... }` for the slide element itself; `:root`, `html`, and `body` do not match. Inner CSS (slide over nested deck over deck) wins regardless of selectors.
- Relative paths (`<img src="./images/a.png">`, `url(bg.png)`) resolve from the deck file's directory and must stay inside it. `check` reports `missing-file` otherwise.
- Browser code goes in its own file, `<Script src={new URL("./x.client.tsx", import.meta.url)} />`, using `hono/jsx/dom` and the global `hinote` (`role`, `position`, `on`, `send`, `toCanvas`). Set up from `hinote.on("position", ...)`; a reload starts with no step revealed.
- Steps: `<Step>` or any element with `data-hinote-step="n"`. Same `at` reveals together.
- The URL holds only the slide (`/3`, `/presenter/3`). There are no nested paths.
- Notes appear only in the presenter view.

## References

Load one with `hinote skills get core --ref <name>`:

- `api`: every option of `createSlide`, the components (`Step`, `Code`, `Center`, `Row`, `Column`, `Script`), themes, and CSS.
- `client`: `<Script>` and the `hinote` browser API, with sync between presenter and audience.
- `serving`: build, prerender, and mounting the deck in Bun, Node, or Cloudflare Workers.
- `recipes`: formulas, a background image beside text, two columns, charts, and other common slides.

`hinote help <command>` gives the options and examples for each command.
