# Developing hinote

To try a change against a real deck, run `bun src/cli.ts init .tmp/talk --no-install` and then `bun src/cli.ts dev .tmp/talk`.

`src/client/main.ts` runs in the browser. Pages inline the generated `src/client/main.generated.ts`, so rendering never needs a bundler. After editing the client, run `bun run build:client`; `bun test` fails while the generated file is stale.

`bun run build:lib` writes `dist/`: the library and the CLI (`dist/cli.js`, the package's `bin`) as JavaScript, with type declarations. `prepack` runs it before packing. The package ships `dist/` and not `src/`, so Bun and Node load the same JavaScript. `bun test` also builds `dist/` and runs it under Node when Node is installed.

Before committing, run `bun test`, `bun run typecheck`, and `bun run lint`. `lint` runs [oxlint](https://oxc.rs/docs/guide/usage/linter) with the rules in `.oxlintrc.json` (each rule turned off there says why), including the type-aware ones that `tsrs` runs, and [oxdg](https://www.npmjs.com/package/oxdg), which fails on a circular import between modules in `src/`. `createSlide` lives in `src/deck/create.ts` for that reason: it builds decks, and a deck renders slides.

## Releasing

Every change that reaches users adds a line under `## Unreleased` in `CHANGELOG.md`. To release, rename that heading to the new version, set the same version in `package.json`, and merge to `main`. Then publish a GitHub release tagged `v<version>` whose body is that version's section of `CHANGELOG.md`, not only a compare link. Publishing the release runs `.github/workflows/publish.yml`, which checks that the tag matches `package.json` and runs `npm publish`.
