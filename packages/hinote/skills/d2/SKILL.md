---
name: hinote-d2
description: Draw D2 diagrams on hinote slides with <D2> from @hinote/d2. Use when a slide shows boxes and arrows: architecture, flows, sequences.
---

# @hinote/d2

`<D2>` for [hinote](https://github.com/halqme/hinote/tree/main/packages/hinote): a [D2](https://d2lang.com) diagram drawn as SVG while the slide renders, so the page gets a finished picture and loads no script for it.

This guide ships with hinote and matches its version; the package is released with the same version.

```sh
bun add @hinote/d2
```

```tsx
import { createSlide } from "hinote";
import { D2 } from "@hinote/d2";

export default createSlide([
  createSlide(() => (
    <D2>{`
      user -> app: request
      app -> db: query
      db -> app
      app -> user: response
    `}</D2>
  )),
  createSlide(() => <D2 code="a -> b -> c" theme={200} sketch />),
]);
```

- The source is `code` or text children. Write children as a template literal, so D2's braces stay out of JSX. The indentation the surrounding JSX adds is removed.
- `theme` is a D2 theme id: 0 (the default), 1 (grey), 200 (dark), 300 (terminal), and the others D2 lists.
- The diagram has no background of its own, so the slide shows through it. `background` keeps the theme's, such as a dark theme on a light slide. Boxes and arrows keep the theme's colors; to match the deck's palette, style them in the D2 source (`classes`, `style.fill`, `style.stroke`, `style.font-color`). Labels are set in D2's own font, which it measured the boxes with.
- `sketch` draws it by hand. `layout="elk"` lays out larger or nested diagrams more evenly than the default `"dagre"`.
- `scale` sizes the SVG relative to D2's own. The default 2 makes its 16px labels about as large as slide text. A diagram too large for the slide is reported by `hinote check`, like any overflow.
- D2 that does not parse is an error when the slide renders, with its line and column, and `hinote check` reports it on that slide.
- D2 runs as WebAssembly in a worker thread, started on the first `<D2>`. It needs Bun or Node; hosts without worker threads, such as Cloudflare Workers, cannot draw diagrams. The install is large (about 60 MB), but only the SVG goes into what `hinote build` writes.
