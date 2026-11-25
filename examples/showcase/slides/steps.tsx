import { Script, Step, Steps, createSlide } from "hinote";
import { createRun, marks, plotSize } from "../components/kmeans.ts";
import { Page, door, type Section } from "../parts.tsx";

export const entry = {
  to: "steps",
  name: "Steps",
  line: "Motion belongs to the step",
} satisfies Section;

const effects = ["fade", "up", "down", "left", "right", "zoom"] as const;

const shown = createSlide(
  {
    title: "A step can fade, move, or grow as it appears",
    transition: {
      name: "zoom",
      duration: 500,
      easing: "cubic-bezier(.2, 0, 0, 1)",
    },
    notes: "One press shows all six, each with its own effect.",
  },
  (slide) => (
    <Page
      slide={slide}
      headline={
        <h2>
          A step can <em>fade</em>, move, or grow as it appears
        </h2>
      }
      standfirst={<p class="standfirst">One key press, six effects.</p>}
    >
      <div class="effects">
        {effects.map((effect) => (
          <Step at={1} effect={effect} class="effect">
            <span class="effect-name">{effect}</span>
            <code>{`effect="${effect}"`}</code>
          </Step>
        ))}
      </div>
    </Page>
  ),
);

const counter = createSlide(
  {
    title: "The number follows the steps you press",
    transition: "slide",
    notes: "Press twice. hinote.observe sets the number to the step times 100.",
  },
  (slide) => (
    <>
      <Page
        slide={slide}
        headline={
          <h2>
            The number <em>follows</em> the steps you press
          </h2>
        }
        standfirst={
          <p class="standfirst">Two presses take it from 0 to 200.</p>
        }
      >
        <Steps count={2} class="counter">
          0
        </Steps>
      </Page>
      <Script
        src={new URL("../components/counter.client.ts", import.meta.url)}
      />
    </>
  ),
);

// Sampled once per process, then shared with the script through data-run.
const plot = createRun();
const first = plot.frames[0];

const clustering = createSlide(
  {
    title: "Three groups, found one step at a time",
    transition: "slide",
    notes:
      "The page opens on one draw. Back and Next take turns: the centers appear, each point draws a line to the nearest one, then the centers travel to the mean. Shuffle replaces the points and the starting centers.",
  },
  (slide) => (
    <>
      <Page
        slide={slide}
        headline={
          <h2>
            Three groups, found <em>one step</em> at a time
          </h2>
        }
        standfirst={
          <p class="standfirst">
            The buttons take turns. The centers appear, each point draws a line
            to the nearest one, then the centers travel to the mean.
          </p>
        }
      >
        <div class="plot">
          <svg
            class="plot-field"
            viewBox={`0 0 ${plotSize} ${plotSize}`}
            role="img"
            aria-label={`${plot.points.length} points in three groups`}
            data-run={JSON.stringify(plot)}
          >
            {marks(plot.points, first).map((mark) => (
              <circle
                cx={mark.x}
                cy={mark.y}
                r={mark.r}
                fill={mark.fill}
                stroke={mark.stroke}
                stroke-width={mark.width}
              />
            ))}
          </svg>
          <p class="plot-label">{first.label}</p>
          <div class="plot-actions">
            <button type="button" data-plot="back" aria-disabled="true">
              Back
            </button>
            <button type="button" data-plot="next">
              Next
            </button>
            <button type="button" data-plot="shuffle">
              Shuffle
            </button>
          </div>
        </div>
      </Page>
      <Script
        src={new URL("../components/kmeans.client.ts", import.meta.url)}
      />
    </>
  ),
);

export default createSlide({ section: entry.name }, [
  door(entry),
  shown,
  counter,
  clustering,
]);
