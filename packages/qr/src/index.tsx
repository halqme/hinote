import type { HinoteErrorLike } from "@hinote/types";
import { raw } from "hono/html";
import { encode } from "uqr";

export type QrProps = {
  // What the code holds, usually a URL.
  value: string;
  // The width and height, as a CSS length or a number of pixels. The default
  // is a third of the 1080-pixel canvas.
  size?: number | string;
  // How much of the code can be lost and still read: L 7%, M 15%, Q 25%,
  // H 30%. More makes the code denser.
  level?: "L" | "M" | "Q" | "H";
  // The dark modules and the light ones around them. They default to the
  // deck's text and background colors.
  color?: string;
  background?: string;
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

// A reader needs four light modules around the code.
const QUIET_ZONE = 4;

function escape(text: string): string {
  return text.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
}

// The dark modules as one path, a rectangle for each run in a row, in
// module units with the quiet zone included.
function modules(data: boolean[][]): string {
  let d = "";
  data.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x++;
        continue;
      }
      const start = x;
      while (row[x]) x++;
      d += `M${start + QUIET_ZONE} ${y + QUIET_ZONE}h${x - start}v1h${start - x}z`;
    }
  });
  return d;
}

// A QR code as inline SVG, drawn while the slide renders, so the page loads
// no script or image for it. It is drawn in the deck's text color on its
// background, so it suits the theme.
export function Qr(props: QrProps) {
  if (typeof props.value !== "string" || props.value === "")
    throw new QrError(
      "<Qr> needs what the code holds as `value`.",
      'Pass the text or URL as a string: <Qr value="https://example.com" />',
    );
  const level = props.level ?? "M";
  if (!LEVELS.has(level))
    throw new QrError(
      `<Qr level="${level}"> is not an error correction level.`,
      'Use "L", "M", "Q", or "H".',
    );

  let data: boolean[][];
  try {
    ({ data } = encode(props.value, { ecc: level, border: 0 }));
  } catch {
    throw new QrError(
      `<Qr> cannot hold its value: ${props.value.length} characters is more than a QR code holds at level ${level}.`,
      level === "L"
        ? "Shorten the value, such as with a shorter URL."
        : 'Shorten the value, or pass level="L", which holds the most.',
    );
  }

  const side = data.length + QUIET_ZONE * 2;
  const size =
    typeof props.size === "number"
      ? `${props.size}px`
      : (props.size ?? "360px");
  const color = escape(props.color ?? "var(--hinote-color-fg)");
  const background = escape(props.background ?? "var(--hinote-color-bg)");
  const attributes = [
    'xmlns="http://www.w3.org/2000/svg"',
    `viewBox="0 0 ${side} ${side}"`,
    `width="${escape(size)}"`,
    `height="${escape(size)}"`,
    'role="img"',
    `aria-label="${escape(props.label ?? props.value)}"`,
    'shape-rendering="crispEdges"',
    ...(props.class === undefined ? [] : [`class="${escape(props.class)}"`]),
    ...(props.style === undefined ? [] : [`style="${escape(props.style)}"`]),
  ];
  return raw(
    `<svg ${attributes.join(" ")}><rect width="${side}" height="${side}" fill="${background}"/><path fill="${color}" d="${modules(data)}"/></svg>`,
  );
}
