import { Column, Flow, Row, Table, createSlide } from "hinote";
import { Head, Page, door, type Section } from "../parts.tsx";

export const entry = {
  to: "layout",
  name: "Layout",
  line: "Spacing stays on one scale",
} satisfies Section;

// The row is the page. Page's spread would put the picture in a figure
// beside a headline, which is the layout this slide is here to replace.
const image = createSlide(
  {
    title: "The picture and the sentence share one row",
    notes: "The image is ./images/page.svg, a path relative to the deck file.",
  },
  (slide) => (
    <div class="page">
      <Head slide={slide} />
      <Row gap={8} align="center">
        <img
          class="photo"
          src="./images/page.svg"
          alt="A printed page: an ultramarine block, rules, and lines of text"
        />
        <Column gap={4}>
          <h2>
            The picture and the sentence <em>share</em> one row
          </h2>
          <p class="standfirst">
            The src is a relative path, ./images/page.svg, next to the deck
            file. The build copies it beside the page.
          </p>
        </Column>
      </Row>
    </div>
  ),
);

const flow = createSlide(
  {
    title: "Two boxes or three, it is the same flow",
    notes: "emphasis={2} marks Check. An arrow sits between each pair.",
  },
  (slide) => (
    <Page
      slide={slide}
      wide
      headline={
        <h2>
          Two boxes or three, it is the <em>same</em> flow
        </h2>
      }
      standfirst={
        <p class="standfirst">
          An arrow sits between each pair, so adding a box does not mean a new
          component.
        </p>
      }
    >
      <Flow emphasis={2} gap={2}>
        <div>
          <p class="flow-name">Write</p>
          <p class="flow-note">deck.tsx</p>
        </div>
        <div>
          <p class="flow-name">Check</p>
          <p class="flow-note">hinote check</p>
        </div>
        <div>
          <p class="flow-name">Present</p>
          <p class="flow-note">hinote dev</p>
        </div>
      </Flow>
    </Page>
  ),
);

const table = createSlide(
  {
    title: "Columns hold their width as the words change",
    notes: "widths={[1, 2]} and emphasis={[2]}, the check row.",
  },
  (slide) => (
    <Page
      slide={slide}
      headline={
        <h2>
          Columns hold their <em>width</em> as the words change
        </h2>
      }
      standfirst={
        <p class="standfirst">
          The ratio is 1 to 2. The check row is the one to read.
        </p>
      }
    >
      <Table widths={[1, 2]} emphasis={[2]}>
        <thead>
          <tr>
            <th>Command</th>
            <th>What you get</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>hinote dev</td>
            <td>The deck in a browser, reloading as you edit</td>
          </tr>
          <tr>
            <td>hinote check</td>
            <td>Every slide rendered, and what is wrong with it</td>
          </tr>
          <tr>
            <td>hinote build</td>
            <td>One HTML file, and the images it loads</td>
          </tr>
        </tbody>
      </Table>
    </Page>
  ),
);

export default createSlide({ section: entry.name }, [
  door(entry),
  image,
  flow,
  table,
]);
