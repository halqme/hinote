import type { ContrastCheck, HinoteErrorLike } from "@hinote/types";
import { raw } from "hono/html";
import { QrCodeDataType, encode } from "uqr";

export type QrShape = "square" | "rounded" | "dot";

export type QrProps = {
  // What the code holds, usually a URL.
  value: string;
  // The width and height, as a CSS length or a number of pixels. The default
  // is a third of the 1080-pixel canvas.
  size?: number | string;
  // How much of the code can be lost and still read: L 7%, M 15%, Q 25%,
  // H 30%. More makes the code denser. A logo needs H.
  level?: "L" | "M" | "Q" | "H";
  // The modules' color, or two or more colors for a gradient from the top
  // left to the bottom right. The default is the color of the text around
  // the code.
  color?: string | string[];
  // The color under the code and its margin. The default is none, so the
  // slide shows through.
  background?: string;
  // The three corner squares' color. The default is `color`.
  finderColor?: string;
  // The modules' shape, and the corner squares'.
  shape?: QrShape;
  finder?: QrShape;
  // An image in the middle, by URL or a path relative to the deck, and its
  // width as a share of the code's.
  logo?: string;
  logoSize?: number;
  // The empty space around the code, in modules.
  margin?: number;
  // What the code is, for a screen reader. It defaults to the value.
  label?: string;
  class?: string;
  style?: string;
};

// hinote reports an error with this name as its own, message and all.
class QrError extends Error implements HinoteErrorLike {
  override readonly name = "HinoteError";
  readonly code = "qr";
  constructor(
    message: string,
    readonly hint?: string,
  ) {
    super(message);
  }
}

const LEVELS = new Set(["L", "M", "Q", "H"]);
const SHAPES = new Set(["square", "rounded", "dot"]);

// The quiet zone the QR standard asks for.
const MARGIN = 4;
// A logo hides modules the code must recover, so it stays under 30% of the
// width, 9% of the area, which level H recovers with room to spare.
const LOGO_MAX = 0.3;
// The contrast hinote check asks of colors a deck passes.
const CONTRAST_MIN = 4.5;

// The corner radius of a module of each shape, and of a corner square's
// ring, hole, and center.
const MODULE_RADIUS = { square: 0, rounded: 0.3, dot: 0.5 };
const FINDER_RADII = {
  square: [0, 0, 0],
  rounded: [2, 1.5, 1],
  dot: [3.5, 2.5, 1.5],
};

function escape(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}

// A rectangle with rounded corners as a closed subpath.
function box(x: number, y: number, w: number, h: number, r: number): string {
  if (r === 0) return `M${x} ${y}h${w}v${h}h${-w}z`;
  const s = w - 2 * r;
  const t = h - 2 * r;
  return (
    `M${x + r} ${y}h${s}a${r} ${r} 0 0 1 ${r} ${r}v${t}` +
    `a${r} ${r} 0 0 1 ${-r} ${r}h${-s}a${r} ${r} 0 0 1 ${-r} ${-r}` +
    `v${-t}a${r} ${r} 0 0 1 ${r} ${-r}z`
  );
}

// The modules outside the corner squares. Square ones are one rectangle per
// run in a row; the others one per module.
function modules(
  data: boolean[][],
  types: QrCodeDataType[][],
  hidden: (x: number, y: number) => boolean,
  shape: QrShape,
  m: number,
): string {
  const dark = (x: number, y: number) =>
    data[y]![x]! && types[y]![x] !== QrCodeDataType.Position && !hidden(x, y);
  let d = "";
  data.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!dark(x, y)) {
        x++;
        continue;
      }
      if (shape === "square") {
        const start = x;
        while (x < row.length && dark(x, y)) x++;
        d += box(start + m, y + m, x - start, 1, 0);
      } else {
        d += box(x + m, y + m, 1, 1, MODULE_RADIUS[shape]);
        x++;
      }
    }
  });
  return d;
}

// The three corner squares: a ring of 7 modules with a hole of 5, and a
// center of 3, filled even-odd.
function finders(size: number, shape: QrShape, m: number): string {
  const [ring, hole, center] = FINDER_RADII[shape];
  return [
    [0, 0],
    [size - 7, 0],
    [0, size - 7],
  ]
    .map(
      ([x, y]) =>
        box(x! + m, y! + m, 7, 7, ring!) +
        box(x! + m + 1, y! + m + 1, 5, 5, hole!) +
        box(x! + m + 2, y! + m + 2, 3, 3, center!),
    )
    .join("");
}

