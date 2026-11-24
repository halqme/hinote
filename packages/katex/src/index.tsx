import type { HinoteErrorLike } from "@hinote/types";
import { raw } from "hono/html";
import katex from "katex";

export type MathProps = {
  // LaTeX source. In a JSX attribute string a backslash is literal: write
  // `\frac`, not `\\frac`.
  tex: string;
  // Inline in the surrounding text instead of a centered block of its own.
  inline?: boolean;
};

// hinote reports an error with this name as its own, message and all.
class MathError extends Error implements HinoteErrorLike {
  override readonly name = "HinoteError";
  readonly code = "math";
}

// LaTeX as MathML, rendered while the slide renders, so the page loads no
// script, stylesheet, or font for it.
export function Math(props: MathProps) {
  if (typeof props.tex !== "string")
    throw new MathError("<Math> needs its LaTeX as `tex`.");
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
    throw new MathError(
      `<Math tex="${props.tex}"> is not valid LaTeX: ${error.rawMessage}`,
    );
  }
}
