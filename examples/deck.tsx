// A fictional five-minute talk, written the way a real one would be.
// `bun run dev` in the repository shows it; `bun examples/deck.tsx` serves it too.
import { createSlide } from "hinote";
import agenda from "./slides/agenda.tsx";
import code from "./slides/code.tsx";
import problem from "./slides/problem.tsx";
import results from "./slides/results.tsx";
import setup from "./slides/setup.tsx";
import thanks from "./slides/thanks.tsx";
import title from "./slides/title.tsx";

// The build part of the talk is a deck of its own; it lends its transition to its slides.
const build = createSlide({ transition: "slide" }, [setup, code]);

export default createSlide(
  {
    title: "週末の焙煎をコードで回す",
    aspect: "16:9",
    transition: "fade",
    theme: {
      colors: {
        bg: "#1c1410",
        fg: "#f5ede6",
        accent: "#e0a96d",
        muted: "#a8968a",
        // Tokens of our own: --hinote-color-surface, used by components/Card.tsx.
        surface: "#2a1e17",
      },
      fonts: {
        base: "'Hiragino Sans', 'Noto Sans JP', system-ui, sans-serif",
        heading: "'Hiragino Sans', 'Noto Sans JP', system-ui, sans-serif",
      },
      typography: { h1: "7rem" },
      radius: "20px",
    },
  },
  [title, agenda, problem, build, results, thanks],
);
