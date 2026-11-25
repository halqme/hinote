import { createSlide } from "hinote";
import { D2 } from "@hinote/d2";
import { Page, door, type Section } from "../parts.tsx";

export const entry = {
  to: "diagrams",
  name: "Diagrams",
  line: "From a paragraph to a picture",
} satisfies Section;

// D2 draws in its own theme, so the source styles every box and arrow in the
// deck's ink and ultramarine.
const picture = createSlide(
  { title: "Diagrams are text, drawn on the server", transition: "slide" },
  (slide) => (
    <Page
      slide={slide}
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

export default createSlide({ section: entry.name }, [door(entry), picture]);