// A short, stable name for one code's gradient, so codes on one page keep
// theirs apart and the same code renders the same each time. FNV-1a.
function salt(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function check(props: QrProps, tag: string): void {
  if (typeof props.value !== "string" || props.value === "")
    throw new QrError(
      "<Qr> needs what the code holds as `value`.",
      'Pass the text or URL as a string: <Qr value="https://example.com" />',
    );
  if (props.level !== undefined && !LEVELS.has(props.level))
    throw new QrError(
      `${tag}: level "${props.level}" is not an error correction level.`,
      'Use "L", "M", "Q", or "H".',
    );
  for (const key of ["shape", "finder"] as const)
    if (props[key] !== undefined && !SHAPES.has(props[key]))
      throw new QrError(
        `${tag}: ${key} "${props[key]}" is not a shape.`,
        'Use "square", "rounded", or "dot".',
      );
  if (
    props.margin !== undefined &&
    !(Number.isInteger(props.margin) && props.margin >= 0)
  )
    throw new QrError(
      `${tag}: margin ${props.margin} is not a number of modules.`,
      `Pass a whole number of modules, such as the ${MARGIN} the QR standard asks for.`,
    );
  if (props.logo !== undefined) {
    const share = props.logoSize ?? 0.2;
    if (!(share > 0 && share <= LOGO_MAX))
      throw new QrError(
        `${tag}: logoSize ${share} hides more of the code than it can recover.`,
        `Pass a share of the code's width above 0 and up to ${LOGO_MAX}.`,
      );
    if (props.level !== undefined && props.level !== "H")
      throw new QrError(
        `${tag}: a logo needs level "H", which recovers the modules it hides.`,
        'Leave level out, or pass level="H".',
      );
  }
  if (Array.isArray(props.color) && props.color.length < 2)
    throw new QrError(
      `${tag}: a gradient needs two colors or more.`,
      'Pass one color as a string, or several: color={["#0ea5e9", "#6366f1"]}',
    );
}

// A QR code as inline SVG, drawn while the slide renders, so the page loads
// no script for it. It is drawn in the color of the text around it, with
// nothing under it, so it suits the theme.
export function Qr(props: QrProps) {
  const tag = `<Qr value="${props.value}">`;
  check(props, tag);
  const level = props.level ?? (props.logo === undefined ? "M" : "H");

  let code: ReturnType<typeof encode>;
  try {
    code = encode(props.value, { ecc: level, border: 0 });
  } catch {
    throw new QrError(
      `${tag} cannot hold its value: ${props.value.length} characters is more than a QR code holds at level ${level}.`,
      level === "L"
        ? "Shorten the value, such as with a shorter URL."
        : props.logo === undefined
          ? 'Shorten the value, or pass level="L", which holds the most.'
          : "Shorten the value, or leave out the logo, which needs level H.",
    );
  }

  const n = code.size;
  const m = props.margin ?? MARGIN;
  const side = n + 2 * m;

  // The logo's box, centered, in modules; the data modules under it are left
  // out, and level H recovers them.
  let logo = "";
  let hidden = (_x: number, _y: number) => false;
  if (props.logo !== undefined) {
    const width = Math.ceil(n * (props.logoSize ?? 0.2));
    const span = width + ((n - width) % 2);
    const start = (n - span) / 2;
    hidden = (x, y) =>
      code.types[y]![x] === QrCodeDataType.Data &&
      x >= start &&
      x < start + span &&
      y >= start &&
      y < start + span;
    logo = `<image href="${escape(props.logo)}" x="${start + m}" y="${start + m}" width="${span}" height="${span}" preserveAspectRatio="xMidYMid meet"/>`;
  }

  const colors =
    props.color === undefined
      ? undefined
      : Array.isArray(props.color)
        ? props.color
        : [props.color];
  let defs = "";
  let fill = escape(colors?.[0] ?? "currentColor");
  if (colors && colors.length > 1) {
    const id = `hinote-qr-${salt(JSON.stringify([props.value, colors, side]))}`;
    const stops = colors
      .map(
        (c, i) =>
          `<stop offset="${i / (colors.length - 1)}" stop-color="${escape(c)}"/>`,
      )
      .join("");
    defs = `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${side}" y2="${side}">${stops}</linearGradient></defs>`;
    fill = `url(#${id})`;
  }
  const finderFill =
    props.finderColor === undefined ? fill : escape(props.finderColor);

  // The colors the deck chose, for hinote check to compare. The modules must
  // be the darker side: a code that is light on dark is one some scanners
  // cannot read.
  // With none chosen, the code is the text's color on the slide, which the
  // theme's own contrast check covers.
  const contrast: ContrastCheck | undefined =
    colors || props.finderColor !== undefined || props.background !== undefined
      ? {
          name: tag,
          fg: [
            ...(colors ?? ["currentColor"]),
            ...(props.finderColor === undefined ? [] : [props.finderColor]),
          ],
          ...(props.background === undefined ? {} : { bg: props.background }),
          min: CONTRAST_MIN,
          dark: true,
        }
      : undefined;

  const size =
    typeof props.size === "number"
      ? `${props.size}px`
      : (props.size ?? "360px");
  const attributes = [
    'xmlns="http://www.w3.org/2000/svg"',
    `viewBox="0 0 ${side} ${side}"`,
    `width="${escape(size)}"`,
    `height="${escape(size)}"`,
    'role="img"',
    `aria-label="${escape(props.label ?? props.value)}"`,
    ...(contrast
      ? [`data-hinote-contrast="${escape(JSON.stringify(contrast))}"`]
      : []),
    ...(props.class === undefined ? [] : [`class="${escape(props.class)}"`]),
    ...(props.style === undefined ? [] : [`style="${escape(props.style)}"`]),
  ];
  const shape = props.shape ?? "square";
  return raw(
    `<svg ${attributes.join(" ")}>${defs}` +
      (props.background === undefined
        ? ""
        : `<rect width="${side}" height="${side}" fill="${escape(props.background)}"/>`) +
      `<path fill="${fill}"${shape === "square" ? ' shape-rendering="crispEdges"' : ""} d="${modules(code.data, code.types, hidden, shape, m)}"/>` +
      `<path fill="${finderFill}" fill-rule="evenodd" d="${finders(n, props.finder ?? "square", m)}"/>` +
      `${logo}</svg>`,
  );
}
