// The page runtime in a DOM: keys, steps, the URL, the presenter's toolbar
// and laser, and window.hinote. Each test gets a fresh happy-dom window and a
// page rendered by the deck, then starts the runtime on it.
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { boot } from "../src/client/boot.ts";
import type { HinoteClient } from "../src/client/api.ts";
import { Link, Morph, Step, Steps, createSlide } from "../src/index.ts";
import type { Page, Sync } from "../src/deck/render.ts";

// The page defines this. Importing @hinote/core/client would type it for every file
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

async function open(
  page: Page,
  url: string,
  sync?: Sync,
  directories = false,
  from = deck,
) {
  const html = await from.render(page, {
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

  test.each([
    ["view", "http://localhost/1", "/3"],
    ["static", "http://localhost/index.html", "#3"],
  ] as const)(
    "on a %s page, a Link moves to its slide without leaving the page; a modified click is the browser's",
    async (page, url, expected) => {
      const linked = createSlide([
        createSlide(() => (
          <p>
            <Link to="end">to the end</Link>
          </p>
        )),
        createSlide(() => <p>middle</p>),
        createSlide([createSlide({ id: "end" }, () => <p>end</p>)]),
      ]);
      await open(page, url, undefined, false, linked);
      const link =
        document.querySelector<HTMLAnchorElement>("a[data-hinote-to]")!;
      expect(link.getAttribute("href")).toBe(expected);

      const modified = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        metaKey: true,
      });
      link.dispatchEvent(modified);
      expect(modified.defaultPrevented).toBe(false);
      expect(active()).toBe(0);

      const plain = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      });
      link.dispatchEvent(plain);
      expect(plain.defaultPrevented).toBe(true);
      expect(active()).toBe(2);
      expect(page === "static" ? location.hash : location.pathname).toBe(
        expected,
      );
    },
  );

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

