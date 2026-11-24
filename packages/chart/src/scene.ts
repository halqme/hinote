// A chart reaches the page as its scenes: the shapes TanStack Charts computed
// on the server, as JSON. The page animates between them and never sees the
// definition, so a definition can hold any function and live in the slide.
//
// A scene is plain data except for its scales' and colors' `map`, which the
// motion renderer calls to find where a bar or area grows from. revive()
// rebuilds them from what the scene keeps: each tick's value and position.
// The scene's shape is TanStack's own detail, which is why the package pins
// @tanstack/charts to a minor version and its tests check a round trip.
import type { ChartScene } from "@tanstack/charts";

// oxlint-disable-next-line typescript/no-explicit-any
export type Scene = ChartScene<any>;

type Tick = { value: unknown; position: number };
type JsonScale = {
  ticks?: readonly Tick[];
  map?: (value: unknown) => number;
};
type JsonColors = {
  domain?: readonly unknown[];
  range?: readonly string[];
  map?: (value: unknown) => string;
};

// Safe inside <script type="application/json">: no "<" survives to end it.
export function sceneJson(scenes: readonly Scene[]): string {
  return JSON.stringify(scenes).replace(/</g, "\\u003c");
}

// A numeric scale maps between its ticks, which is exact for a linear scale
// and close for others. A categorical one looks the value up: its tick sits
// where its map puts it, at the middle of a band.
function reviveScale(scale: JsonScale): void {
  const ticks = [...(scale.ticks ?? [])];
  if (
    ticks.length > 1 &&
    ticks.every((tick) => typeof tick.value === "number")
  ) {
    const points = ticks
      .map((tick) => [Number(tick.value), tick.position] as const)
      .sort((a, b) => a[0] - b[0]);
    // Between the two ticks around the value, or on past the end ones.
    scale.map = (value) => {
      const v = Number(value);
      const next = points.findIndex(([at]) => at >= v);
      const i = next === -1 ? points.length - 1 : Math.max(1, next);
      const [v0, p0] = points[i - 1] ?? [0, 0];
      const [v1, p1] = points[i] ?? [1, 0];
      return v1 === v0 ? p0 : p0 + ((v - v0) * (p1 - p0)) / (v1 - v0);
    };
    return;
  }
  const at = new Map(ticks.map((tick) => [tick.value, tick.position]));
  scale.map = (value) => at.get(value) ?? Number.NaN;
}

type JsonScene = { scales: Record<string, JsonScale>; colors: JsonColors };

function isJsonScene(value: unknown): value is JsonScene {
  return (
    typeof value === "object" &&
    value !== null &&
    "scales" in value &&
    "colors" in value
  );
}

// The JSON is what sceneJson wrote on the server for this page.
export function revive(json: string): Scene[] {
  const scenes: unknown = JSON.parse(json);
  if (!Array.isArray(scenes) || !scenes.every(isJsonScene)) return [];
  for (const scene of scenes) {
    for (const scale of Object.values(scene.scales)) reviveScale(scale);
    const { domain = [], range = [] } = scene.colors;
    scene.colors.map = (value) =>
      range[Math.max(0, domain.indexOf(value)) % Math.max(1, range.length)] ??
      "currentColor";
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return scenes as Scene[];
}
