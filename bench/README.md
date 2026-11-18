# Compared with Slidev, Marp, and hono-decks

[日本語](comparison.ja.md)

Decks were made with hinote, [Slidev](https://sli.dev), [Marp CLI](https://github.com/marp-team/marp-cli), and [hono-decks](https://github.com/ts-76/hono-decks), and their install, start-up, and build were measured. Each deck has about 20 slides mixing lists, code, tables, and quotes, with different content per tool. The Slidev, Marp, and hono-decks decks each add one thing that tool does well; the hinote deck adds slides that reproduce all three with hinote (22 slides). The sources are in [`bench/`](../bench).

hono-decks has a somewhat different aim: it adds MDX decks to an existing Hono app on Cloudflare Workers or Vite, several decks per app. Both serve slides on Hono and offer similar features, such as a presenter view and sync, so it is listed alongside.

## Results

hinote was measured twice, run by Bun and run by Node; on Node it has esbuild and `@hono/node-server` added. hinote's numbers include KaTeX, added for the formula.

|                                                          | hinote 0.1.0 (Bun) | hinote 0.1.0 (Node) | hono-decks 2.2.0 |       Slidev 53.1.0 | Marp CLI 4.5.1 |
| -------------------------------------------------------- | -----------------: | ------------------: | ---------------: | ------------------: | -------------: |
| Slides                                                   |                 22 |                  22 |               20 |                  20 |             20 |
| Packages installed                                       |              **5** |                   8 |              161 |                 639 |            155 |
| `node_modules` size                                      |        **10.3 MB** |             20.8 MB |          46.6 MB |              570 MB |         131 MB |
| Install time                                             |          **0.4 s** |               1.0 s |            2.3 s |              10.8 s |          2.7 s |
| Dev server: until it responds                            |         **0.08 s** |              0.14 s |           0.29 s |              0.58 s |         0.32 s |
| Dev server: from start until the browser shows the slide |         **0.18 s** |              0.24 s |           0.40 s |              1.54 s |         0.60 s |
| Build time                                               |         **0.05 s** |              0.10 s |           0.21 s |              1.56 s |         0.22 s |
| Build output                                             |     2 files, 28 KB |      2 files, 28 KB |                — | 120 files, 1,899 KB | 1 file, 116 KB |
| Build output, gzipped                                    |               8 KB |                8 KB |                — |            1,197 KB |          24 KB |

- The machine was an Apple M4 Pro with 48 GB of memory, running macOS 27.2.1, Bun 1.4.4, and Node.js 26.13.1.
- The two dev server rows and the build time are medians. The dev server was timed 3 times after the first start. The build was timed 5 times after one warm-up run.
- The first start was about the same: hinote 0.15 s on Bun and 0.22 s on Node, hono-decks 0.38 s, Slidev 1.72 s, Marp 0.79 s. Slidev's first start was timed with its Vite cache removed.
- hinote's two files are the HTML and the background image. Marp does not copy images, so its one file has no image in it; the image has to be placed separately. Slidev's many files include the formula fonts.

## How far hinote follows

hinote reproduced what each of the other tools does well, with the same look. Each was checked in a browser.

| Tool       | Strength                           | In that tool                       | In hinote                                                                                                | Added   |
| ---------- | ---------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------- | ------- |
| Slidev     | LaTeX formulas                     | `$$ ... $$`                        | A small component that renders MathML with KaTeX while the slide renders (`<Math tex="..." />`, 9 lines) | `katex` |
| Marp       | A background image beside the text | `![bg left:40%](./photo.svg)`      | The slide's `css` makes a two-column grid with the image as the left column                              | Nothing |
| hono-decks | A two-column layout                | `layout: two-cols` and `::right::` | Two `Column`s in a `Row`                                                                                 | Nothing |

- For brevity, the one-line Markdown of the other tools wins. hinote takes a component or some CSS, but the mechanism is yours to change.
- hono-decks islands (components that run in the browser) were tried too, but in this setup they did not come alive in the browser, so they are left out. hinote does the same with `<Script>`; see the example's Game of Life and chart switch.

## How it was measured

```bash
bun bench/run.ts            # install, build, and until the dev server responds
bun bench/run.ts --browser  # also until the browser shows the slide (needs agent-browser)
```

- **Package manager:** Everything was installed with Bun. The two hinote rows start the CLI with `bun` and with `node`.
- **Install:** The cache was empty, so install time includes downloads. It depends on the network; treat it as a rough guide.
- **Until the browser shows the slide:** The time from starting the dev server until the title text appears in headless Chrome. It includes about 0.1 s of browser automation.
- **Build:** `hinote build`, `hono-decks compile`, `slidev build`, and `marp slides.md -o dist/index.html`.
- **hono-decks:** The project is what `hono-decks init` writes, plus a Hono app that mounts the deck. In daily use Wrangler or Vite compiles on start, so its dev server is timed from `compile` until Bun serves the app. The browser waited on `/decks/talk/presentation`, which shows the slides alone.

## Reading the numbers

The build outputs do not contain the same things:

- **hinote:** One HTML file with the audience view only. It has no presenter view and no sync.
- **hono-decks:** `compile` writes TypeScript modules for a Hono app, not something to hand out, so no size is given. The host that serves it, Wrangler or Vite, is not counted in its packages or size either.
- **Slidev:** A static site, a single-page app built on Vue. It includes the presenter view and its other features.
- **Marp:** One HTML file that also includes a presenter view.

## Features

|                | hinote                                                                                               | hono-decks                                                                      | Slidev                                                                            | Marp CLI                                                           |
| -------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Authoring      | TSX (Hono/JSX)                                                                                       | MDX (Markdown with Hono/JSX components)                                         | Markdown and Vue components                                                       | Markdown and CSS themes                                            |
| Runtime        | Bun or Node (on Node, with esbuild and @hono/node-server added); the deck also runs on Workers       | An existing Hono app (Cloudflare Workers, Vite, HonoX, Void)                    | Node.js 22.22 or later                                                            | Node.js 18 or later                                                |
| Components     | JSX components, which may be async                                                                   | MDX components and client islands                                               | Vue components                                                                    | None (style with CSS)                                              |
| Presenter view | Only when turned on (`hinote dev` turns it on for localhost)                                         | Yes, with remote control from other devices through Durable Objects             | Yes, and a phone can control it                                                   | Also in the built HTML                                             |
| Export         | One HTML file with the audience view, or a static site (`prerender`); PDF by printing in the browser | A print route; PDF and PNG through Cloudflare Browser Rendering                 | A static site; PDF, PNG, and PPTX need `playwright-chromium` installed separately | One HTML file; PDF, PPTX, and images need Chrome, Edge, or Firefox |
| Serving        | The deck is a Hono app, so `app.route()` mounts it in a server of your own                           | Built to be mounted in an app with `app.route(decks.mountPath, decks.router())` | Dev server                                                                        | `-s` serves a directory                                            |

Slidev has many features hinote lacks: drawing, recording, LaTeX, Mermaid diagrams, icons, shared themes, and editor integration. Marp needs only Markdown and can export to PowerPoint. hono-decks suits serving several decks from one Hono app, with Workers-based export, remote control, OGP images, embeds, and built-in layouts.

hinote fits when you want:

- a small dependency footprint
- a light build output
- slides written as TypeScript code that read data while they render
- one deck made and presented with the CLI alone, which can also be mounted in another app as a Hono app
