// The page's runtime: fetching and showing slides, steps, sync, the presenter
// view, and window.hinote. main.ts starts it; tests start it on a rendered page.
//
// A served page holds one slide. Moving to another fetches that slide's route,
// the same page a browser would get by opening it, and swaps its slide in, so
// whatever the server runs in front of a slide runs for every move. The single
// file holds every slide in a <template> and takes them from there.
import { parseHash, slideHash } from "./location.ts";
import type { HinoteClient, Observed } from "./api.ts";
import {
  clampPosition,
  createPlayer,
  isEventMessage,
  isEventName,
  nextPosition,
  normalizePointer,
  type Player,
  type Position,
  type Role,
  type SyncMessage,
} from "./player.ts";
import { renderNotes } from "./notes.ts";

type Port = {
  post(message: SyncMessage): void;
  listen(handler: (message: unknown) => void): void;
};

// The built file is one audience view with nothing to sync with.
const NO_PORT: Port = { post() {}, listen() {} };

// A URL of the deck, from its root.
const fromRoot = (path: string) => new URL(path, document.baseURI).href;

// Pages on a static host have no server behind them, so windows of one
// browser talk directly: a presenter on the laptop, the audience view on the projector.
function broadcastPort(channel: string): Port {
  const broadcast = new BroadcastChannel(`hinote-sync:${channel}`);
  return {
    post: (message) => broadcast.postMessage(message),
    listen: (handler) => {
      broadcast.onmessage = (event) => handler(event.data);
    },
  };
}

function isReload(message: unknown): boolean {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "reload"
  );
}

// Under `hinote dev` without the presenter, a page only listens for reloads.
function reloadPort(channel: string): Port {
  const query = new URLSearchParams({ id: crypto.randomUUID(), channel });
  const events = new EventSource(fromRoot(`_hinote/events?${query}`));
  events.onmessage = (event) => {
    if (isReload(JSON.parse(event.data))) location.reload();
  };
  return NO_PORT;
}

// A served page listens on the deck's SSE stream and sends with POST, so pages
// on other devices follow too. The server sends `reload` after `hinote dev` reloads.
function serverPort(channel: string): Port {
  const id = crypto.randomUUID();
  // The deck root names the channel, so decks mounted side by side stay apart.
  const query = new URLSearchParams({ id, channel });
  const events = new EventSource(fromRoot(`_hinote/events?${query}`));
  const post = (message: SyncMessage) => {
    void fetch(fromRoot("_hinote/sync"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel, from: id, message }),
    }).catch(() => {});
  };
  // A message sent before the stream opened gets no answer, so greet again on (re)connect.
  events.onopen = () => post({ type: "hello" });
  return {
    post,
    listen: (handler) => {
      events.onmessage = (event) => {
        const message: unknown = JSON.parse(event.data);
        if (isReload(message)) location.reload();
        else handler(message);
      };
    },
  };
}

// The steps an element reserved, as `data-hinote-steps="from-to"`.
function reservedSteps(
  el: Element | null,
): { from: number; to: number } | undefined {
  const match = /^(\d+)-(\d+)$/.exec(
    el?.getAttribute("data-hinote-steps") ?? "",
  );
  return match ? { from: Number(match[1]), to: Number(match[2]) } : undefined;
}

function stepCount(slide: Element): number {
  let count = 0;
  for (const el of slide.querySelectorAll<HTMLElement>("[data-hinote-step]")) {
    count = Math.max(count, Number(el.dataset.hinoteStep));
  }
  for (const el of slide.querySelectorAll("[data-hinote-steps]")) {
    count = Math.max(count, reservedSteps(el)?.to ?? 0);
  }
  return count;
}

// Hides the steps of one slide that come after `revealed`.
function revealSteps(slide: ParentNode, revealed: number): void {
  for (const el of slide.querySelectorAll<HTMLElement>("[data-hinote-step]")) {
    el.classList.toggle("is-hidden", Number(el.dataset.hinoteStep) > revealed);
  }
}

