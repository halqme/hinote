# Developing hinote

The repository is a Bun workspace. Each package lives in `packages/`:

- `packages/hinote`: the `hinote` package, the CLI and the core components.
- `packages/code`: `@hinote/code`, the `<Code>` component. It depends on `@pierre/highlights` so that `hinote` does not.
- `packages/d2`: `@hinote/d2`, `<D2>`, D2 diagrams drawn as SVG with `@terrastruct/d2`. The compiler is WebAssembly in a worker thread; the component draws one diagram at a time and holds the worker only while it draws, so a build exits when it is done.
- `packages/katex`: `@hinote/katex`, `<Math>`, LaTeX as MathML with KaTeX.
- `packages/types`: `@hinote/types`, the types shared by `hinote` and the `@hinote/*` packages, such as `Theme` and `SlideContext`. It is one hand-written `index.d.ts` with no JavaScript. `hinote` re-exports what it holds.

Run `bun install` once at the root. The root `package.json` is private and holds the workspace and the dev dependencies every package uses: TypeScript, `@types/bun`, `hono`, and the linters. A package lists only what it needs beyond those. `tsconfig.base.json` holds the compiler options every package extends, and its `paths` point `hinote` and `@hinote/types` at their source, so the `@hinote/*` packages' tests render through `hinote` without depending on it. `.oxlintrc.json` holds the lint rules.

To try a change against a real deck, run `bun src/cli.ts init .tmp/talk --no-install` and then `bun src/cli.ts dev .tmp/talk` in `packages/hinote`.

`packages/hinote/src/client/main.ts` runs in the browser. Pages inline the generated `src/client/main.generated.ts`, so rendering never needs a bundler. After editing the client, run `bun run build:client` in `packages/hinote`; `bun test` fails while the generated file is stale.

`bun run build` builds every package; in one package it builds that one. Each package's `dist/` is its `src/` compiled file for file by TypeScript, JavaScript next to declarations, by `scripts/build-package.ts` and the package's `tsconfig.build.json`. Nothing is bundled, and each package declares `"sideEffects": false`, so a deck's bundler keeps only the modules the deck imports. `prepack` builds before packing. A package ships `dist/` and not `src/`, so Bun and Node load the same JavaScript. hinote's `scripts/build-lib.ts` adds the CSS module declaration that tsc does not copy. `bun test` in hinote also builds `dist/` and runs it under Node when Node is installed.

Before committing, run `bun run test`, `bun run typecheck`, and `bun run lint` at the root; each runs the same script in every package. `lint` runs [oxlint](https://oxc.rs/docs/guide/usage/linter) with the rules in `.oxlintrc.json` (each rule turned off there says why), including the type-aware ones that `tsrs` runs, and then each package's `lint`. In `packages/hinote` that is [oxdg](https://www.npmjs.com/package/oxdg), which fails on a circular import between modules in `src/`. `createSlide` lives in `src/deck/create.ts` for that reason: it builds decks, and a deck renders slides.

## Releasing

Every change that reaches users adds a line under `## Unreleased` in `packages/hinote/CHANGELOG.md`. To release, rename that heading to the new version, set the same version in `packages/hinote/package.json`, and merge to `main`. Then publish a GitHub release tagged `v<version>` whose body is that version's section of the changelog, not only a compare link. Publishing the release runs `.github/workflows/publish.yml`, which checks that the tag matches `packages/hinote/package.json` and runs `npm publish` in `packages/hinote`. Before that it publishes `@hinote/types`, `@hinote/code`, `@hinote/katex`, and `@hinote/d2` when npm does not have the version in their `package.json` yet. Bump a package's version whenever it changes, note the change in the changelog, and raise the range `hinote` depends on when `@hinote/types` changes.
