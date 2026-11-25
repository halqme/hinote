import { Contents, createSlide } from "hinote";
import { Page } from "../parts.tsx";

// The index is the page after the cover, not a part you enter, so it has no door.
// <Contents> reads the sections from the deck: each door's id and title.
const contents = createSlide(
  {
    title: "Each section starts at a door you can open from here",
    transition: "none",
    notes:
      "The wordmark moved here from the cover: that is <Morph>. <Contents> lists the sections deck.tsx holds; each link jumps to a door by its id.",
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
      <Contents slide={slide} class="toc" />
    </Page>
  ),
);

export default createSlide({ section: "Contents" }, [contents]);
