# Example: automating a weekend coffee roast

[日本語](README.ja.md)

A fictional five-minute talk about automating a home coffee roaster with a Raspberry Pi, written the way a real talk would be.

Run this from the repository root to show it:

```bash
bun run dev
```

## Layout

```
examples/
├── deck.tsx                  deck options and slide order
├── style.css                 CSS for every slide
├── slides/                   one slide per file
├── components/               components the slides use
├── data/roasts.json          a log of 12 roasts
└── images/setup.svg          the setup diagram
```

## What each file shows

| File                                                   | Shows                                                                                                                      |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `deck.tsx`                                             | Deck options and a theme with a token of its own (`surface`). Slides 4–5 are a nested deck that uses `transition: "slide"` |
| `slides/title.tsx`                                     | A title centered with `Center`                                                                                             |
| `slides/agenda.tsx`                                    | `<Step as="li">` in a list                                                                                                 |
| `style.css`                                            | CSS for every slide, passed as `css` in `deck.tsx`; it styles `.card` and the agenda list                                  |
| `slides/problem.tsx`, `components/Card.tsx`            | A component of your own revealed with `data-hinote-step`; two cards appear together                                        |
| `slides/setup.tsx`                                     | An image next to the deck                                                                                                  |
| `slides/code.tsx`                                      | `<Code>`                                                                                                                   |
| `slides/results.tsx`, `components/FirstCrackChart.tsx` | An async component reads `data/roasts.json`, computes the standard deviation, and draws a bar chart                        |
| `slides/results.tsx`, `components/results.client.tsx`  | A `<Script>` that gives the presenter buttons; `hinote.send` makes every page follow                                       |
| `slides/thanks.tsx`                                    | A slide with its own theme, transition, and CSS                                                                            |

`FirstCrackChart.tsx` reads its data with `new URL("../data/roasts.json", import.meta.url)`. The path resolves from that file under `hinote dev` and `hinote build` alike.