describe("morphing between slides", () => {
  // The browser pairs elements by view-transition-name: it reads the names on
  // the old page when the transition starts and on the new page after the
  // update. The stub records both.
  type Run = { before: string[]; after: string[] };
  const runs: Run[] = [];
  const named = () =>
    [...document.querySelectorAll<HTMLElement>("#deck .slide *")]
      .filter((el) => el.style.getPropertyValue("view-transition-name"))
      .map(
        (el) =>
          `${[...document.querySelectorAll("#deck .slide")].indexOf(el.closest(".slide")!) + 1}:${el.style.getPropertyValue("view-transition-name")}`,
      );
  const stubTransitions = () => {
    runs.length = 0;
    (document as { startViewTransition: unknown }).startViewTransition = (
      update: () => void,
    ) => {
      const run: Run = { before: named(), after: [] };
      update();
      run.after = named();
      runs.push(run);
      return { finished: Promise.resolve() };
    };
  };
  const morphDeck = createSlide({ transition: "none" }, [
    createSlide(() => (
      <>
        <Morph name="title">
          <h1>big</h1>
        </Morph>
        <Morph name="logo">
          <p>only here</p>
        </Morph>
      </>
    )),
    createSlide(() => (
      <>
        <Morph name="title">
          <h2>small</h2>
        </Morph>
        <Step>
          <Morph name="logo">
            <p>later</p>
          </Morph>
        </Step>
      </>
    )),
    createSlide(() => <p>plain</p>),
  ]);

  test("an element named on both slides carries one name out of the old slide and into the new, and nothing stays named after", async () => {
    await open(
      "static",
      "http://localhost/index.html#1",
      undefined,
      false,
      morphDeck,
    );
    stubTransitions();
    press("ArrowRight");
    expect(runs).toEqual([
      { before: ["1:hinote-morph-title"], after: ["2:hinote-morph-title"] },
    ]);
    await Promise.resolve();
    expect(named()).toEqual([]);
  });

  test("a slide with no transition and no pair changes without a view transition", async () => {
    await open(
      "static",
      "http://localhost/index.html#2",
      undefined,
      false,
      morphDeck,
    );
    stubTransitions();
    press("ArrowRight");
    press("ArrowRight");
    expect(active()).toBe(2);
    expect(runs).toEqual([]);
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

  test("observe reports when an element's slide is shown and how many of its own steps are out", async () => {
    const withChart = createSlide([
      createSlide(() => <p>one</p>),
      createSlide(() => (
        <div>
          <Step>first</Step>
          <Steps count={2} class="chart">
            chart
          </Steps>
          <Step>last</Step>
        </div>
      )),
    ]);
    await open(
      "static",
      "http://localhost/index.html",
      undefined,
      false,
      withChart,
    );
    const chart = document.querySelector("#deck .chart");
    const slide = document.querySelectorAll("#deck .slide")[1];
    const seen: unknown[] = [];
    const whole: unknown[] = [];
    hinote.observe(chart!, (state) => seen.push(state));
    hinote.observe(slide!, (state) => whole.push(state.step));
    for (let i = 0; i < 5; i++) press("ArrowRight");
    press("ArrowLeft");
    press("ArrowLeft");
    press("ArrowLeft");
    press("ArrowLeft");
    press("ArrowLeft");
    // Its own steps count 0 to 2 while the slide's go 0 to 4, and a move
    // that changes neither does not call it again.
    expect(seen).toEqual([
      { active: false, step: 0, steps: 2 },
      { active: true, step: 0, steps: 2 },
      { active: true, step: 1, steps: 2 },
      { active: true, step: 2, steps: 2 },
      { active: true, step: 1, steps: 2 },
      { active: true, step: 0, steps: 2 },
      { active: false, step: 0, steps: 2 },
    ]);
    expect(whole).toEqual([0, 0, 1, 2, 3, 4, 3, 2, 1, 0, 0]);
  });

  test("observe never reports a copy outside the deck as shown", async () => {
    await open("static", "http://localhost/index.html");
    const copy = document.querySelector("#deck .slide")!.cloneNode(true);
    document.body.append(copy);
    const seen: boolean[] = [];
    hinote.observe(copy as Element, (state) => seen.push(state.active));
    press("ArrowRight");
    press("ArrowLeft");
    expect(seen).toEqual([false]);
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
  test("notes show their structure, plain notes read as before, and HTML stays text", async () => {
    const noted = createSlide({ presenter: true }, [
      createSlide(
        {
          notes:
            '## Bridge\nNext comes **the method**.\n- one\n- two\n\n<img src=x onerror="alert(1)">',
        },
        () => <p>a</p>,
      ),
      createSlide({ notes: "line one\nline two" }, () => <p>b</p>),
    ]);
    await open(
      "presenter",
      "http://localhost/presenter/1",
      undefined,
      false,
      noted,
    );
    const notes = document.getElementById("hinote-notes")!;
    expect([...notes.children].map((el) => el.tagName)).toEqual([
      "H2",
      "P",
      "UL",
      "P",
    ]);
    expect(notes.querySelector("strong")?.textContent).toBe("the method");
    expect(notes.querySelectorAll("li")).toHaveLength(2);
    expect(notes.querySelector("img")).toBeNull();
    expect(notes.lastElementChild?.textContent).toBe(
      '<img src=x onerror="alert(1)">',
    );
    press("ArrowRight");
    expect(notes.innerHTML).toBe("<p>line one\nline two</p>");
  });

  // A page script that redraws its part of the live slide, such as a chart
  // growing in, must not leave the preview half drawn.
  test("the preview of the next key press shows the slide as the server drew it, not as a script changed it", async () => {
    await open("presenter", "http://localhost/presenter/1");
    const live = document.querySelectorAll("#deck .slide")[1]!;
    live.querySelector("li")!.textContent = "changed by a script";
    press("ArrowRight");
    const preview = document.getElementById("hinote-next")!;
    expect(
      [...preview.querySelectorAll("li")].map((li) => li.textContent),
    ).toEqual(["a", "b"]);
    expect(live.querySelector("li")?.textContent).toBe("changed by a script");
  });

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
    const underlined = (action: string) =>
      [
        ...document.querySelectorAll(
          `#hinote-toolbar [data-action="${action}"] u`,
        ),
      ].map((el) => el.textContent);
    expect(underlined("prev")).toEqual(["←", "P"]);
    expect(underlined("next")).toEqual(["N", "→"]);
    expect(underlined("overview")).toEqual(["O"]);
    expect(underlined("laser")).toEqual(["L"]);
    press("n");
    expect(active()).toBe(1);
    expect(hidden()).toEqual([true, true]);
    press("n");
    expect(hidden()).toEqual([false, true]);
    press("p");
    expect(hidden()).toEqual([true, true]);
    press("P");
    expect(active()).toBe(0);
    press("N");
    expect(active()).toBe(1);
    click("overview");
    expect(
      document.getElementById("hinote-overview")?.classList.contains("is-open"),
    ).toBe(true);
    press("Escape");
    expect(
      document.getElementById("hinote-overview")?.classList.contains("is-open"),
    ).toBe(false);
  });

  test("shows progress in the side column, the next slide under it, and titles only in the overview", async () => {
    const titled = createSlide({ presenter: true }, [
      createSlide({ title: "Open", notes: "Say this." }, () => <p>a</p>),
      createSlide({ title: "Method" }, () => (
        <ul>
          <Step as="li">a</Step>
          <Step as="li">b</Step>
        </ul>
      )),
      createSlide(() => <p>c</p>),
    ]);
    await open(
      "presenter",
      "http://localhost/presenter/1",
      undefined,
      false,
      titled,
    );
    expect(document.getElementById("hinote-title")).toBeNull();
    expect(document.getElementById("hinote-upcoming")).toBeNull();
    expect(document.querySelector(".hinote-label")).toBeNull();
    const panel = document.getElementById("hinote-panel");
    expect(document.getElementById("hinote-notes")?.parentElement).toBe(panel);
    expect(document.getElementById("hinote-next")?.parentElement).toBe(panel);
    expect(document.getElementById("hinote-toolbar")?.parentElement).toBe(
      document.body,
    );
    const marks = () =>
      [...document.querySelectorAll("#hinote-indicator span")].map((el) =>
        el instanceof HTMLElement
          ? [el.dataset.state, el.style.getPropertyValue("--hinote-fill")]
          : [],
      );
    const indicator = document.getElementById("hinote-indicator");
    expect(indicator?.getAttribute("aria-label")).toBe("Slide 1 of 3");
    expect(marks()).toEqual([
      ["current", "1"],
      ["future", "0"],
      ["future", "0"],
    ]);
    press("ArrowRight");
    expect(indicator?.getAttribute("aria-label")).toBe(
      "Slide 2 of 3, step 0 of 2",
    );
    expect(marks()[1]).toEqual(["current", "0"]);
    press("ArrowRight");
    expect(marks()[1]).toEqual(["current", "0.5"]);
    press("ArrowRight");
    expect(marks()[1]).toEqual(["current", "1"]);
    press("ArrowRight");
    expect(marks().map((mark) => mark[0])).toEqual(["past", "past", "current"]);
    expect(
      document.getElementById("hinote-next")?.hasAttribute("data-end"),
    ).toBe(true);
    expect(
      [...document.querySelectorAll(".hinote-overview-label")].map(
        (el) => el.textContent,
      ),
    ).toEqual(["1. Open", "2. Method", "3"]);
  });

  test("notes are shown when a slide has them, and not when it does not", async () => {
    const noted = createSlide({ presenter: true }, [
      createSlide({ notes: "# Claim\n\nSay this." }, () => <p>a</p>),
      createSlide(() => <p>b</p>),
    ]);
    await open(
      "presenter",
      "http://localhost/presenter/1",
      undefined,
      false,
      noted,
    );
    const notes = document.getElementById("hinote-notes")!;
    expect(notes.textContent).toContain("Say this.");
    expect(getComputedStyle(notes).display).not.toBe("none");
    expect(getComputedStyle(notes).fontSize).toBe("16px");
    expect(getComputedStyle(notes.querySelector("h1")!).fontSize).toBe("16px");
    press("ArrowRight");
    expect(notes.textContent).toBe("");
    expect(getComputedStyle(notes).display).toBe("none");
  });

  test("the audience page carries neither speaker notes nor slide titles", async () => {
    const titled = createSlide({ presenter: true }, [
      createSlide({ title: "Open", notes: "secret" }, () => <p>a</p>),
    ]);
    await open("view", "http://localhost/1", undefined, false, titled);
    expect(document.getElementById("hinote-notes")).toBeNull();
    expect(document.getElementById("hinote-title")).toBeNull();
    expect(document.querySelector("[data-notes]")).toBeNull();
    expect(document.querySelector("[data-title]")).toBeNull();
  });

  test("the laser starts off, and a choice stays across a reload", async () => {
    await open("presenter", "http://localhost/presenter/1", "broadcast");
    expect(document.getElementById("hinote-fullscreen")).toBeNull();
    expect(document.getElementById("hinote-nav")).toBeNull();
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

describe("the built page", () => {
  test("has previous and next icons over the slide, and no full screen button", async () => {
    await open("static", "http://localhost/index.html");
    expect(document.getElementById("hinote-fullscreen")).toBeNull();
    expect(document.getElementById("hinote-panel")).toBeNull();
    const nav = document.getElementById("hinote-nav");
    expect(nav?.textContent).toBe("");
    expect(nav?.querySelectorAll("svg")).toHaveLength(2);
    expect(getComputedStyle(nav!).opacity).toBe("0");
    document.dispatchEvent(new Event("pointermove"));
    expect(getComputedStyle(nav!).opacity).toBe("1");
    const pressNav = (action: string) =>
      nav?.querySelector<HTMLElement>(`[data-action="${action}"]`)?.click();
    pressNav("next");
    expect(active()).toBe(1);
    expect(hidden()).toEqual([true, true]);
    pressNav("next");
    expect(hidden()).toEqual([false, true]);
    pressNav("prev");
    expect(hidden()).toEqual([true, true]);
    pressNav("prev");
    expect(active()).toBe(0);
  });
});

describe("the audience page", () => {
  test("enters full screen from the icon and from F, and the icon switches while it is full screen", async () => {
    await open("view", "http://localhost/1");
    const button = document.getElementById("hinote-fullscreen");
    const shown = (icon: string) =>
      getComputedStyle(button!.querySelector(`[data-icon="${icon}"]`)!).display;
    expect(button?.getAttribute("aria-label")).toBe("Full screen");
    expect(getComputedStyle(button!).opacity).toBe("0");
    document.dispatchEvent(new Event("pointermove"));
    expect(getComputedStyle(button!).opacity).toBe("1");
    expect(shown("enter")).not.toBe("none");
    expect(shown("exit")).toBe("none");
    expect(document.getElementById("hinote-nav")).toBeNull();
    let entered = 0;
    document.documentElement.requestFullscreen = () => {
      entered += 1;
      return Promise.resolve();
    };
    press("f");
    press("F");
    button?.click();
    expect(entered).toBe(3);
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => document.documentElement,
    });
    document.dispatchEvent(new Event("fullscreenchange"));
    expect(button?.hidden).toBe(false);
    expect(button?.getAttribute("aria-pressed")).toBe("true");
    expect(button?.getAttribute("aria-label")).toBe("Exit full screen");
    expect(shown("enter")).toBe("none");
    expect(shown("exit")).not.toBe("none");
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
