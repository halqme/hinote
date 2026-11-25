// The page's runtime: navigation, steps, sync, the presenter view, and
// window.hinote. main.ts starts it; tests start it on a rendered page.
import {
  parseHash,
  parseServedPath,
  servedPath,
  slideHash,
} from "./location.ts";
import type { HinoteClient, Observed } from "./api.ts";
import {
  createPlayer,
  isEventMessage,
  isEventName,
  nextPosition,
  normalizePointer,
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

// Prerendered pages have no server behind them, so windows of one browser
// talk directly: a presenter on the laptop, the audience view on the projector.
function broadcastPort(base: string): Port {
  const channel = new BroadcastChannel(`hinote-sync:${base}`);
  return {
    post: (message) => channel.postMessage(message),
    listen: (handler) => {
      channel.onmessage = (event) => handler(event.data);
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
function reloadPort(base: string): Port {
  const query = new URLSearchParams({ id: crypto.randomUUID(), channel: base });
  const events = new EventSource(`${base}/_hinote/events?${query}`);
  events.onmessage = (event) => {
    if (isReload(JSON.parse(event.data))) location.reload();
  };
  return NO_PORT;
}

// A served page listens on the deck's SSE stream and sends with POST, so pages
// on other devices follow too. The server sends `reload` after `hinote dev` reloads.
function serverPort(base: string): Port {
  const id = crypto.randomUUID();
  // The base path names the channel, so decks mounted side by side stay apart.
  const query = new URLSearchParams({ id, channel: base });
  const events = new EventSource(`${base}/_hinote/events?${query}`);
  const post = (message: SyncMessage) => {
    void fetch(`${base}/_hinote/sync`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel: base, from: id, message }),
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

function presenterView(
  slides: HTMLElement[],
  steps: readonly number[],
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

  const items = slides.map((slide, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "hinote-overview-item";
    const box = document.createElement("div");
    box.className = "hinote-thumb";
    fillThumb(box, slide, steps[index] ?? 0);
    const label = document.createElement("span");
    label.className = "hinote-overview-label";
    const title = slide.dataset.title?.trim();
    label.textContent = title ? `${index + 1}. ${title}` : `${index + 1}`;
    item.append(box, label);
    item.addEventListener("click", () => {
      go({ slide: index, step: 0 });
      setOverview(false);
    });
    sizes.observe(box);
    return item;
  });
  overview?.replaceChildren(...items);

  const setOverview = (open: boolean) => {
    overview?.classList.toggle("is-open", open);
    if (open)
      overview
        ?.querySelector(".is-current")
        ?.scrollIntoView({ block: "center" });
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

  return {
    get laser() {
      return laser;
    },
    show(position) {
      for (const [index, item] of items.entries())
        item.classList.toggle("is-current", index === position.slide);
      const next = nextPosition(position, steps);
      if (!nextEl) return;
      const slide = next && slides[next.slide];
      if (next && slide) {
        nextEl.removeAttribute("data-end");
        fillThumb(nextEl, slide, next.step);
      } else {
        nextEl.setAttribute("data-end", "");
        nextEl.replaceChildren();
      }
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

export function boot(): void {
  const page = document.documentElement.dataset.page;
  const served =
    page === "static" ? undefined : parseServedPath(location.pathname);
  const role: Role = page === "presenter" ? "presenter" : "view";

  const deck = document.getElementById("deck");
  const stage = document.querySelector<HTMLElement>(".hinote-stage");
  const slides = Array.from(document.querySelectorAll<HTMLElement>(".slide"));
  const steps = slides.map(stepCount);
  const notesEl = document.getElementById("hinote-notes");
  const indicatorEl = document.getElementById("hinote-indicator");
  const pointerEl = document.getElementById("hinote-pointer");
  const sync = document.documentElement.dataset.sync;
  const directories = document.documentElement.dataset.paths === "directories";
  const port = !served
    ? NO_PORT
    : sync === "server"
      ? serverPort(served.base)
      : sync === "broadcast"
        ? broadcastPort(served.base)
        : sync === "reload"
          ? reloadPort(served.base)
          : NO_PORT;

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
    if (slides.length === 0) return;
    const url = served
      ? `${servedPath(served.base, role, position.slide, directories)}${location.search}`
      : `${location.search}${slideHash(position.slide)}`;
    history.replaceState(null, "", url);
  };

  // Assigned once the player exists, since the overview navigates through it.
  let presenter: PresenterView | undefined;

  const apply = (position: Position) => {
    for (const [index, slide] of slides.entries()) {
      slide.classList.toggle("is-active", index === position.slide);
      // Earlier slides show every step, later slides none.
      revealSteps(
        slide,
        index < position.slide
          ? Infinity
          : index === position.slide
            ? position.step
            : 0,
      );
    }
    presenter?.show(position);
    if (indicatorEl) {
      const marks = [...indicatorEl.children];
      if (marks.length !== slides.length) {
        indicatorEl.replaceChildren(
          ...slides.map(() => document.createElement("span")),
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
        slides.length === 0
          ? ""
          : `Slide ${position.slide + 1} of ${slides.length}` +
              (stepTotal > 0 ? `, step ${position.step} of ${stepTotal}` : ""),
      );
    }
    if (notesEl)
      notesEl.replaceChildren(
        ...renderNotes(document, slides[position.slide]?.dataset.notes ?? ""),
      );
    writeUrl(position);
  };

  // A slide change animates with the transition of the slide it enters.
  // Elements that share a <Morph> name on the two slides move into each other
  // as their own pairs, whatever the transition, so a "none" slide still runs
  // a view transition when it has pairs.
  const root = document.documentElement;
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
  const show = (position: Position) => {
    const from = shown;
    shown = position;
    const entering = slides[position.slide];
    const leaving = from && slides[from.slide];
    const transition = entering?.dataset.transition ?? "none";
    const before = morphs(leaving, from?.step ?? 0);
    const after = morphs(entering, position.step);
    const pairs = [...after.keys()].filter((key) => before.has(key));
    if (
      from === undefined ||
      from.slide === position.slide ||
      (transition === "none" && pairs.length === 0) ||
      reduceMotion.matches ||
      !document.startViewTransition
    ) {
      apply(position);
      return;
    }
    root.dataset.transition = transition;
    root.dataset.direction = position.slide > from.slide ? "forward" : "back";
    for (const [property, value] of [
      ["--hinote-transition-duration", entering?.dataset.transitionDuration],
      ["--hinote-transition-easing", entering?.dataset.transitionEasing],
    ] as const) {
      if (value) root.style.setProperty(property, value);
      else root.style.removeProperty(property);
    }
    unname();
    for (const key of pairs) nameMorph(before.get(key), key);
    const transitionRun = document.startViewTransition(() => {
      unname();
      apply(position);
      for (const key of pairs) nameMorph(after.get(key), key);
    });
    running = transitionRun;
    void transitionRun.finished.finally(() => {
      if (running === transitionRun) unname();
    });
  };

  const activeSlide = () =>
    slides.find((slide) => slide.classList.contains("is-active"));

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
  let current: Position = { slide: 0, step: 0 };
  // hinote.observe: one check per observed element, run on every move.
  const observers = new Set<() => void>();
  const track = (position: Position) => {
    current = position;
    emit("position", position);
    for (const check of observers) check();
  };
  const observe = (element: Element, handler: (state: Observed) => void) => {
    const slide = slides.indexOf(
      element.closest<HTMLElement>(".slide") ?? document.createElement("div"),
    );
    const own = reservedSteps(element.closest("[data-hinote-steps]"));
    const total = own ? own.to - own.from + 1 : (steps[slide] ?? 0);
    let last: string | undefined;
    const check = () => {
      const active = slide >= 0 && current.slide === slide;
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
    observers.add(check);
    check();
    return () => {
      observers.delete(check);
    };
  };

  const player = createPlayer({
    role,
    steps,
    initial: {
      slide: (served ? served.slide : parseHash(location.hash)) ?? 0,
      step: 0,
    },
    show(position) {
      show(position);
      track(position);
    },
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
  port.listen((message) => {
    if (isEventMessage(message)) emit(message.name, message.data);
    else player.onMessage(message);
  });

  const api: HinoteClient = {
    role,
    sync: served && (sync === "server" || sync === "broadcast") ? sync : "none",
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
  // Not declared here: hinote/client declares the global for client files only.
  Reflect.set(globalThis, "hinote", api);

  // The laser is drawn only while it is on and the mouse is over the slide.
  let pointing = false;
  const point = (active: boolean, x = 0, y = 0) => {
    if (!active && !pointing) return;
    pointing = active;
    player.pointer(x, y, active, "local");
  };

  if (role === "presenter" && stage) {
    presenter = presenterView(slides, steps, Number(stage.dataset.width), {
      go: (position) => player.go(position, "local"),
      next: () => player.next(),
      prev: () => player.prev(),
      laserOff: () => point(false),
    });
    presenter.show(player.position);
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
  if (page === "static") {
    const move: Record<string, () => void> = {
      prev: () => player.prev(),
      next: () => player.next(),
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
    if (presenter?.key(event.key) || player.key(event.key))
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
    const target = slides.findIndex(
      (slide) => slide.dataset.hinoteId === link.dataset.hinoteTo,
    );
    if (target < 0) return;
    event.preventDefault();
    player.go({ slide: target, step: 0 }, "local");
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
