import { describe, expect, test } from "bun:test";
import {
  baseHref,
  parseHash,
  slideHash,
  slideHref,
  slideRoute,
} from "../src/client/location.ts";
import {
  createPlayer,
  isEventMessage,
  isEventName,
  normalizePointer,
  type Position,
  type Role,
  type SyncMessage,
} from "../src/client/player.ts";

function player(role: Role, steps: number[], initial?: Position) {
  const shown: Position[] = [];
  const pointers: { x: number; y: number; active: boolean }[] = [];
  const sent: SyncMessage[] = [];
  const instance = createPlayer({
    role,
    steps,
    initial,
    show: (position) => shown.push(position),
    showPointer: (pointer) => pointers.push(pointer),
    post: (message) => sent.push(message),
  });
  return { player: instance, shown, pointers, sent };
}

function walk(steps: number[], keys: string[]): Position[] {
  const { player: p } = player("view", steps);
  return keys.map((key) => {
    p.key(key);
    return p.position;
  });
}

describe("navigation", () => {
  test("next reveals each step, then moves to the next slide with none revealed", () => {
    expect(walk([2, 0, 1], Array(5).fill("ArrowRight"))).toEqual([
      { slide: 0, step: 1 },
      { slide: 0, step: 2 },
      { slide: 1, step: 0 },
      { slide: 2, step: 0 },
      { slide: 2, step: 1 },
    ]);
  });

  test("prev hides steps, then lands on the previous slide fully revealed", () => {
    const { player: p } = player("view", [2, 1], { slide: 1, step: 1 });
    const seen = Array.from({ length: 4 }, () => {
      p.key("ArrowLeft");
      return p.position;
    });
    expect(seen).toEqual([
      { slide: 1, step: 0 },
      { slide: 0, step: 2 },
      { slide: 0, step: 1 },
      { slide: 0, step: 0 },
    ]);
  });

  test("stops at both ends and jumps with Home and End", () => {
    expect(walk([0, 3], ["ArrowLeft", "End", "ArrowRight", "Home"])).toEqual([
      { slide: 0, step: 0 },
      { slide: 1, step: 3 },
      { slide: 1, step: 3 },
      { slide: 0, step: 0 },
    ]);
  });

  test("an out-of-range start is clamped, and an empty deck never moves", () => {
    expect(
      player("view", [1, 1], { slide: 9, step: 9 }).player.position,
    ).toEqual({ slide: 1, step: 1 });
    const empty = player("view", []);
    empty.player.key("ArrowRight");
    expect(empty.player.position).toEqual({ slide: 0, step: 0 });
    expect(empty.sent.some((message) => message.type === "navigate")).toBe(
      false,
    );
  });

  test("other keys are left to the page", () => {
    const { player: p } = player("view", [0, 0]);
    expect(p.key("a")).toBe(false);
    expect(p.position).toEqual({ slide: 0, step: 0 });
  });
});

