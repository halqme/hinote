// The page runtime in a DOM: keys, steps, the URL, the presenter's toolbar
// and laser, and window.hinote. Each test gets a fresh happy-dom window and a
// page rendered by the deck, then starts the runtime on it.
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { boot } from "../src/client-boot.ts";
import type { HinoteClient } from "../src/client-api.ts";
import { Step, createSlide } from "../src/index.ts";
import type { Page, Sync } from "../src/render.ts";

// The page defines this. Importing hinote/client would type it for every file
// in the program, so the test declares it for itself.
declare const hinote: HinoteClient;

// A BroadcastChannel that records what the page posts and lets a test
// deliver messages as if another window sent them.
const channels: FakeChannel[] = [];
class FakeChannel {
  posted: unknown[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  constructor(readonly name: string) {
    channels.push(this);
  }
  postMessage(data: unknown) {
    this.posted.push(JSON.parse(JSON.stringify(data)));
  }
  deliver(data: unknown) {
    this.onmessage?.({ data });
  }
  close() {}
}

const deck = createSlide({ presenter: true }, [
  createSlide({ notes: "first notes" }, () => <p>one</p>),
  createSlide({ notes: "second notes" }, () => (
    <ul>
      <Step as="li">a</Step>
      <Step as="li">b</Step>
    </ul>
  )),
  createSlide(() => <p>three</p>),
]);

async function open(page: Page, url: string, sync?: Sync, directories = false) {
  const html = await deck.render(page, {
    base: page === "static" ? undefined : "",
    sync,
    directories,
  });
  (
    window as unknown as { happyDOM: { setURL(url: string): void } }
  ).happyDOM.setURL(url);
  // The runtime is started by the test, not by the inlined script.
  document.write(html.replace(/<script>[\s\S]*?<\/script>/g, ""));
  document.close();
  boot();
  return channels.at(-1);
}

const press = (key: string) =>
  document.dispatchEvent(new KeyboardEvent("keydown", { key }));
const active = () =>
  [...document.querySelectorAll("#deck .slide")].findIndex((slide) =>
    slide.classList.contains("is-active"),
  );
const hidden = () =>
  [
    ...document.querySelectorAll("#deck .slide.is-active [data-hinote-step]"),
  ].map((el) => el.classList.contains("is-hidden"));
const click = (action: string) =>
  document
    .querySelector<HTMLElement>(`#hinote-toolbar [data-action="${action}"]`)
    ?.click();

beforeEach(() => {
  GlobalRegistrator.register({ url: "http://localhost/" });
  (globalThis as { BroadcastChannel: unknown }).BroadcastChannel = FakeChannel;
  channels.length = 0;
});

afterEach(async () => {
  await GlobalRegistrator.unregister();
});

describe("navigating a page", () => {
  test("keys reveal steps before moving on, and the hash follows the slide", async () => {
    await open("static", "http://localhost/index.html#2");
    expect(active()).toBe(1);
    expect(hidden()).toEqual([true, true]);
    press("ArrowRight");
    expect(hidden()).toEqual([false, true]);
    press(" ");
    expect(hidden()).toEqual([false, false]);
    press("ArrowRight");
    expect(active()).toBe(2);
    expect(location.hash).toBe("#3");
    press("ArrowLeft");
    expect(active()).toBe(1);
    expect(hidden()).toEqual([false, false]);
    press("Home");
    expect(active()).toBe(0);
    press("End");
    expect(active()).toBe(2);
  });

  test("keys with a modifier are left to the browser", async () => {
    await open("static", "http://localhost/index.html");
    const event = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      metaKey: true,
      cancelable: true,
    });
    document.dispatchEvent(event);
    expect(active()).toBe(0);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe("window.hinote", () => {
  test("reports the position at once and on every change", async () => {
    await open("static", "http://localhost/index.html");
    expect(hinote.role).toBe("view");
    expect(hinote.sync).toBe("none");
    const seen: unknown[] = [];
    const stop = hinote.on("position", (position) => seen.push(position));
    press("ArrowRight");
    stop();
    press("ArrowRight");
    expect(seen).toEqual([
      { slide: 0, step: 0 },
      { slide: 1, step: 0 },
    ]);
    expect(hinote.position).toEqual({ slide: 1, step: 1 });
  });

  test("send reaches this page; a handler that throws does not stop the others", async () => {
    await open("static", "http://localhost/index.html");
    const got: unknown[] = [];
    hinote.on("poll", () => {
      throw new Error("broken handler");
    });
    hinote.on("poll", (data) => got.push(data));
    const error = console.error;
    console.error = () => {};
    try {
      hinote.send("poll", { vote: "a" });
    } finally {
      console.error = error;
    }
    expect(got).toEqual([{ vote: "a" }]);
    expect(() => hinote.send("has space")).toThrow();
    expect(() => hinote.send("position")).toThrow();
  });

  test("toCanvas turns a pointer into canvas pixels of the slide", async () => {
    await open("static", "http://localhost/index.html");
    const slide = document.querySelector<HTMLElement>("#deck .slide.is-active");
    // The slide shown at half size, 100px from the left and 50px from the top.
    slide!.getBoundingClientRect = () =>
      ({ left: 100, top: 50, width: 960, height: 540 }) as DOMRect;
    expect(hinote.toCanvas({ clientX: 580, clientY: 320 })).toEqual({
      x: 960,
      y: 540,
    });
  });
});

describe("the presenter view", () => {
  test("announces its position, and its toolbar moves and opens the overview", async () => {
    const channel = await open(
      "presenter",
      "http://localhost/presenter/2",
      "broadcast",
    );
    expect(channel?.name).toBe("hinote-sync:");
    expect(channel?.posted[0]).toEqual({ type: "navigate", slide: 1, step: 0 });
    expect(document.getElementById("hinote-notes")?.textContent).toBe(
      "second notes",
    );
    click("next");
    expect(hidden()).toEqual([false, true]);
    click("prev");
    click("prev");
    expect(active()).toBe(0);
    expect(location.pathname).toBe("/presenter/1");
    expect(document.getElementById("hinote-notes")?.textContent).toBe(
      "first notes",
    );
    click("overview");
    expect(
      document.getElementById("hinote-overview")?.classList.contains("is-open"),
    ).toBe(true);
    press("Escape");
    expect(
      document.getElementById("hinote-overview")?.classList.contains("is-open"),
    ).toBe(false);
  });

  test("the laser starts off, and a choice stays across a reload", async () => {
    await open("presenter", "http://localhost/presenter/1", "broadcast");
    const laser = () =>
      document
        .querySelector('[data-action="laser"]')
        ?.getAttribute("aria-pressed");
    expect(laser()).toBe("false");
    click("laser");
    expect(laser()).toBe("true");
    expect(sessionStorage.getItem("hinote-laser")).toBe("on");
    await open("presenter", "http://localhost/presenter/1", "broadcast");
    expect(laser()).toBe("true");
    press("l");
    expect(laser()).toBe("false");
    await open("presenter", "http://localhost/presenter/1", "broadcast");
    expect(laser()).toBe("false");
  });
});

describe("a view that syncs", () => {
  test("follows navigation and hears events from other windows", async () => {
    const channel = await open("view", "http://localhost/1", "broadcast");
    expect(channel?.posted[0]).toEqual({ type: "hello" });
    channel?.deliver({ type: "navigate", slide: 2, step: 0 });
    expect(active()).toBe(2);
    expect(location.pathname).toBe("/3");
    const got: unknown[] = [];
    hinote.on("chart:mode", (mode) => got.push(mode));
    channel?.deliver({ type: "event", name: "chart:mode", data: "auto" });
    channel?.deliver({ type: "event", name: "not valid", data: "x" });
    expect(got).toEqual(["auto"]);
    // What this page sends goes to the other windows as an event message.
    hinote.send("chart:mode", "manual");
    expect(channel?.posted.at(-1)).toEqual({
      type: "event",
      name: "chart:mode",
      data: "manual",
    });
  });

  test("a prerendered page keeps the trailing slash a static host serves", async () => {
    await open("view", "http://localhost/talk/2/", undefined, true);
    expect(active()).toBe(1);
    press("End");
    expect(location.pathname).toBe("/talk/3/");
  });

  test("the view of a deck without the presenter syncs with nothing", async () => {
    await open("view", "http://localhost/1");
    expect(hinote.sync).toBe("none");
    expect(channels).toHaveLength(0);
    expect(document.getElementById("hinote-pointer")).toBeNull();
  });
});
