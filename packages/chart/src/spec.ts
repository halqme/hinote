import {
  areaY,
  barY,
  defineChart,
  dot,
  lineY,
  stack,
  type DomChartDefinition,
} from "@tanstack/charts";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scalePoint } from "@tanstack/charts/scales/point";

// Any chart defineChart makes. The datum type is the author's; this package
// only draws it.
// oxlint-disable-next-line typescript/no-explicit-any
export type AnyChart = DomChartDefinition<any>;

type Value = string | number;
// oxlint-disable-next-line typescript/no-explicit-any
type Row = Record<string, any>;
type KeyOf<R, V> = {
  [K in keyof R & string]: R[K] extends V ? K : never;
}[keyof R & string];

export type SeriesOptions<R extends Row> = {
  // The field on the horizontal axis: a category, or a number.
  x: KeyOf<R, Value>;
  // The field the height shows.
  y: KeyOf<R, number>;
  // A field that splits the rows into series, each in its own color.
  color?: KeyOf<R, Value>;
  // The vertical axis. Without it the axis spans the data of every step, so
  // a step moves the marks against axes that hold still.
  domain?: readonly [number, number];
  // Axis titles.
  xLabel?: string;
  yLabel?: string;
};

export type BarOptions<R extends Row> = SeriesOptions<R> & {
  // Series side by side (the default), or stacked.
  stack?: boolean;
};

type Kind = "bar" | "line" | "area" | "dot";

const SPEC = Symbol("hinote-chart");

// A chart described, not yet defined. <Chart> defines it once it has seen
// every step, so the steps can share their axes.
export type ChartSpec = {
  readonly [SPEC]: true;
  readonly kind: Kind;
  readonly rows: readonly Row[];
  readonly options: BarOptions<Row>;
};

export function isSpec(value: unknown): value is ChartSpec {
  return typeof value === "object" && value !== null && SPEC in value;
}

// The field names were checked against the rows' type by the caller.
function spec<R extends Row>(
  kind: Kind,
  rows: readonly R[],
  options: BarOptions<R> | SeriesOptions<R>,
): ChartSpec {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return { [SPEC]: true, kind, rows, options: options as BarOptions<Row> };
}

// Bars, one for each row, side by side for each `color`.
export function bars<R extends Row>(
  rows: readonly R[],
  options: BarOptions<R>,
): ChartSpec {
  return spec("bar", rows, options);
}

// A line through the rows, one for each `color`.
export function lines<R extends Row>(
  rows: readonly R[],
  options: SeriesOptions<R>,
): ChartSpec {
  return spec("line", rows, options);
}

// A filled area under the rows, stacked for each `color`.
export function areas<R extends Row>(
  rows: readonly R[],
  options: SeriesOptions<R>,
): ChartSpec {
  return spec("area", rows, options);
}

// A dot for each row.
export function dots<R extends Row>(
  rows: readonly R[],
  options: SeriesOptions<R>,
): ChartSpec {
  return spec("dot", rows, options);
}

// The extent every step needs, so no step's marks leave the axes. Bars and
// areas stand on zero; stacked ones reach the sum of their series.
function extent(specs: readonly ChartSpec[]): [number, number] {
  let low = Infinity;
  let high = -Infinity;
  for (const { kind, rows, options } of specs) {
    const stacked = kind === "area" || (kind === "bar" && options.stack);
    const sums = new Map<unknown, number>();
    for (const row of rows) {
      const value = Number(row[options.y]);
      if (!Number.isFinite(value)) continue;
      const total = stacked ? (sums.get(row[options.x]) ?? 0) + value : value;
      sums.set(row[options.x], total);
      low = Math.min(low, total);
      high = Math.max(high, total);
    }
    if (kind === "bar" || kind === "area") low = Math.min(low, 0);
  }
  return Number.isFinite(low) ? [low, high] : [0, 1];
}

// Categories in the order they first appear, across every step, so a bar
// keeps its place when a later step adds another.
function categories(specs: readonly ChartSpec[]): string[] {
  const seen = new Set<string>();
  for (const { rows, options } of specs)
    for (const row of rows) seen.add(String(row[options.x]));
  return [...seen];
}

function define(
  item: ChartSpec,
  shared: { y: [number, number]; x: string[] | undefined; numericX: boolean },
): AnyChart {
  const { kind, rows, options } = item;
  const color = options.color;
  // A mark keeps its key from step to step, so it moves rather than leaving
  // and entering.
  const key = (row: Row) =>
    color === undefined
      ? String(row[options.x])
      : `${row[options.x]}\u0000${row[color]}`;
  const x = (row: Row) =>
    shared.numericX ? Number(row[options.x]) : String(row[options.x]);
  const y = (row: Row) => Number(row[options.y]);
  const z = color === undefined ? undefined : (row: Row) => String(row[color]);
  const channels = { x, y, key, ...(z ? { z } : {}) };
  const mark =
    kind === "bar"
      ? barY(rows, {
          ...channels,
          ...(options.stack ? { layout: stack() } : {}),
        })
      : kind === "line"
        ? lineY(rows, channels)
        : kind === "area"
          ? areaY(rows, { ...channels, ...(z ? { layout: stack() } : {}) })
          : dot(rows, channels);
  const domain = options.domain ?? shared.y;
  const xScale = shared.numericX
    ? scaleLinear().domain(numericDomain(rows, options.x, shared))
    : kind === "bar"
      ? scaleBand()
          .domain(shared.x ?? [])
          .padding(0.2)
      : scalePoint()
          .domain(shared.x ?? [])
          .padding(0.4);
  return defineChart({
    marks: [mark],
    scales: {
      x: { scale: xScale, axis: { label: options.xLabel } },
      y: {
        scale: scaleLinear().domain([domain[0], domain[1]]).nice(),
        grid: true,
        axis: { label: options.yLabel },
      },
    },
  }) as AnyChart;
}

function numericDomain(
  rows: readonly Row[],
  field: string,
  shared: { x: string[] | undefined },
): [number, number] {
  const values = (shared.x ?? rows.map((row) => String(row[field]))).map(
    Number,
  );
  return [Math.min(...values), Math.max(...values)];
}

// Defines every step's chart. Described steps share their axes; a chart from
// defineChart is used as it is.
export function defineAll(
  items: readonly (ChartSpec | AnyChart)[],
): AnyChart[] {
  const specs = items.filter(isSpec);
  const numericX =
    specs.length > 0 &&
    specs.every(({ rows, options }) =>
      rows.every((row) => typeof row[options.x] === "number"),
    );
  const shared = {
    y: extent(specs),
    x: specs.length > 0 ? categories(specs) : undefined,
    numericX,
  };
  return items.map((item) => (isSpec(item) ? define(item, shared) : item));
}
