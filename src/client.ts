import {
  createPlayer,
  normalizePointer,
  SYNC_CHANNEL,
  type Role,
} from "./player.ts";

export type LocationLike = {
  search: string;
  pathname: string;
};

export type ChannelPort = {
  postMessage(data: unknown): void;
  onmessage: ((event: { data: unknown }) => void) | null;
};

export type ClassListLike = {
  toggle(token: string, force?: boolean): void;
  contains(token: string): boolean;
};

export type Rect = { left: number; top: number; width: number; height: number };

export type DeckNode = {
  dataset: { notes?: string; role?: string };
  classList: ClassListLike;
  textContent: string | null;
  style: { left: string; top: string; opacity: string };
  getBoundingClientRect(): Rect;
  addEventListener(
    type: string,
    listener: (event: { clientX: number; clientY: number }) => void,
  ): void;
};

export type KeyEventLike = {
  key: string;
  preventDefault(): void;
};

export type DeckDom = {
  documentElement: { dataset: { role?: string } };
  body: { dataset: { role?: string } };
  querySelectorAll(selector: ".slide"): ArrayLike<DeckNode>;
  getElementById(id: string): DeckNode | null;
  addEventListener(
    type: "keydown",
    listener: (event: KeyEventLike) => void,
  ): void;
};

function roleFor(doc: DeckDom, loc: LocationLike): Role {
  const presenter =
    doc.documentElement.dataset.role === "presenter" ||
    doc.body.dataset.role === "presenter" ||
    new URLSearchParams(loc.search).has("presenter") ||
    loc.pathname === "/presenter";
  return presenter ? "presenter" : "view";
}

export function boot(
  doc: DeckDom,
  channel: ChannelPort,
  loc: LocationLike,
): void {
  const role = roleFor(doc, loc);
  doc.documentElement.dataset.role = role;
  doc.body.dataset.role = role;

  const slides = Array.from(doc.querySelectorAll(".slide"));
  const notesEl = doc.getElementById("hinote-notes");
  const stepEl = doc.getElementById("hinote-step");
  const pointerEl = doc.getElementById("hinote-pointer");
  let laser = false;

  const player = createPlayer({
    role,
    slideCount: slides.length,
    notes: slides.map((slide) => slide.dataset.notes ?? ""),
    showSlide(index) {
      for (const [slideIndex, slide] of slides.entries()) {
        slide.classList.toggle("is-active", slideIndex === index);
      }
      if (stepEl) {
        stepEl.textContent =
          slides.length === 0 ? "" : `${index + 1} / ${slides.length}`;
      }
    },
    showNotes(text) {
      if (notesEl) notesEl.textContent = text;
    },
    showPointer(pointer) {
      const active = slides.find((slide) =>
        slide.classList.contains("is-active"),
      );
      if (!pointerEl || !active) return;
      const rect = active.getBoundingClientRect();
      pointerEl.style.left = `${rect.left + pointer.x * rect.width}px`;
      pointerEl.style.top = `${rect.top + pointer.y * rect.height}px`;
      pointerEl.style.opacity = pointer.active ? "1" : "0";
    },
    post(message) {
      channel.postMessage(message);
    },
  });

  channel.onmessage = (event) => {
    player.onMessage(event.data);
  };

  doc.addEventListener("keydown", (event) => {
    if (player.key(event.key)) event.preventDefault();
  });

  if (role === "presenter") {
    const deck = doc.getElementById("deck");
    const point = (active: boolean, x = 0, y = 0) => {
      if (!active && !laser) return;
      laser = active;
      player.pointer(x, y, active, "local");
    };
    deck?.addEventListener("pointermove", (event) => {
      const active = slides.find((slide) =>
        slide.classList.contains("is-active"),
      );
      if (!active) return;
      const normalized = normalizePointer(
        active.getBoundingClientRect(),
        event.clientX,
        event.clientY,
      );
      if (!normalized) point(false);
      else point(true, normalized.x, normalized.y);
    });
    deck?.addEventListener("pointerleave", () => point(false));
  }
}

const isBrowser =
  typeof document !== "undefined" && typeof window !== "undefined";
if (isBrowser) {
  boot(
    document as unknown as DeckDom,
    new BroadcastChannel(SYNC_CHANNEL) as unknown as ChannelPort,
    window.location,
  );
}
