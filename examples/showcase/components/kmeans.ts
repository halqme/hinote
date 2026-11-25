// One k-means run. Points and the starting centers are placed at random. The
// points stay in three separated blobs so the slide's claim can still come true.

export type Point = { x: number; y: number };

export const plotSize = 100;

const colors = ["var(--hinote-color-accent)", "#9a3412", "#166534"] as const;
const ink = "var(--hinote-color-fg)";
const paper = "var(--hinote-color-surface)";

export type Frame = {
  label: string;
  clusters: (number | null)[];
  centers: Point[];
};

export type Run = {
  points: Point[];
  frames: Frame[];
};

export type Mark = {
  x: number;
  y: number;
  r: number;
  fill: string;
  stroke: string;
  width: number;
};

const pointRadius = 1.8;
const centerRadius = 3.4;
const perBlob = 8;

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

const inset = 14;
const blobRadius = 6;

function spot(random: () => number): Point {
  const span = plotSize - inset * 2;
  return {
    x: round(inset + random() * span),
    y: round(inset + random() * span),
  };
}

// Random positions that stay at least `gap` apart. `distance` is squared.
function placed(count: number, gap: number, random: () => number): Point[] {
  const found: Point[] = [];
  const gap2 = gap * gap;
  let guard = 0;
  while (found.length < count && guard < 200) {
    guard += 1;
    const candidate = spot(random);
    if (found.every((point) => distance(point, candidate) >= gap2))
      found.push(candidate);
  }
  return found;
}

function cloud(origin: Point, count: number, random: () => number): Point[] {
  const points: Point[] = [];
  const radius2 = blobRadius * blobRadius;
  let guard = 0;
  while (points.length < count && guard < 400) {
    guard += 1;
    const x = origin.x + (random() - 0.5) * blobRadius * 2;
    const y = origin.y + (random() - 0.5) * blobRadius * 2;
    const dx = x - origin.x;
    const dy = y - origin.y;
    // inset 14 and radius 6 stay inside the plot, so this needs no second clip.
    if (dx * dx + dy * dy > radius2) continue;
    points.push({ x: round(x), y: round(y) });
  }
  return points;
}

function sample(random: () => number): Point[] {
  return placed(3, 36, random).flatMap((origin) =>
    cloud(origin, perBlob, random),
  );
}

// Squared, so a gap check uses gap * gap and skips the square root.
function distance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function nearest(point: Point, centers: Point[]): number {
  let group = 0;
  let best = Infinity;
  for (const [index, center] of centers.entries()) {
    const away = distance(point, center);
    if (away < best) {
      best = away;
      group = index;
    }
  }
  return group;
}

function means(points: Point[], groups: number[], centers: Point[]): Point[] {
  return centers.map((center, group) => {
    let x = 0;
    let y = 0;
    let count = 0;
    for (const [index, point] of points.entries()) {
      if (groups[index] !== group) continue;
      x += point.x;
      y += point.y;
      count += 1;
    }
    if (count === 0) return center;
    return { x: round(x / count), y: round(y / count) };
  });
}

function same(groups: number[], previous: (number | null)[]): boolean {
  return groups.every((group, index) => group === previous[index]);
}

// Squared. `round` snaps to 0.01, so this ignores that last step and nothing more.
const centerShift = 0.0001;

export function centersTravel(from: Point[], to: Point[]): boolean {
  return (
    from.length > 0 &&
    from.length === to.length &&
    from.some((center, index) => distance(center, to[index]) > centerShift)
  );
}

function frames(points: Point[], seeds: Point[]): Frame[] {
  const blank: (number | null)[] = points.map(() => null);
  const run: Frame[] = [
    { label: `${points.length} points`, clusters: blank, centers: [] },
    { label: "Three starting centers", clusters: blank, centers: seeds },
  ];
  let centers = seeds;
  let clusters = blank;
  for (let pass = 0; pass < 4; pass++) {
    const groups = points.map((point) => nearest(point, centers));
    if (same(groups, clusters)) break;
    run.push({
      label: "Each point takes the nearest",
      clusters: groups,
      centers,
    });
    const next = means(points, groups, centers);
    if (!centersTravel(centers, next)) break;
    centers = next;
    clusters = groups;
    run.push({
      label: "Centers move to the mean",
      clusters: groups,
      centers,
    });
  }
  return run;
}

function draw(random: () => number): Run {
  const points = sample(random);
  const seeds = [spot(random), spot(random), spot(random)];
  return { points, frames: frames(points, seeds) };
}

function coversCenters(frame: Frame): boolean {
  const seen = new Set<number>();
  for (const cluster of frame.clusters) {
    if (cluster === null) return false;
    seen.add(cluster);
  }
  return seen.size === frame.centers.length;
}

// True when each sampled blob ends in its own center, every colored step uses
// all three centers, and a center has moved. Points stay in sample() order:
// perBlob points from each blob, blob by blob.
function separated(run: Run): boolean {
  if (run.points.length !== perBlob * 3) return false;
  const last = run.frames[run.frames.length - 1];
  const seeds = run.frames[1];
  if (!last || !seeds || seeds.centers.length !== 3) return false;
  if (last.clusters.length !== run.points.length) return false;
  for (const frame of run.frames) {
    const colored = frame.clusters.some((cluster) => cluster !== null);
    if (colored && !coversCenters(frame)) return false;
  }
  let traveled = false;
  for (let index = 1; index < run.frames.length; index++) {
    const before = run.frames[index - 1];
    const after = run.frames[index];
    if (before && after && centersTravel(before.centers, after.centers))
      traveled = true;
  }
  const groups = new Set<number>();
  for (let blob = 0; blob < 3; blob++) {
    const group = last.clusters[blob * perBlob];
    if (group === null) return false;
    groups.add(group);
    for (let index = 0; index < perBlob; index++) {
      if (last.clusters[blob * perBlob + index] !== group) return false;
    }
  }
  return groups.size === 3 && traveled;
}

// A new draw each time the module loads. The slide closes over it, so one
// process (presenter and audience) shares the picture until the deck reloads.
// A draw that does not separate the three groups is not returned.
export function createRun(random: () => number = Math.random): Run {
  for (let attempt = 0; attempt < 40; attempt++) {
    const run = draw(random);
    if (separated(run)) return run;
  }
  throw new Error("k-means did not find the three groups.");
}

export type Link = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
};

export function links(points: Point[], frame: Frame): Link[] {
  const drawn: Link[] = [];
  for (const [index, cluster] of frame.clusters.entries()) {
    if (cluster === null) continue;
    const point = points[index];
    const center = frame.centers[cluster];
    const stroke = colors[cluster];
    if (point === undefined || center === undefined || stroke === undefined)
      continue;
    drawn.push({
      x1: point.x,
      y1: point.y,
      x2: center.x,
      y2: center.y,
      stroke,
    });
  }
  return drawn;
}

export function marks(points: Point[], frame: Frame): Mark[] {
  const drawn: Mark[] = frame.clusters.map((cluster, index) => {
    const point = points[index];
    return {
      x: point.x,
      y: point.y,
      r: pointRadius,
      fill: cluster === null ? ink : (colors[cluster] ?? ink),
      stroke: "none",
      width: 0,
    };
  });
  for (const [index, center] of frame.centers.entries()) {
    drawn.push({
      x: center.x,
      y: center.y,
      r: centerRadius,
      fill: paper,
      stroke: colors[index] ?? ink,
      width: 1.1,
    });
  }
  return drawn;
}
