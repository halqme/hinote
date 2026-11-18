// oxlint-disable-next-line typescript/triple-slash-reference -- types the browser global without importing it into a slide
/// <reference types="hinote/client" />
import type { Position } from "hinote/client";
// Conway's Game of Life, run in the browser and bundled by hinote from
// <Script> in slides/life.tsx.
//
// One page leads: the presenter, or the page itself when nothing syncs (the
// built file). It runs the board and sends every generation with
// hinote.send; the other pages only draw what they receive. A page that
// opens or reloads asks the leader for the board, so it never starts behind.
import { render, useState } from "hono/jsx/dom";

const COLUMNS = 64;
const ROWS = 32;
const SPEED_MS = 120;

type Board = Uint8Array;

// The same seed on every page, so even a page that never hears from the
// leader shows the same start.
function seeded(seed: number): Board {
  const board = new Uint8Array(COLUMNS * ROWS);
  let state = seed;
  for (let i = 0; i < board.length; i++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    board[i] = state / 2 ** 32 < 0.28 ? 1 : 0;
  }
  return board;
}

function step(board: Board): Board {
  const next = new Uint8Array(board.length);
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLUMNS; x++) {
      let around = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          // The edges wrap around, so gliders come back.
          const nx = (x + dx + COLUMNS) % COLUMNS;
          const ny = (y + dy + ROWS) % ROWS;
          around += board[ny * COLUMNS + nx] ?? 0;
        }
      const alive = board[y * COLUMNS + x] === 1;
      next[y * COLUMNS + x] = around === 3 || (alive && around === 2) ? 1 : 0;
    }
  }
  return next;
}

// 2048 cells as 512 hex digits: small enough for one sync message.
function encode(board: Board): string {
  let out = "";
  for (let i = 0; i < board.length; i += 4)
    out += (
      (board[i] ?? 0) * 8 +
      (board[i + 1] ?? 0) * 4 +
      (board[i + 2] ?? 0) * 2 +
      (board[i + 3] ?? 0)
    ).toString(16);
  return out;
}

function decode(text: string): Board {
  const board = new Uint8Array(COLUMNS * ROWS);
  for (let i = 0; i < text.length; i++) {
    const n = Number.parseInt(text[i] ?? "0", 16);
    for (let bit = 0; bit < 4; bit++) board[i * 4 + bit] = (n >> (3 - bit)) & 1;
  }
  return board;
}

const canvases = [...document.querySelectorAll<HTMLCanvasElement>("#deck .life-board")];
const slideOf = (el: Element) => el.closest<HTMLElement>(".slide");
const slides = [...document.querySelectorAll("#deck .slide")];

function draw(board: Board, generation: number) {
  for (const canvas of canvases) {
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    const style = getComputedStyle(canvas);
    const size = canvas.width / COLUMNS;
    ctx.fillStyle = style.getPropertyValue("--hinote-color-surface") || "#222";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = style.getPropertyValue("--hinote-color-accent") || "#fa0";
    for (let i = 0; i < board.length; i++) {
      if (!board[i]) continue;
      const x = (i % COLUMNS) * size;
      const y = Math.floor(i / COLUMNS) * size;
      ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
    }
  }
  for (const label of document.querySelectorAll("#deck .life-generation"))
    label.textContent = `第 ${generation} 世代`;
}

let board = seeded(2026);
let generation = 0;
const leads = hinote.role === "presenter" || hinote.sync === "none";

// Followers draw what the leader sends, and ask for it when they start.
hinote.on("life:board", (data) => {
  if (leads) return;
  const { cells, generation: g } = data as {
    cells: string;
    generation: number;
  };
  board = decode(cells);
  generation = g;
  draw(board, generation);
});

function publish() {
  draw(board, generation);
  if (hinote.sync !== "none") hinote.send("life:board", { cells: encode(board), generation });
}

if (leads) {
  hinote.on("life:need", () => publish());
} else {
  hinote.send("life:need");
}
draw(board, generation);

// The leader's controls: play, one step, a new seed, and clicks that flip
// cells. The timer lives outside the component, which only shows it.
let timer: ReturnType<typeof setInterval> | undefined;
let showPlaying = (_playing: boolean) => {};

function play() {
  if (timer) return;
  timer = setInterval(() => {
    board = step(board);
    generation++;
    publish();
  }, SPEED_MS);
  showPlaying(true);
}

function stop() {
  clearInterval(timer);
  timer = undefined;
  showPlaying(false);
}

function Controls() {
  const [playing, setPlaying] = useState(false);
  showPlaying = setPlaying;
  return (
    <div class="life-controls">
      <button
        type="button"
        aria-pressed={playing ? "true" : "false"}
        onClick={() => (timer ? stop() : play())}
      >
        {playing ? "一時停止" : "再生"}
      </button>
      <button
        type="button"
        onClick={() => {
          board = step(board);
          generation++;
          publish();
        }}
      >
        1世代進める
      </button>
      <button
        type="button"
        onClick={() => {
          board = seeded(Math.floor(Math.random() * 2 ** 31));
          generation = 0;
          publish();
        }}
      >
        ランダム
      </button>
    </div>
  );
}

if (leads) {
  // Leaving the slide stops the board, so it does not run unseen.
  hinote.on("position", ({ slide }: Position) => {
    const here = canvases.some((canvas) => slides.indexOf(slideOf(canvas) as Element) === slide);
    if (!here) stop();
  });
}

if (leads) {
  for (const slot of document.querySelectorAll<HTMLElement>("#deck .life-slot"))
    render(<Controls />, slot);
  for (const canvas of canvases) {
    canvas.style.cursor = "crosshair";
    canvas.addEventListener("click", (event) => {
      // Canvas pixels of the slide, minus where the board sits in it.
      const point = hinote.toCanvas(event);
      let left = 0;
      let top = 0;
      for (
        let el: HTMLElement | null = canvas;
        el && !el.classList.contains("slide");
        el = el.offsetParent as HTMLElement | null
      ) {
        left += el.offsetLeft;
        top += el.offsetTop;
      }
      const size = canvas.clientWidth / COLUMNS;
      const x = Math.floor((point.x - left) / size);
      const y = Math.floor((point.y - top) / size);
      if (x < 0 || y < 0 || x >= COLUMNS || y >= ROWS) return;
      board[y * COLUMNS + x] = board[y * COLUMNS + x] ? 0 : 1;
      publish();
    });
  }
}
