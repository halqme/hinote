import { jsx } from "hono/jsx";
import { HinoteError } from "../errors.ts";

export type ScriptProps = {
  // A file to bundle for the browser, `new URL("./chart.client.tsx",
  // import.meta.url)`, or the URL of a script you built yourself.
  src: URL | string;
};

// Marks where a page needs a script. A file URL leaves a placeholder that the
// hinote CLI (dev, build, prerender) bundles and inlines at the end of the
// page, once per file, after window.hinote exists. A string is an ordinary
// module script the page loads from that URL.
export function Script(props: ScriptProps) {
  if (props.src instanceof URL) {
    if (props.src.protocol !== "file:")
      throw new HinoteError(
        `<Script src> must be a file URL or a string, not ${props.src.href}.`,
      );
    return jsx("script", {
      type: "module",
      "data-hinote-src": props.src.href,
    });
  }
  if (typeof props.src !== "string" || props.src === "")
    throw new HinoteError("<Script> needs src.");
  return jsx("script", { type: "module", src: props.src });
}
