# Code in the browser

Slides are HTML rendered on the server. For anything interactive, put the code in its own file and add `<Script>` to the slide.

```tsx
// slides/poll.tsx
import { Script, createSlide } from "hinote";

export default createSlide(() => (
  <section>
    <h2>Poll</h2>
    <div class="poll" />
    <Script src={new URL("../components/poll.client.tsx", import.meta.url)} />
  </section>
));
```

```tsx
// components/poll.client.tsx
/// <reference types="hinote/client" />
import type { Position, Role } from "hinote/client";
import { render } from "hono/jsx/dom";

const role: Role = hinote.role;
hinote.on("position", (position: Position) => position.slide);
hinote.on("poll:vote", (choice) => count(choice as string));

hinote.mount(".poll", (slot) => {
  render(
    <button onClick={() => hinote.send("poll:vote", "a")}>A</button>,
    slot,
  );
});
```

- The file is bundled for the browser with JSX from `hono/jsx/dom` and runs once, when the first slide that uses it enters the page, however many slides use it. `hinote check` reports a file that does not bundle (`script`).
- A page holds one slide at a time: moving to another fetches it and swaps it in. So a script finds its elements with `hinote.mount(selector, setup)`, not `document.querySelectorAll`, which would see only the slide on screen when the script ran. `setup` runs for each matching element of every slide as the slide enters, now and later. What it returns, if a function, runs as the slide leaves. A slide that enters again comes back as the server drew it, and `setup` runs again.
- `/// <reference types="hinote/client" />` types the global `hinote`. Import `Position` and `Role` from `hinote/client`. Keep that import and the reference in the `*.client.tsx` file. A slide that imports `hinote/client` types `hinote` for every file in the program, and `hinote check` reports both that import and any `hinote.` outside a client file as `browser-global`. `init` excludes `*.client.tsx` from `tsconfig.json` and writes `tsconfig.client.json` for them.
- The presenter's previews copy the slide's markup; `hinote.mount` never sees them.
- `src` may name a `.js` file by the name it compiles to, as TypeScript imports do: when `./widget.client.js` does not exist, hinote bundles `./widget.client.ts` or `.tsx`. A package that ships its build can then write one URL that works from its source and from `dist/`.

## Code that plays with its slide

`hinote.observe(element, handler)` tells a script when the element's slide is shown and left, so an animation can start when its slide opens. Wrap the element in `<Steps count={n}>` and the slide gives it n steps, numbered with its `<Step>`s; `step` then counts only those, from 0 to n:

```tsx
// slides/growth.tsx
<Steps count={2} class="counter">0</Steps>
<Script src={new URL("../components/counter.client.ts", import.meta.url)} />
```

```ts
// components/counter.client.ts
hinote.mount(".counter", (el) => {
  hinote.observe(el, ({ active, step }) => {
    el.textContent = active ? String(step * 100) : "0";
  });
});
```

- The handler runs at once, then when `active` or `step` changes. Without `<Steps>`, `step` is the slide's. It reports `active: false` one last time as its slide leaves the page, and then stops.
- An element outside the deck, such as a copy in the presenter's previews, is never active, so `observe` needs no `#deck`.

## The hinote global

|                                    |                                                                                                |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| `hinote.role`                      | `"presenter"` or `"view"`                                                                      |
| `hinote.sync`                      | `"server"`, `"broadcast"`, or `"none"`: how far `send` reaches                                 |
| `hinote.position`                  | `{ slide, step }`, slide counted from 0                                                        |
| `hinote.on(name, handler)`         | Every event with that name; returns a function that stops it                                   |
| `hinote.on("position", handler)`   | Fires at once, then on every slide or step change                                              |
| `hinote.mount(selector, setup)`    | `setup(element)` for each match on every slide as it enters; what it returns runs as it leaves |
| `hinote.observe(element, handler)` | `{ active, step, steps }` for the element's slide, at once and on every change                 |
| `hinote.send(name, data)`          | To every page of the deck, this one included; JSON, a few KB at most; names without spaces     |
| `hinote.toCanvas(event)`           | Pointer position in canvas pixels of the current slide                                         |

- Under `hinote dev` with the presenter on, events reach every page through the server. Pages `hinote build` wrote for a static host reach other windows of the same browser. The built single file reaches only itself.
- A page opened later has not seen earlier events, and a reload starts with no step revealed. Keep state that others need to follow in one page (the presenter, say) and have it answer a request event: the leader sends the board with `hinote.send`, and a page that opens or reloads asks for it so it never starts behind.
- The slide is a scaled canvas: use `hinote.toCanvas(event)` instead of `clientX`.
