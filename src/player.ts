export const SYNC_CHANNEL = "hinote-sync";

export type Role = "view" | "presenter";

export type Pointer = { x: number; y: number; active: boolean };

export type SyncMessage =
  | { type: "navigate"; index: number }
  | { type: "pointer"; x: number; y: number; active: boolean }
  | { type: "hello" };

export type Player = {
  readonly index: number;
  go(index: number, source: "local" | "remote"): void;
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
  slideCount: number;
  notes: readonly string[];
  initialIndex?: number;
  showSlide: (index: number) => void;
  showPointer: (pointer: Pointer) => void;
  showNotes: (notes: string) => void;
  post: (message: SyncMessage) => void;
};

function clampIndex(index: number, slideCount: number): number {
  if (slideCount <= 0) return 0;
  return Math.min(slideCount - 1, Math.max(0, index));
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
): message is { type: "navigate"; index: number } {
  return message.type === "navigate" && Number.isInteger(message.index);
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

export function createPlayer(options: PlayerOptions): Player {
  let index = clampIndex(options.initialIndex ?? 0, options.slideCount);
  const notesAt = (next: number) => options.notes[next] ?? "";

  const show = (next: number) => {
    index = next;
    options.showSlide(next);
    options.showNotes(notesAt(next));
  };

  show(index);
  options.showPointer({ x: 0, y: 0, active: false });
  options.post({ type: "hello" });

  const player: Player = {
    get index() {
      return index;
    },
    go(next, source) {
      if (!Number.isInteger(next)) return;
      const clamped = clampIndex(next, options.slideCount);
      if (clamped === index) return;
      if (options.slideCount <= 0) return;
      show(clamped);
      if (source === "local")
        options.post({ type: "navigate", index: clamped });
    },
    next() {
      player.go(index + 1, "local");
    },
    prev() {
      player.go(index - 1, "local");
    },
    key(key) {
      if (
        key === "ArrowRight" ||
        key === "ArrowDown" ||
        key === "PageDown" ||
        key === " " ||
        key === "Enter"
      ) {
        player.next();
        return true;
      }
      if (
        key === "ArrowLeft" ||
        key === "ArrowUp" ||
        key === "PageUp" ||
        key === "Backspace"
      ) {
        player.prev();
        return true;
      }
      if (key === "Home") {
        player.go(0, "local");
        return true;
      }
      if (key === "End") {
        player.go(options.slideCount - 1, "local");
        return true;
      }
      return false;
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
          options.post({ type: "navigate", index });
        return;
      }
      if (isNavigate(record)) {
        player.go(record.index, "remote");
        return;
      }
      if (isPointer(record))
        player.pointer(record.x, record.y, record.active, "remote");
    },
  };

  return player;
}
