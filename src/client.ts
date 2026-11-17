// Browser runtime inlined into every page. `bun run build:client` turns it into
// client.generated.ts, so rendering a deck never needs a bundler at runtime.
import {
  parseHash,
  parseServedPath,
  servedPath,
  slideHash,
} from "./location.ts";
import type { HinoteClient } from "./client-api.ts";
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

// Under `hinote dev` without the presenter, a page only listens for reloads.
function reloadPort(base: string): Port {
  const query = new URLSearchParams({ id: crypto.randomUUID(), channel: base });
  const events = new EventSource(`${base}/_hinote/events?${query}`);
  events.onmessage = (event) => {
    if (
      (JSON.parse(event.data) as { type?: unknown } | null)?.type === "reload"
    )
      location.reload();
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
        if ((message as { type?: unknown } | null)?.type === "reload")
          location.reload();
        else handler(message);
      };
    },
  };
}

function stepCount(slide: Element): number {
  let count = 0;
  for (const el of slide.querySelectorAll("[data-hinote-step]")) {
    count = Math.max(count, Number((el as HTMLElement).dataset.hinoteStep));
  }
  return count;
}

// Hides the steps of one slide that come after `revealed`.
function revealSteps(slide: ParentNode, revealed: number): void {
  for (const el of slide.querySelectorAll<HTMLElement>("[data-hinote-step]")) {
    el.classList.toggle("is-hidden", Number(el.dataset.hinoteStep) > revealed);
  }
}

// A copy of a slide scaled into `box`, which keeps the canvas ratio in CSS.
function fillThumb(box: HTMLElement, slide: HTMLElement, revealed: number) {
  const copy = slide.cloneNode(true) as HTMLElement;
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
};

function presenterView(
  slides: HTMLElement[],
  steps: readonly number[],
  canvasWidth: number,
  go: (position: Position) => void,
): PresenterView {
  const nextEl = document.getElementById("hinote-next");
  const timerEl = document.getElementById("hinote-timer");
  const clockEl = document.getElementById("hinote-clock");
  const overview = document.getElementById("hinote-overview");

  const sizes = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const box = entry.target as HTMLElement;
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
    label.textContent = `${index + 1}`;
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

  return {
    show(position) {
      for (const [index, item] of items.entries())
        item.classList.toggle("is-current", index === position.slide);
      if (!nextEl) return;
      const next = nextPosition(position, steps);
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
      else return false;
      return true;
    },
  };
}

function boot(): void {
  const page = document.documentElement.dataset.page;
  const served =
    page === "static" ? undefined : parseServedPath(location.pathname);
  const role: Role = page === "presenter" ? "presenter" : "view";

  const deck = document.getElementById("deck");
  const stage = document.querySelector<HTMLElement>(".hinote-stage");
  const slides = Array.from(document.querySelectorAll<HTMLElement>(".slide"));
  const steps = slides.map(stepCount);
  const notesEl = document.getElementById("hinote-notes");
  const stepEl = document.getElementById("hinote-step");
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
    if (stepEl) {
      const total = steps[position.slide] ?? 0;
      stepEl.textContent =
        slides.length === 0
          ? ""
          : `${position.slide + 1} / ${slides.length}` +
            (total > 0 ? ` · step ${position.step} / ${total}` : "");
    }
    if (notesEl)
      notesEl.textContent = slides[position.slide]?.dataset.notes ?? "";
    writeUrl(position);
  };

  // A slide change animates with the transition of the slide it enters.
  const root = document.documentElement;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let shown: number | undefined;
  const show = (position: Position) => {
    const from = shown;
    shown = position.slide;
    const transition = slides[position.slide]?.dataset.transition ?? "none";
    if (
      from === undefined ||
      from === position.slide ||
      transition === "none" ||
      reduceMotion.matches ||
      !document.startViewTransition
    ) {
      apply(position);
      return;
    }
    root.dataset.transition = transition;
    root.dataset.direction = position.slide > from ? "forward" : "back";
    document.startViewTransition(() => apply(position));
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
  const track = (position: Position) => {
    current = position;
    emit("position", position);
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
    get position() {
      return current;
    },
    on(name: string, handler: (data: never) => void) {
      const handlers = listeners.get(name) ?? new Set();
      listeners.set(name, handlers);
      const call = handler as (data: unknown) => void;
      handlers.add(call);
      if (name === "position") call(current);
      return () => handlers.delete(call);
    },
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
  globalThis.hinote = api;

  if (role === "presenter" && stage) {
    presenter = presenterView(
      slides,
      steps,
      Number(stage.dataset.width),
      (position) => player.go(position, "local"),
    );
    presenter.show(player.position);
  }

  document.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (presenter?.key(event.key) || player.key(event.key))
      event.preventDefault();
  });

  if (role === "presenter" && deck) {
    let laser = false;
    const point = (active: boolean, x = 0, y = 0) => {
      if (!active && !laser) return;
      laser = active;
      player.pointer(x, y, active, "local");
    };
    deck.addEventListener("pointermove", (event) => {
      const active = activeSlide();
      if (!active) return;
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

boot();
