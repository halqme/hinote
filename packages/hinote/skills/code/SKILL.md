---
name: hinote-code
description: Highlight source code on hinote slides with <Code> from @hinote/code. Use when a slide shows code.
---

# @hinote/code

`<Code>` for [hinote](https://github.com/halqme/hinote/tree/main/packages/hinote): source highlighted on the server with [`@pierre/highlights`](https://www.npmjs.com/package/@pierre/highlights), colors inline, so the page runs no highlighter.

This guide ships with hinote and matches its version; the package is released with the same version.

```sh
bun add @hinote/code
```

```tsx
import { createSlide } from "hinote";
import { Code } from "@hinote/code";
import { githubLight } from "@hinote/code/themes";

export default createSlide([
  createSlide(() => (
    <Code lang="ts">{`
      const deck = createSlide([title, points]);
    `}</Code>
  )),
  createSlide(() => <Code lang="rust" code={source} theme={githubLight} />),
  createSlide(() => (
    <Code lang="ts" highlight={["1", "2-3"]}>{`
      const deck = createSlide([title, points]);
      const app = deck.app();
      export default app;
    `}</Code>
  )),
]);
```

- `lang` is a language name or alias, such as `"ts"` or `"rust"`. An unknown one is an error when the slide renders.
- The source is `code` or the text children. The indentation the surrounding JSX adds is removed.
- `theme` is one of `@hinote/code/themes`. The default is Pierre's dark theme.
- `highlight` dims every line but the ones given, counted from 1: `3`, `"1-3"`, or `"1-3,5"`. A line the source does not have is an error when the slide renders.
- An array of them, `highlight={["1-3", 5, "1-5"]}`, moves the highlight one set per step, the first shown before any. Each set after the first is a step of the slide, numbered with its `<Step>`s in document order, so a `<Step>` after the code comes after the last set. It needs no script: a snapshot, a printout, or the slide with every step out shows the last set.
- `class` is added to the `<pre class="highlights">`, and to each copy of it when the highlight has steps. hinote's CSS sizes it from the theme's `typography.code`.
- The highlighter is WebAssembly. It loads on the first `<Code>`, so a deck that imports this package but shows no code still runs on hosts that refuse WebAssembly.
