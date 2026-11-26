import { createSlide } from "hinote";
import style from "./style.css" with { type: "text" };
import { theme } from "./parts.tsx";
import cover from "./slides/cover.tsx";
import contents from "./slides/contents.tsx";
import layout from "./slides/layout.tsx";
import code from "./slides/code.tsx";
import charts from "./slides/charts.tsx";
import diagrams from "./slides/diagrams.tsx";
import sequences from "./slides/sequences.tsx";
import math from "./slides/math.tsx";
import icons from "./slides/icons.tsx";
import qr from "./slides/qr.tsx";
import morph from "./slides/morph.tsx";
import steps from "./slides/steps.tsx";
import end from "./slides/end.tsx";

// Settings and order. The contents page lists the sections in this order.
export default createSlide(
  {
    document: { title: "hinote showcase", lang: "en", pageNumber: true },
    theme,
    css: style,
  },
  [
    cover,
    contents,
    layout,
    code,
    charts,
    diagrams,
    sequences,
    math,
    icons,
    qr,
    morph,
    steps,
    end,
  ],
);
