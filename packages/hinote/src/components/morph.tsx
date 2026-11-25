import { jsx, type Child } from "hono/jsx";
import { HinoteError } from "../errors.ts";
import type { Tag } from "./step.tsx";

export type MorphProps = {
  // Letters, digits, "_", or "-". The element with the same name on the next
  // slide is where this one moves to.
  name: string;
  // Element to render. Defaults to "div".
  as?: Tag;
  class?: string;
  children?: Child;
};

const NAME = /^[\w-]{1,64}$/;
const TAG = /^[a-z][a-z0-9-]*$/;

// An element that moves and resizes into its twin when the slide changes:
// the page pairs elements by `data-hinote-morph` across the two slides and
// runs one view transition for each pair.
export function Morph(props: MorphProps) {
  if (typeof props.name !== "string" || !NAME.test(props.name))
    throw new HinoteError(
      '<Morph name> must be letters, digits, "_", or "-", such as "title".',
    );
  const tag = props.as ?? "div";
  if (!TAG.test(tag))
    throw new HinoteError(`<Morph as="${tag}"> must be a lowercase tag name.`);
  return jsx(
    tag,
    { "data-hinote-morph": props.name, class: props.class },
    props.children,
  );
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
