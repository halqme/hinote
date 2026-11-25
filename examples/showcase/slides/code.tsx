import { createSlide } from "hinote";
import { Code } from "@hinote/code";
import { Page, door, type Section } from "../parts.tsx";

export const entry = {
  to: "code",
  name: "Code",
  line: "The page is finished HTML",
} satisfies Section;

const sample = createSlide(
  {
    title: "A slide is a function that returns JSX",
    transition: "none",
    notes: "The sample is the whole shape: one slide, then a deck around it.",
  },
  (slide) => (
    <Page
      slide={slide}
      headline={
        <h2>
          A slide is a <em>function</em> that returns JSX
        </h2>
      }
      standfirst={
        <p class="standfirst">
          It renders on the server, so the page gets finished HTML and CSS.
        </p>
      }
    >
      <Code lang="tsx">{`
        import { Step, createSlide } from "hinote";

        const plan = createSlide({ title: "Plan" }, () => (
          <ul>
            <Step as="li" effect="up">Measure</Step>
            <Step as="li" effect="up">Change one thing</Step>
          </ul>
        ));

        export default createSlide(
          { transition: "fade" },
          [plan],
        );
      `}</Code>
    </Page>
  ),
);

export default createSlide({ section: entry.name }, [door(entry), sample]);
