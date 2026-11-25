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
  // A browser loads a string as is, and cannot run TypeScript or JSX.
  if (/\.(?:[cm]?ts|tsx|jsx)(?:[?#].*)?$/.test(props.src))
    throw new HinoteError(
      `<Script src="${props.src}"> names a source file, which the browser cannot load.`,
      {
        code: "script-src",
        hint: `Pass a file URL so hinote bundles it: <Script src={new URL("${props.src}", import.meta.url)} />`,
      },
    );
  return jsx("script", { type: "module", src: props.src });
}

// A package can put browser code it built itself into a slide as
// `<script type="module" data-hinote-script="name">`, such as the code that
// animates @hinote/chart. However many slides carry one, the page runs it
// once: the first of each name moves to the end of <body>, after the
// runtime that defines window.hinote, and the rest are dropped.
const PACKAGED =
  /<script type="module" data-hinote-script="([^"]+)">([\s\S]*?)<\/script>/g;

export function gatherScripts(html: string): string {
  const scripts = new Map<string, string>();
  const page = html.replace(PACKAGED, (whole, name: string) => {
    if (!scripts.has(name)) scripts.set(name, whole);
    return "";
  });
  if (scripts.size === 0) return html;
  const end = page.lastIndexOf("</body>");
  const tail = [...scripts.values()].join("");
  return end < 0 ? page + tail : page.slice(0, end) + tail + page.slice(end);
}
