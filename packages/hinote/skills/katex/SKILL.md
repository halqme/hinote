---
name: hinote-katex
description: Write LaTeX formulas on hinote slides with <Math> from @hinote/katex. Use when a slide shows math.
---

# @hinote/katex

`<Math>` for [hinote](https://github.com/halqme/hinote/tree/main/packages/hinote): LaTeX rendered as MathML with [KaTeX](https://katex.org) while the slide renders, so the page loads no script, stylesheet, or font for it.

This guide ships with hinote and matches its version; the package is released with the same version.

```sh
bun add @hinote/katex
```

```tsx
import { createSlide } from "hinote";
import { Math } from "@hinote/katex";

export default createSlide([
  createSlide(() => (
    <>
      <Math tex="\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}" />
      <p>
        The area is <Math inline tex="\pi r^2" />.
      </p>
    </>
  )),
]);
```

- `tex` is the LaTeX source. In a JSX attribute string a backslash is literal: write `\frac`, not `\\frac`.
- A formula is a centered block by default. `inline` puts it in the surrounding text.
- LaTeX that does not parse is an error when the slide renders, and `hinote check` reports it on that slide.
