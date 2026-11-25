import { createSlide } from "hinote";
import style from "./style.css" with { type: "text" };
import { theme } from "./parts.tsx";
import cover from "./slides/cover.tsx";
import contents, { sectionDecks } from "./slides/contents.tsx";
import end from "./slides/end.tsx";

// Settings and order. The section decks are the same list the contents page links.
export default createSlide(
  {
    title: "hinote showcase",
    lang: "en",
    theme,
    css: style,
    pageNumber: true,
  },
  [cover, contents, ...sectionDecks, end],
);
