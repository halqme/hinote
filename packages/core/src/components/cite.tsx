import { raw } from "hono/html";
import { jsx, type Child } from "hono/jsx";
import { HinoteError } from "../errors.ts";

export type CiteProps = {
  // The name of a source in <References sources>, or several names.
  source: string | readonly string[];
  class?: string;
};

export type ReferencesProps = {
  // Every source the talk may cite, by name. The list shows the cited ones,
  // numbered in the order the deck first cites them.
  sources: Readonly<Record<string, Child>>;
  class?: string;
};

// Source names are words, digits, and `_`, `-`, `.`, `:`, so they fit an
// attribute and a regular expression as they are.
const SOURCE_NAME = /^[\w.:-]{1,64}$/;

function checkName(name: unknown, label: string): string {
  if (typeof name !== "string" || !SOURCE_NAME.test(name))
    throw new HinoteError(
      `${label} must be a source name of letters, digits, "_", "-", ".", or ":", not ${JSON.stringify(name)}.`,
    );
  return name;
}

// A citation such as [1] or [1, 3]. Numbers come from the whole deck, which
// one slide cannot know while it renders: Cite writes the names, and
// `numberCitations` writes the numbers into the finished page.
export function Cite(props: CiteProps) {
  const names =
    typeof props.source === "string" ? [props.source] : props.source;
  if (!Array.isArray(names) || names.length === 0)
    throw new HinoteError("<Cite source> must name at least one source.");
  for (const name of names) checkName(name, "<Cite source>");
  // jsx() rather than JSX syntax, as in Link.
  return jsx(
    "span",
    {
      "data-hinote-cite": [...new Set(names)].join(" "),
      class: ["hinote-cite", props.class].filter(Boolean).join(" "),
    },
    "[?]",
  );
}

const END = "<!--/hinote-references-->";

// The list of cited sources. It holds every source, so a slide rendered by
// itself can still be numbered for the whole deck; the ones the deck does not
// cite are hidden.
export function References(props: ReferencesProps) {
  const { sources } = props;
  if (typeof sources !== "object" || sources === null)
    throw new HinoteError(
      "<References sources> must be an object of sources by name.",
    );
  const items = Object.entries(sources).map(([name, source]) =>
    jsx(
      "li",
      { "data-hinote-source": checkName(name, "A <References> source") },
      source,
    ),
  );
  return jsx(
    "ol",
    {
      "data-hinote-references": "",
      class: ["hinote-references", props.class].filter(Boolean).join(" "),
    },
    ...items,
    raw(END),
  );
}

const CITE = /<span data-hinote-cite="([\w.: -]+)"([^>]*)>[^<]*<\/span>/g;
const LIST =
  /(<ol data-hinote-references=""[^>]*>)([\s\S]*?)<!--\/hinote-references--><\/ol>/g;
const ITEM =
  /<li data-hinote-source="([\w.:-]+)"(?: value="\d+"| hidden="")?>/g;

// Source names in the order the slides first cite them.
export function citationOrder(slides: readonly string[]): string[] {
  const order = new Set<string>();
  for (const html of slides)
    for (const [, names = ""] of html.matchAll(CITE))
      for (const name of names.split(" ")) order.add(name);
  return [...order];
}

// The names every <References> on these slides lists.
export function listedSources(slides: readonly string[]): Set<string> {
  const listed = new Set<string>();
  for (const html of slides)
    for (const [, , list = ""] of html.matchAll(LIST))
      for (const [, name = ""] of list.matchAll(ITEM)) listed.add(name);
  return listed;
}

// Writes each citation's numbers, and numbers and orders each list by
// `order`. It can run again on its own output with the order of a larger deck.
export function numberCitations(
  html: string,
  order: readonly string[],
): string {
  const numbers = new Map(order.map((name, index) => [name, index + 1]));
  const cited = html.replace(CITE, (whole, names: string, rest: string) => {
    const found = names
      .split(" ")
      .map((name) => numbers.get(name))
      .filter((number) => number !== undefined);
    if (found.length === 0) return whole;
    const sorted = found.toSorted((a, b) => a - b);
    return `<span data-hinote-cite="${names}"${rest}>[${sorted.join(", ")}]</span>`;
  });
  return cited.replace(LIST, (_, start: string, list: string) => {
    const first = list.search(ITEM);
    const head = first === -1 ? list : list.slice(0, first);
    const items = [...list.matchAll(ITEM)].map((match, index, all) => {
      const name = match[1] ?? "";
      const number = numbers.get(name);
      const end = all[index + 1]?.index ?? list.length;
      const body = list.slice((match.index ?? 0) + match[0].length, end);
      const open =
        number === undefined
          ? `<li data-hinote-source="${name}" hidden="">`
          : `<li data-hinote-source="${name}" value="${number}">`;
      return { order: number ?? Infinity, html: open + body };
    });
    items.sort((a, b) => a.order - b.order);
    return `${start}${head}${items.map((item) => item.html).join("")}${END}</ol>`;
  });
}
