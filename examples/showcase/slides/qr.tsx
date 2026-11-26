import { createSlide } from "hinote";
import { Qr } from "@hinote/qr";
import { Page, door, type Section } from "../parts.tsx";

export const entry = {
  to: "qr",
  name: "QR",
  line: "Drawn in the text's color",
} satisfies Section;

// No color of its own: the modules are the text's color, and the page shows
// through the quiet zone. The address is written out for anyone who cannot scan.
const link = "https://github.com/halqme/hinote";

const code = createSlide(
  {
    title: "The code is the text's color, on the page",
    transition: "slide",
    notes:
      "Point a phone at it: github.com/halqme/hinote. Dark ink on this paper scans; a light code on a dark ground may not.",
  },
  (slide) => (
    <Page
      slide={slide}
      headline={
        <h2>
          The code is the <em>text's</em> color, on the page
        </h2>
      }
      standfirst={
        <p class="standfirst">
          Drawn while the slide renders. The address is written under it, for anyone who cannot
          scan.
        </p>
      }
    >
      <div class="scan">
        <Qr value={link} size={520} shape="dot" finder="rounded" />
        <p class="scan-url">github.com/halqme/hinote</p>
      </div>
    </Page>
  ),
);

export default createSlide({ section: entry.name }, [door(entry), code]);
