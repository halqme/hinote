# Recipes

## A formula (LaTeX)

Add `@hinote/katex`; `<Math>` renders MathML on the server:

```tsx
import { Math } from "@hinote/katex";

<Math tex="\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}" />;
```

In a JSX attribute string a backslash is literal: write `\frac`, not `\\frac`.

## An image beside the text

```tsx
createSlide(
  {
    css: "& { display: grid; grid-template-columns: 40% 1fr; gap: var(--hinote-space-safe); } .photo { margin: calc(-1 * var(--hinote-space-safe)); margin-right: 0; }",
  },
  () => (
    <>
      <div
        class="photo"
        data-hinote-bleed
        style="background: url(./photo.jpg) center / cover"
      />
      <Column gap={3}>
        <h2>Title</h2>
        <p>Body</p>
      </Column>
    </>
  ),
);
```

The slide keeps its `spacing.safe` padding, so the title sits where it does on every other slide. The photo pulls out to the edges with a negative margin of the same size, and `data-hinote-bleed` tells `snapshot` the bleed is intended.

## Two columns

```tsx
<Row gap={4} align="start">
  <Column>
    <h3>Before</h3>...
  </Column>
  <Column>
    <h3>After</h3>...
  </Column>
</Row>
```

## Aligned cards

When headings wrap to different heights, put the cards in a `Grid` so subgrid lines up the rows:

```tsx
<Grid columns={2} gap={3}>
  <Card>
    <h3>Short title</h3>
    <p>Finding A</p>
  </Card>
  <Card>
    <h3>A longer title that wraps to two lines</h3>
    <p>Finding B</p>
  </Card>
  <Card span={2}>
    <h3>Full-width note</h3>
    <p>Spans both columns</p>
  </Card>
</Grid>
```

## Data from a file

```tsx
import { readFile } from "node:fs/promises";

export default createSlide(async () => {
  const rows = JSON.parse(
    await readFile(new URL("../data/rows.json", import.meta.url), "utf8"),
  );
  return (
    <table>
      {rows.map((r) => (
        <tr>
          <td>{r.name}</td>
          <td>{r.value}</td>
        </tr>
      ))}
    </table>
  );
});
```

## A chart

`<Chart>` from `@hinote/chart` draws a TanStack Charts chart and animates it, step by step if you like. Without a package, draw an SVG on the server from the data, or add `<Script>` for one that responds to clicks. The presenter can switch what every page shows with `hinote.send`:

```tsx
/// <reference types="hinote/client" />
import { render } from "hono/jsx/dom";

hinote.on("chart:mode", (mode) => {
  for (const bar of document.querySelectorAll<HTMLElement>("[data-roast]")) {
    const on = mode === "all" || bar.dataset.roast === mode;
    bar.style.opacity = on ? "1" : "0.15";
  }
});

if (hinote.role === "presenter") {
  for (const slot of document.querySelectorAll<HTMLElement>(
    "#deck .chart-slot",
  ))
    render(
      <button type="button" onClick={() => hinote.send("chart:mode", "manual")}>
        Manual
      </button>,
      slot,
    );
}
```

## Reveal a figure and its caption together

```tsx
<Step>Figure</Step>
<Step at={1}>Caption</Step>
<Step>Next point</Step>
```
