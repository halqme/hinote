// The page runtime in a DOM: keys, steps, the URL, the presenter's toolbar
// and laser, and window.hinote. Each test gets a fresh happy-dom window and a
// page rendered by the deck, then starts the runtime on it.
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { boot } from "../src/client/boot.ts";
import type { HinoteClient } from "../src/client/api.ts";
import { baseHref } from "../src/client/location.ts";
import { Link, Morph, Step, Steps, createSlide } from "../src/index.ts";
import type { Deck } from "../src/deck/deck.ts";
import type { Sync } from "../src/deck/render.ts";

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

const deck = createSlide({ document: { presenter: true } }, [
  createSlide({ notes: "first notes" }, () => <p>one</p>),
  createSlide({ notes: "second notes" }, () => (
    <ul>
      <Step as="li">a</Step>
      <Step as="li">b</Step>
    </ul>
  )),
  createSlide(() => <p>three</p>),
]);

// The page a deck answers at `path`, under `mount`, syncing as `sync` says.
async function pageAt(
  from: Deck,
  path: string,
  sync: Sync | undefined,
  mount: string,
): Promise<string | undefined> {
  if (!path.startsWith(mount)) return undefined;
  const route = path.slice(mount.length) || "/";
  const match = /^(\/presenter)?(?:\/(\d+))?$/.exec(route === "/" ? "" : route);
  if (!match || match[2] === "1") return undefined;
  const role = match[1] ? "presenter" : "view";
  const index = match[2] ? Number(match[2]) - 1 : 0;
  if (index >= from.slides.length) return undefined;
  return from.renderSlide(index, role, { base: baseHref(path, route), sync });
}

// The page's own runtime script, which the test starts itself.
const withoutRuntime = (html: string) =>
  html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, (script) =>
    script.includes("data-hinote-script") ? script : "",
  );

// What the page fetched, with the headers it sent.
const fetched: { path: string; purpose: string | null }[] = [];

// Opens a page: the single file when `url` names index.html, else the page
// the deck answers at that path. The page fetches other slides from the deck.
async function open(
  url: string,
  from: Deck = deck,
  sync?: Sync,
  mount = "",
  answer?: (path: string) => Response | undefined,
) {
  const path = new URL(url).pathname;
  const html = path.endsWith("index.html")
    ? await from.render()
    : await pageAt(from, path, sync, mount);
  if (html === undefined) throw new Error(`No page at ${path}`);
  (
    window as unknown as { happyDOM: { setURL(url: string): void } }
  ).happyDOM.setURL(url);
  fetched.length = 0;
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const target = new URL(String(input)).pathname;
    fetched.push({
      path: target,
      purpose: new Headers(init?.headers).get("purpose"),
    });
    const custom = answer?.(target);
    if (custom) return custom;
    const page = await pageAt(from, target, sync, mount);
    return page === undefined
      ? new Response("Not Found", { status: 404 })
      : new Response(
          withoutRuntime(page).replace(/<link rel="stylesheet"[^>]*>/, ""),
          {
            headers: { "content-type": "text/html" },
          },
        );
  }) as typeof fetch;
  // The runtime is started by the test, not by the page's own script, and
  // the stylesheet the deck serves is put inline, as happy-dom loads no files.
  const stylesheet = /<link rel="stylesheet" href="([^"]*)"\/>/.exec(html);
  const css = stylesheet
    ? await (await from.request(`/${stylesheet[1]}`)).text()
    : "";
  document.write(
    withoutRuntime(html).replace(
      /<link rel="stylesheet" href="[^"]*"\/>/,
      () => `<style>${css}</style>`,
    ),
  );
  document.close();
  boot();
  await settle();
  return channels.at(-1);
}

