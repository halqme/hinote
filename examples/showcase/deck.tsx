import { Card, Grid, Morph, Step, createSlide } from "hinote";
import { Chart, bars } from "@hinote/chart";
import { Code } from "@hinote/code";
import { D2 } from "@hinote/d2";
import { Math } from "@hinote/katex";
import { Mermaid } from "@hinote/mermaid";
import type { Child } from "hono/jsx";
import style from "./style.css" with { type: "text" };

// A printed page: warm paper, ink, and one ultramarine. Headlines are set in
// Instrument Serif, text in Geist, and code in Geist Mono (fonts in style.css).
const theme = {
  colors: {
    bg: "#f3efe6",
    fg: "#151412",
    accent: "#1f2fc4",
    muted: "#4f4b44",
    surface: "#fbf9f4",
    border: "#d6d0c4",
  },
  fonts: {
    base: "'Geist Variable', system-ui, sans-serif",
    heading: "'Instrument Serif', Georgia, serif",
    mono: "'Geist Mono Variable', ui-monospace, monospace",
  },
  typography: { h1: "8rem", h2: "5.5rem", h3: "3.5rem", body: "2.125rem" },
  spacing: { safe: "calc(var(--hinote-space-unit) * 11)" },
  radius: "2px",
};

// The wordmark: across the cover, small in the running head of the next
// slide, and across the last page again. One <Morph> name carries it.
const Brand = () => (
  <Morph name="brand">
    <div class="brand">hinote</div>
  </Morph>
);

// The running head of a content page: the wordmark and the page's section.
const Head = (props: { no: string; section: string; brand?: boolean }) => (
  <header class="head">
    {props.brand ? <Brand /> : <span class="brand is-quiet">hinote</span>}
    <span class="section">
      № {props.no} — {props.section}
    </span>
  </header>
);

// A content page: the running head, a headline with its standfirst, and the
// figure. `wide` puts the figure under the headline instead of beside it.
const Page = (props: {
  no: string;
  section: string;
  headline: Child;
  standfirst?: Child;
  wide?: boolean;
  brand?: boolean;
  children?: Child;
}) => (
  <div class="page">
    <Head no={props.no} section={props.section} brand={props.brand} />
    <div class={props.wide ? "spread is-wide" : "spread"}>
      {/* The figure comes first in the HTML, so its steps are numbered
          before a step in the standfirst that comments on them. */}
      <figure class="figure">{props.children}</figure>
      <div class="text">
        {props.headline}
        {props.standfirst}
      </div>
    </div>
  </div>
);

const cover = createSlide(
  {
    title: "Slides you write as Hono JSX",
    class: "cover",
    transition: "none",
    notes:
      "One sentence: a deck is a TypeScript file, and the page is plain HTML.",
  },
  () => (
    <div class="cover-body">
      <p class="dateline">A showcase deck · Hono JSX · Bun and Node</p>
      <Brand />
      <p class="cover-line">
        Slides you write as <em>Hono JSX</em>, rendered on the server and
        presented in the browser.
      </p>
    </div>
  ),
);