describe("sync", () => {
  // Wires two players like two windows on one channel.
  function pair(steps: number[], presenterAt: Position) {
    const presenter = player("presenter", steps, presenterAt);
    const viewer = player("view", steps);
    let rounds = 0;
    const flush = () => {
      while (presenter.sent.length > 0 || viewer.sent.length > 0) {
        if (++rounds > 20) throw new Error("sync loop");
        const toViewer = presenter.sent.splice(0);
        const toPresenter = viewer.sent.splice(0);
        for (const message of toViewer) viewer.player.onMessage(message);
        for (const message of toPresenter) presenter.player.onMessage(message);
      }
    };
    return { presenter, viewer, flush };
  }

  test("a viewer that joins adopts the presenter position, then both follow each other", () => {
    const { presenter, viewer, flush } = pair([0, 2, 0], { slide: 1, step: 1 });
    flush();
    expect(viewer.player.position).toEqual({ slide: 1, step: 1 });

    presenter.player.next();
    flush();
    expect(viewer.player.position).toEqual({ slide: 1, step: 2 });

    viewer.player.prev();
    flush();
    expect(presenter.player.position).toEqual({ slide: 1, step: 1 });
  });

  test("a presenter opened later brings open viewers to its position", () => {
    const viewer = player("view", [0, 0, 0]);
    viewer.sent.length = 0;
    const presenter = player("presenter", [0, 0, 0], { slide: 2, step: 0 });
    for (const message of presenter.sent) viewer.player.onMessage(message);
    expect(viewer.player.position).toEqual({ slide: 2, step: 0 });
  });

  test("only the presenter sends the pointer", () => {
    const { presenter, viewer, flush } = pair([0], { slide: 0, step: 0 });
    flush();
    presenter.player.pointer(0.25, 0.5, true, "local");
    flush();
    expect(viewer.pointers.at(-1)).toEqual({ x: 0.25, y: 0.5, active: true });

    const before = presenter.pointers.length;
    viewer.player.pointer(0.9, 0.9, true, "local");
    flush();
    expect(presenter.pointers.length).toBe(before);
  });

  test("ignores malformed messages", () => {
    const { player: p, pointers } = player("view", [0, 0]);
    const before = pointers.length;
    for (const message of [
      null,
      "navigate",
      { type: "navigate", slide: 1.5, step: 0 },
      { type: "navigate", slide: 1 },
      { type: "pointer", x: 2, y: 0, active: true },
      { type: "pointer", x: Number.NaN, y: 0, active: true },
    ])
      p.onMessage(message);
    expect(p.position).toEqual({ slide: 0, step: 0 });
    expect(pointers.length).toBe(before);
  });
});

test("normalizePointer maps inside the slide and rejects outside", () => {
  const rect = { left: 100, top: 50, width: 200, height: 100 };
  expect(normalizePointer(rect, 200, 100)).toEqual({ x: 0.5, y: 0.5 });
  expect(normalizePointer(rect, 99, 100)).toBeNull();
  expect(normalizePointer({ ...rect, width: 0 }, 100, 50)).toBeNull();
});

describe("location", () => {
  test("each slide has a route from the deck root, counted from 1, and an href relative to it", () => {
    expect(slideRoute("view", 0)).toBe("/");
    expect(slideRoute("view", 2)).toBe("/3");
    expect(slideRoute("presenter", 0)).toBe("/presenter");
    expect(slideRoute("presenter", 1)).toBe("/presenter/2");
    expect(slideHref("view", 0)).toBe("./");
    expect(slideHref("view", 2)).toBe("3");
    expect(slideHref("presenter", 1)).toBe("presenter/2");
  });

  test("<base href> finds the deck root from any page, mounted or not", () => {
    const root = (path: string, route: string) =>
      new URL(baseHref(path, route), `http://h${path}`).pathname;
    for (const [path, route] of [
      ["/", "/"],
      ["/2", "/2"],
      ["/presenter", "/presenter"],
      ["/presenter/2", "/presenter/2"],
    ] as const)
      expect(root(path, route)).toBe("/");
    for (const [path, route] of [
      ["/talk", "/"],
      ["/talk/", "/"],
      ["/talk/2", "/2"],
      ["/talk/presenter", "/presenter"],
      ["/talk/presenter/2", "/presenter/2"],
    ] as const)
      expect(root(path, route)).toBe("/talk/");
    // Relative wherever the route allows, so a page written for a static host
    // works under any path.
    expect(baseHref("/presenter/2", "/presenter/2")).toBe("../");
  });

  test("the built file keeps the slide in the hash", () => {
    expect(parseHash(slideHash(4))).toBe(4);
    expect(parseHash("")).toBeUndefined();
    expect(parseHash("#3.2")).toBeUndefined();
  });
});

test("author events need a short name; anything else is not an event", () => {
  expect(isEventName("chart:mode")).toBe(true);
  expect(isEventName("poll.vote-2")).toBe(true);
  for (const name of ["", "has space", "<script>", "x".repeat(65), 3])
    expect(isEventName(name)).toBe(false);
  expect(isEventMessage({ type: "event", name: "a", data: [1] })).toBe(true);
  expect(isEventMessage({ type: "event", name: "a b", data: 1 })).toBe(false);
  expect(isEventMessage({ type: "navigate", slide: 1, step: 0 })).toBe(false);
});
