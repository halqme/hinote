---
name: hinote
description: Write, check, and ship slide decks with hinote, where each slide is a Hono JSX component rendered on the server and the deck is a Hono app. Use when a project has a deck.tsx that imports from "hinote" or "@hinote/core", or when asked to make slides with hinote.
---

# hinote

A deck is a TSX file whose default export is `createSlide([...])`. Slides render on the server into one HTML page; nothing on a slide runs in the browser unless it goes through `<Script>`. This guide matches the installed hinote, so prefer it over memory.

## The loop

1. Edit the deck (`deck.tsx`, usually with one file per slide under `slides/`).
2. `hinote check --json`: loads the deck, renders each slide alone, looks for the files slides load, bundles each `<Script>`, and reads the source for mistakes a render cannot see. Exit 1 lists problems, each with a `code`, a `hint` that says how to fix it, and the slide numbers when it has them. Fix them before anything else.
3. `hinote inspect`: the outline of the deck, each slide under its section with its title, steps, and notes (`--json` for all of it). Read only the titles, in order: they should tell the whole story, each as a claim rather than a topic. Use it to confirm the deck says what you meant without opening a browser.
4. Look at it. `hinote snapshot --json` writes one PNG per slide at the canvas size (`shots/1.png`, `shots/2.png`, …). Every `<Step>` is shown (no mid-fade), so the picture is the finished slide. The same result reports layout: `problems` for what does not fit the canvas (exit 1), and `warnings` for what fits but reads badly (exit 0 alone). Each issue has `slides` (an array of slide numbers), `code`, `hint`, and a short selector. Mark intentional bleed with `data-hinote-bleed`. `--slides 2,5,8` photographs and reports only those slides; pictures keep their slide number (`shots/5.png`). The pictures come from Google Chrome, Chromium, or Edge, or a Chromium build that Playwright, Puppeteer, or agent-browser downloaded; `HINOTE_CHROME` names another. To present, run `hinote dev --json` in the background; its first line is `{"event":"listening","data":{"urls":[{"deck":...,"presenter":...}]}}`. Open `/<n>` for slide n.
5. Ship: `hinote build` (one HTML file and the files it loads; `--embed` puts them in the HTML, to send as one file), `hinote prerender` (a static site), or `hinote assets` beside a server of your own. `hinote check && hinote build` stops on a broken deck.

Every command takes `--json` and `--help`. Errors come as `{"ok":false,"error":{"code","message","hint"}}`; the hint is usually the next command to run. Exit 2 means the command line was wrong: read `hinote help <command>`.

## Deck shape

```tsx
// deck.tsx
import { createSlide } from "hinote";
import style from "./style.css" with { type: "text" };
import title from "./slides/title.tsx";
import agenda from "./slides/agenda.tsx";

export default createSlide(
  { document: { title: "Talk", aspect: "16:9" }, css: style },
  [
    title,
    agenda,
    createSlide({ transition: "fade" }, [
      /* a nested deck: its slides, in order */
    ]),
  ],
);
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

- `createSlide(render)` or `createSlide(options, render)` is one slide; `createSlide([...])` or `createSlide(options, [...])` is a deck. Decks nest and are flattened in order. Pass a nested deck in the array as it is. Do not `.map`, `.flat()`, or `.flatMap()` it into slides yourself. A `.map` that builds new slides with `createSlide`, or that draws rows inside a render function, is fine. Slide numbers in URLs and in `check` count from 1 across the flattened deck. `document: { pageNumber: true }` on the top-level deck paints that same count on each slide (`3 / 12`). A slide's `pageNumber: false` hides its own.
- The canvas is 1080 px tall; 16:9 is 1920 x 1080 and 4:3 is 1440 x 1080. Size text and images for that canvas, not for a browser window.
- JSX is `hono/jsx`: write `class`, `style` as a string or object, and plain HTML elements. React hooks and event handlers do nothing on a slide.
- Render functions may be `async` (read a file, fetch data).

## What makes a slide work

A deck that passes `check` and `snapshot` can still say nothing. Before you finish:

- One message per slide, and the title states it as a claim ("Size does not explain it", not "Relation to size").
- Every word is one a first-time reader already knows, and means only one thing. A slide is right when someone reading it cold gets exactly what you meant. Short space pushes you to invent words or to fall back on short, broad ones; write the plain phrase instead, and if it does not fit, cut something else from the slide rather than shortening the words. `--ref design` has examples.
- Every number sits next to what it is compared with.
- One emphasis per slide. Cut a dense slide down rather than shrinking its text or splitting it in two. `<Step>` is a last resort: someone who misses a step is left with a slide that makes no sense, so use as few as you can.
- Lay out with `Row`, `Column`, `Grid`, and `Card` and a numeric `gap`; do not write `px` for spacing.

`--ref design` has the reasons, the sources, and a checklist.

`hinote skills get talk` comes before all of this: how many slides the time allows, how the story runs, what a slide should hold, and rehearsal.

## Rules that are easy to get wrong

- Import CSS as text: `import style from "./style.css" with { type: "text" }`.
- Start from a palette instead of writing one: `import { themes } from "hinote"`, then `theme: themes.ink` (dark, also the default), `themes.paper` (warm light), or `themes.slate` (cool light). Use CSS for layout, not for picking a palette.
- CSS reaches only its own slides. Use `& { ... }` for the slide element itself; `:root`, `html`, and `body` do not match. Inner CSS (slide over nested deck over deck) wins regardless of selectors.
- Relative paths (`<img src="./images/a.png">`, `url(bg.png)`) resolve from the deck file's directory and must stay inside it. A file in an installed package, such as `./node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2`, counts as inside even when the package manager links it from a store elsewhere.
- A slide is HTML drawn on the server: anything that should happen in the browser (a click, a timer, state) goes in its own `*.client.tsx` file, added with `<Script src={new URL("./x.client.tsx", import.meta.url)} />`. Start that file with `/// <reference types="hinote/client" />`; the `hinote` global exists only there. `--ref client` has the rest.
- Steps: `<Step>` or any element with `data-hinote-step="n"`. Same `at` reveals together.
- The URL holds only the slide (`/3`, `/presenter/3`). There are no nested paths.
- Notes appear only in the presenter view.

## Packages

Components that need a larger dependency, such as a highlighter, live in packages of their own. `hinote skills` lists every guide this hinote ships, each saying when it applies; read the one that fits before using its package. A guide can be read before its package is installed.

## References

Load one with `hinote skills get core --ref <name>`:

- `api`: every option of `createSlide`, the components (`Row`, `Column`, `Center`, `Grid`, `Card`, `Flow`, `Table`, `Link`, `Step`, `Steps`, `Morph`, `Script`), themes, and CSS.
- `client`: `<Script>` and the `hinote` browser API, with sync between presenter and audience.
- `serving`: presenting with `dev`, what `build`, `prerender`, and `snapshot` write, mounting the deck in Bun, Node, or Cloudflare Workers, and the one-step commands.
- `design`: what makes a slide say something, how hinote supports it, and how to check it.
- `recipes`: a background image beside text, two columns, a chart drawn by hand, and other common slides.

`hinote help <command>` gives the options and examples for each command.
