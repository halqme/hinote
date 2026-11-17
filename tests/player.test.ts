import { expect, test } from "bun:test";
import {
  boot,
  type ChannelPort,
  type DeckDom,
  type DeckNode,
  type KeyEventLike,
} from "../src/client.ts";
import {
  createPlayer,
  normalizePointer,
  type SyncMessage,
} from "../src/player.ts";

function recorder() {
  const shown: number[] = [];
  const notes: string[] = [];
  const pointers: { x: number; y: number; active: boolean }[] = [];
  const sent: SyncMessage[] = [];
  return { shown, notes, pointers, sent };
}

test("a viewer that joins adopts the presenter slide, then both follow each other", () => {
  const toViewer: SyncMessage[] = [];
  const toPresenter: SyncMessage[] = [];
  let steps = 0;
  const viewerRec = recorder();
  const presenterRec = recorder();
  const presenter = createPlayer({
    role: "presenter",
    slideCount: 3,
    notes: ["p0", "p1", "p2"],
    initialIndex: 1,
    showSlide: (index) => presenterRec.shown.push(index),
    showNotes: (note) => presenterRec.notes.push(note),
    showPointer: (pointer) => presenterRec.pointers.push(pointer),
    post: (message) => toViewer.push(message),
  });
  toViewer.length = 0;
  const viewer = createPlayer({
    role: "view",
    slideCount: 3,
    notes: ["v0", "v1", "v2"],
    showSlide: (index) => viewerRec.shown.push(index),
    showNotes: (note) => viewerRec.notes.push(note),
    showPointer: (pointer) => viewerRec.pointers.push(pointer),
    post: (message) => toPresenter.push(message),
  });
  const flush = () => {
    while (toPresenter.length > 0 || toViewer.length > 0) {
      if (++steps > 20) throw new Error("sync loop");
      const forPresenter = toPresenter.splice(0);
      const forViewer = toViewer.splice(0);
      for (const message of forPresenter) presenter.onMessage(message);
      for (const message of forViewer) viewer.onMessage(message);
    }
  };

  flush();
  expect(presenter.index).toBe(1);
  expect(viewer.index).toBe(1);
  expect(viewerRec.notes.at(-1)).toBe("v1");

  presenter.next();
  flush();
  expect(presenter.index).toBe(2);
  expect(viewer.index).toBe(2);

  viewer.prev();
  flush();
  expect(viewer.index).toBe(1);
  expect(presenter.index).toBe(1);
  expect(presenterRec.notes.at(-1)).toBe("p1");

  presenter.pointer(0.25, 0.5, true, "local");
  flush();
  expect(viewerRec.pointers.at(-1)).toEqual({ x: 0.25, y: 0.5, active: true });

  const before = viewerRec.pointers.length;
  const posted = toPresenter.length;
  viewer.pointer(0.1, 0.1, true, "local");
  flush();
  expect(viewerRec.pointers.length).toBe(before);
  expect(toPresenter.length).toBe(posted);
});

test("ignores malformed sync messages and clamps remote navigation", () => {
  const sent: SyncMessage[] = [];
  const shown: number[] = [];
  const player = createPlayer({
    role: "view",
    slideCount: 3,
    notes: ["", "", ""],
    showSlide: (index) => shown.push(index),
    showNotes: () => {},
    showPointer: () => {},
    post: (message) => sent.push(message),
  });
  const baseline = sent.length;
  player.onMessage(null);
  player.onMessage({ type: "navigate" });
  player.onMessage({ type: "navigate", index: 1.5 });
  player.onMessage({ type: "pointer", x: 2, y: 0, active: true });
  player.onMessage({ type: "pointer", x: 0, y: 0 });
  expect(player.index).toBe(0);
  expect(sent.length).toBe(baseline);

  player.onMessage({ type: "navigate", index: 99 });
  expect(player.index).toBe(2);
  expect(sent.length).toBe(baseline);

  player.onMessage({ type: "navigate", index: -3 });
  expect(player.index).toBe(0);
  player.onMessage({ type: "hello" });
  expect(
    sent.slice(baseline).every((message) => message.type !== "navigate"),
  ).toBe(true);
});

test("down, up, and enter move between slides", () => {
  const player = createPlayer({
    role: "view",
    slideCount: 3,
    notes: ["", "", ""],
    showSlide: () => {},
    showNotes: () => {},
    showPointer: () => {},
    post: () => {},
  });
  player.key("ArrowDown");
  expect(player.index).toBe(1);
  player.key("PageUp");
  expect(player.index).toBe(0);
  player.key("Enter");
  expect(player.index).toBe(1);
});

test("does not broadcast when already on the requested slide", () => {
  const sent: SyncMessage[] = [];
  const player = createPlayer({
    role: "presenter",
    slideCount: 1,
    notes: ["only"],
    showSlide: () => {},
    showNotes: () => {},
    showPointer: () => {},
    post: (message) => sent.push(message),
  });
  player.next();
  player.key("End");
  player.key("Home");
  expect(sent.map((message) => message.type)).toEqual(["hello"]);
});

