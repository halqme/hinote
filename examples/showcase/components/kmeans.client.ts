/// <reference types="hinote/client" />

import {
  centersTravel,
  createRun,
  links,
  marks,
  type Frame,
  type Point,
  type Run,
} from "./kmeans.ts";

const svgNs = "http://www.w3.org/2000/svg";
const travelMs = 650;

function isPoint(value: unknown): value is Point {
  return (
    typeof value === "object" &&
    value !== null &&
    "x" in value &&
    typeof value.x === "number" &&
    "y" in value &&
    typeof value.y === "number"
  );
}

function isFrame(value: unknown): value is Frame {
  return (
    typeof value === "object" &&
    value !== null &&
    "label" in value &&
    typeof value.label === "string" &&
    "clusters" in value &&
    Array.isArray(value.clusters) &&
    value.clusters.every(
      (cluster) => cluster === null || typeof cluster === "number",
    ) &&
    "centers" in value &&
    Array.isArray(value.centers) &&
    value.centers.every(isPoint)
  );
}

function isRun(value: unknown): value is Run {
  return (
    typeof value === "object" &&
    value !== null &&
    "points" in value &&
    Array.isArray(value.points) &&
    value.points.every(isPoint) &&
    "frames" in value &&
    Array.isArray(value.frames) &&
    value.frames.every(isFrame)
  );
}

function readRun(svg: SVGSVGElement): Run | undefined {
  try {
    const parsed: unknown = JSON.parse(svg.getAttribute("data-run") ?? "");
    return isRun(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

// The deck takes Enter and Space as "next slide" and cancels the click a
// focused button would have fired. Handle them here so the button wins.
function activateOnKey(button: HTMLButtonElement) {
  button.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) button.click();
  });
}

function paint(
  svg: SVGSVGElement,
  label: Element,
  points: Point[],
  shown: Frame,
) {
  svg.replaceChildren();
  for (const link of links(points, shown)) {
    const line = document.createElementNS(svgNs, "line");
    line.setAttribute("x1", String(link.x1));
    line.setAttribute("y1", String(link.y1));
    line.setAttribute("x2", String(link.x2));
    line.setAttribute("y2", String(link.y2));
    line.setAttribute("stroke", link.stroke);
    line.setAttribute("stroke-width", "0.45");
    line.setAttribute("stroke-opacity", "0.65");
    svg.append(line);
  }
  for (const mark of marks(points, shown)) {
    const circle = document.createElementNS(svgNs, "circle");
    circle.setAttribute("cx", String(mark.x));
    circle.setAttribute("cy", String(mark.y));
    circle.setAttribute("r", String(mark.r));
    circle.setAttribute("fill", mark.fill);
    circle.setAttribute("stroke", mark.stroke);
    circle.setAttribute("stroke-width", String(mark.width));
    svg.append(circle);
  }
  label.textContent = shown.label;
}

for (const plot of document.querySelectorAll<HTMLElement>("#deck .plot")) {
  const svg = plot.querySelector("svg");
  const label = plot.querySelector(".plot-label");
  if (!(svg instanceof SVGSVGElement) || !label) continue;
  const run = readRun(svg);
  if (!run) continue;
  let { points, frames } = run;
  const opening = frames[0];
  if (opening === undefined) continue;
  let shown = opening;
  let frameId = 0;

  const go = (index: number) => {
    cancelAnimationFrame(frameId);
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const next = frames[Math.min(index, frames.length - 1)] ?? shown;
    const from = shown.centers;
    const to = next.centers;
    if (reduce || !centersTravel(from, to)) {
      shown = next;
      paint(svg, label, points, shown);
      return;
    }
    const started = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / travelMs);
      const eased = 1 - (1 - t) ** 3;
      shown = {
        label: next.label,
        clusters: next.clusters,
        centers: to.map((center, i) => {
          const start = from[i];
          return {
            x: start.x + (center.x - start.x) * eased,
            y: start.y + (center.y - start.y) * eased,
          };
        }),
      };
      paint(svg, label, points, shown);
      if (t < 1) frameId = requestAnimationFrame(step);
    };
    frameId = requestAnimationFrame(step);
  };

  let index = 0;
  const back = plot.querySelector<HTMLButtonElement>("[data-plot='back']");
  const next = plot.querySelector<HTMLButtonElement>("[data-plot='next']");
  // aria-disabled, not disabled. A disabled button drops focus, and a held
  // Enter or Space then reaches the deck and changes slides.
  const mark = (button: HTMLButtonElement | null, off: boolean) => {
    if (button) button.ariaDisabled = off ? "true" : "false";
  };
  const show = (to: number) => {
    index = to;
    mark(back, index <= 0);
    mark(next, index >= frames.length - 1);
    go(index);
  };
  back?.addEventListener("click", () => {
    if (index > 0) show(index - 1);
  });
  next?.addEventListener("click", () => {
    if (index < frames.length - 1) show(index + 1);
  });
  if (back) activateOnKey(back);
  if (next) activateOnKey(next);
  const shuffle = plot.querySelector<HTMLButtonElement>(
    "[data-plot='shuffle']",
  );
  shuffle?.addEventListener("click", () => {
    let drawn: Run;
    try {
      drawn = createRun();
    } catch {
      return;
    }
    const first = drawn.frames[0];
    if (!first) return;
    points = drawn.points;
    frames = drawn.frames;
    shown = first;
    show(0);
  });
  if (shuffle) activateOnKey(shuffle);

  hinote.observe(plot, ({ active }) => {
    if (!active) {
      // Do not paint on the way out. That write is part of the view-transition
      // snapshot, so the exit would jump. The frame in progress stays where it
      // was. `index` already names the frame the button committed to.
      cancelAnimationFrame(frameId);
      return;
    }
    const frame = frames[index] ?? frames[frames.length - 1];
    if (!frame) return;
    cancelAnimationFrame(frameId);
    shown = frame;
    paint(svg, label, points, shown);
  });
}
