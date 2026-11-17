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
import { render } from "hono/jsx/dom";

hinote.on("poll:vote", (choice) => count(choice as string));

for (const slot of document.querySelectorAll<HTMLElement>("#deck .poll"))
  render(
    <button onClick={() => hinote.send("poll:vote", "a")}>A</button>,
    slot,
  );
```

- The file is bundled for the browser with JSX from `hono/jsx/dom` and inlined once at the end of the page, however many slides use it. `hinote check` reports a file that does not bundle (`script`).
- The presenter's previews copy the slide's markup; query with `#deck` to skip them.

## The hinote global

|                                  |                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| `hinote.role`                    | `"presenter"` or `"view"`                                                                  |
| `hinote.sync`                    | `"server"`, `"broadcast"`, or `"none"`: how far `send` reaches                             |
| `hinote.position`                | `{ slide, step }`, slide counted from 0                                                    |
| `hinote.on(name, handler)`       | Every event with that name; returns a function that stops it                               |
| `hinote.on("position", handler)` | Fires at once, then on every slide or step change                                          |
| `hinote.send(name, data)`        | To every page of the deck, this one included; JSON, a few KB at most; names without spaces |
| `hinote.toCanvas(event)`         | Pointer position in canvas pixels of the current slide                                     |

- Under `hinote dev` with the presenter on, events reach every page through the server. Prerendered pages reach other windows of the same browser. The built single file reaches only itself.
- A page opened later has not seen earlier events, and a reload starts with no step revealed. Keep state that others need to follow in one page (the presenter, say) and have it answer a request event, as `examples/components/life.client.tsx` does.
- The slide is a scaled canvas: use `hinote.toCanvas(event)` instead of `clientX`.
