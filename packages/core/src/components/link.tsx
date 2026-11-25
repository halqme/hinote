import { jsx, type Child } from "hono/jsx";
import { HinoteError } from "../errors.ts";

export type LinkProps = {
  // The `id` slide option of the slide to go to.
  to: string;
  class?: string;
  children?: Child;
};

// Slide ids are words, digits, `_`, and `-`, so they fit an attribute and a
// regular expression as they are.
export const SLIDE_ID = /^[\w-]{1,64}$/;

// A link to another slide of the deck, by its id rather than its URL. The
// deck writes the href for the page it renders (dev, a mounted base,
// prerendered directories, or the single file's #n), and the runtime moves
// there without reloading the page.
export function Link(props: LinkProps) {
  if (typeof props.to !== "string" || !SLIDE_ID.test(props.to))
    throw new HinoteError(
      `<Link to> must be a slide id of letters, digits, "_", or "-", not ${JSON.stringify(props.to)}.`,
    );
  // jsx() rather than JSX syntax: slide options import this module, and the
  // CLI loads them outside a deck's JSX settings.
  return jsx(
    "a",
    { "data-hinote-to": props.to, class: props.class },
    props.children,
  );
}
