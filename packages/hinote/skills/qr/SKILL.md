---
name: hinote-qr
description: Put a QR code on hinote slides with <Qr> from @hinote/qr, such as the link to the slides at the end of a talk, in the theme's colors or your own, with dots, rounded corners, a gradient, or a logo. Use when a slide shows a QR code.
---

# @hinote/qr

`<Qr>` for [hinote](https://github.com/halqme/hinote/tree/main/packages/hinote): a QR code, such as the link to the slides at the end of a talk, drawn as inline SVG in the color of the text around it while the slide renders, so the page loads no script or image for it.

This guide ships with hinote and matches its version; the package is released with the same version.

```sh
bun add @hinote/qr
```

```tsx
import { createSlide } from "hinote";
import { Qr } from "@hinote/qr";

export default createSlide([
  createSlide(() => (
    <>
      <h2>The slides</h2>
      <Qr value="https://example.com/talk" />
      <p>example.com/talk</p>
    </>
  )),
]);
```

- `value` is what the code holds, usually a URL. Text that is not ASCII is encoded as UTF-8. Write the URL beside the code too, for anyone who cannot scan it.
- `size` is the width and height, a CSS length or a number of pixels. The default, `360px`, is a third of the 1080-pixel canvas.
- By default the code is drawn in the color of the text around it, with nothing under it, so it suits the theme. On a dark theme that makes it light on dark, which some scanners cannot read; pass colors of your own for dark on light.
- `color` is the modules' color, any CSS color. Several, `color={["#1e3a8a", "#9333ea"]}`, make a gradient from the top left to the bottom right. `background` fills the code and its margin. `finderColor` colors the three corner squares; it defaults to `color`.
- Colors you pass are yours to keep readable: the modules must be the darker of the two, far apart from the background. `hinote check` warns when a color you passed is below 4.5:1 against the background (the slide's, without `background`), when the modules are the lighter one, and when it cannot read a color. It reads `#rgb`, `#rrggbb`, `rgb()`, `white`, `black`, `currentColor`, and `var(--hinote-color-<name>)`.
- `shape` is the modules' shape and `finder` the corner squares': `"square"` (the default), `"rounded"`, or `"dot"`.
- `logo` puts an image in the middle, by URL or by a path relative to the deck, which `hinote build` copies like any other. `logoSize` is its width as a share of the code's, from above 0 to `0.3`; the default is `0.2`. A logo hides modules, so it needs level `"H"`, which it sets; another level is an error.
- `level` is how much of the code can be lost and still read: `"L"` 7%, `"M"` 15% (the default), `"Q"` 25%, `"H"` 30%. A higher level makes the code denser. A value too long for a code is an error; shorten it, or pass `level="L"`, which holds the most.
- `margin` is the empty space around the code, in modules. The QR standard asks for 4, the default; leave no border of your own on top of it.
- `label` names the code for a screen reader. It defaults to the value.
- `class` and `style` go on the `<svg>`.
- It needs nothing from Node or the file system, so it runs on Bun, Node, and Cloudflare Workers alike.

```tsx
<Qr
  value="https://example.com/talk"
  shape="dot"
  finder="rounded"
  color={["#1e3a8a", "#9333ea"]}
  background="#fff"
  logo="./logo.svg"
/>
```
