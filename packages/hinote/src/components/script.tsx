import { jsx } from "hono/jsx";
import { HinoteError } from "../errors.ts";

// Spelled in parts: the deck bundler rewrites the whole phrase to a path
// wherever it appears in a file, strings included.
const META_URL = ["import", "meta", "url"].join(".");

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
  // A browser loads a string as is, and cannot run TypeScript or JSX.
  if (/\.(?:[cm]?ts|tsx|jsx)(?:[?#].*)?$/.test(props.src))
    throw new HinoteError(
      `<Script src="${props.src}"> names a source file, which the browser cannot load.`,
      {
        code: "script-src",
        hint: `Pass a file URL so hinote bundles it: <Script src={new URL("${props.src}", ${META_URL})} />`,
      },
    );
  return jsx("script", { type: "module", src: props.src });
}