// The <Morph> elements of a slide by name that are shown once `revealed`
// steps are out, so a twin inside a later step stays out of a pair.
function morphs(
  slide: HTMLElement | undefined,
  revealed: number,
): Map<string, HTMLElement> {
  const found = new Map<string, HTMLElement>();
  for (const el of slide?.querySelectorAll<HTMLElement>(
    "[data-hinote-morph]",
  ) ?? []) {
    const key = el.dataset.hinoteMorph ?? "";
    if (!/^[\w-]+$/.test(key) || found.has(key)) continue;
    let step = el.closest<HTMLElement>("[data-hinote-step]");
    while (step && slide?.contains(step)) {
      if (Number(step.dataset.hinoteStep) > revealed) break;
      step =
        step.parentElement?.closest<HTMLElement>("[data-hinote-step]") ?? null;
    }
    if (step && slide?.contains(step)) continue;
    found.set(key, el);
  }
  return found;
}

// A copy of a slide scaled into `box`, which keeps the canvas ratio in CSS.
function fillThumb(box: HTMLElement, slide: HTMLElement, revealed: number) {
  const copy = slide.cloneNode(true);
  if (!(copy instanceof HTMLElement)) return;
  revealSteps(copy, revealed);
  box.replaceChildren(copy);
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

// The timer survives reloads from `hinote dev`, so editing during a rehearsal
// does not restart it. Storage can be unavailable; then it starts at load.
const TIMER_KEY = "hinote-timer-start";

function timerStart(reset = false): number {
  const now = Date.now();
  try {
    const saved = Number(sessionStorage.getItem(TIMER_KEY));
    if (!reset && saved > 0 && saved <= now) return saved;
    sessionStorage.setItem(TIMER_KEY, String(now));
  } catch {}
  return now;
}

// A slide as the server drew it, before any script changed it, and the CSS and
// scripts its page carries. The page shows copies, so previews stay as drawn.
type Drawn = {
  slide: HTMLElement;
  css?: Element;
  scripts: Element[];
};

type Slides = {
  // Every slide's href, relative to the deck root, in order.
  readonly hrefs: readonly string[];
  // The slide, or undefined when its route answered with something that is
  // not a slide of this deck, such as a redirect to a sign-in page.
  load(index: number, prefetch?: boolean): Promise<Drawn | undefined>;
  // Forgets the slides it fetched except these.
  keep(indices: readonly number[]): void;
};

function drawnCopy(slide: HTMLElement): HTMLElement {
  const copy = slide.cloneNode(true);
  if (!(copy instanceof HTMLElement)) throw new Error("Not an element.");
  copy.classList.remove("is-active");
  return copy;
}

// Slides fetched from their routes. Whether a page is fresh is the server's
// call, through the HTTP cache: the page keeps a fetched slide only while it is
// near the one shown, or until the next reload.
function servedSlides(index: number, current: Drawn | undefined): Slides {
  const hrefs = [
    ...document.querySelectorAll('head > link[rel="hinote-slide"]'),
  ].map((link) => link.getAttribute("href") ?? "");
  const fetched = new Map<number, Promise<Drawn | undefined>>();
  if (current) fetched.set(index, Promise.resolve(current));
  const fetchSlide = async (
    href: string,
    prefetch: boolean,
  ): Promise<Drawn | undefined> => {
    // `Purpose` tells middleware that counts or charges for a slide that no
    // one has opened this one yet.
    const response = await fetch(fromRoot(href), {
      headers: prefetch ? { purpose: "prefetch" } : {},
    });
    if (response.redirected) return undefined;
    const doc = new DOMParser().parseFromString(
      await response.text(),
      "text/html",
    );
    if (!doc.documentElement.hasAttribute("data-hinote-deck")) return undefined;
    const slide = doc.querySelector(".hinote-stage > .slide");
    if (!(slide instanceof HTMLElement)) return undefined;
    slide.classList.remove("is-active");
    // Images start loading now, so the slide does not enter without them.
    for (const img of slide.querySelectorAll("img[src]")) {
      const src = img.getAttribute("src");
      if (src) new Image().src = fromRoot(src);
    }
    return {
      slide,
      css: doc.querySelector("head > style[data-hinote-slide]") ?? undefined,
      scripts: [...doc.querySelectorAll("body > script")],
    };
  };
  return {
    hrefs,
    load(at, prefetch = false) {
      let slide = fetched.get(at);
      const href = hrefs[at];
      if (!slide && href !== undefined) {
        slide = fetchSlide(href, prefetch).catch(() => undefined);
        fetched.set(at, slide);
      }
      return slide ?? Promise.resolve(undefined);
    },
    keep(indices) {
      for (const at of fetched.keys())
        if (!indices.includes(at)) fetched.delete(at);
    },
  };
}

// The single file: the first slide on the stage, the rest in a <template>.
function bundledSlides(current: Drawn | undefined): Slides & {
  readonly all: readonly Drawn[];
} {
  const template = document.getElementById("hinote-slides");
  const rest =
    template instanceof HTMLTemplateElement
      ? [...template.content.children].filter(
          (el): el is HTMLElement =>
            el instanceof HTMLElement && el.classList.contains("slide"),
        )
      : [];
  const all: Drawn[] = [
    ...(current ? [current] : []),
    ...rest.map((slide) => ({ slide, scripts: [] })),
  ];
  return {
    all,
    hrefs: all.map((_, index) => slideHash(index)),
    load: (index) => Promise.resolve(all[index]),
    keep() {},
  };
}

// The key a script runs once under: its name, or the URL it loads.
function scriptKey(script: Element): string | undefined {
  const name = script.getAttribute("data-hinote-script");
  if (name) return `name:${name}`;
  const src = script.getAttribute("src");
  return src ? `src:${fromRoot(src)}` : undefined;
}

// A script copied from another document does not run, so it is made anew.
function freshScript(script: Element): HTMLScriptElement {
  const fresh = document.createElement("script");
  for (const { name, value } of script.attributes)
    fresh.setAttribute(name, value);
  fresh.textContent = script.textContent;
  return fresh;
}

type PresenterView = {
  show(position: Position): void;
  // Returns true when it used the key.
  key(key: string): boolean;
  // Whether the laser pointer follows the mouse to the audience.
  readonly laser: boolean;
};

// The laser survives reloads from `hinote dev`, like the timer.
const LASER_KEY = "hinote-laser";

// Off until the presenter turns it on. A choice stays for this tab, including reloads.
function savedLaser(): boolean {
  try {
    return sessionStorage.getItem(LASER_KEY) === "on";
  } catch {
    return false;
  }
}

// How many slides the overview fetches at once.
const OVERVIEW_FETCHES = 4;

function presenterView(
  slides: Slides,
  steps: readonly (number | undefined)[],
  canvasWidth: number,
  actions: {
    go: (position: Position) => void;
    next: () => void;
    prev: () => void;
    // Called when the laser is turned off, to hide it on every page.
    laserOff: () => void;
  },
): PresenterView {
  const { go } = actions;
  const nextEl = document.getElementById("hinote-next");
  const timerEl = document.getElementById("hinote-timer");
  const clockEl = document.getElementById("hinote-clock");
  const overview = document.getElementById("hinote-overview");

  const sizes = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const box = entry.target;
      if (!(box instanceof HTMLElement)) continue;
      box.style.setProperty(
        "--hinote-scale",
        String(box.clientWidth / canvasWidth),
      );
    }
  });
  if (nextEl) sizes.observe(nextEl);

  let start = timerStart();
  const tick = () => {
    if (timerEl) timerEl.textContent = formatElapsed(Date.now() - start);
    if (clockEl)
      clockEl.textContent = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
  };
  tick();
  setInterval(tick, 1000);
  timerEl?.addEventListener("click", () => {
    start = timerStart(true);
    tick();
  });

  // Labels and pictures fill in as the overview fetches the slides, the
  // first time it opens.
  const items = slides.hrefs.map((_, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "hinote-overview-item";
    const box = document.createElement("div");
    box.className = "hinote-thumb";
    const label = document.createElement("span");
    label.className = "hinote-overview-label";
    label.textContent = `${index + 1}`;
    item.append(box, label);
    item.addEventListener("click", () => {
      go({ slide: index, step: 0 });
      setOverview(false);
    });
    sizes.observe(box);
    return { item, box, label };
  });
  overview?.replaceChildren(...items.map(({ item }) => item));
  let filled = false;
  const fillOverview = async () => {
    if (filled) return;
    filled = true;
    let next = 0;
    const worker = async () => {
      while (next < items.length) {
        const index = next++;
        const drawn = await slides.load(index, true);
        const entry = items[index];
        if (!drawn || !entry) continue;
        fillThumb(entry.box, drawn.slide, steps[index] ?? 0);
        const title = drawn.slide.dataset.title?.trim();
        if (title) entry.label.textContent = `${index + 1}. ${title}`;
      }
    };
    await Promise.all(Array.from({ length: OVERVIEW_FETCHES }, worker));
  };

  const setOverview = (open: boolean) => {
    overview?.classList.toggle("is-open", open);
    if (!open) return;
    void fillOverview();
    overview?.querySelector(".is-current")?.scrollIntoView({ block: "center" });
  };

  // The toolbar does what the keys do.
  let laser = savedLaser();
  const laserButton = document.querySelector<HTMLElement>(
    '[data-action="laser"]',
  );
  const setLaser = (on: boolean) => {
    laser = on;
    laserButton?.setAttribute("aria-pressed", String(on));
    try {
      sessionStorage.setItem(LASER_KEY, on ? "on" : "off");
    } catch {}
    if (!on) actions.laserOff();
  };
  setLaser(laser);
  const toolbar: Record<string, () => void> = {
    prev: actions.prev,
    next: actions.next,
    overview: () =>
      setOverview(!(overview?.classList.contains("is-open") ?? false)),
    laser: () => setLaser(!laser),
  };
  for (const button of document.querySelectorAll<HTMLElement>(
    "#hinote-toolbar [data-action]",
  )) {
    const action = toolbar[button.dataset.action ?? ""];
    if (action) button.addEventListener("click", action);
  }

  // The preview of the next key press: the next step of this slide, or the
  // next slide, fetched now if it has not been. A later move wins.
  let preview = 0;
  return {
    get laser() {
      return laser;
    },
    show(position) {
      for (const [index, { item }] of items.entries())
        item.classList.toggle("is-current", index === position.slide);
      if (!nextEl) return;
      const next = nextPosition(position, steps);
      const asked = ++preview;
      if (!next) {
        nextEl.setAttribute("data-end", "");
        nextEl.replaceChildren();
        return;
      }
      void slides.load(next.slide, true).then((drawn) => {
        if (asked !== preview) return;
        if (!drawn) {
          nextEl.replaceChildren();
          return;
        }
        nextEl.removeAttribute("data-end");
        fillThumb(nextEl, drawn.slide, next.step);
      });
    },
    key(key) {
      const open = overview?.classList.contains("is-open") ?? false;
      if (key === "o" || key === "O") setOverview(!open);
      else if (key === "Escape" && open) setOverview(false);
      else if (key === "l" || key === "L") setLaser(!laser);
      else if (key === "p" || key === "P") actions.prev();
      else if (key === "n" || key === "N") actions.next();
      else return false;
      return true;
    },
  };
}

