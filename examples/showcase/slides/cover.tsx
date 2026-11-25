import { createSlide } from "hinote";
import { Brand } from "../parts.tsx";

export default createSlide(
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
