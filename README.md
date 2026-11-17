# hinote

[日本語](README.ja.md)

Write slides with Hono and Hono/JSX. A deck is a Hono app: any way of running Hono serves it. `build` writes one HTML file and leaves image URLs as they are.

## Slides

The default export of `deck.tsx` is the deck.

```tsx
import { Center, Step, createSlide } from "hinote";
import points from "./slides/points.tsx";

export default createSlide(
  {
    aspect: "16:9",
    theme: {
      colors: { bg: "#0f1115", fg: "#f8fafc", accent: "#38bdf8" },
      typography: { h1: "7rem", body: "2.25rem" },
    },
  },
  [
    createSlide({ title: "hinote", notes: "What to say" }, () => (
      <Center>
        <h1>hinote</h1>
        <ul>
          <Step as="li">Shown on the first step</Step>
          <Step as="li">Shown on the second step</Step>
        </ul>
      </Center>
    )),
    points,
  ],
);
```

- `createSlide(render)` is one slide.
- `createSlide({ notes, title, background, class, theme }, render)` adds options to that slide.
- `createSlide([slide, deck])` is a deck. A deck inside the array is expanded in order.
- `createSlide({ title, theme, aspect }, [...])` is a deck with options. `title` is the document title. `aspect` is the canvas ratio: `"16:9"` (default), `"4:3"`, or any `"W:H"`. Only the top-level deck can set `title` and `aspect`. A nested deck's `theme` applies to its slides, under each slide's own `theme`.
- Every slide is laid out on a canvas 1080 px tall with the deck's ratio, and the canvas is scaled to fit the window.
- `<Step>` reveals its children one step at a time. Steps count up in document order; `at={n}` puts an element on step `n`, and `as="li"` picks the element. Any element with `data-hinote-step="n"` works the same way.
- `Center`, `Column`, and `Row` take `gap`, `align`, and `justify`. A numeric `gap` is that many multiples of the theme's `spacing.unit`.
- The theme becomes CSS variables such as `--hinote-bg`. A slide's own `theme` overrides those variables on that slide.

## Running

Run this repository with Bun.

```bash
bun src/cli.ts dev examples/deck.tsx
bun src/cli.ts dev deck.tsx --port 4321
bun src/cli.ts build deck.tsx -o dist/index.html
bun src/cli.ts insert Next --at 2
bun examples/deck.tsx
```

`dev` serves the deck at <http://127.0.0.1:4321> and the presenter view at `/presenter`. It reloads the deck when a file in the deck directory changes, and open pages reload with it. A deck that fails to load is reported, and the last one keeps serving. `dev` also serves files inside the deck directory, such as images, and refuses a path that leaves that directory.

Because the deck is a Hono app, `bun deck.tsx` serves it too (on port 3000), and so does `app.route("/talk", deck)` inside another app. You can add your own routes with `deck.get(...)`. Without `dev` there is no reload and no file serving; add `serveStatic` yourself if you need images.

`/3` opens the third slide and `/presenter/3` its presenter view. Paths do not nest further: steps are not in the URL, so a reload starts the slide with no step revealed.

Advance with the left, right, up, and down arrows, Page Up, Page Down, Space, Enter, Backspace, Home, and End. Going forward reveals the next step before moving on; going back from a slide lands on the previous slide with every step revealed.

The presenter sends the pointer to the audience. Either window can move, and the other follows. A window opened later jumps to the presenter's position. Served pages sync through the deck itself (an SSE stream at `/_hinote/events` and POST to `/_hinote/sync`), so pages on other devices that reach the server follow too. The built HTML file syncs with `BroadcastChannel` (`hinote-sync`) between windows of the same origin; two copies opened with `file://` do not sync. On the built file, the position is in the hash (`#3`) and `?presenter` opens the presenter view.

`build` does not rewrite image URLs. Put the images where the HTML file can load them.

`insert` creates `slides/<Name>.tsx` and adds an import to a deck whose default export is a single `createSlide([...])` without options. `<Name>` has to be a JavaScript identifier.

## Developing hinote

`src/client.ts` runs in the browser. Pages inline the generated `src/client.generated.ts`, so rendering never needs a bundler. After editing the client, run `bun run build:client`; `bun test` fails while the generated file is stale.
