import { createSlide } from "hinote";
import { Icon } from "@hinote/icon";
import { Page, door, type Section } from "../parts.tsx";

export const entry = {
  to: "icons",
  name: "Icons",
  line: "A name, drawn as SVG",
} satisfies Section;

// One-color icons are currentColor. The standfirst leaves them the muted
// text; the cards set the accent, and a number makes them larger than 1em.
const marks = [
  ["lucide:pen-line", "Write"],
  ["lucide:presentation", "Present"],
  ["lucide:send", "Share"],
] as const;

const named = createSlide(
  {
    title: "An icon is a name, drawn as SVG",
    transition: "slide",
    notes:
      "lucide:pen-line, as icones.js.org lists it. The small one is 1em, so it takes this line. The cards are the accent.",
  },
  (slide) => (
    <Page
      slide={slide}
      headline={
        <h2>
          An icon is a <em>name</em>, drawn as SVG
        </h2>
      }
      standfirst={
        <p class="standfirst">
          <Icon name="lucide:pen-line" class="icon" /> At 1em it takes the color
          of this line, and the cards are the accent.
        </p>
      }
    >
      <div class="marks">
        {marks.map(([name, word]) => (
          <div class="mark">
            <Icon name={name} size={112} />
            <div>
              <p class="mark-name">{word}</p>
              <code>{name}</code>
            </div>
          </div>
        ))}
      </div>
    </Page>
  ),
);

export default createSlide({ section: entry.name }, [door(entry), named]);
