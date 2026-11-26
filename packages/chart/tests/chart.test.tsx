import { expect, test } from "bun:test";
import { Step, createSlide } from "@hinote/core";
import {
  Chart,
  areas,
  barY,
  bars,
  createChartRuntime,
  defineChart,
  dots,
  lines,
  scaleBand,
  scaleLinear,
} from "../src/index.tsx";
import { revive, sceneJson } from "../src/scene.ts";

async function render(...nodes: (() => unknown)[]) {
  return createSlide(
    nodes.map((node) => createSlide(node as () => never)),
  ).render();
}

const q1 = [
  { month: "Jan", sales: 120 },
  { month: "Feb", sales: 180 },
];
const q2 = [
  ...q1.map((row) => ({ ...row, sales: row.sales * 3 })),
  { month: "Mar", sales: 90 },
];

function scenesIn(
  html: string,
): { scales: { y: { domain: number[] }; x: { domain: string[] } } }[] {
  return JSON.parse(
    /<script type="application\/json">(.*?)<\/script>/s.exec(html)?.[1] ?? "[]",
  );
}

test("draws the chart on the server, enlarged, with its scenes and the script that animates them", async () => {
  const html = await render(() => (
    <Chart
      label="Sales"
      chart={bars(q1, { x: "month", y: "sales" })}
      width={800}
      height={400}
    />
  ));
  expect(html).toMatch(
    /<div class="hinote-chart" data-hinote-chart="hc[0-9a-f]{8}" style="width:800px;height:400px;[^"]*"><svg/,
  );
  // Drawn at 320 x 160 and shown at 800 x 400: labels 2.5 times TanStack's.
  expect(html).toContain('viewBox="0 0 320 160"');
  expect(html).toContain('aria-label="Sales"');
  expect(scenesIn(html)).toHaveLength(1);
  expect(chartScripts(html)).toHaveLength(1);
});

// The code that animates charts, as the page carries it.
const chartScripts = (html: string) => [
  ...html.matchAll(
    /<script type="module" data-hinote-script="@hinote\/chart">([\s\S]*?)<\/script>/g,
  ),
];

