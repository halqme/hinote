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
]);
```

- `lang` is a language name or alias, such as `"ts"` or `"rust"`. An unknown one is an error when the slide renders.
- The source is `code` or the text children. The indentation the surrounding JSX adds is removed.
- `theme` is one of `@hinote/code/themes`. The default is Pierre's dark theme.
- `class` is added to the `<pre class="highlights">`. hinote's CSS sizes it from the theme's `typography.code`.
- The highlighter is WebAssembly. It loads on the first `<Code>`, so a deck that imports this package but shows no code still runs on hosts that refuse WebAssembly.
