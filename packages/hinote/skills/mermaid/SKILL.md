---
name: hinote-mermaid
description: Draw Mermaid diagrams on hinote slides with <Mermaid> from @hinote/mermaid. Use when a slide shows a flowchart, a state machine, a sequence of messages, classes, an ER model, or a small bar or line chart written in Mermaid.
---

# @hinote/mermaid

`<Mermaid>` for [hinote](https://github.com/halqme/hinote/tree/main/packages/hinote): a [Mermaid](https://mermaid.js.org) diagram drawn as SVG by [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid) while the slide renders, so the page gets a finished picture and loads no script or font for it.

This guide ships with hinote and matches its version; the package is released with the same version.

```sh
bun add @hinote/mermaid
```

```tsx
import { createSlide } from "hinote";
import { Mermaid } from "@hinote/mermaid";

export default createSlide([
  createSlide(() => (
    <Mermaid>{`
      sequenceDiagram
        Browser->>Deck: GET /3
        Deck-->>Browser: slide 3
    `}</Mermaid>
  )),
  createSlide(() => (
    <Mermaid code={"graph LR\n  write --> present --> share"} />
  )),
]);
```

- The source is `code` or text children. Write children as a template literal, so Mermaid's braces stay out of JSX. The indentation the surrounding JSX adds is removed. Put each statement on its own line: `graph LR; a --> b` on one line is refused.
- It draws flowcharts (`graph`, `flowchart`), `stateDiagram`, `sequenceDiagram`, `classDiagram`, `erDiagram`, and `xychart` (bars and lines). Anything else, such as `gantt`, `pie`, `mindmap`, or `gitGraph`, is an error that lists these.
- The diagram takes the deck's theme: the background, text, accent, muted, surface, and border colors, and the deck's base and mono fonts. A slide with its own theme gets a diagram in that theme. It has no background of its own, so the slide shows through it.
- `scale` sizes the SVG relative to the renderer's own. The default 2.5 makes its 13px labels about as large as slide text. A diagram too large for the slide is reported by `hinote check`, like any overflow.
- A source it cannot read is an error when the slide renders, and `hinote check` reports it on that slide. The renderer is lenient: a statement it does not understand is often left out of the picture instead, so look at the slide (`hinote snapshot`).
- It is plain JavaScript with no DOM, so it draws on Bun, Node, and Cloudflare Workers alike. The layout engine loads on the first `<Mermaid>`.
