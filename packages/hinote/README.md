# hinote

Write slides with Hono and Hono/JSX.

- **Slides are code.** Each slide is a component, so it can read a file or fetch data while it renders. Lay it out with `Row`, `Column`, `Grid`, and `Card`, and start from `themes.ink`, `themes.paper`, or `themes.slate`.
- **A deck is a Hono app, with a route for each slide.** `hinote dev` presents it, `build` writes the audience view as one HTML file, `prerender` writes every route out as a static site, and `app.route()` mounts the same deck in a server of your own, where middleware runs for each slide that is opened. Such a server can depend on [`@hinote/core`](https://github.com/halqme/hinote/tree/main/packages/core), the library `hinote` re-exports, without the CLI and its bundler.
- **The install stays small.** The [comparison](https://github.com/halqme/hinote/blob/main/bench/README.md) with Slidev, Marp, and hono-decks measures the install, the dev server, and the build. Those numbers are the latest benchmark run, not this file.

Code, formulas, diagrams, charts, icons, and QR codes are separate packages, so a deck installs only what it shows: `@hinote/code`, `@hinote/katex`, `@hinote/d2`, `@hinote/mermaid`, `@hinote/chart`, `@hinote/icon`, and `@hinote/qr`. Their guides ship with hinote (`hinote skills`).

New to hinote? Run `hinote init`, then `hinote skills get core` for the loop and references.

## Getting started

hinote runs on Bun or Node.

```bash
# Bun
bunx hinote init my-talk
cd my-talk
bunx hinote dev

# Node
npx hinote init my-talk
cd my-talk
npx hinote dev
```

`init` writes `deck.tsx`, `style.css`, `tsconfig.json` (JSX from `hono/jsx`, and `*.client.tsx` left out of that program), `tsconfig.client.json` (those browser files, JSX from `hono/jsx/dom`), and a `package.json` that depends on `hinote` and `hono`, then installs them with the package manager that started it: `bunx` runs `bun install`, `npx` runs `npm install`, and `pnpm dlx` and `yarn dlx` use pnpm and yarn. It prints the command it runs; `--no-install` skips it, and a failed install keeps the files and says how to try again. It never overwrites a file. After upgrading hinote, `hinote init --diff` compares the project's `tsconfig.json`, `tsconfig.client.json`, and package ranges with what this version would write, and changes nothing. In a directory that already has a `package.json`, it leaves that file alone, installs nothing, and prints what to add. Every command afterwards goes through the CLI the same way: `bunx hinote dev`, `npx hinote build`, and so on.

From here, add slides, images, steps, code, and a theme, then present with `hinote dev` or hand the deck out with `hinote build`. `hinote skills get core` walks the same loop with the references for the API, browser code, serving, and recipes.

## Documentation

The guide ships with the package and matches its version. `hinote skills get core` prints it, and `--ref <name>` prints one reference. The same files are in [`skills/core`](skills/core/SKILL.md):

- [`api`](skills/core/references/api.md): `createSlide` and its options, the components, themes, and CSS.
- [`client`](skills/core/references/client.md): `<Script>` and the `hinote` browser global.
- [`serving`](skills/core/references/serving.md): `dev`, `build`, `prerender`, `snapshot`, mounting the deck in Bun, Node, or Cloudflare Workers, middleware in front of each slide, and the one-step commands.
- [`recipes`](skills/core/references/recipes.md): formulas, images beside text, columns, charts.

[Developing hinote](https://github.com/halqme/hinote/blob/main/CONTRIBUTING.md)

## Limits

- **Sync lives in memory.** Pages sync through a hub inside the process that serves the deck. Pages that reach different processes do not follow each other: several isolates of a deployed Worker, several instances behind a load balancer, or serverless functions. Long-lived connections may also be cut where a host limits them.
- **Prerendered pages sync within one browser.** They use `BroadcastChannel`, so a phone or another computer does not follow.
- **Steps are not in the URL.** A reload shows the slide with no step revealed.
- **Not tried yet:** Deno, a deployed Cloudflare Worker, and other serverless hosts.