const code = createSlide(
  {
    title: "A slide is a function that returns JSX",
    transition: "none",
    notes: "The wordmark moved here from the cover: that is <Morph>.",
  },
  () => (
    <Page
      no="1"
      section="Code"
      brand
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

// Sample numbers, labeled as such on the slide.
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

const chart = createSlide(
  {
    title: "A chart moves to its next data at each step",
    transition: "slide",
    notes: "Press once: March and April grow, and the axis holds still.",
  },
  () => (
    <Page
      no="2"
      section="Charts"
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

// D2 draws in its own theme, so the source styles every box and arrow in the
// deck's ink and ultramarine.
const diagram = createSlide(
  { title: "Diagrams are text, drawn on the server", transition: "slide" },
  () => (
    <Page
      no="3"
      section="Diagrams"
      wide
      headline={
        <h2>
          Diagrams are <em>text</em>, drawn on the server
        </h2>
      }
      standfirst={
        <p class="standfirst">
          The page gets an SVG and loads no script for it.
        </p>
      }
    >
      <D2 scale={1.7}>{`
        direction: right
        classes: {
          box: {
            style: {
              fill: "#fbf9f4"
              stroke: "#151412"
              stroke-width: 1
              font-color: "#151412"
              border-radius: 2
              font-size: 20
            }
          }
          source: {
            style: {
              fill: "#1f2fc4"
              stroke: "#1f2fc4"
              font-color: "#fbf9f4"
              border-radius: 2
              font-size: 20
            }
          }
        }
        deck: deck.tsx {class: source}
        dev: hinote dev {class: box}
        build: hinote build {class: box}
        browser: Browser {class: box}
        file: index.html {class: box}
        deck -> dev: renders
        dev -> browser: serves, reloads
        deck -> build: renders
        build -> file: one file
        (* -> *)[*].style: {
          stroke: "#4f4b44"
          stroke-width: 1
          font-color: "#4f4b44"
          font-size: 18
          italic: true
        }
      `}</D2>
    </Page>
  ),
);

// Mermaid takes the deck's colors and fonts by itself, so the source is only
// the diagram.
const sequence = createSlide(
  {
    title: "Mermaid takes the deck's colors and fonts",
    transition: "slide",
  },
  () => (
    <Page
      no="4"
      section="Sequences"
      headline={
        <h2>
          Mermaid takes the deck's <em>colors</em> and fonts
        </h2>
      }
      standfirst={
        <p class="standfirst">
          The same source a README holds, drawn while the slide renders.
        </p>
      }
    >
      <Mermaid scale={2.2}>{`
        sequenceDiagram
          participant P as Presenter
          participant D as hinote dev
          participant A as Audience
          P->>D: next slide
          D-->>A: move to slide 5
          A-->>P: follows along
      `}</Mermaid>
    </Page>
  ),
);

const math = createSlide(
  { title: "Formulas are MathML, with no script or font", transition: "slide" },
  () => (
    <Page
      no="5"
      section="Math"
      headline={
        <h2>
          Formulas are <em>MathML</em>, with no script or font
        </h2>
      }
      standfirst={
        <p class="standfirst">
          KaTeX turns <Math inline tex="\LaTeX" /> into MathML while the slide
          renders.
        </p>
      }
    >
      <div class="formula">
        <Math tex="\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}" />
      </div>
    </Page>
  ),
);

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
  () => (
    <Page
      no="6"
      section="Morph"
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
  () => (
    <Page
      no="6"
      section="Morph"
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

const effects = createSlide(
  {
    title: "A step can move into place as it appears",
    transition: {
      name: "zoom",
      duration: 500,
      easing: "cubic-bezier(.2, 0, 0, 1)",
    },
    notes: "One press shows all three, each with its own effect.",
  },
  () => (
    <Page
      no="7"
      section="Steps"
      headline={
        <h2>
          A step can <em>move</em> into place as it appears
        </h2>
      }
      standfirst={<p class="standfirst">One key press, three effects.</p>}
    >
      <div class="effects">
        {(["up", "zoom", "left"] as const).map((effect) => (
          <Step at={1} effect={effect} class="effect">
            <span class="effect-name">{effect}</span>
            <code>{`effect="${effect}"`}</code>
          </Step>
        ))}
      </div>
    </Page>
  ),
);

const end = createSlide(
  {
    title: "Start with hinote init, present with hinote dev",
    class: "cover",
    transition: "wipe",
  },
  () => (
    <div class="cover-body">
      <p class="dateline">Thank you · Questions welcome</p>
      <Brand />
      <div class="shell">
        <code>bunx hinote init my-talk</code>
        <code>cd my-talk &amp;&amp; bunx hinote dev</code>
      </div>
    </div>
  ),
);

export default createSlide(
  { title: "hinote showcase", lang: "en", theme, css: style, pageNumber: true },
  [
    cover,
    code,
    chart,
    diagram,
    sequence,
    math,
    morphAll,
    morphOne,
    effects,
    end,
  ],
);
