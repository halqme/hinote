import { Fragment, jsx, type Child } from "hono/jsx";
import { raw } from "hono/html";
import { HinoteError } from "../errors.ts";
import { elementHtml } from "./html.ts";

export type MorphProps = {
  // Letters, digits, "_", or "-". The element with the same name on the next
  // slide is where this one moves to.
  name: string;
  // One element: an HTML element or a component that renders one, such as
  // <h2>, <Card>, or <Code>.
  children?: Child;
};

const NAME = /^[\w-]{1,64}$/;

// The first start tag of rendered HTML, up to the end of its name.
const FIRST_TAG = /^(\s*<[a-zA-Z][\w-]*)(?=[\s/>])/;

const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

// Elements whose content is text, which may hold "<" that is not a tag.
const RAW_TEXT = new Set(["script", "style", "textarea", "title"]);

const TOKEN =
  /<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|[^<]+|</g;

// How many elements rendered HTML has at its top level, or -1 when it also
// has text there. A component may render several elements as a fragment, so
// counting its JSX children would not tell.
function outerElements(html: string): number {
  let depth = 0;
  let count = 0;
  let rawText: string | undefined;
  for (const [token, close, open, attributes = ""] of html.matchAll(TOKEN)) {
    if (rawText !== undefined) {
      if (close?.toLowerCase() === rawText) rawText = undefined;
      else continue;
    }
    if (token.startsWith("<!--")) continue;
    if (close !== undefined) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (open === undefined) {
      if (depth === 0 && token.trim() !== "") return -1;
      continue;
    }
    if (depth === 0) count++;
    const name = open.toLowerCase();
    if (VOID.has(name) || attributes.trimEnd().endsWith("/")) continue;
    if (RAW_TEXT.has(name)) rawText = name;
    depth++;
  }
  return count;
}

// Names the element it wraps so it moves and resizes into its twin when the
// slide changes: the page pairs elements by `data-hinote-morph` across the two
// slides and runs one view transition for each pair. It adds no element of its
// own, so the wrapped element keeps its place in the layout, and a Grid still
// counts the Card inside it.
export async function Morph(props: MorphProps) {
  if (typeof props.name !== "string" || !NAME.test(props.name))
    throw new HinoteError(
      '<Morph name> must be letters, digits, "_", or "-", such as "title".',
    );
  const needsOne = `<Morph name="${props.name}"> needs one element inside, such as <h2> or <Card>.`;
  const html = await elementHtml(jsx(Fragment, {}, props.children), needsOne);
  if (outerElements(html) !== 1) throw new HinoteError(needsOne);
  return raw(html.replace(FIRST_TAG, `$1 data-hinote-morph="${props.name}"`));
}

// The first name a finished slide uses twice, which the page could not pair.
export function repeatedMorph(html: string): string | undefined {
  const seen = new Set<string>();
  for (const [, name] of html.matchAll(/ data-hinote-morph="([^"]*)"/g)) {
    if (name === undefined) continue;
    if (seen.has(name)) return name;
    seen.add(name);
  }
  return undefined;
}
