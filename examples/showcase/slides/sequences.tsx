import { createSlide } from "hinote";
import { Mermaid } from "@hinote/mermaid";
import { Page, door, type Section } from "../parts.tsx";

export const entry = {
  to: "sequences",
  name: "Sequences",
  line: "A sequence, in the deck's ink",
} satisfies Section;

// Mermaid takes the deck's colors and fonts by itself, so the source is only
// the diagram.
const sequence = createSlide(
  {
    title: "Mermaid takes the deck's colors and fonts",
    transition: "slide",
  },
  (slide) => (
    <Page
      slide={slide}
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
          D-->>A: move to the next slide
          A-->>P: follows along
      `}</Mermaid>
    </Page>
  ),
);

export default createSlide({ section: entry.name }, [door(entry), sequence]);
