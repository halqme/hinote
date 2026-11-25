---
name: hinote-qr
description: Put a QR code on hinote slides with <Qr> from @hinote/qr, such as the link to the slides at the end of a talk. Use when a slide shows a QR code.
---

# @hinote/qr

`<Qr>` for [hinote](https://github.com/halqme/hinote/tree/main/packages/hinote): a QR code, such as the link to the slides at the end of a talk, drawn as inline SVG in the deck's colors while the slide renders, so the page loads no script or image for it.

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
- `size` is the width and height, a CSS length or a number of pixels. The default, `360px`, is a third of the 1080-pixel canvas. The code keeps the four modules of empty space around it that a reader needs, so leave no border of your own.
- The code is drawn in the deck's text color on its background color, so it suits the theme. On a dark theme it is light on dark, and some scanners read only dark on light. For dark on light whatever the theme, pass `color` for the modules and `background` for the space around them: `<Qr value="…" color="#000" background="#fff" />`. Keep the two far apart in lightness.
- `level` is how much of the code can be lost and still read: `"L"` 7%, `"M"` 15% (the default), `"Q"` 25%, `"H"` 30%. A higher level makes the code denser. A value too long for a code is an error; shorten it, or pass `level="L"`, which holds the most.
- `label` names the code for a screen reader. It defaults to the value.
- `class` and `style` go on the `<svg>`.
- It needs nothing from Node or the file system, so it runs on Bun, Node, and Cloudflare Workers alike.
