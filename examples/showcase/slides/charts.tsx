import { Card, Grid, Step, createSlide } from "hinote";
import { Chart, areas, bars, dots, lines } from "@hinote/chart";
import { Page, door, type Section } from "../parts.tsx";

export const entry = {
  to: "charts",
  name: "Charts",
  line: "The axes stay put",
} satisfies Section;

// Sample numbers, labeled as such on the slide. The series chart uses the same
// months twice, once for each color.
const before = [
  { month: "Jan", visits: 120 },
  { month: "Feb", visits: 150 },
  { month: "Mar", visits: 140 },
  { month: "Apr", visits: 160 },
];
const after = [
  { month: "Jan", visits: 120 },
  { month: "Feb", visits: 150 },
  { month: "Mar", visits: 230 },
  { month: "Apr", visits: 310 },
];
const visits = [
  ...before.map((row) => ({ ...row, when: "Before" })),
  ...after.map((row) => ({ ...row, when: "After" })),
];
const series = {
  x: "month",
  y: "visits",
  color: "when",
  yLabel: "Visits",
} as const;

const steps = createSlide(
  {
    title: "A chart moves to its next data at each step",
    transition: "slide",
    notes: "Press once: March and April grow, and the axis holds still.",
  },
  (slide) => (
    <Page
      slide={slide}
      headline={
        <h2>
          A chart <em>moves</em> to its next data at each step
        </h2>
      }
      standfirst={
        <Step as="p" class="standfirst" effect="up">
          After the change in March, April went from <strong>160</strong> to{" "}
          <strong>310</strong> visits.
        </Step>
      }
    >
      <Chart
        label="Visits per month, sample data"
        width={900}
        height={600}
        steps={[before, after].map((rows) =>
          bars(rows, {
            x: "month",
            y: "visits",
            domain: [0, 350],
            yLabel: "Visits (sample data)",
          }),
        )}
      />
    </Page>
  ),
);

const marks = [
  [
    "Lines",
    'lines · color: "when"',
    lines(visits, { ...series, domain: [0, 500] }),
  ],
  ["Areas", "areas · stacked", areas(visits, { ...series, domain: [0, 500] })],
  [
    "Dots",
    'dots · color: "when"',
    dots(visits, { ...series, domain: [0, 500] }),
  ],
] as const;

const split = createSlide(
  {
    title: "Before and after share one chart, in two colors",
    transition: "slide",
    notes:
      'The same months as the bars. color: "when" splits Before and After. Footers name lines, areas, and dots.',
  },
  (slide) => (
    <Page
      slide={slide}
      wide
      headline={
        <h2>
          Before and after share one chart, in <em>two colors</em>
        </h2>
      }
      standfirst={
        <p class="standfirst">
          Same visits as the last chart. The first series takes the accent.
          Areas stack; lines and dots do not.
        </p>
      }
    >
      <Grid columns={3} gap={3}>
        {marks.map(([name, mark, chart]) => (
          <Card class="series" footer={<small>{mark}</small>}>
            <h3>{name}</h3>
            {/* Still, not stepping: the bars slide is the one that moves. */}
            <Chart
              label={`${name} of visits per month, before and after, sample data`}
              width={500}
              height={300}
              animate={false}
              chart={chart}
            />
          </Card>
        ))}
      </Grid>
    </Page>
  ),
);

export default createSlide({ section: entry.name }, [
  door(entry),
  steps,
  split,
]);
