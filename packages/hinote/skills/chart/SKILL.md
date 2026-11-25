---
name: hinote-chart
description: Draw charts that animate step by step on hinote slides with <Chart> from @hinote/chart. Use when a slide shows numbers as bars, lines, areas, or dots.
---

# @hinote/chart

`<Chart>` for [hinote](https://github.com/halqme/hinote/tree/main/packages/hinote): a [TanStack Charts](https://github.com/TanStack/charts) chart drawn while the slide renders, then animated in the page. Bars grow in when the slide opens, and a chart with steps moves to its next data at each step.

This guide ships with hinote and matches its version; the package is released with the same version.

```sh
bun add @hinote/chart
```

```tsx
import { Step, createSlide } from "hinote";
import { Chart, bars } from "@hinote/chart";

const q1 = [
  { month: "Jan", sales: 120 },
  { month: "Feb", sales: 180 },
  { month: "Mar", sales: 150 },
];
const q2 = [
  { month: "Jan", sales: 210 },
  { month: "Feb", sales: 260 },
  { month: "Mar", sales: 300 },
];

export const sales = createSlide(() => (
  <section>
    <h2>Sales</h2>
    <Chart label="Monthly sales" chart={bars(q1, { x: "month", y: "sales" })} />
  </section>
));

// One chart for each step, the first shown before any.
export const growth = createSlide(() => (
  <section>
    <h2>Growth</h2>
    <Chart
      label="Sales by quarter"
      steps={[q1, q2].map((rows) => bars(rows, { x: "month", y: "sales" }))}
    />
    <Step>Twice the first quarter</Step>
  </section>
));
```

The data, the chart, and its steps are all in the slide. The page gets only what the server computed from them, so nothing in the slide has to run in the browser.

## Charts

`bars`, `lines`, `areas`, and `dots` take the rows and the fields to show:

| Option             | What it does                                                                      |
| ------------------ | --------------------------------------------------------------------------------- |
| `x`, `y`           | The field along the bottom (a category or a number), and the field for the height |
| `color`            | A field that splits the rows into series, each in its own color                   |
| `stack`            | `bars` only: stack the series instead of setting them side by side                |
| `domain`           | The vertical axis, such as `[0, 500]`                                             |
| `xLabel`, `yLabel` | Axis titles                                                                       |

- The field names are checked against the rows' type.
- Without `domain`, the axes span the data of every step, so the marks move against axes that hold still. A mark keeps its place by its `x` (and `color`), so a bar grows or shrinks instead of leaving and entering.
- `areas` stacks its series.

## defineChart

Any other chart is TanStack's `defineChart`, with its marks and scales, all imported from `@hinote/chart`. Pass it as `chart`, or one for each step:

```tsx
import {
  Chart,
  barY,
  defineChart,
  ruleY,
  scaleBand,
  scaleLinear,
} from "@hinote/chart";

const target = 200;

<Chart
  label="Sales against the target"
  chart={defineChart({
    marks: [
      barY(q1, { x: "month", y: "sales", key: "month" }),
      ruleY([target]),
    ],
    scales: {
      x: { scale: scaleBand },
      y: { scale: scaleLinear().domain([0, 300]), grid: true },
    },
  })}
/>;
```

- Everything `@tanstack/charts` exports comes from `@hinote/chart`, with `scaleBand`, `scaleLinear`, `scaleOrdinal`, `scalePoint`, and `scaleUtc`. The deck does not install `@tanstack/charts` itself, so the definition and the drawing use the same version.
- A defined chart is drawn as it is. For steps, give marks a `key` that stays the same, and fix the axes with a configured scale (`scaleLinear().domain([0, 300])`): a scale given as a factory fits each step's own data.
- Functions in the definition (formatters, scales) run on the server. Motion settings in it do not reach the page, which animates with TanStack's default motion.

## Props

- `label` says what the chart shows, for screen readers; `description` can say more.
- `width` and `height` are canvas pixels, 1600 by 720 unless given.
- `scale` enlarges the chart over TanStack's own size, 2.5 unless given, so its 11px labels read as small slide text. Lines and dots grow with it.
- `animate={false}` keeps the SVG the server drew and adds no script.
- The first series takes the theme's accent color.

## How it runs

- The server computes each step's scene, the shapes of the chart, and draws the last as SVG: what the slide shows with every step out, in a printout, a snapshot, or a page without scripts. Each step after the first is a step of the slide, numbered with its `<Step>`s in document order.
- The page animates between the scenes with `@tanstack/charts/motion`, only while the chart's slide is shown, and honors `prefers-reduced-motion`. Off its slide, and in the presenter's previews, it is the server's SVG.
- Motion is TanStack's default. A definition's own motion settings, which are functions, stay on the server.
- The package ships the animating code already bundled, so charts move with the hinote CLI and in a server of your own alike.
- The page carries the motion renderer once, however many charts it has (about 24 KB gzipped), and each chart's scenes as JSON, some 10 to 30 KB for a small chart with a few steps.
- Scenes are TanStack's own data, whose shape it does not promise between versions, so this package pins `@tanstack/charts` to `~1.5`.
