export type Role = "view" | "presenter";

export type Pointer = { x: number; y: number; active: boolean };

// `step` counts revealed steps: 0 shows none, `steps[slide]` shows all.
export type Position = { slide: number; step: number };

export type SyncMessage =
  | { type: "navigate"; slide: number; step: number }
  | { type: "pointer"; x: number; y: number; active: boolean }
  | { type: "hello" }
  // An author's event, sent with hinote.send(name, data).
  | { type: "event"; name: string; data: unknown };

// Event names are short words: "reveal", "poll:vote".
export function isEventName(name: unknown): name is string {
  return typeof name === "string" && /^[\w:.-]{1,64}$/.test(name);
}

export function isEventMessage(
  message: unknown,
): message is { type: "event"; name: string; data: unknown } {
  const record = message as Record<string, unknown> | null;
  return (
    !!record &&
    typeof record === "object" &&
    record.type === "event" &&
    isEventName(record.name)
  );
}

export type Player = {
  readonly position: Position;
  go(position: Position, source: "local" | "remote"): void;
  next(): void;
  prev(): void;
  key(key: string): boolean;
  pointer(
    x: number,
    y: number,
    active: boolean,
    source: "local" | "remote",
  ): void;
  onMessage(message: unknown): void;
};

export type PlayerOptions = {
  role: Role;
  // Number of steps on each slide. Its length is the slide count.
  steps: readonly number[];
  initial?: Position;
  show: (position: Position) => void;
  showPointer: (pointer: Pointer) => void;
  post: (message: SyncMessage) => void;
};

export function clampPosition(
  position: Position,
  steps: readonly number[],
): Position {
  if (steps.length === 0) return { slide: 0, step: 0 };
  const slide = Math.min(steps.length - 1, Math.max(0, position.slide));
  const step = Math.min(steps[slide] ?? 0, Math.max(0, position.step));
  return { slide, step };
}

// Reveal the next step, or move to the next slide with nothing revealed.
// Undefined at the very end.
export function nextPosition(
  { slide, step }: Position,
  steps: readonly number[],
): Position | undefined {
  if (step < (steps[slide] ?? 0)) return { slide, step: step + 1 };
  if (slide < steps.length - 1) return { slide: slide + 1, step: 0 };
  return undefined;
}

// Hide the last step, or move to the previous slide fully revealed.
// Undefined at the very start.
export function prevPosition(
  { slide, step }: Position,
  steps: readonly number[],
): Position | undefined {
  if (step > 0) return { slide, step: step - 1 };
  if (slide > 0) return { slide: slide - 1, step: steps[slide - 1] ?? 0 };
  return undefined;
}

export function normalizePointer(
  rect: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;
  if (x < 0 || y < 0 || x > 1 || y > 1) return null;
  return { x, y };
}

function isNavigate(
  message: Record<string, unknown>,
): message is { type: "navigate"; slide: number; step: number } {
  return (
    message.type === "navigate" &&
    Number.isInteger(message.slide) &&
    Number.isInteger(message.step)
  );
}

function isPointer(
  message: Record<string, unknown>,
): message is { type: "pointer"; x: number; y: number; active: boolean } {
  return (
    message.type === "pointer" &&
    typeof message.x === "number" &&
    typeof message.y === "number" &&
    Number.isFinite(message.x) &&
    Number.isFinite(message.y) &&
    message.x >= 0 &&
    message.y >= 0 &&
    message.x <= 1 &&
    message.y <= 1 &&
    typeof message.active === "boolean"
  );
}

const NEXT_KEYS = new Set([
  "ArrowRight",
  "ArrowDown",
  "PageDown",
  " ",
  "Enter",
]);
const PREV_KEYS = new Set(["ArrowLeft", "ArrowUp", "PageUp", "Backspace"]);

export function createPlayer(options: PlayerOptions): Player {
  const { steps } = options;
  let position = clampPosition(options.initial ?? { slide: 0, step: 0 }, steps);
  const stepsAt = (slide: number) => steps[slide] ?? 0;

  options.show(position);
  options.showPointer({ x: 0, y: 0, active: false });
  // A viewer asks where the presenter is; a presenter says where it is, so
  // open views follow a presenter that was just opened or reloaded.
  options.post(
    options.role === "presenter"
      ? { type: "navigate", ...position }
      : { type: "hello" },
  );

  const player: Player = {
    get position() {
      return position;
    },
    go(next, source) {
      if (steps.length === 0) return;
      if (!Number.isInteger(next.slide) || !Number.isInteger(next.step)) return;
      const clamped = clampPosition(next, steps);
      if (clamped.slide === position.slide && clamped.step === position.step)
        return;
      position = clamped;
      options.show(position);
      if (source === "local") options.post({ type: "navigate", ...position });
    },
    next() {
      const next = nextPosition(position, steps);
      if (next) player.go(next, "local");
    },
    prev() {
      const prev = prevPosition(position, steps);
      if (prev) player.go(prev, "local");
    },
    key(key) {
      if (NEXT_KEYS.has(key)) player.next();
      else if (PREV_KEYS.has(key)) player.prev();
      else if (key === "Home") player.go({ slide: 0, step: 0 }, "local");
      else if (key === "End") {
        const last = steps.length - 1;
        player.go({ slide: last, step: stepsAt(last) }, "local");
      } else return false;
      return true;
    },
    pointer(x, y, active, source) {
      if (source === "local" && options.role !== "presenter") return;
      options.showPointer({ x, y, active });
      if (source === "local") options.post({ type: "pointer", x, y, active });
    },
    onMessage(message) {
      if (!message || typeof message !== "object") return;
      const record = message as Record<string, unknown>;
      if (record.type === "hello") {
        if (options.role === "presenter")
          options.post({ type: "navigate", ...position });
        return;
      }
      if (isNavigate(record)) {
        player.go({ slide: record.slide, step: record.step }, "remote");
        return;
      }
      if (isPointer(record))
        player.pointer(record.x, record.y, record.active, "remote");
    },
  };

  return player;
}
