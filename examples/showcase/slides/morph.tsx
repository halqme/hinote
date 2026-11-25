import { Card, Grid, Morph, createSlide } from "hinote";
import { Page, door, type Section } from "../parts.tsx";

export const entry = {
  to: "morph",
  name: "Morph",
  line: "Leave the cut for what changes",
} satisfies Section;

// Two slides with the same three cards and headline: on the second, one card
// grows and the others step aside. hinote's Grid lines up the cards' rows
// (number, heading, text), and a <Morph> around each card carries it to the
// next slide.
const cards = [
  { name: "write", no: "i", head: "Write", body: "deck.tsx in your editor" },
  {
    name: "present",
    no: "ii",
    head: "Present",
    body: "hinote dev, with a presenter view",
  },
  {
    name: "share",
    no: "iii",
    head: "Share",
    body: "hinote build, one HTML file",
  },
];

const morphAll = createSlide(
  {
    title: "What stays on screen moves instead of cutting",
    transition: "slide-up",
  },
  (slide) => (
    <Page
      slide={slide}
      wide
      headline={
        <Morph name="morph-title">
          <h2 class="morph-title">
            What stays on screen <em>moves</em> instead of cutting
          </h2>
        </Morph>
      }
    >
      <Grid columns={3} gap={3} class="cards">
        {cards.map((card) => (
          <Morph name={card.name}>
            <Card class="card">
              <span class="card-no">{card.no}</span>
              <h3>{card.head}</h3>
              <p>{card.body}</p>
            </Card>
          </Morph>
        ))}
      </Grid>
    </Page>
  ),
);

const [write, present, share] = cards;

const morphOne = createSlide(
  {
    title: "Elements with the same Morph name move between slides",
    transition: "none",
    notes: "Same names on both slides: the browser moves each card into place.",
  },
  (slide) => (
    <Page
      slide={slide}
      wide
      headline={
        <Morph name="morph-title">
          <h2 class="morph-title is-small">
            What stays on screen <em>moves</em> instead of cutting
          </h2>
        </Morph>
      }
    >
      <Grid columns={3} gap={3} class="cards is-focus">
        <Morph name={present.name}>
          <Card span={2} class="card is-big">
            <span class="card-no">{present.no}</span>
            <h3>{present.head}</h3>
            <p>{present.body}</p>
          </Card>
        </Morph>
        <div class="cards-side">
          {[write, share].map((card) => (
            <Morph name={card.name}>
              <Card class="card">
                <span class="card-no">{card.no}</span>
                <h3>{card.head}</h3>
              </Card>
            </Morph>
          ))}
        </div>
      </Grid>
    </Page>
  ),
);

export default createSlide({ section: entry.name }, [
  door(entry),
  morphAll,
  morphOne,
]);
