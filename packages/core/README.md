# @hinote/core

The library of [hinote](https://github.com/halqme/hinote/tree/main/packages/hinote): `createSlide`, the layout components, `<Step>`, `<Morph>`, `<Script>`, and themes. A deck is a Hono app, which renders its slides on the server into one page.

`hinote` re-exports this package and adds the CLI (`dev`, `build`, `check`, `snapshot`, …) with the bundler it runs on. Depend on `@hinote/core` alone when a server or an app of your own serves the deck and builds it with the project's own bundler, or with none: the package is plain JavaScript, its browser runtime already bundled. Import from `@hinote/core` where a deck for the CLI imports from `hinote`, and from `@hinote/core/client` for `hinote/client`.

The guide ships with hinote: `hinote skills get core --ref serving` covers serving a deck yourself.