test("normalizes pointer positions inside the slide", () => {
  expect(
    normalizePointer({ left: 10, top: 20, width: 100, height: 50 }, 60, 45),
  ).toEqual({
    x: 0.5,
    y: 0.5,
  });
  expect(
    normalizePointer({ left: 0, top: 0, width: 100, height: 100 }, -1, 10),
  ).toBeNull();
  expect(
    normalizePointer({ left: 0, top: 0, width: 0, height: 10 }, 0, 0),
  ).toBeNull();
});

function fakeDom(count = 2) {
  const make = (
    notes?: string,
  ): DeckNode & {
    tokens: Set<string>;
    listeners: Map<
      string,
      ((event: { clientX: number; clientY: number }) => void)[]
    >;
  } => {
    const tokens = new Set<string>();
    const listeners = new Map<
      string,
      ((event: { clientX: number; clientY: number }) => void)[]
    >();
    return {
      dataset: { notes },
      tokens,
      listeners,
      textContent: "",
      style: { left: "", top: "", opacity: "" },
      classList: {
        toggle(token: string, force?: boolean) {
          const on = force ?? !tokens.has(token);
          if (on) tokens.add(token);
          else tokens.delete(token);
        },
        contains: (token: string) => tokens.has(token),
      },
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
      }),
      addEventListener(
        type: string,
        listener: (event: { clientX: number; clientY: number }) => void,
      ) {
        const list = listeners.get(type) ?? [];
        list.push(listener);
        listeners.set(type, list);
      },
    };
  };
  const slides = Array.from({ length: count }, (_, index) =>
    make(`note-${index}`),
  );
  const deck = make();
  const notes = make();
  const step = make();
  const pointer = make();
  const keys: ((event: KeyEventLike) => void)[] = [];
  const doc: DeckDom = {
    documentElement: { dataset: {} },
    body: { dataset: {} },
    querySelectorAll: () => slides,
    getElementById(id) {
      if (id === "deck") return deck;
      if (id === "hinote-notes") return notes;
      if (id === "hinote-step") return step;
      if (id === "hinote-pointer") return pointer;
      return null;
    },
    addEventListener: (_type, listener) => keys.push(listener),
  };
  return {
    doc,
    slides,
    deck,
    notes,
    step,
    pointer,
    keys,
  };
}

function channel(): ChannelPort & { sent: unknown[] } {
  const sent: unknown[] = [];
  return {
    sent,
    onmessage: null,
    postMessage(data) {
      sent.push(data);
    },
  };
}

test("viewer boot follows remote navigation and ignores its own pointer", () => {
  const dom = fakeDom();
  const port = channel();
  boot(dom.doc, port, { search: "", pathname: "/" });

  expect(dom.slides[0]?.tokens.has("is-active")).toBe(true);
  expect(dom.notes.textContent).toBe("note-0");
  expect(port.sent).toContainEqual({ type: "hello" });

  const before = port.sent.length;
  port.onmessage?.({ data: { type: "navigate", index: 1 } });
  expect(dom.slides[1]?.tokens.has("is-active")).toBe(true);
  expect(dom.notes.textContent).toBe("note-1");
  expect(
    port.sent
      .slice(before)
      .some((message) => (message as { type?: string }).type === "navigate"),
  ).toBe(false);

  dom.deck.listeners
    .get("pointermove")
    ?.forEach((listener) => listener({ clientX: 10, clientY: 10 }));
  expect(
    port.sent
      .slice(before)
      .some((message) => (message as { type?: string }).type === "pointer"),
  ).toBe(false);
});

test("presenter boot publishes the pointer and query string selects presenter", () => {
  const dom = fakeDom();
  const port = channel();
  const loc = { search: "?presenter", pathname: "/index.html" };
  boot(dom.doc, port, loc);
  expect(dom.doc.documentElement.dataset.role).toBe("presenter");
  expect(dom.step.textContent).toBe("1 / 2");

  dom.deck.listeners
    .get("pointermove")
    ?.forEach((listener) => listener({ clientX: 40, clientY: 10 }));
  expect(port.sent).toContainEqual({
    type: "pointer",
    x: 0.4,
    y: 0.1,
    active: true,
  });
  expect(dom.pointer.style.opacity).toBe("1");

  dom.deck.listeners
    .get("pointerleave")
    ?.forEach((listener) => listener({ clientX: 0, clientY: 0 }));
  dom.deck.listeners
    .get("pointerleave")
    ?.forEach((listener) => listener({ clientX: 0, clientY: 0 }));
  const inactive = port.sent.filter(
    (message) =>
      (message as { type?: string }).type === "pointer" &&
      (message as { active?: boolean }).active === false,
  );
  expect(inactive).toHaveLength(1);
});
