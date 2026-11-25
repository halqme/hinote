import { PackageError } from "@hinote/shared";
import type { IconifyJSON } from "@iconify/types";
import {
  getIconData,
  iconToHTML,
  iconToSVG,
  replaceIDs,
  validateIconName,
} from "@iconify/utils";
import { raw } from "hono/html";

export type IconProps = {
  // The icon as icones.js.org names it: the set's prefix, a colon, and the
  // icon, such as "mdi:home" or "lucide:rocket".
  name: string;
  // The height, as a CSS length or a number of pixels. The width follows the
  // icon's own proportions. The default 1em sizes it to the text around it.
  size?: number | string;
  // What the icon means, for a screen reader. Without it the icon is
  // decoration and hidden from one.
  label?: string;
  class?: string;
  style?: string;
};

// Sets passed to addCollection, by prefix.
const collections = new Map<string, IconifyJSON>();

// Makes an icon set's icons available to <Icon> without reading it from disk,
// as UnoCSS's `collections` does. A deck needs it only where it cannot read
// files, such as Cloudflare Workers, where only what the deck imports is
// bundled:
//
//   import { icons as mdi } from "@iconify-json/mdi";
//   addCollection(mdi);
export function addCollection(set: IconifyJSON): void {
  collections.set(set.prefix, set);
}

type Reader = (prefix: string) => Promise<IconifyJSON | undefined>;

// Any other set is read from where this package is installed, which is the
// deck's node_modules, so it does not matter which directory hinote runs in.
// The CLI keeps import.meta.url at this file's own path when it bundles it.
// Node's modules load only on the first such set, so a deck on Workers with
// its sets added never needs them. Without them, or without a file URL for
// this module, there is no reader.
let reader: Promise<Reader | undefined> | undefined;

function fileReader(): Promise<Reader | undefined> {
  reader ??= Promise.all([
    import("node:path"),
    import("node:url"),
    import("@iconify/utils/lib/loader/fs"),
  ])
    .then(([{ dirname }, { fileURLToPath }, { loadCollectionFromFS }]) => {
      const here = dirname(fileURLToPath(import.meta.url));
      return (prefix: string) =>
        loadCollectionFromFS(prefix, false, "@iconify-json", here);
    })
    .catch(() => undefined);
  return reader;
}

async function iconSet(prefix: string): Promise<IconifyJSON | undefined> {
  return collections.get(prefix) ?? (await (await fileReader())?.(prefix));
}

type IconName = { prefix: string; name: string };

// The ways a name splits into a set and an icon, the likeliest first.
// "mdi:home" is icones.js.org's id, and "i-mdi:home" the UnoCSS class with
// it. In the class "i-mdi-light-home" any hyphen may end the prefix, since a
// prefix has hyphens of its own; as UnoCSS does, the longest prefix comes
// first, so it is mdi-light:home before mdi:light-home.
function iconNames(text: string): IconName[] {
  const body = text.startsWith("i-") ? text.slice(2) : text;
  let names: IconName[];
  if (body.includes(":")) {
    const [prefix = "", name = "", ...rest] = body.split(":");
    names = rest.length > 0 ? [] : [{ prefix, name }];
  } else if (body === text) {
    names = [];
  } else {
    const parts = body.split("-");
    names = parts
      .slice(1)
      .map((_, i) => ({
        prefix: parts.slice(0, i + 1).join("-"),
        name: parts.slice(i + 1).join("-"),
      }))
      .toReversed();
  }
  return names.filter((n) => validateIconName({ provider: "", ...n }));
}

function escape(text: string): string {
  return text.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
}

// An Iconify icon as inline SVG, drawn while the slide renders, so the page
// loads no script, font, or file for it. A one-color icon is drawn in
// currentColor and takes the color of the text around it.
export async function Icon(props: IconProps) {
  const tag = `<Icon name="${props.name}">`;
  const names = typeof props.name === "string" ? iconNames(props.name) : [];
  if (names.length === 0)
    throw new PackageError(
      typeof props.name === "string"
        ? `${tag} is not an icon name.`
        : "<Icon> needs the icon's name as `name`.",
      "icon",
      'Write the set\'s prefix, a colon, and the icon, as icones.js.org shows it: name="mdi:home". The UnoCSS class name="i-mdi-home" works too.',
    );

  let data: ReturnType<typeof getIconData> = null;
  // The first split whose set is installed, for the error when none draws.
  let lacking: IconName | undefined;
  for (const candidate of names) {
    const set = await iconSet(candidate.prefix);
    data = set ? getIconData(set, candidate.name) : null;
    if (data) break;
    if (set) lacking ??= candidate;
  }
  if (!data) {
    if (lacking)
      throw new PackageError(
        `${tag}: the set "${lacking.prefix}" has no icon "${lacking.name}".`,
        "icon",
        `Find its name at https://icones.js.org/collection/${lacking.prefix}`,
      );
    throw new PackageError(
      `${tag} needs the icon set ${names.map((n) => `"${n.prefix}"`).join(" or ")}, which is not installed in the deck.`,
      "icon",
      `Install it in the deck: bun add @iconify-json/${names[0]!.prefix}` +
        ((await fileReader())
          ? ""
          : `. This server cannot read it from disk: import its icons from "@iconify-json/${names[0]!.prefix}" and pass them to addCollection.`),
    );
  }

  const size =
    typeof props.size === "number" ? `${props.size}px` : (props.size ?? "1em");
  const svg = iconToSVG(data, { height: size });
  const attributes: Record<string, string> = {
    ...svg.attributes,
    ...(props.label === undefined
      ? { "aria-hidden": "true" }
      : { role: "img", "aria-label": escape(props.label) }),
    ...(props.class === undefined ? {} : { class: escape(props.class) }),
    ...(props.style === undefined ? {} : { style: escape(props.style) }),
  };
  // Every icon is on the one page, so ids inside an icon must not repeat.
  return raw(iconToHTML(replaceIDs(svg.body), attributes));
}
