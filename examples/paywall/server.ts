import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { html } from "hono/html";
import deck from "./deck.tsx";

const TICKET = "hinote-demo";

const cookie = { path: "/", httpOnly: true, sameSite: "Lax" } as const;

export const app = new Hono();

app.get("/unlock", (c) => {
  setCookie(c, TICKET, "1", cookie);
  return c.redirect("/2");
});

app.get("/lock", (c) => {
  deleteCookie(c, TICKET, { path: "/" });
  return c.redirect("/");
});

// Each slide is its own request, the page's move to the next one included,
// so ordinary middleware decides who sees it. Without the cookie, slide 2 and
// later answer with this page instead, and the browser opens it as it is.
app.use("/:slide{[0-9]+}", async (c, next) => {
  if (Number(c.req.param("slide")) < 2 || getCookie(c, TICKET) === "1") return next();
  return c.html(
    html`<!doctype html>
      <title>The rest stays on the server</title>
      <h1>The rest stays on the server</h1>
      <p><a href="/unlock">Unlock this demo</a></p>
      <p>This sets a cookie. It does not take payment.</p>`,
    402,
  );
});

app.route("/", deck);

export default app;
