# hinote

[日本語](README.ja.md)

Write slides with Hono and Hono/JSX. While you are editing, a local server shows them. `build` writes one HTML file and leaves image URLs as they are.

## Slides

The default export of `deck.tsx` is the deck. A named `theme` export applies to every slide.

```tsx
import { Center, Column, Row, createSlide, type Theme } from "hinote";
import points from "./slides/points.tsx";

export const theme: Theme = {
  colors: { bg: "#0f1115", fg: "#f8fafc", accent: "#38bdf8" },
  fonts: { base: "system-ui, sans-serif" },
  typography: { h1: "4.5rem", body: "1.5rem" },
  shadows: { md: "0 12px 40px rgb(0 0 0 / 0.35)" },
};

export default createSlide([
  createSlide({ title: "hinote", notes: "What to say" }, () => (
    <Center>
      <h1>hinote</h1>
    </Center>
  )),
  points,
]);
```

- `createSlide(render)` is one slide.
- `createSlide({ notes, title, background, class, theme }, render)` adds options to that slide.
- `createSlide([slide, deck])` is several slides. A deck inside the array is expanded in order.
- `Center`, `Column`, and `Row` take `gap`, `align`, and `justify`. A numeric `gap` is that many multiples of the theme's `spacing.unit`.
- The theme becomes CSS variables such as `--hinote-bg`. A slide's own `theme` overrides those variables on that slide, and the visible slide paints its background and text from them.

## Commands

Run this repository with Bun.

```bash
bun src/cli.ts dev examples/deck.tsx
bun src/cli.ts dev deck.tsx --port 4321
bun src/cli.ts build deck.tsx -o dist/index.html
bun src/cli.ts insert Next --at 2
```

`dev` serves the audience view at <http://127.0.0.1:4321> and the presenter view at `/presenter`. The presenter view shows a 16:9 slide on the left and the notes on the right. It also serves files inside the deck directory, and refuses a path that leaves that directory. It does not reload when you edit a file. Stop it and run `dev` again.

Advance with the left, right, up, and down arrows, Page Up, Page Down, Space, Enter, Backspace, Home, and End.

The presenter sends the pointer to the audience. Either window can change the slide, and the other window follows. An audience window opened later jumps to the presenter's slide. Sync uses `BroadcastChannel` (`hinote-sync`) and works only between pages on the same HTTP origin. Two copies opened with `file://` do not sync. On the built HTML file, add `?presenter` for the presenter view.

`build` does not rewrite image URLs. Put the images where the HTML file can load them.

`insert` creates `slides/<Name>.tsx` and adds an import to a deck whose default export is a single `createSlide([...])`. `<Name>` has to be a JavaScript identifier.
