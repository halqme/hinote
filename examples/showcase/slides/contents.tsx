import { Column, Link, createSlide } from "hinote";
import { Page, type Section } from "../parts.tsx";
import layout, { entry as layoutEntry } from "./layout.tsx";
import code, { entry as codeEntry } from "./code.tsx";
import charts, { entry as chartsEntry } from "./charts.tsx";
import diagrams, { entry as diagramsEntry } from "./diagrams.tsx";
import sequences, { entry as sequencesEntry } from "./sequences.tsx";
import math, { entry as mathEntry } from "./math.tsx";
import morph, { entry as morphEntry } from "./morph.tsx";
import steps, { entry as stepsEntry } from "./steps.tsx";

// One list. The contents page links through it, and deck.tsx renders the decks.
const sections: { entry: Section; deck: ReturnType<typeof createSlide> }[] = [
  { entry: layoutEntry, deck: layout },
  { entry: codeEntry, deck: code },
  { entry: chartsEntry, deck: charts },
  { entry: diagramsEntry, deck: diagrams },
  { entry: sequencesEntry, deck: sequences },
  { entry: mathEntry, deck: math },
  { entry: morphEntry, deck: morph },
  { entry: stepsEntry, deck: steps },
];

export const sectionDecks = sections.map((section) => section.deck);

// The index is the page after the cover, not a part you enter, so it has no door.
const contents = createSlide(
  {
    title: "Each section starts at a door you can open from here",
    transition: "none",
    notes:
      "The wordmark moved here from the cover: that is <Morph>. Each link jumps to a door by its id.",
  },
  (slide) => (
    <Page
      slide={slide}
      brand
      headline={
        <h2>
          Each section starts at a <em>door</em> you can open from here
        </h2>
      }
    >
      <Column gap={1}>
        {sections.map((section) => (
          <Link to={section.entry.to} class="toc-link">
            <span class="toc-name">{section.entry.name}</span>
            <span class="toc-line">{section.entry.line}</span>
          </Link>
        ))}
      </Column>
    </Page>
  ),
);

export default createSlide({ section: "Contents" }, [contents]);
