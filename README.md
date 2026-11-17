# hinote

[日本語](README.ja.md)

Write slides with Hono and Hono/JSX. A deck is a Hono app: any way of running Hono serves it. `build` writes the audience view as one HTML file.

New to hinote? Start with the [hands-on](docs/hands-on.md). For a deck written like a real talk, see [`examples/`](examples/README.md); for how hinote compares with Slidev and Marp in install size and speed, see [the comparison](docs/comparison.md).

## Getting started

hinote runs on Bun or Node.

```bash
# Bun
bunx hinote init my-talk
cd my-talk
bun install
bun run dev

# Node
npx hinote init my-talk
cd my-talk
npm install
npm run dev
```

`init` writes `deck.tsx`, `style.css`, `tsconfig.json` (JSX from `hono/jsx`), and a `package.json` that depends on `hinote` and `hono`. Run on Node, it also adds `esbuild` and `@hono/node-server`, which the CLI uses there in place of Bun's bundler and server. It never overwrites a file, and it leaves an existing `package.json` alone; then add the packages yourself (`bun add hinote hono`, or `npm install hinote hono` and `npm install -D esbuild @hono/node-server`).

The [hands-on](docs/hands-on.md) walks from here through adding slides, images, steps, code, and a theme to presenting and handing the deck out.

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
- A render function and the components in it may be `async`, so a slide can read a file or call an API while it renders. The deck renders once per server start (or reload), and `build` waits for every slide.
- `transition` sets how slides enter: `"none"` (default), `"fade"`, or `"slide"`. Put it on the deck for every slide or on one slide for that slide; a nested deck lends it to its slides. Steps do not animate this way, and nothing animates when the system asks for reduced motion.
- `<Code lang="ts">{`...`}</Code>` (or `code={source}`) highlights code with [`@pierre/highlights`](https://diffs.com/highlights) while the slide renders, with colors inline, so neither the page nor the built file runs a highlighter. The indentation the surrounding JSX adds is removed. Pass `theme` from `hinote/code-themes` (for example `githubLight`); the default is Pierre's dark theme. The size comes from the theme's `typography.code`.
- `Center`, `Column`, and `Row` take `gap`, `align`, and `justify`. A numeric `gap` is that many multiples of the theme's `spacing.unit`.
- A theme has the groups `colors`, `fonts`, `typography`, `shadows`, and `spacing`, plus `radius`. Each token becomes a CSS variable named `--hinote-<group>-<name>`, with the groups written `color`, `font`, `text`, `shadow`, and `space`: `colors.bg` is `--hinote-color-bg`, `typography.h1` is `--hinote-text-h1`, and `radius` is `--hinote-radius`. hinote's own styles read `colors` `bg`, `fg`, `accent`, `muted`; `fonts` `base`, `heading`, `mono`; `typography` `h1`, `h2`, `body`, `small`; and `spacing.unit`. Any other name works the same way, so `colors: { brand: "#f50" }` gives `var(--hinote-color-brand)` to use in your slides. A slide's own `theme` sets only the tokens it names, on that slide.

## CSS

Pass `css` to a deck or a slide: CSS text, usually a `.css` file imported as text, or an array of them.

```tsx
import style from "./style.css" with { type: "text" };

export default createSlide({ css: style }, [
  title,
  createSlide({ css: "h2 { color: var(--hinote-color-accent); }" }, [a, b]),
  createSlide({ css: "& { padding: 0; }" }, () => <img src="./cover.png" />),
]);
```

- Each CSS reaches only its own slides: the deck's reaches every slide, a nested deck's reaches its slides, and a slide's reaches that slide. It never touches the presenter panel.
- Inner CSS wins: a slide's CSS beats its nested deck's, which beats the outer deck's, whatever the selectors. hinote puts each in a [cascade layer](https://developer.mozilla.org/docs/Web/CSS/@layer), and its own default styles sit in the weakest one, so any CSS you pass can override them.
- Selectors match inside the slide. Write `& { ... }` for the slide itself; `:root`, `html`, and `body` do not match. `@keyframes`, `@font-face`, and similar rules work anywhere in the file. `@import` is refused; pass each file in the array instead.
- `with { type: "text" }` imports the file as a string, typed as `string`. `hinote dev` and `hinote build`, `bun deck.tsx`, esbuild, and Wrangler all understand it, so serving the deck yourself needs no setup for CSS. Leave it out and the import is an object, which hinote refuses with a hint.
- A file URL, `new URL("./style.css", import.meta.url)`, also works. It is read when the deck renders, which needs a file system (Bun, Node, Deno).
- `url()` in CSS resolves from the page, that is, from the directory of `deck.tsx`.

## Steps

`<Step>` reveals part of a slide one key press at a time, like a click animation in other slide tools.

```tsx
<ul>
  <Step as="li">First</Step>
  <Step as="li">Second</Step>
  <Step as="li">Third</Step>
</ul>
```

The slide opens with all three hidden. Each `→` reveals the next one; once all are shown, `→` moves to the next slide. `←` hides them in reverse, and from the first step goes back to the previous slide with every step revealed.

| prop    | Meaning                                                                                  |
| ------- | ---------------------------------------------------------------------------------------- |
| `as`    | The element to render, `div` by default. Use `"li"` in a list or `"span"` in a sentence. |
| `at`    | The step that reveals it. Without it, steps count up 1, 2, 3, … in document order.       |
| `class` | A class for the element.                                                                 |

Give several elements the same `at` to reveal them together:

```tsx
<Step>Figure</Step>              {/* 1 */}
<Step at={1}>Its caption</Step>  {/* with the figure */}
<Step>Summary</Step>             {/* 2 */}
```

- `<Step>` renders an element with `data-hinote-step="n"`. Any element you give that attribute, such as `<img data-hinote-step="1">`, works the same way.
- A hidden step keeps its space (`opacity: 0` and `visibility: hidden`), so nothing shifts when it appears. It fades in over 0.2 s.
- Steps inside async components still count in document order.
- The presenter and audience views sync down to the step. The URL holds the slide only, so a reload starts the slide with no step revealed.
- The presenter's next preview shows the next step. Printing reveals every step. `transition` does not animate steps.

## Running

```bash
hinote dev [deck.tsx] [--port 4321] [--host 127.0.0.1]
hinote build [deck.tsx] [-o dist/index.html]
```

The CLI works the same on Bun and on Node. On Bun it uses Bun's own bundler and server; on Node it uses `esbuild` and `@hono/node-server`, which `init` adds there. If they are missing on Node, the CLI hands the run to Bun when Bun is installed, and otherwise says what to install.

`dev` serves the deck at <http://127.0.0.1:4321> and the presenter view at `/presenter`. The presenter view shows the current slide, a preview of what the next key press shows, the elapsed time (click it to restart; it survives reloads), the clock, and the notes. Press `O` for an overview of every slide; click one to jump to it. It reloads the deck when a file in the deck directory changes, and open pages reload with it. A deck that fails to load is reported, and the last one keeps serving. `dev` also serves files inside the deck directory, such as images, and refuses a path that leaves that directory.

`dev` listens on this machine only. Pass `--host 0.0.0.0` to open the deck from a phone or another laptop on the same network; it prints the addresses to use. Every file in the deck directory can then be fetched from the network, so use it on networks you trust.

`/3` opens the third slide and `/presenter/3` its presenter view. Paths do not nest further: steps are not in the URL, so a reload starts the slide with no step revealed.

Advance with the left, right, up, and down arrows, Page Up, Page Down, Space, Enter, Backspace, Home, and End. Going forward reveals the next step before moving on; going back from a slide lands on the previous slide with every step revealed.

The presenter sends the pointer to the audience. Either window can move, and the other follows. A window opened later jumps to the presenter's position. Pages sync through the deck itself (an SSE stream at `/_hinote/events` and POST to `/_hinote/sync`), so pages on other devices that reach the server follow too.

To make a PDF, print any page and choose "Save as PDF". Each slide becomes one page at canvas size with every step revealed.

`build` writes the audience view only: no presenter view, no pointer, and no sync. The position is in the hash (`#3`). Images and other files the slides refer to by relative path (`src`, `href`, `srcset`, and `url()` in CSS) are copied next to the HTML file, keeping their paths. Files outside the deck directory, absolute paths, and other sites are left as they are.

## Serving the deck as a Hono app

A deck is a Hono app, so you can also serve it without the CLI: on its own, mounted in another app with `app.route("/talk", deck)`, or with routes of your own added by `deck.get(...)`. Without `dev`, nothing serves the files next to the deck; add `serveStatic` if the slides use images. The package ships JavaScript and type declarations, so any runtime that runs Hono can serve it.

### Bun

```bash
bun deck.tsx        # serves on port 3000
bun --hot deck.tsx  # also reloads open pages when you save
```

### Node

```ts
import { serve } from "@hono/node-server";
import deck from "./deck.js";

serve({ fetch: deck.fetch, port: 4321 });
```

Node does not run TSX, so compile `deck.tsx` first. With esbuild:

```bash
esbuild deck.tsx --bundle --platform=node --format=esm --packages=external \
  --jsx=automatic --jsx-import-source=hono/jsx --outfile=deck.js
```

### Cloudflare Workers

Export the deck as the Worker:

```toml
# wrangler.toml
main = "src/deck.tsx"
compatibility_date = "2026-11-01"
```

A deployed Worker may answer requests from several isolates, and sync only reaches pages connected to the same one. CSS passed as a file URL needs a file system, so import the file instead.

The deck, the presenter view, `<Code>`, CSS, and sync were checked on all three: Bun, Node with `@hono/node-server`, and Workers with `wrangler dev`. Deno has not been tried.

To show the deck farther away, put it behind whatever you already use: a deck is a Hono app, so [Tailscale](https://tailscale.com/kb/1312/serve), [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/), or any host that runs Hono can serve it. hinote does not choose one for you. Sync keeps pages in step only when they reach the same process.

## Developing hinote

In this repository, `bun run dev` shows the example in [`examples/`](examples/README.md): a fictional five-minute talk written the way a real one would be.

`src/client.ts` runs in the browser. Pages inline the generated `src/client.generated.ts`, so rendering never needs a bundler. After editing the client, run `bun run build:client`; `bun test` fails while the generated file is stale.

`bun run build:lib` writes `dist/`: the library and the CLI (`dist/cli.js`, the package's `bin`) as JavaScript, with type declarations. `prepack` runs it before packing. Bun loads `src/` directly through the `bun` export condition. `bun test` also builds `dist/` and runs it under Node when Node is installed.
