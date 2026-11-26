import { expect, test } from "bun:test";
import { app } from "./server.ts";

const paid = "This slide was not in the free page";
const locked = "Unlock this demo";

async function page(path: string, cookie?: string) {
  const response = await app.request(path, {
    headers: cookie === undefined ? {} : { cookie },
  });
  return { response, html: await response.text() };
}

test("the free slide's page does not carry the paid one", async () => {
  for (const path of ["/", "/1"]) {
    const { response, html } = await page(path);
    expect(response.status).toBe(200);
    expect(html).toContain("Each slide is a request");
    expect(html).not.toContain(paid);
  }
});

test("without the cookie, the paid slide's route answers with the paywall", async () => {
  // The page fetches /2 to move there, so this is what it gets, and it opens
  // the paywall as a page of its own.
  const { response, html } = await page("/2");
  expect(response.status).toBe(402);
  expect(html).toContain(locked);
  expect(html).not.toContain(paid);
  expect(html).not.toContain("data-hinote-deck");
});

test("with the cookie, the paid slide comes through", async () => {
  const { response, html } = await page("/2", "hinote-demo=1");
  expect(response.status).toBe(200);
  expect(html).toContain(paid);
  expect(html).not.toContain(locked);
});

test("/unlock sets the cookie and /lock clears it", async () => {
  const unlock = await app.request("/unlock");
  expect(unlock.status).toBe(302);
  expect(unlock.headers.get("location")).toBe("/2");
  expect(unlock.headers.get("set-cookie")).toContain("hinote-demo=1");

  const lock = await app.request("/lock", {
    headers: { cookie: "hinote-demo=1" },
  });
  expect(lock.status).toBe(302);
  expect(lock.headers.get("location")).toBe("/");
  expect(lock.headers.get("set-cookie")).toContain("hinote-demo=");
});
