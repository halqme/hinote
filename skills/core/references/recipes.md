# Recipes

## A formula (LaTeX)

Render MathML on the server with KaTeX (`npm install katex`):

```tsx
import katex from "katex";
import { raw } from "hono/html";

export function Math(props: { tex: string }) {
  return raw(
    katex.renderToString(props.tex, { output: "mathml", displayMode: true }),
  );
}

<Math tex="\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}" />;
```

In a JSX attribute string a backslash is literal: write `\frac`, not `\\frac`.

## An image beside the text

```tsx
createSlide(
  {
    css: "& { padding: 0; display: grid; grid-template-columns: 40% 1fr; } .text { padding: 64px; }",
  },
  () => (
    <>
      <div style="background: url(./photo.jpg) center / cover" />
      <div class="text">
        <h2>Title</h2>
        <p>Body</p>
      </div>
    </>
  ),
);
```

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

Draw an SVG on the server from the data (no library needed), or add `<Script>` for one that responds to clicks; `examples/components/results.client.tsx` switches charts from the presenter.

## Reveal a figure and its caption together

```tsx
<Step>Figure</Step>
<Step at={1}>Caption</Step>
<Step>Next point</Step>
```
