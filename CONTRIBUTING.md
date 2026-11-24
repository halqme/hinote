# Developing hinote

The repository is a Bun workspace. Each package lives in `packages/`:

- `packages/hinote`: the `hinote` package, the CLI and the core components.
- `packages/types`: `@hinote/types`, the types shared with the `@hinote/*` packages. It is empty and private for now.

Run `bun install` once at the root. The root `package.json` is private and holds only the workspace and the shared tools; `tsconfig.base.json` holds the compiler options every package extends, and `.oxlintrc.json` the lint rules.

To try a change against a real deck, run `bun src/cli.ts init .tmp/talk --no-install` and then `bun src/cli.ts dev .tmp/talk` in `packages/hinote`.

`packages/hinote/src/client/main.ts` runs in the browser. Pages inline the generated `src/client/main.generated.ts`, so rendering never needs a bundler. After editing the client, run `bun run build:client` in `packages/hinote`; `bun test` fails while the generated file is stale.

`bun run build:lib` in `packages/hinote` writes `dist/`: the library and the CLI (`dist/cli.js`, the package's `bin`) as JavaScript, with type declarations. `prepack` runs it before packing. The package ships `dist/` and not `src/`, so Bun and Node load the same JavaScript. `bun test` also builds `dist/` and runs it under Node when Node is installed.

Before committing, run `bun run test`, `bun run typecheck`, and `bun run lint` at the root; each runs the same script in every package. `lint` runs [oxlint](https://oxc.rs/docs/guide/usage/linter) with the rules in `.oxlintrc.json` (each rule turned off there says why), including the type-aware ones that `tsrs` runs, and then each package's `lint`. In `packages/hinote` that is [oxdg](https://www.npmjs.com/package/oxdg), which fails on a circular import between modules in `src/`. `createSlide` lives in `src/deck/create.ts` for that reason: it builds decks, and a deck renders slides.

## Releasing

Only `hinote` is published. Every change that reaches users adds a line under `## Unreleased` in `packages/hinote/CHANGELOG.md`. To release, rename that heading to the new version, set the same version in `packages/hinote/package.json`, and merge to `main`. Then publish a GitHub release tagged `v<version>` whose body is that version's section of the changelog, not only a compare link. Publishing the release runs `.github/workflows/publish.yml`, which checks that the tag matches `packages/hinote/package.json` and runs `npm publish` in `packages/hinote`.
