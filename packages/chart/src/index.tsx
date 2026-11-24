import type { HinoteErrorLike } from "@hinote/types";
import { createChartRuntime, renderChartSvg } from "@tanstack/charts";
import { raw } from "hono/html";
import { sceneJson, type Scene } from "./scene.ts";
import { defineAll, isSpec, type AnyChart, type ChartSpec } from "./spec.ts";

export { areas, bars, dots, lines } from "./spec.ts";
export type { BarOptions, ChartSpec, SeriesOptions } from "./spec.ts";

type ChartInput = ChartSpec | AnyChart;

export type ChartProps = {
  // What the chart shows, for screen readers.
  label: string;
  description?: string;
  // Canvas pixels.
  width?: number;
  height?: number;
  // How much larger than TanStack's own the chart is drawn: its 11px labels
  // become 11 * scale. The default 2.5 makes them about as large as small
  // slide text.
  scale?: number;
  // false leaves the SVG as the server drew it and adds no script.
  animate?: boolean;
  class?: string;
} & (
  | {
      // One chart: from bars(), lines(), areas(), dots(), or defineChart.
      chart: ChartInput;
      steps?: never;
    }
  | {
      // One chart for each step, the first shown before any. Each after the
      // first is a step of the slide, numbered with its <Step>s.
      steps: readonly ChartInput[];
      chart?: never;
    }
);

const WIDTH = 1600;
const HEIGHT = 720;
const SCALE = 2.5;

// hinote reports an error with this name as its own, message and all.
class ChartError extends Error implements HinoteErrorLike {
  override readonly name = "HinoteError";
  readonly code = "chart";
}

// The page script, by its built name: the CLI finds client.ts from src/ and
// client.js in dist/.
const CLIENT = new URL("./client.js", import.meta.url);

function positive(name: string, value: number): number {
  if (!(value > 0) || !Number.isFinite(value))
    throw new ChartError(`<Chart ${name}> must be a positive number.`);
  return value;
}

// Stable across renders, distinct for distinct charts: the SVG ids of every
// slide share one page.
function idOf(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++)
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return `hc${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function scenesOf(
  charts: readonly AnyChart[],
  width: number,
  height: number,
): Scene[] {
  const runtime = createChartRuntime();
  try {
    return charts.map((chart) => runtime.render(chart, { width, height }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ChartError(`<Chart> could not draw its chart: ${message}`);
  } finally {
    runtime.destroy();
  }
}

// The first series takes the theme's accent; the rest keep TanStack's palette.
// Drawn while the slide renders: the page has the finished chart before any
// script runs, and a printout or snapshot shows it whole. The server draws
// the last step, which is what the slide shows with every step out.
export function Chart(props: ChartProps) {
  if (typeof props.label !== "string" || props.label === "")
    throw new ChartError("<Chart> needs a label that says what it shows.");
  const inputs = props.steps ?? (props.chart ? [props.chart] : []);
  if (
    inputs.length === 0 ||
    !inputs.every((item) => isSpec(item) || typeof item === "object")
  )
    throw new ChartError(
      "<Chart> needs chart={bars(rows, { x, y })}, a chart from defineChart, or steps={[...]}.",
    );
  const width = positive("width", props.width ?? WIDTH);
  const height = positive("height", props.height ?? HEIGHT);
  const scale = positive("scale", props.scale ?? SCALE);
  // Drawn small and enlarged by the viewBox, so text and lines grow with it.
  const scenes = scenesOf(defineAll(inputs), width / scale, height / scale);
  const json = sceneJson(scenes);
  const id = idOf(json + props.label);
  const last = scenes.at(-1);
  const svg = last
    ? renderChartSvg(last, {
        ariaLabel: props.label,
        ariaDescription: props.description,
        idPrefix: id,
      })
    : "";
  const className = props.class ? ` ${escapeAttribute(props.class)}` : "";
  // Each chart after the first is a step the element reserves, numbered with
  // the slide's <Step>s.
  const steps =
    scenes.length > 1 ? ` data-hinote-steps="auto:${scenes.length - 1}"` : "";
  const data =
    props.animate === false
      ? ""
      : `<script type="application/json">${json}</script>`;
  // The CLI bundles the client into the page once, however many charts use
  // it (the markup <Script> writes, from @hinote/types).
  const script =
    props.animate === false
      ? ""
      : `<script type="module" data-hinote-src="${escapeAttribute(CLIENT.href)}"></script>`;
  return raw(
    `<div class="hinote-chart${className}" data-hinote-chart="${id}"${steps} style="width:${width}px;height:${height}px;--ts-chart-1:var(--hinote-color-accent)">${svg}${data}</div>${script}`,
  );
}

function escapeAttribute(value: string): string {
  return value.replace(/[&"<>]/g, (char) => `&#${char.charCodeAt(0)};`);
}
