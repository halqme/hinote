import { PackageError } from "@hinote/shared";
import { raw } from "hono/html";
import katex from "katex";

export type MathProps = {
  // LaTeX source. In a JSX attribute string a backslash is literal: write
  // `\frac`, not `\\frac`.
  tex: string;
  // Inline in the surrounding text instead of a centered block of its own.
  inline?: boolean;
};

// LaTeX as MathML, rendered while the slide renders, so the page loads no
// script, stylesheet, or font for it.
export function Math(props: MathProps) {
  if (typeof props.tex !== "string")
    throw new PackageError("<Math> needs its LaTeX as `tex`.", "math");
  // In a JSX attribute string a backslash is already literal, so `\\frac`
  // reaches KaTeX as a line break followed by the word "frac". A break
  // directly before a letter is that mistake, not a break anyone wants.
  const doubled = /\\\\[A-Za-z]+/.exec(props.tex);
  if (doubled)
    throw new PackageError(
      `<Math tex="${props.tex}"> has "${doubled[0]}", which LaTeX reads as a line break and then text.`,
      "math",
      `A JSX attribute string keeps backslashes as written: write ${doubled[0].slice(1)}, not ${doubled[0]}.`,
    );
  try {
    return raw(
      katex.renderToString(props.tex, {
        output: "mathml",
        displayMode: props.inline !== true,
        throwOnError: true,
      }),
    );
  } catch (error) {
    if (!(error instanceof katex.ParseError)) throw error;
    throw new PackageError(
      `<Math tex="${props.tex}"> is not valid LaTeX: ${error.rawMessage}`,
      "math",
    );
  }
}
