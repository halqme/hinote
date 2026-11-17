import katex from "katex";
import { raw } from "hono/html";

// LaTeX as MathML, rendered while the slide renders: no script or font to load.
export function Math(props: { tex: string }) {
  return raw(
    katex.renderToString(props.tex, { output: "mathml", displayMode: true }),
  );
}
