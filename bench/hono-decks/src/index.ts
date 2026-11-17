import { Hono } from "hono";
import { decks } from "../decks";

const app = new Hono();
app.get("/", (c) => c.redirect(decks.paths("talk").viewer));
app.route(decks.mountPath, decks.router());

export default { fetch: app.fetch, port: Number(process.env.PORT ?? 3000) };