// When the page is idle, so fetching ahead does not delay what is on screen.
function whenIdle(task: () => void): void {
  if (typeof requestIdleCallback === "function") requestIdleCallback(task);
  else setTimeout(task, 50);
}

export function boot(): void {
  // <base href> is relative, so it would move with the URL as the page goes
  // from slide to slide. It is fixed to the deck root it names now.
  const base = document.querySelector("base");
  if (base) base.setAttribute("href", document.baseURI);
  const root = document.documentElement;
  const page = root.dataset.page;
  const single = page === "static";
  const role: Role = page === "presenter" ? "presenter" : "view";

  const deck = document.getElementById("deck");
  const stage = document.querySelector<HTMLElement>(".hinote-stage");
  const first =
    stage?.querySelector<HTMLElement>(":scope > .slide") ?? undefined;
  const firstIndex = single ? 0 : Number(first?.dataset.hinoteSlide ?? 1) - 1;
  // As the server drew it: the page's scripts have not run yet, and once they
  // do they change the live slide, such as a chart that redraws itself to grow
  // in, which a copy would catch half drawn.
  const initial: Drawn | undefined = first
    ? { slide: drawnCopy(first), scripts: [] }
    : undefined;
  const bundled = single ? bundledSlides(initial) : undefined;
  const slides = bundled ?? servedSlides(firstIndex, initial);
  const count = slides.hrefs.length;
  const steps: (number | undefined)[] = Array.from(
    { length: count },
    () => undefined,
  );
  if (bundled)
    for (const [index, drawn] of bundled.all.entries())
      steps[index] = stepCount(drawn.slide);
  else if (first) steps[firstIndex] = stepCount(first);

  const notesEl = document.getElementById("hinote-notes");
  const indicatorEl = document.getElementById("hinote-indicator");
  const pointerEl = document.getElementById("hinote-pointer");
  const sync = root.dataset.sync;
  const channel = new URL(".", document.baseURI).pathname;
  const port = single
    ? NO_PORT
    : sync === "server"
      ? serverPort(channel)
      : sync === "broadcast"
        ? broadcastPort(channel)
        : sync === "reload"
          ? reloadPort(channel)
          : NO_PORT;

  // Scripts already on the page ran as it loaded.
  const ran = new Set(
    [...document.scripts].flatMap((script) => scriptKey(script) ?? []),
  );

  const fit = () => {
    if (!deck || !stage) return;
    const style = getComputedStyle(deck);
    const width =
      deck.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight);
    const height =
      deck.clientHeight -
      parseFloat(style.paddingTop) -
      parseFloat(style.paddingBottom);
    const scale = Math.min(
      width / Number(stage.dataset.width),
      height / Number(stage.dataset.height),
    );
    if (scale > 0) deck.style.setProperty("--hinote-scale", String(scale));
  };
  fit();
  if (deck) new ResizeObserver(fit).observe(deck);

  const writeUrl = (position: Position) => {
    const href = slides.hrefs[position.slide];
    if (href === undefined) return;
    const url = single
      ? `${location.search}${href}`
      : `${new URL(href, document.baseURI).pathname}${location.search}`;
    history.replaceState(null, "", url);
  };

  // Assigned once the player exists, since the overview navigates through it.
  let presenter: PresenterView | undefined;

  // The slide on the page and where it is in the deck.
  let slideEl: HTMLElement | undefined = first;
  let slideAt = firstIndex;
  if (first) first.classList.add("is-active");

  // Authors' events (window.hinote). Handlers run in order; one that throws
  // does not stop the others.
  const listeners = new Map<string, Set<(data: unknown) => void>>();
  const emit = (name: string, data: unknown) => {
    for (const handler of listeners.get(name) ?? []) {
      try {
        handler(data);
      } catch (error) {
        console.error(error);
      }
    }
  };
  let current: Position = { slide: firstIndex, step: 0 };

  // hinote.observe: one check per observed element, run on every move. An
  // element's check goes when its slide leaves the page.
  const observers = new Map<() => void, HTMLElement | null>();
  const checkAll = () => {
    for (const check of observers.keys()) check();
  };
  const observe = (element: Element, handler: (state: Observed) => void) => {
    const slide = element.closest<HTMLElement>(".slide");
    const own = reservedSteps(element.closest("[data-hinote-steps]"));
    const total = own ? own.to - own.from + 1 : slide ? stepCount(slide) : 0;
    let last: string | undefined;
    const check = () => {
      const active =
        slide !== null &&
        slide === slideEl &&
        stage?.contains(slide) === true &&
        current.slide === slideAt;
      const step = !active
        ? 0
        : own
          ? Math.min(total, Math.max(0, current.step - own.from + 1))
          : current.step;
      const key = `${active} ${step}`;
      if (key === last) return;
      last = key;
      try {
        handler({ active, step, steps: total });
      } catch (error) {
        console.error(error);
      }
    };
    observers.set(check, slide);
    check();
    return () => {
      observers.delete(check);
    };
  };

  // hinote.mount: each setup runs for the matching elements of every slide
  // that enters; what it returns runs as the slide leaves.
  type Mount = {
    selector: string;
    setup: (element: HTMLElement) => void | (() => void);
  };
  const mounts = new Set<Mount>();
  const cleanups = new Map<HTMLElement, (() => void)[]>();
  const mountIn = (slide: HTMLElement, entry: Mount) => {
    const done = cleanups.get(slide) ?? [];
    cleanups.set(slide, done);
    for (const element of slide.querySelectorAll<HTMLElement>(entry.selector)) {
      try {
        const cleanup = entry.setup(element);
        if (typeof cleanup === "function") done.push(cleanup);
      } catch (error) {
        console.error(error);
      }
    }
  };
  const unmount = (slide: HTMLElement) => {
    for (const [check, of] of observers) {
      if (of !== slide) continue;
      check();
      observers.delete(check);
    }
    for (const cleanup of cleanups.get(slide) ?? []) {
      try {
        cleanup();
      } catch (error) {
        console.error(error);
      }
    }
    cleanups.delete(slide);
  };

  const track = (position: Position) => {
    current = position;
    emit("position", position);
    checkAll();
  };

  const afterMove = (position: Position) => {
    presenter?.show(position);
    if (indicatorEl) {
      const marks = [...indicatorEl.children];
      if (marks.length !== count) {
        indicatorEl.replaceChildren(
          ...Array.from({ length: count }, () =>
            document.createElement("span"),
          ),
        );
      }
      for (const [index, mark] of [...indicatorEl.children].entries()) {
        if (!(mark instanceof HTMLElement)) continue;
        const total = steps[index] ?? 0;
        const state =
          index < position.slide
            ? "past"
            : index === position.slide
              ? "current"
              : "future";
        mark.dataset.state = state;
        const fill =
          state === "past"
            ? 1
            : state === "future"
              ? 0
              : total === 0
                ? 1
                : position.step / total;
        mark.style.setProperty("--hinote-fill", String(fill));
      }
      const stepTotal = steps[position.slide] ?? 0;
      indicatorEl.setAttribute(
        "aria-label",
        count === 0
          ? ""
          : `Slide ${position.slide + 1} of ${count}` +
              (stepTotal > 0 ? `, step ${position.step} of ${stepTotal}` : ""),
      );
    }
    if (notesEl)
      notesEl.replaceChildren(
        ...renderNotes(document, slideEl?.dataset.notes ?? ""),
      );
    if (count > 0) writeUrl(position);
  };

  // Puts a slide on the stage in place of the one there, then runs what it
  // needs: its CSS, the scripts the page has not run yet, and hinote.mount.
  const swap = (drawn: Drawn, entering: HTMLElement, index: number) => {
    const leaving = slideEl;
    slideEl = entering;
    slideAt = index;
    if (leaving) {
      unmount(leaving);
      leaving.remove();
    }
    stage?.append(entering);
    const css = drawn.css;
    const number = css?.getAttribute("data-hinote-slide");
    if (
      css &&
      number &&
      !document.head.querySelector(`style[data-hinote-slide="${number}"]`)
    ) {
      const style = document.createElement("style");
      style.setAttribute("data-hinote-slide", number);
      style.textContent = css.textContent;
      document.head.append(style);
    }
    for (const script of [
      ...entering.querySelectorAll("script"),
      ...drawn.scripts,
    ]) {
      const key = scriptKey(script);
      if (!key || ran.has(key)) continue;
      ran.add(key);
      if (entering.contains(script)) script.replaceWith(freshScript(script));
      else document.body.append(freshScript(script));
    }
    for (const entry of mounts) mountIn(entering, entry);
  };

  // A slide change animates with the transition of the slide it enters.
  // Elements that share a <Morph> name on the two slides move into each other
  // as their own pairs, whatever the transition, so a "none" slide still runs
  // a view transition when it has pairs.
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let shown: Position | undefined;
  let named: HTMLElement[] = [];
  let running: ViewTransition | undefined;
  const unname = () => {
    for (const el of named) el.style.removeProperty("view-transition-name");
    named = [];
  };
  const nameMorph = (el: HTMLElement | undefined, key: string) => {
    if (!el) return;
    el.style.setProperty("view-transition-name", `hinote-morph-${key}`);
    named.push(el);
  };
  const display = (position: Position, drawn: Drawn | undefined) => {
    const from = shown;
    shown = position;
    current = position;
    if (!drawn || !slideEl || position.slide === slideAt) {
      if (drawn && !slideEl) swap(drawn, activeCopy(drawn), position.slide);
      if (slideEl) revealSteps(slideEl, position.step);
      track(position);
      afterMove(position);
      return;
    }
    const entering = activeCopy(drawn);
    revealSteps(entering, position.step);
    const transition = entering.dataset.transition ?? "none";
    const before = morphs(slideEl, from?.step ?? 0);
    const after = morphs(entering, position.step);
    const pairs = [...after.keys()].filter((key) => before.has(key));
    const change = () => {
      swap(drawn, entering, position.slide);
      track(position);
      afterMove(position);
    };
    if (
      from === undefined ||
      (transition === "none" && pairs.length === 0) ||
      reduceMotion.matches ||
      !document.startViewTransition
    ) {
      change();
      return;
    }
    root.dataset.transition = transition;
    root.dataset.direction = position.slide > slideAt ? "forward" : "back";
    for (const [property, value] of [
      ["--hinote-transition-duration", entering.dataset.transitionDuration],
      ["--hinote-transition-easing", entering.dataset.transitionEasing],
    ] as const) {
      if (value) root.style.setProperty(property, value);
      else root.style.removeProperty(property);
    }
    unname();
    for (const key of pairs) nameMorph(before.get(key), key);
    const transitionRun = document.startViewTransition(() => {
      unname();
      change();
      for (const key of pairs) nameMorph(after.get(key), key);
    });
    running = transitionRun;
    void transitionRun.finished.finally(() => {
      if (running === transitionRun) unname();
    });
  };

  // Fetches the slides either side of this one while the page is idle, and
  // forgets the others.
  const fetchAround = (index: number) => {
    slides.keep([index - 1, index, index + 1]);
    whenIdle(() => {
      for (const near of [index + 1, index - 1])
        if (near >= 0 && near < count) void slides.load(near, true);
    });
  };

  // Each move waits for its slide; a later move wins over one still waiting.
  let player: Player | undefined;
  let moves = 0;
  const show = (position: Position) => {
    const move = ++moves;
    if (position.slide === slideAt && slideEl) {
      display(position, undefined);
      return;
    }
    void slides.load(position.slide).then((drawn) => {
      if (move !== moves) return;
      if (!drawn) {
        // Not a slide of this deck: leave for whatever the server answered.
        const href = slides.hrefs[position.slide];
        if (!single && href !== undefined) location.assign(fromRoot(href));
        return;
      }
      steps[position.slide] = stepCount(drawn.slide);
      const settled = clampPosition(position, steps);
      if (settled.step !== position.step) player?.settle(settled);
      display(settled, drawn);
      fetchAround(settled.slide);
    });
  };

  const activeSlide = () => slideEl;

  const created = createPlayer({
    role,
    steps,
    initial: {
      slide: single ? (parseHash(location.hash) ?? 0) : firstIndex,
      step: 0,
    },
    show,
    showPointer(pointer) {
      const active = activeSlide();
      if (!pointerEl || !active) return;
      const rect = active.getBoundingClientRect();
      pointerEl.style.left = `${rect.left + pointer.x * rect.width}px`;
      pointerEl.style.top = `${rect.top + pointer.y * rect.height}px`;
      pointerEl.style.opacity = pointer.active ? "1" : "0";
    },
    post: (message) => port.post(message),
  });
  player = created;
  if (!single && count > 0) fetchAround(firstIndex);
  port.listen((message) => {
    if (isEventMessage(message)) emit(message.name, message.data);
    else created.onMessage(message);
  });

  const api: HinoteClient = {
    role,
    sync:
      !single && (sync === "server" || sync === "broadcast") ? sync : "none",
    get position() {
      return current;
    },
    on(name: string, handler: (data: never) => void) {
      const handlers = listeners.get(name) ?? new Set();
      listeners.set(name, handlers);
      // The overloads in api.ts pair each name with its data, and emit only
      // calls a "position" handler with a Position.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const call = handler as (data: unknown) => void;
      handlers.add(call);
      if (name === "position") call(current);
      return () => handlers.delete(call);
    },
    mount(selector, setup) {
      const entry: Mount = { selector, setup };
      mounts.add(entry);
      if (slideEl) mountIn(slideEl, entry);
      return () => {
        mounts.delete(entry);
      };
    },
    observe,
    send(name, data) {
      if (!isEventName(name) || name === "position")
        throw new Error(`hinote.send: "${name}" is not an event name.`);
      emit(name, data);
      port.post({ type: "event", name, data });
    },
    toCanvas(event) {
      const slide = activeSlide();
      const rect = slide?.getBoundingClientRect();
      if (!rect || !stage || rect.width === 0) return { x: 0, y: 0 };
      return {
        x:
          ((event.clientX - rect.left) * Number(stage.dataset.width)) /
          rect.width,
        y:
          ((event.clientY - rect.top) * Number(stage.dataset.height)) /
          rect.height,
      };
    },
  };
  // Not declared here: @hinote/core/client declares the global for client files only.
  Reflect.set(globalThis, "hinote", api);

  // The laser is drawn only while it is on and the mouse is over the slide.
  let pointing = false;
  const point = (active: boolean, x = 0, y = 0) => {
    if (!active && !pointing) return;
    pointing = active;
    created.pointer(x, y, active, "local");
  };

  if (role === "presenter" && stage) {
    presenter = presenterView(slides, steps, Number(stage.dataset.width), {
      go: (position) => created.go(position, "local"),
      next: () => created.next(),
      prev: () => created.prev(),
      laserOff: () => point(false),
    });
    presenter.show(created.position);
  }

  // The single file prints every slide: they join the stage while it prints.
  if (bundled) {
    let printing: HTMLElement[] = [];
    window.addEventListener("beforeprint", () => {
      if (!slideEl) return;
      printing = bundled.all.map((drawn) => drawnCopy(drawn.slide));
      for (const [index, copy] of printing.entries()) {
        if (index === slideAt) continue;
        if (index < slideAt) slideEl.before(copy);
        else stage?.append(copy);
      }
    });
    window.addEventListener("afterprint", () => {
      for (const copy of printing) copy.remove();
      printing = [];
    });
  }

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()?.catch(() => {});
      return;
    }
    void document.documentElement.requestFullscreen()?.catch(() => {});
  };
  const fullscreenButton = document.getElementById("hinote-fullscreen");
  fullscreenButton?.addEventListener("click", toggleFullscreen);
  const slideNav = document.getElementById("hinote-nav");
  if (fullscreenButton || slideNav) {
    const chrome = [fullscreenButton, slideNav].filter(
      (el): el is HTMLElement => el instanceof HTMLElement,
    );
    let hideChrome = 0;
    const revealChrome = () => {
      for (const el of chrome) el.classList.add("is-shown");
      window.clearTimeout(hideChrome);
      hideChrome = window.setTimeout(() => {
        for (const el of chrome) el.classList.remove("is-shown");
      }, 1600);
    };
    document.addEventListener("pointermove", revealChrome);
  }
  document.addEventListener("fullscreenchange", () => {
    const on = document.fullscreenElement != null;
    fullscreenButton?.setAttribute("aria-pressed", String(on));
    fullscreenButton?.setAttribute(
      "aria-label",
      on ? "Exit full screen" : "Full screen",
    );
    fullscreenButton?.setAttribute(
      "title",
      on ? "Exit full screen (F)" : "Full screen (F)",
    );
  });
  if (single) {
    const move: Record<string, () => void> = {
      prev: () => created.prev(),
      next: () => created.next(),
    };
    for (const button of document.querySelectorAll<HTMLElement>(
      "#hinote-nav [data-action]",
    )) {
      const action = move[button.dataset.action ?? ""];
      if (action) button.addEventListener("click", action);
    }
  }

  document.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (page === "view" && (event.key === "f" || event.key === "F")) {
      event.preventDefault();
      toggleFullscreen();
      return;
    }
    if (presenter?.key(event.key) || created.key(event.key))
      event.preventDefault();
  });

  // A <Link> on a slide moves there through the player, with no reload. Its
  // href is the real URL, so a modified or middle click opens a new tab that
  // starts on that slide.
  document.addEventListener("click", (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey) return;
    if (event.shiftKey || event.altKey) return;
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLElement>("a[data-hinote-to]");
    if (!link || !link.closest(".hinote-stage")) return;
    const target = slides.hrefs.indexOf(link.getAttribute("href") ?? "");
    if (target < 0) return;
    event.preventDefault();
    created.go({ slide: target, step: 0 }, "local");
  });

  if (role === "presenter" && deck) {
    deck.addEventListener("pointermove", (event) => {
      const active = activeSlide();
      if (!active || !presenter?.laser) return;
      const normalized = normalizePointer(
        active.getBoundingClientRect(),
        event.clientX,
        event.clientY,
      );
      if (!normalized) point(false);
      else point(true, normalized.x, normalized.y);
    });
    deck.addEventListener("pointerleave", () => point(false));
  }
}

// A copy of a drawn slide to put on the stage.
function activeCopy(drawn: Drawn): HTMLElement {
  const copy = drawnCopy(drawn.slide);
  copy.classList.add("is-active");
  return copy;
}