test("the page carries the animating code once, after hinote's runtime, with nothing left to bundle or import", async () => {
  const chart = () => (
    <Chart label="Sales" chart={bars(q1, { x: "month", y: "sales" })} />
  );
  const html = await render(chart, chart, chart);
  const scripts = chartScripts(html);
  expect(scripts).toHaveLength(1);
  const [script] = scripts;
  const code = script?.[1] ?? "";
  // After the inline runtime that defines window.hinote, at the end of <body>.
  expect(html.indexOf(script?.[0] ?? "")).toBeGreaterThan(
    html.lastIndexOf("<script>"),
  );
  expect(
    html.slice(html.indexOf(script?.[0] ?? "")).replace(script?.[0] ?? "", ""),
  ).toBe("</body></html>");
  expect(code).not.toMatch(/\bimport\s*[{(*"']|\bfrom\s*["']/);
  expect(html).not.toContain("data-hinote-src");
});

// The server draws the last chart: what the slide shows with every step out,
// as in a printout, a snapshot, or a page without scripts.
test("reserves a step for each chart after the first, numbered with the slide's own", async () => {
  const html = await render(() => (
    <section>
      <Step>Before</Step>
      <Chart
        label="Sales"
        steps={[
          bars(q1, { x: "month", y: "sales" }),
          bars(q2, { x: "month", y: "sales" }),
        ]}
      />
      <Step>After</Step>
    </section>
  ));
  expect(html).toContain('<div data-hinote-step="1">Before</div>');
  expect(html).toContain('data-hinote-steps="2-2"');
  expect(html).toContain('<div data-hinote-step="3">After</div>');
  expect(html).toContain(">Mar<");
});

// So a step moves the marks against axes that hold still.
test("gives described steps the same axes, spanning every step", async () => {
  const html = await render(() => (
    <Chart
      label="Sales"
      steps={[q1, q2].map((rows) => bars(rows, { x: "month", y: "sales" }))}
    />
  ));
  const [first, second] = scenesIn(html);
  expect(first?.scales.y.domain).toEqual(second?.scales.y.domain);
  expect(first?.scales.y.domain[1]).toBeGreaterThanOrEqual(540);
  expect(first?.scales.x.domain).toEqual(["Jan", "Feb", "Mar"]);
});

test("draws a chart from defineChart as it is", async () => {
  const chart = defineChart({
    marks: [barY([{ id: "a", k: "Raw", v: 3 }], { x: "k", y: "v", key: "id" })],
    scales: { x: { scale: scaleBand }, y: { scale: scaleLinear } },
  });
  expect(await render(() => <Chart label="Raw" chart={chart} />)).toContain(
    ">Raw<",
  );
});

test("animate={false} leaves the SVG and adds no scenes or script", async () => {
  const html = await render(() => (
    <Chart
      label="Squares"
      chart={lines(
        [
          { x: 1, y: 1 },
          { x: 2, y: 4 },
        ],
        { x: "x", y: "y" },
      )}
      animate={false}
    />
  ));
  expect(html).toContain("<svg");
  expect(html).not.toContain(`<script type="application/json">`);
  expect(chartScripts(html)).toHaveLength(0);
});

test("gives each chart its own ids, the same on every render", async () => {
  const deck = () =>
    render(
      () => <Chart label="A" chart={bars(q1, { x: "month", y: "sales" })} />,
      () => <Chart label="B" chart={bars(q2, { x: "month", y: "sales" })} />,
    );
  const first = await deck();
  const ids = [...first.matchAll(/data-hinote-chart="(hc[0-9a-f]+)"/g)].map(
    (m) => m[1],
  );
  expect(ids).toHaveLength(2);
  expect(ids[0]).not.toBe(ids[1]);
  expect(await deck()).toBe(first);
});

// The page animates scenes that went through JSON. TanStack does not promise
// their shape, so this checks that the scales the page rebuilds still place
// values where the server's did.
test("rebuilds each scale's map from a scene that went through JSON", () => {
  const runtime = createChartRuntime();
  const chart = defineChart({
    marks: [barY(q2, { x: "month", y: "sales", key: "month" })],
    scales: {
      x: { scale: scaleBand },
      y: { scale: scaleLinear().domain([0, 600]) },
    },
  });
  const scene = runtime.render(chart, { width: 640, height: 320 });
  const [copy] = revive(sceneJson([scene]));
  for (const value of [0, 150, 600])
    expect(copy?.scales.y?.map(value)).toBeCloseTo(
      scene.scales.y?.map(value) ?? NaN,
      5,
    );
  for (const value of ["Jan", "Mar"])
    expect(copy?.scales.x?.map(value)).toBeCloseTo(
      scene.scales.x?.map(value) ?? NaN,
      5,
    );
  expect(sceneJson([scene])).not.toContain("<");
  runtime.destroy();
});

// hinote reports it by name, like its own errors.
test("rejects a chart with no label, nothing to draw, or a bad size as HinoteError", async () => {
  const chart = bars(q1, { x: "month", y: "sales" });
  for (const node of [
    () => <Chart label="" chart={chart} />,
    () => <Chart label="x" steps={[] as never} />,
    () => <Chart label="x" chart={chart} width={0} />,
    () => <Chart label="x" chart={chart} scale={-1} />,
  ])
    await expect(render(node)).rejects.toMatchObject({
      name: "HinoteError",
      code: "chart",
    });
});

test("rebuilt numeric scales carry on past the end ticks", () => {
  const [copy] = revive(
    JSON.stringify([
      {
        scales: {
          y: {
            ticks: [
              { value: 0, position: 100 },
              { value: 10, position: 0 },
            ],
          },
        },
        colors: {},
      },
    ]),
  );
  expect(copy?.scales.y?.map(20)).toBe(-100);
  expect(copy?.scales.y?.map(-10)).toBe(200);
});

test("draws each kind of described chart, with series in colors", async () => {
  const rows = ["Jan", "Feb"].flatMap((month, i) =>
    ["A", "B"].map((team, j) => ({ month, team, sales: 10 + i * 5 + j * 3 })),
  );
  const options = { x: "month", y: "sales", color: "team" } as const;
  for (const chart of [
    bars(rows, options),
    bars(rows, { ...options, stack: true }),
    lines(rows, options),
    areas(rows, options),
    dots(rows, options),
  ]) {
    const html = await render(() => <Chart label="Teams" chart={chart} />);
    expect(html).toContain("var(--ts-chart-2");
  }
});
