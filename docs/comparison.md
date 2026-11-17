# Compared with Slidev and Marp

[日本語](comparison.ja.md)

The same five slides were made with hinote, [Slidev](https://sli.dev), and [Marp CLI](https://github.com/marp-team/marp-cli), and their install, start-up, and build were measured. The five slides are a title, a list revealed one item at a time, TypeScript code, a paragraph, and a closing slide. The sources are in [`bench/`](../bench).

## Results

Measured on 2026-11-17. hinote was measured twice, run by Bun and run by Node; on Node it has esbuild and `@hono/node-server` added.

|                                                          | hinote 0.1.0 (Bun) | hinote 0.1.0 (Node) |    Slidev 53.1.0 | Marp CLI 4.5.1 |
| -------------------------------------------------------- | -----------------: | ------------------: | ---------------: | -------------: |
| Packages installed                                       |              **3** |                   6 |              639 |            155 |
| `node_modules` size                                      |         **5.6 MB** |             16.1 MB |           570 MB |         131 MB |
| Install time                                             |          **0.6 s** |               1.0 s |           13.6 s |          2.4 s |
| Dev server: until it responds                            |         **0.07 s** |              0.12 s |           0.55 s |         0.36 s |
| Dev server: from start until the browser shows the slide |         **0.17 s** |              0.21 s |           1.41 s |         0.62 s |
| Build time                                               |         **0.04 s** |              0.08 s |           1.56 s |         0.22 s |
| Build output                                             |      1 file, 17 KB |       1 file, 17 KB | 45 files, 791 KB | 1 file, 108 KB |
| Build output, gzipped                                    |               6 KB |                6 KB |           329 KB |          24 KB |

- The machine was an Apple M4 Pro with 48 GB of memory, running macOS 27.2.1, Bun 1.4.4, and Node.js 26.13.1.
- The two dev server rows and the build time are medians. The dev server was timed 3 times after the first start. The build was timed 5 times after one warm-up run.
- The first start was about the same: hinote 0.14 s on Bun and 0.19 s on Node, Slidev 1.61 s, Marp 0.69 s. Slidev's first start was timed with its Vite cache removed.

## How it was measured

```bash
bun bench/run.ts            # install, build, and until the dev server responds
bun bench/run.ts --browser  # also until the browser shows the slide (needs agent-browser)
```

- **Package manager:** Everything was installed with Bun. The two hinote rows start the CLI with `bun` and with `node`.
- **Install:** The cache was empty, so install time includes downloads. It depends on the network; treat it as a rough guide.
- **Until the browser shows the slide:** The time from starting the dev server until the title text appears in headless Chrome. It includes about 0.1 s of browser automation.
- **Build:** `hinote build`, `slidev build`, and `marp slides.md -o dist/index.html`.

## Reading the numbers

The build outputs do not contain the same things:

- **hinote:** One HTML file with the audience view only. It has no presenter view and no sync.
- **Slidev:** A static site, a single-page app built on Vue. It includes the presenter view and its other features.
- **Marp:** One HTML file that also includes a presenter view.

Part of hinote's lightness comes from doing less. Keep that in mind when reading the numbers above.

## Features

|                | hinote                                                                                         | Slidev                                                                            | Marp CLI                                                           |
| -------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Authoring      | TSX (Hono/JSX)                                                                                 | Markdown and Vue components                                                       | Markdown and CSS themes                                            |
| Runtime        | Bun or Node (on Node, with esbuild and @hono/node-server added); the deck also runs on Workers | Node.js 22.22 or later                                                            | Node.js 18 or later                                                |
| Components     | JSX components, which may be async                                                             | Vue components                                                                    | None (style with CSS)                                              |
| Presenter view | Only when the deck is served                                                                   | Yes, and a phone can control it                                                   | Also in the built HTML                                             |
| Export         | One HTML file with the audience view; PDF by printing in the browser                           | A static site; PDF, PNG, and PPTX need `playwright-chromium` installed separately | One HTML file; PDF, PPTX, and images need Chrome, Edge, or Firefox |
| Serving        | The deck is a Hono app: `bun deck.tsx` serves it, and `app.route()` mounts it                  | Dev server                                                                        | `-s` serves a directory                                            |

Slidev has many features hinote lacks: drawing, recording, LaTeX, Mermaid diagrams, icons, shared themes, and editor integration. Marp needs only Markdown and can export to PowerPoint.

hinote fits when you want:

- a small dependency footprint
- a light build output
- slides written as TypeScript code that read data while they render
- a deck you can mount into another app as a Hono app
