# Showing and shipping a deck

| Goal                              | Command                         | Result                                                                                  |
| --------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------- |
| Present from this machine         | `hinote dev`                    | `/` for the audience, `/presenter` with timer, progress, next preview, notes, laser     |
| Present to devices on the network | `hinote dev --host 0.0.0.0`     | Presenter off unless the deck sets `presenter: true`                                    |
| Hand out one file                 | `hinote build`                  | `dist/index.html` with previous and next under the slide; with `--embed`, only the HTML |
| Host on a static site             | `hinote prerender --base /repo` | `/`, `/3/`, and with `presenter: true`, `/presenter/`                                   |
| Mount in a server                 | `hinote assets`                 | `public/` with only the files slides load                                               |

The pipeline, step by step (each runs alone):

```bash
hinote render --page static | hinote inline -o dist/index.html
hinote assets -o dist
```

## In a server of your own

A deck is a Hono app. Mount it and serve `public/` from `hinote assets`:

```ts
import { Hono } from "hono";
import { serveStatic } from "hono/bun"; // or @hono/node-server/serve-static
import deck from "./deck.tsx";

const app = new Hono();
app.route("/", deck);
app.use("/*", serveStatic({ root: "./public" }));
```

On Node, use `serve` from `@hono/node-server` and `serveStatic` from `@hono/node-server/serve-static`. Node does not run TSX, so compile the deck first:

```bash
esbuild deck.tsx --bundle --platform=node --format=esm --packages=external \
  --jsx=automatic --jsx-import-source=hono/jsx --outfile=deck.js
```

Cloudflare Workers: `main = "deck.tsx"` and `[assets] directory = "./public"` in `wrangler.toml`. Pass CSS as an imported string there, not a file URL. Sync reaches only pages on the same isolate.

Run `hinote assets` again after adding images. Bun, Node with `@hono/node-server`, and `wrangler dev` were checked; Deno and a deployed Worker were not. To reach the deck from farther away, put it behind a tunnel or any host that runs Hono; sync keeps pages in step only when they reach the same process.

A server or app that never runs the CLI can depend on `@hinote/core` instead of `hinote`. It is the same library, which `hinote` re-exports, without the CLI and its bundler: the deck goes through whatever the project already builds with. Import from `@hinote/core` and `@hinote/core/client` in place of `hinote` and `hinote/client`.

`<Script>` with a file URL is bundled only by the hinote CLI. In a server of your own, bundle the file with your own bundler and pass its URL as a string `src`; a page that still has a file URL answers 500 with a `script-unbundled` error instead of serving a script that never runs. The scripts packages add, such as the one that animates `@hinote/chart`, come built and run in any server.

## Presenting with dev

- `/` is the audience view. `F` or the fullscreen icon fills the screen, and the icon switches to leave it. The icon stays hidden until the pointer moves. `/presenter` shows the slide, a timer (click to restart; it survives reloads), the clock, and a progress mark for each slide. The side column has a preview of the next key press and the notes, at the same size as the panel text. Notes take no space when a slide has none. Prev, Next, Overview, and Laser sit under the slide. `P` and `←` go back, `N` and `→` go forward, `O` opens an overview of every slide by number and title, and `L` toggles the laser. The underlined letters and arrows on the buttons are those keys.
- Keys: arrows, Page Up/Down, Space, Enter, Backspace, Home, End.
- The presenter sends the pointer. Pages sync through the deck (SSE at `/_hinote/events`, POST to `/_hinote/sync`), so other devices that reach the server follow; a window opened later jumps to the presenter.
- `dev` reloads the deck and open pages when a file in the deck directory changes. A deck that fails to load is reported, and the last good one keeps serving. It serves files inside the deck directory and refuses paths outside it.
- The presenter view, sync, and pointer are on only when `dev` serves this machine. With `--host 0.0.0.0`, or in a server of your own, they stay off until the deck sets `presenter: true`; until then `/presenter` and the sync endpoints answer 404 and no other page carries the notes. Anyone who reaches a deck with the presenter on can read the notes and move the slides.
- To make a PDF, print any page and save as PDF: one page per slide at canvas size, every step shown.

## Output of each command

- `build`: the audience view only (no presenter, pointer, or sync), with previous and next icons over the slide. They stay hidden until the pointer moves. The position is in the hash (`#3`). Files the slides refer to by relative path (`src`, `href`, `srcset`, CSS `url()`) are copied beside it with their paths; files outside the deck directory, absolute paths, and other sites are left as they are.
- `prerender`: `index.html` at `/` and `/3/` for each slide, plus those files. With `presenter: true` also `/presenter/` and `/presenter/3/`, synced between windows of one browser with `BroadcastChannel`; anyone can open them and read the notes. `--base /repo` for a site under a path, such as a GitHub Pages project site.
- `snapshot`: `auto` tries `agent-browser`, `puppeteer` (the project's package), `chrome` (Google Chrome, Chromium, or Edge, or `HINOTE_CHROME`), and `chrome-for-testing` (or `HINOTE_CHROME_FOR_TESTING`). As root, chrome and puppeteer add `--no-sandbox`. Extra Chromium flags go in `HINOTE_CHROME_FLAGS`; when Chrome dies on start, the error's `hint` has the tail of its stderr.
- The CLI bundles with Rolldown, which comes with hinote, on Bun and Node alike. It serves with `Bun.serve` on Bun and `node:http` on Node.

## One step at a time

| Command                                        | What it does                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------------- |
| `hinote check`                                 | Every problem with a code and a hint; exit 1 if there is one                 |
| `hinote inspect`                               | Each slide's title, steps, notes, and files                                  |
| `hinote refs`                                  | The files slides refer to, and whether each exists                           |
| `hinote render --page view\|presenter\|static` | One page's HTML, `<Script>` left as placeholders                             |
| `hinote inline [page.html]`                    | Bundles the `<Script>` files of a page from a file or stdin                  |
| `hinote init --diff`                           | What differs from the settings and package ranges this version's init writes |

`hinote skills path core` prints this guide's directory, to copy into an agent's skills.
