# hinote hands-on

[日本語](hands-on.ja.md)

Create a project, add slides, style them, present, and hand the deck out. It takes about 20 minutes.

You need [Bun](https://bun.com) or [Node.js](https://nodejs.org). The commands below are for Bun; on Node, use `npx` for `bunx`.

## 1. Create a project

```bash
bunx hinote init my-talk
cd my-talk
```

`init` also installs the packages. `my-talk` now has these files:

- `deck.tsx`: the slides. It starts with three.
- `style.css`: CSS for every slide, imported by `deck.tsx`.
- `tsconfig.json`: reads JSX with `hono/jsx`.
- `package.json`: depends on `hinote` and `hono` (and, when made on Node, on `esbuild` and `@hono/node-server`, which the CLI uses there).

## 2. Show it

```bash
bunx hinote dev
```

Open <http://127.0.0.1:4321>. Go forward with `→` or Space and back with `←`. On the second slide the list items appear one at a time before the next slide.

If you see `Port 4321 is in use`, pass another port:

```bash
bunx hinote dev --port 4322
```

## 3. Edit the first slide

Open `deck.tsx`, change `<h1>My talk</h1>` on the first slide, and save. The browser reloads on its own and stays on the same slide.

`notes` in `createSlide({ title, notes }, () => ...)` is for you; it shows in the presenter view.

## 4. Add a slide from its own file

As the deck grows, put slides in their own files. Create `slides/about.tsx`:

```tsx
import { Center, createSlide } from "hinote";

export default createSlide(
  { title: "About", notes: "Introduce yourself" },
  () => (
    <Center gap={2}>
      <h2>About me</h2>
      <p>Your name</p>
    </Center>
  ),
);
```

Import it in `deck.tsx` and put it in the list. The order of the array is the order of the slides.

```tsx
import about from "./slides/about.tsx";

// ...

  [
    title,
    about,
    points,
    code,
  ],
```

## 5. Add images

Make an `images/` directory and refer to files with relative paths:

```tsx
<img src="./images/logo.png" alt="Logo" width="200" />
```

`dev` serves the files in the directory of `deck.tsx`. Paths resolve from the deck root on the presenter view (`/presenter/2`) too.

## 6. Reveal step by step

Anything inside `<Step>` appears one key press at a time, as on the second slide:

```tsx
<ul>
  <Step as="li">First</Step>
  <Step as="li">Second</Step>
  <Step as="li">Third</Step>
</ul>
```

- `as` picks the element, `div` by default. Use `"li"` inside a list.
- `at={n}` shows it on step `n`. Elements with the same number appear together.
- Going back hides them in reverse, and lands on the previous slide fully revealed.

## 7. Show code

The third slide uses `<Code>`. The indentation around it is removed.

```tsx
<Code lang="ts">{`
  const answer = 42;
`}</Code>
```

Pick a color theme from `hinote/code-themes`:

```tsx
import { githubLight } from "hinote/code-themes";

<Code lang="ts" theme={githubLight}>{`...`}</Code>;
```

## 8. Change the look

Deck settings go in the first argument of the last `createSlide` in `deck.tsx`:

```tsx
export default createSlide(
  {
    aspect: "4:3",
    transition: "slide",
    css: style,
    theme: {
      colors: {
        bg: "#fffaf0",
        fg: "#1f2937",
        accent: "#ea580c",
        brand: "#ea580c",
      },
      fonts: { base: "'Hiragino Sans', sans-serif" },
    },
  },
  [title, about, points, code],
);
```

- `aspect` is the canvas ratio: `"16:9"` (default), `"4:3"`, or any `"W:H"`.
- `transition` is how slides enter: `"none"`, `"fade"`, or `"slide"`.
- `theme` values become CSS variables. A name of your own, such as `colors.brand`, is available as `var(--hinote-color-brand)`.

- `css` is CSS for every slide. The top of `deck.tsx` reads `style.css` as a string with `import style from "./style.css" with { type: "text" }`.

`style.css` holds plain CSS. Selectors match inside a slide, `&` is the slide itself, and the tokens you added to `theme` are there too:

```css
h2 {
  color: var(--hinote-color-brand);
}

& {
  padding: 64px 96px;
}
```

To change one slide only, put `theme`, `transition`, or `css` on that slide's `createSlide`. A slide's `css` wins over `style.css`.

## 9. Present

Open <http://127.0.0.1:4321/presenter>. The current slide is on the left; on the right are a preview of the next view, the elapsed time, the clock, and your notes.

- Open the audience view (`/`) in another window for the projector. It follows the presenter view.
- Move the mouse over the slide in the presenter view and a red pointer appears in the audience view.
- Press `O` for an overview of every slide; click one to jump to it.
- Click the elapsed time to restart it.
- To open the deck from a phone or another device, start it with `bunx hinote dev --host 0.0.0.0` and open one of the addresses it prints. For the presenter view and sync over the network too, set `presenter: true` on the deck.

## 10. Hand it out

```bash
bunx hinote build
```

`dist/index.html` is one HTML file with the audience view only, and the images it uses are copied into `dist/`. Hand out the `dist/` directory as it is. The presenter view and sync are not included.

`bunx hinote prerender` writes the deck as a static site you can upload to GitHub Pages or any static host. To include the presenter view, set `presenter: true` on the deck; anyone can open it then, notes included.

For a PDF, print the page and choose "Save as PDF". Each slide becomes one page with every step revealed.

## Next

- The deck is a Hono app. You can serve it without the CLI on Bun, Node, or Workers, and add routes with `deck.get("/api", ...)`; see [Serving the deck as a Hono app](../README.md#serving-the-deck-as-a-hono-app) in the README.
- Slides and components may be `async`, so they can read files or call APIs while rendering.
- For a deck closer to a real talk, see [`examples/`](../examples/README.md) in the repository: a fictional talk that includes an async component reading data into a chart.
- Everything else is in the [README](../README.md).
