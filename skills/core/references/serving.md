# Showing and shipping a deck

| Goal                              | Command                         | Result                                                                    |
| --------------------------------- | ------------------------------- | ------------------------------------------------------------------------- |
| Present from this machine         | `hinote dev`                    | `/` for the audience, `/presenter` with notes, timer, next preview, laser |
| Present to devices on the network | `hinote dev --host 0.0.0.0`     | Presenter off unless the deck sets `presenter: true`                      |
| Hand out one file                 | `hinote build`                  | `dist/index.html` plus the files slides load                              |
| Host on a static site             | `hinote prerender --base /repo` | `/`, `/3/`, and with `presenter: true`, `/presenter/`                     |
| Mount in a server                 | `hinote assets`                 | `public/` with only the files slides load                                 |

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

Cloudflare Workers: `main = "deck.tsx"` and `[assets] directory = "./public"` in `wrangler.toml`. Pass CSS as an imported string there, not a file URL. Sync reaches only pages on the same isolate.

`<Script>` with a file URL is bundled only by the hinote CLI; in a server of your own, pass a string `src` to a script you built.