// Moves wait for their slide, which the page fetches.
async function settle() {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

const press = async (key: string) => {
  document.dispatchEvent(new KeyboardEvent("keydown", { key }));
  await settle();
};
const shownSlide = () =>
  document.querySelector<HTMLElement>("#deck .slide.is-active");
const active = () => Number(shownSlide()?.dataset.hinoteSlide ?? 0) - 1;
const hidden = () =>
  [
    ...document.querySelectorAll("#deck .slide.is-active [data-hinote-step]"),
  ].map((el) => el.classList.contains("is-hidden"));
const click = async (action: string) => {
  document
    .querySelector<HTMLElement>(`#hinote-toolbar [data-action="${action}"]`)
    ?.click();
  await settle();
};

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
    await open("http://localhost/index.html#2");
    expect(active()).toBe(1);
    expect(hidden()).toEqual([true, true]);
    await press("ArrowRight");
    expect(hidden()).toEqual([false, true]);
    await press(" ");
    expect(hidden()).toEqual([false, false]);
    await press("ArrowRight");
    expect(active()).toBe(2);
    expect(location.hash).toBe("#3");
    await press("ArrowLeft");
    expect(active()).toBe(1);
    expect(hidden()).toEqual([false, false]);
    await press("Home");
    expect(active()).toBe(0);
    await press("End");
    expect(active()).toBe(2);
  });

  test("a served page holds one slide and fetches the next from its route", async () => {
    await open("http://localhost/");
    expect(document.querySelectorAll("#deck .slide")).toHaveLength(1);
    await press("ArrowRight");
    expect(active()).toBe(1);
    expect(document.querySelectorAll("#deck .slide")).toHaveLength(1);
    expect(location.pathname).toBe("/2");
    expect(fetched.map((entry) => entry.path)).toContain("/2");
    // Going back onto a slide reveals every step it turns out to have.
    for (let i = 0; i < 3; i++) await press("ArrowRight");
    expect(active()).toBe(2);
    await press("ArrowLeft");
    expect(active()).toBe(1);
    expect(hidden()).toEqual([false, false]);
    await press("ArrowLeft");
    expect(hidden()).toEqual([false, true]);
    await press("Home");
    expect(location.pathname).toBe("/");
  });

  test("the slides either side are fetched ahead, marked as a prefetch", async () => {
    await open("http://localhost/2");
    await new Promise((r) => setTimeout(r, 100));
    expect(fetched).toContainEqual({ path: "/3", purpose: "prefetch" });
    expect(fetched).toContainEqual({ path: "/", purpose: "prefetch" });
  });

  test("a route that answers with something other than a slide is opened as a page", async () => {
    const left: string[] = [];
    await open("http://localhost/", deck, undefined, "", (path) =>
      path === "/2" ? new Response("Pay first", { status: 402 }) : undefined,
    );
    Object.defineProperty(location, "assign", {
      configurable: true,
      value: (url: string) => left.push(url),
    });
    await press("ArrowRight");
    expect(left).toEqual(["http://localhost/2"]);
    expect(active()).toBe(0);
  });

  test.each([
    ["view", "http://localhost/", "3"],
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
      await open(url, linked);
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
      await settle();
      expect(plain.defaultPrevented).toBe(true);
      expect(active()).toBe(2);
      expect(page === "static" ? location.hash : location.pathname).toBe(
        page === "static" ? expected : `/${expected}`,
      );
    },
  );

  test("a deck mounted under a path finds its slides there", async () => {
    await open("http://localhost/talk/2", deck, undefined, "/talk");
    expect(active()).toBe(1);
    await press("End");
    expect(location.pathname).toBe("/talk/3");
    await press("Home");
    expect(location.pathname).toBe("/talk/");
  });

  test("keys with a modifier are left to the browser", async () => {
    await open("http://localhost/index.html");
    const event = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      metaKey: true,
      cancelable: true,
    });
    document.dispatchEvent(event);
    await settle();
    expect(active()).toBe(0);
    expect(event.defaultPrevented).toBe(false);
  });

  test("a slide's own CSS joins the page when the slide does", async () => {
    const styled = createSlide([
      createSlide(() => <p>plain</p>),
      createSlide({ css: ".mine{color:red}" }, () => <p class="mine">x</p>),
    ]);
    await open("http://localhost/", styled);
    expect(document.querySelector('style[data-hinote-slide="2"]')).toBeNull();
    await press("ArrowRight");
    expect(
      document.querySelector('style[data-hinote-slide="2"]')?.textContent,
    ).toContain(".mine");
    await press("ArrowLeft");
    await press("ArrowRight");
    expect(
      document.querySelectorAll('style[data-hinote-slide="2"]'),
    ).toHaveLength(1);
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
          `${el.closest<HTMLElement>(".slide")?.dataset.hinoteSlide}:${el.style.getPropertyValue("view-transition-name")}`,
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

  test.each(["http://localhost/", "http://localhost/index.html#1"])(
    "at %s, an element named on both slides carries one name out of the old slide and into the new, and nothing stays named after",
    async (url) => {
      await open(url, morphDeck);
      stubTransitions();
      await press("ArrowRight");
      expect(runs).toEqual([
        { before: ["1:hinote-morph-title"], after: ["2:hinote-morph-title"] },
      ]);
      expect(named()).toEqual([]);
    },
  );

  test("a slide with no transition and no pair changes without a view transition", async () => {
    await open("http://localhost/index.html#2", morphDeck);
    stubTransitions();
    await press("ArrowRight");
    await press("ArrowRight");
    expect(active()).toBe(2);
    expect(runs).toEqual([]);
  });
});

