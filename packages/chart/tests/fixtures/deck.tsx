import { Step, createSlide } from "hinote";
import {
  Chart,
  barY,
  bars,
  defineChart,
  lines,
  scaleBand,
  scaleLinear,
} from "../../src/index.tsx";

const q1 = [
  { month: "Jan", sales: 120 },
  { month: "Feb", sales: 180 },
  { month: "Mar", sales: 150 },
];
const q2 = q1.map((row) => ({ ...row, sales: row.sales * 2 }));
const q3 = q1.map((row) => ({ ...row, sales: row.sales * 3 }));

export default createSlide([
  createSlide(() => <h1>Before</h1>),
  createSlide(() => (
    <section>
      <h2>Line</h2>
      <Chart
        label="Squares"
        chart={lines(
          [1, 2, 3, 4].map((x) => ({ x, y: x * x })),
          { x: "x", y: "y" },
        )}
      />
    </section>
  )),
  createSlide(() => (
    <section>
      <h2>Sales</h2>
      <Chart
        label="Monthly sales"
        steps={[q1, q2, q3].map((rows) =>
          bars(rows, { x: "month", y: "sales" }),
        )}
      />
      <Step>After the chart</Step>
    </section>
  )),
  createSlide(() => (
    <section>
      <h2>Raw</h2>
      <Chart
        label="Raw"
        chart={defineChart({
          marks: [
            barY([{ id: "a", k: "A", v: 3 }], { x: "k", y: "v", key: "id" }),
          ],
          scales: { x: { scale: scaleBand }, y: { scale: scaleLinear } },
        })}
      />
    </section>
  )),
]);
