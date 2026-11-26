# Paywall

Each slide of a deck is a request, and moving to the next slide fetches it, so Hono middleware in front of the deck sees every slide before the browser does. This server lets the first slide through and answers slide 2 with a paywall page, status 402, until the `hinote-demo` cookie is set. The page opens that answer as an ordinary page, and the paid slide is never in what the browser received. `/unlock` sets the cookie and redirects to `/2`; `/lock` clears it.

The cookie stands in for a ticket. Nothing here takes payment.

```sh
# at the repository root
bun install

# here
bun run dev     # http://localhost:3000
bun test
bun run check
```