describe("window.hinote", () => {
  test("reports the position at once and on every change", async () => {
    await open("http://localhost/index.html");
    expect(hinote.role).toBe("view");
    expect(hinote.sync).toBe("none");
    const seen: unknown[] = [];
    const stop = hinote.on("position", (position) => seen.push(position));
    await press("ArrowRight");
    stop();
    await press("ArrowRight");
    expect(seen).toEqual([
      { slide: 0, step: 0 },
      { slide: 1, step: 0 },
    ]);
    expect(hinote.position).toEqual({ slide: 1, step: 1 });
  });

  test("send reaches this page; a handler that throws does not stop the others", async () => {
    await open("http://localhost/index.html");
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

  test.each(["http://localhost/", "http://localhost/index.html"])(
    "at %s, mount sets up each slide's elements as the slide enters, and cleans up as it leaves",
    async (url) => {
      await open(url, withChart);
      const log: string[] = [];
      hinote.mount(".chart", (element) => {
        log.push(`in ${element.textContent}`);
        return () => log.push("out");
      });
      expect(log).toEqual([]);
      await press("ArrowRight");
      expect(log).toEqual(["in chart"]);
      await press("ArrowLeft");
      expect(log).toEqual(["in chart", "out"]);
      // A slide that enters again is set up again, from the slide as drawn.
      await press("ArrowRight");
      expect(log).toEqual(["in chart", "out", "in chart"]);
    },
  );

  test("observe reports when an element's slide is shown and how many of its own steps are out, and stops when the slide leaves", async () => {
    await open("http://localhost/", withChart);
    const seen: unknown[] = [];
    const whole: unknown[] = [];
    hinote.mount(".chart", (chart) => {
      hinote.observe(chart, (state) => seen.push(state));
      hinote.observe(chart.closest(".slide")!, (state) =>
        whole.push(state.step),
      );
    });
    for (let i = 0; i < 5; i++) await press("ArrowRight");
    for (let i = 0; i < 5; i++) await press("ArrowLeft");
    // Its own steps count 0 to 2 while the slide's go 0 to 4, and a move
    // that changes neither does not call it again.
    expect(seen).toEqual([
      { active: true, step: 0, steps: 2 },
      { active: true, step: 1, steps: 2 },
      { active: true, step: 2, steps: 2 },
      { active: true, step: 1, steps: 2 },
      { active: true, step: 0, steps: 2 },
      { active: false, step: 0, steps: 2 },
    ]);
    expect(whole).toEqual([0, 1, 2, 3, 4, 3, 2, 1, 0, 0]);
    // The slide left the page, so its observers are gone.
    await press("ArrowRight");
    expect(seen).toHaveLength(7);
  });

  test("observe never reports a copy outside the deck as shown", async () => {
    await open("http://localhost/index.html");
    const copy = document.querySelector("#deck .slide")!.cloneNode(true);
    document.body.append(copy);
    const seen: boolean[] = [];
    hinote.observe(copy as Element, (state) => seen.push(state.active));
    await press("ArrowRight");
    await press("ArrowLeft");
    expect(seen).toEqual([false]);
  });

  test("a script a fetched slide brings runs once, however often the slide enters", async () => {
    const scripted = createSlide([
      createSlide(() => <p>one</p>),
      createSlide(() => (
        <div>
          two
          <script type="module" data-hinote-script="widget">
            {"window.widgetRuns = (window.widgetRuns ?? 0) + 1;"}
          </script>
        </div>
      )),
    ]);
    await open("http://localhost/", scripted);
    const scripts = () =>
      document.querySelectorAll('body > script[data-hinote-script="widget"]');
    expect(scripts()).toHaveLength(0);
    await press("ArrowRight");
    expect(scripts()).toHaveLength(1);
    await press("ArrowLeft");
    await press("ArrowRight");
    expect(scripts()).toHaveLength(1);
  });

  test("toCanvas turns a pointer into canvas pixels of the slide", async () => {
    await open("http://localhost/index.html");
    const slide = shownSlide();
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
    const noted = createSlide({ document: { presenter: true } }, [
      createSlide(
        {
          notes:
            '## Bridge\nNext comes **the method**.\n- one\n- two\n\n<img src=x onerror="alert(1)">',
        },
        () => <p>a</p>,
      ),
      createSlide({ notes: "line one\nline two" }, () => <p>b</p>),
    ]);
    await open("http://localhost/presenter", noted);
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
    await press("ArrowRight");
    expect(notes.innerHTML).toBe("<p>line one\nline two</p>");
  });

  // A page script that redraws its part of the live slide, such as a chart
  // growing in, must not leave the preview half drawn.
  test("the preview of the next key press shows the slide as the server drew it, not as a script changed it", async () => {
    await open("http://localhost/presenter/2");
    const live = shownSlide()!;
    live.querySelector("li")!.textContent = "changed by a script";
    await press("ArrowRight");
    const preview = document.getElementById("hinote-next")!;
    expect(
      [...preview.querySelectorAll("li")].map((li) => li.textContent),
    ).toEqual(["a", "b"]);
    expect(live.querySelector("li")?.textContent).toBe("changed by a script");
  });

  test("announces its position, and its toolbar moves and opens the overview", async () => {
    const channel = await open(
      "http://localhost/presenter/2",
      deck,
      "broadcast",
    );
    expect(channel?.name).toBe("hinote-sync:/");
    expect(channel?.posted[0]).toEqual({ type: "navigate", slide: 1, step: 0 });
    expect(document.getElementById("hinote-notes")?.textContent).toBe(
      "second notes",
    );
    await click("next");
    expect(hidden()).toEqual([false, true]);
    await click("prev");
    await click("prev");
    expect(active()).toBe(0);
    expect(location.pathname).toBe("/presenter");
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
    await press("n");
    expect(active()).toBe(1);
    expect(hidden()).toEqual([true, true]);
    await press("n");
    expect(hidden()).toEqual([false, true]);
    await press("p");
    expect(hidden()).toEqual([true, true]);
    await press("P");
    expect(active()).toBe(0);
    await press("N");
    expect(active()).toBe(1);
    await click("overview");
    expect(
      document.getElementById("hinote-overview")?.classList.contains("is-open"),
    ).toBe(true);
    await press("Escape");
    expect(
      document.getElementById("hinote-overview")?.classList.contains("is-open"),
    ).toBe(false);
  });

  test("shows progress in the side column, the next slide under it, and titles only in the overview", async () => {
    const titled = createSlide({ document: { presenter: true } }, [
      createSlide({ title: "Open", notes: "Say this." }, () => <p>a</p>),
      createSlide({ title: "Method" }, () => (
        <ul>
          <Step as="li">a</Step>
          <Step as="li">b</Step>
        </ul>
      )),
      createSlide(() => <p>c</p>),
    ]);
    await open("http://localhost/presenter", titled);
    expect(document.getElementById("hinote-title")).toBeNull();
    expect(document.getElementById("hinote-upcoming")).toBeNull();
    expect(document.querySelector(".hinote-label")).toBeNull();
    const panel = document.getElementById("hinote-panel");
    expect(document.getElementById("hinote-notes")?.parentElement).toBe(panel);
    expect(document.getElementById("hinote-next")?.parentElement).toBe(panel);
    expect(document.getElementById("hinote-toolbar")?.parentElement).toBe(
      document.body,
    );
    // The next slide's preview is fetched.
    expect(document.querySelector("#hinote-next .slide p")?.textContent).toBe(
      undefined,
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
    await press("ArrowRight");
    expect(indicator?.getAttribute("aria-label")).toBe(
      "Slide 2 of 3, step 0 of 2",
    );
    expect(marks()[1]).toEqual(["current", "0"]);
    await press("ArrowRight");
    expect(marks()[1]).toEqual(["current", "0.5"]);
    await press("ArrowRight");
    expect(marks()[1]).toEqual(["current", "1"]);
    await press("ArrowRight");
    expect(marks().map((mark) => mark[0])).toEqual(["past", "past", "current"]);
    expect(
      document.getElementById("hinote-next")?.hasAttribute("data-end"),
    ).toBe(true);
    const labels = () =>
      [...document.querySelectorAll(".hinote-overview-label")].map(
        (el) => el.textContent,
      );
    // The overview fetches the slides it shows the first time it opens.
    expect(labels()).toEqual(["1", "2", "3"]);
    await click("overview");
    expect(labels()).toEqual(["1. Open", "2. Method", "3"]);
    expect(
      document.querySelectorAll("#hinote-overview .hinote-thumb .slide"),
    ).toHaveLength(3);
  });

  test("notes are shown when a slide has them, and not when it does not", async () => {
    const noted = createSlide({ document: { presenter: true } }, [
      createSlide({ notes: "# Claim\n\nSay this." }, () => <p>a</p>),
      createSlide(() => <p>b</p>),
    ]);
    await open("http://localhost/presenter", noted);
    const notes = document.getElementById("hinote-notes")!;
    expect(notes.textContent).toContain("Say this.");
    expect(getComputedStyle(notes).display).not.toBe("none");
    expect(getComputedStyle(notes).fontSize).toBe("16px");
    expect(getComputedStyle(notes.querySelector("h1")!).fontSize).toBe("16px");
    await press("ArrowRight");
    expect(notes.textContent).toBe("");
    expect(getComputedStyle(notes).display).toBe("none");
  });

  test("the audience page carries neither speaker notes nor slide titles", async () => {
    const titled = createSlide({ document: { presenter: true } }, [
      createSlide({ title: "Open", notes: "secret" }, () => <p>a</p>),
    ]);
    await open("http://localhost/", titled);
    expect(document.getElementById("hinote-notes")).toBeNull();
    expect(document.getElementById("hinote-title")).toBeNull();
    expect(document.querySelector("[data-notes]")).toBeNull();
    expect(document.querySelector("[data-title]")).toBeNull();
  });

  test("the laser starts off, and a choice stays across a reload", async () => {
    await open("http://localhost/presenter", deck, "broadcast");
    expect(document.getElementById("hinote-fullscreen")).toBeNull();
    expect(document.getElementById("hinote-nav")).toBeNull();
    const laser = () =>
      document
        .querySelector('[data-action="laser"]')
        ?.getAttribute("aria-pressed");
    expect(laser()).toBe("false");
    await click("laser");
    expect(laser()).toBe("true");
    expect(sessionStorage.getItem("hinote-laser")).toBe("on");
    await open("http://localhost/presenter", deck, "broadcast");
    expect(laser()).toBe("true");
    await press("l");
    expect(laser()).toBe("false");
    await open("http://localhost/presenter", deck, "broadcast");
    expect(laser()).toBe("false");
  });
});

describe("the built page", () => {
  test("has previous and next icons over the slide, and no full screen button", async () => {
    await open("http://localhost/index.html");
    expect(document.getElementById("hinote-fullscreen")).toBeNull();
    expect(document.getElementById("hinote-panel")).toBeNull();
    const nav = document.getElementById("hinote-nav");
    expect(nav?.textContent).toBe("");
    expect(nav?.querySelectorAll("svg")).toHaveLength(2);
    expect(getComputedStyle(nav!).opacity).toBe("0");
    document.dispatchEvent(new Event("pointermove"));
    expect(getComputedStyle(nav!).opacity).toBe("1");
    const pressNav = async (action: string) => {
      nav?.querySelector<HTMLElement>(`[data-action="${action}"]`)?.click();
      await settle();
    };
    await pressNav("next");
    expect(active()).toBe(1);
    expect(hidden()).toEqual([true, true]);
    await pressNav("next");
    expect(hidden()).toEqual([false, true]);
    await pressNav("prev");
    expect(hidden()).toEqual([true, true]);
    await pressNav("prev");
    expect(active()).toBe(0);
  });

  test("prints every slide, in order, and goes back to one after", async () => {
    await open("http://localhost/index.html#2");
    window.dispatchEvent(new Event("beforeprint"));
    expect(
      [...document.querySelectorAll<HTMLElement>("#deck .slide")].map(
        (slide) => slide.dataset.hinoteSlide,
      ),
    ).toEqual(["1", "2", "3"]);
    window.dispatchEvent(new Event("afterprint"));
    expect(document.querySelectorAll("#deck .slide")).toHaveLength(1);
    expect(active()).toBe(1);
  });
});

describe("the audience page", () => {
  test("enters full screen from the icon and from F, and the icon switches while it is full screen", async () => {
    await open("http://localhost/");
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
    await press("f");
    await press("F");
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
    const channel = await open("http://localhost/", deck, "broadcast");
    expect(channel?.posted[0]).toEqual({ type: "hello" });
    channel?.deliver({ type: "navigate", slide: 2, step: 0 });
    await settle();
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

  test("a move back from the presenter onto a slide not fetched yet shows all its steps", async () => {
    const channel = await open("http://localhost/3", deck, "broadcast");
    channel?.deliver({
      type: "navigate",
      slide: 1,
      step: Number.MAX_SAFE_INTEGER,
    });
    await settle();
    expect(active()).toBe(1);
    expect(hidden()).toEqual([false, false]);
    expect(hinote.position).toEqual({ slide: 1, step: 2 });
  });

  test("the view of a deck without the presenter syncs with nothing", async () => {
    await open("http://localhost/");
    expect(hinote.sync).toBe("none");
    expect(channels).toHaveLength(0);
    expect(document.getElementById("hinote-pointer")).toBeNull();
  });
});
