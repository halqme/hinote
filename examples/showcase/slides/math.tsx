import { createSlide } from "hinote";
import { Math } from "@hinote/katex";
import { Page, door, type Section } from "../parts.tsx";

export const entry = {
  to: "math",
  name: "Math",
  line: "Set while the slide renders",
} satisfies Section;

const formula = createSlide(
  { title: "Formulas are MathML, with no script or font", transition: "slide" },
  (slide) => (
    <Page
      slide={slide}
      headline={
        <h2>
          Formulas are <em>MathML</em>, with no script or font
        </h2>
      }
      standfirst={
        <p class="standfirst">
          KaTeX turns <Math inline tex="\LaTeX" /> into MathML while the slide
          renders.
        </p>
      }
    >
      <div class="formula">
        <Math tex="\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}" />
      </div>
    </Page>
  ),
);

export default createSlide({ section: entry.name }, [door(entry), formula]);
