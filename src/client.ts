// Browser runtime inlined into every page. `bun run build:client` turns it into
// client.generated.ts, so rendering a deck never needs a bundler at runtime.
import {
  parseHash,
  parseServedPath,
  servedPath,
  slideHash,
} from "./location.ts";
import {
  createPlayer,
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

// A served page listens on the deck's SSE stream and sends with POST, so pages
// on other devices follow too. The server sends `reload` after `hinote dev` reloads.
function serverPort(base: string): Port {
  const id = crypto.randomUUID();
  const events = new EventSource(
    `${base}/_hinote/events?id=${encodeURIComponent(id)}`,
  );
  const post = (message: SyncMessage) => {
    void fetch(`${base}/_hinote/sync`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: id, message }),
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
  const port = served ? serverPort(served.base) : NO_PORT;

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
      ? `${servedPath(served.base, role, position.slide)}${location.search}`
      : `${location.search}${slideHash(position.slide)}`;
    history.replaceState(null, "", url);
  };

  const show = (position: Position) => {
    for (const [index, slide] of slides.entries()) {
      slide.classList.toggle("is-active", index === position.slide);
      for (const el of slide.querySelectorAll<HTMLElement>(
        "[data-hinote-step]",
      )) {
        const hidden =
          index > position.slide ||
          (index === position.slide &&
            Number(el.dataset.hinoteStep) > position.step);
        el.classList.toggle("is-hidden", hidden);
      }
    }
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

  const activeSlide = () =>
    slides.find((slide) => slide.classList.contains("is-active"));

  const player = createPlayer({
    role,
    steps,
    initial: {
      slide: (served ? served.slide : parseHash(location.hash)) ?? 0,
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
  port.listen((message) => player.onMessage(message));

  document.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (player.key(event.key)) event.preventDefault();
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
