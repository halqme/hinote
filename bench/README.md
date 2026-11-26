# Compared with Slidev, Marp, and hono-decks

Decks were made with hinote, [Slidev](https://sli.dev), [Marp CLI](https://github.com/marp-team/marp-cli), and [hono-decks](https://github.com/ts-76/hono-decks), and their install, start-up, and build were measured. Each deck has about 20 slides mixing lists, code, tables, and quotes, with different content per tool. The Slidev, Marp, and hono-decks decks each add one thing that tool does well; the hinote deck adds slides that reproduce all three with hinote (22 slides). The sources are in [`bench/`](../bench).

hono-decks has a somewhat different aim: it adds MDX decks to an existing Hono app on Cloudflare Workers or Vite, several decks per app. Both serve slides on Hono and offer similar features, such as a presenter view and sync, so it is listed alongside.

## Results

The numbers are not kept here. A run writes `bench/report/` (`index.html` and `latest.json`) from what it actually installed. The Benchmark workflow runs that on Mondays and when started by hand, and publishes the report from `main`.

[View the benchmark report →](https://halqme.github.io/hinote/)

```bash
bun bench/run.ts            # install, build, and until the dev server responds
bun bench/run.ts --browser  # also until the browser shows the slide (needs agent-browser)
```

hinote is measured twice when the published packages can run this deck. **Release** is `hinote@latest` and `@hinote/code@latest` from npm, downloaded by the timed `bun install`. That row runs only when `hinote@latest` depends on `@hinote/core` and `@hinote/code` is on npm; otherwise the report says the release deck was not measured, and it does not substitute a different install. **Main** is this checkout: `bun pm pack` builds `hinote`, `@hinote/core`, `@hinote/code`, `@hinote/types`, and `@hinote/shared`, and the install uses those tarballs, not the workspace. Each is run by Bun and by Node; on Node the deck adds esbuild and `@hono/node-server`. The deck also installs KaTeX for the formula. Slidev, Marp, and hono-decks stay at the versions pinned in their `package.json`.

The dev server column in the report is the warm median, timed 3 times after the first start. The build is timed 5 times after one warm-up. Install time includes downloads. The machine, the commit, and the resolved versions are in the report, not in this file.

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

- **Package manager:** Everything was installed with Bun, in a temporary copy of the deck, from an empty cache. The hinote rows start the CLI with `bun` and with `node`.
- **Install:** Install time includes downloads. It depends on the network; treat it as a rough guide. Main's `@hinote/core`, `@hinote/types`, and `@hinote/shared` are overrides to the checkout tarballs, because the packed packages would otherwise ask npm for them.
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
