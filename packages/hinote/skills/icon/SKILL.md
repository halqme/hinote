---
name: hinote-icon
description: Put icons on hinote slides with <Icon> from @hinote/icon, any Iconify icon named as icones.js.org shows it. Use when a slide shows an icon or a logo.
---

# @hinote/icon

`<Icon>` for [hinote](https://github.com/halqme/hinote/tree/main/packages/hinote): any [Iconify](https://iconify.design) icon, named as [icones.js.org](https://icones.js.org) shows it, drawn as inline SVG while the slide renders, so the page loads no script, font, or file for it.

This guide ships with hinote and matches its version; the package is released with the same version.

Install the package and each icon set the deck uses, as `@iconify-json/<prefix>`:

```sh
bun add @hinote/icon @iconify-json/mdi @iconify-json/logos
```

```tsx
import { createSlide } from "hinote";
import { Icon } from "@hinote/icon";

export default createSlide([
  createSlide(() => (
    <>
      <h1>
        <Icon name="mdi:rocket-launch" /> Launch
      </h1>
      <Icon name="logos:bun" size={160} label="Bun" />
    </>
  )),
]);
```

- `name` is the icon's id on icones.js.org: the set's prefix, a colon, and the icon, such as `mdi:home`. Copy it from the icon's page. The UnoCSS class works too, `i-mdi-home` or `i-mdi:home`. In a class the longest installed prefix wins, as in UnoCSS: `i-mdi-light-home` is `mdi-light:home` when that set is installed.
- Each set is its own package, `@iconify-json/` and the prefix. `@iconify/json`, every set in one package, works too. A set that is not installed is an error naming the package. Sets are found where `@hinote/icon` is installed, so it does not matter which directory hinote runs in.
- An icon the set does not have is an error with the set's page on icones.js.org. An old name the set keeps as an alias works.
- `size` is the height, a CSS length or a number of pixels; the width follows the icon. The default `1em` matches the text around it, so an icon sits in a heading or a line of text.
- A one-color icon is drawn in `currentColor` and takes the text's color: set `color` on it or around it. A multicolor icon, such as one from `logos`, keeps its own colors.
- `label` names the icon for a screen reader. Without it the icon is decoration and hidden from one.
- `class` and `style` go on the `<svg>`.
- On Bun and Node the sets are read from disk, so installing one is all it takes. Where the deck cannot read files, such as Cloudflare Workers, only what the deck imports is bundled: import each set it uses and pass it to `addCollection` once, as UnoCSS's `collections` does. A set added this way is never read from disk, so this works everywhere.

```tsx
import { addCollection, Icon } from "@hinote/icon";
import { icons as mdi } from "@iconify-json/mdi";

addCollection(mdi);
```
