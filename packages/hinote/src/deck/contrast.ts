import type { Theme } from "./theme.ts";

// Theme tokens hinote's own CSS uses for text and the surfaces they sit on.
const TEXT_TOKENS = ["fg", "muted", "accent"] as const;
const SURFACE_TOKENS = ["bg", "surface"] as const;

export const CONTRAST_MIN = 7;

export type ContrastWarning = {
  code: "contrast";
  message: string;
  slides: number[];
  hint: string;
};

type Rgb = { r: number; g: number; b: number };

// Only #rgb, #rrggbb, and opaque rgb(...). var(), color-mix(), hsl(), and
// anything with alpha are skipped so check neither warns nor fails on them.
export function parseCssColor(value: string): Rgb | undefined {
  const text = value.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (hex) {
    let body = hex[1]!;
    if (body.length === 3)
      body = body
        .split("")
        .map((ch) => ch + ch)
        .join("");
    return {
      r: Number.parseInt(body.slice(0, 2), 16),
      g: Number.parseInt(body.slice(2, 4), 16),
      b: Number.parseInt(body.slice(4, 6), 16),
    };
  }
  const rgb =
    /^rgb\(\s*([^\s,/]+)\s*[, ]\s*([^\s,/]+)\s*[, ]\s*([^\s,/]+)\s*(?:[,/]\s*([^\s)]+)\s*)?\)$/i.exec(
      text,
    );
  if (!rgb) return undefined;
  if (rgb[4] !== undefined && !isOpaqueAlpha(rgb[4])) return undefined;
  const r = parseRgbChannel(rgb[1]!);
  const g = parseRgbChannel(rgb[2]!);
  const b = parseRgbChannel(rgb[3]!);
  if (r === undefined || g === undefined || b === undefined) return undefined;
  return { r, g, b };
}

function isOpaqueAlpha(value: string): boolean {
  const text = value.trim();
  if (text.endsWith("%")) {
    const n = Number.parseFloat(text.slice(0, -1));
    return Number.isFinite(n) && Math.abs(n - 100) < 1e-9;
  }
  const n = Number.parseFloat(text);
  return Number.isFinite(n) && Math.abs(n - 1) < 1e-9;
}

function parseRgbChannel(value: string): number | undefined {
  const text = value.trim();
  if (text.endsWith("%")) {
    const n = Number.parseFloat(text.slice(0, -1));
    if (!Number.isFinite(n) || n < 0 || n > 100) return undefined;
    return (n / 100) * 255;
  }
  const n = Number.parseFloat(text);
  if (!Number.isFinite(n) || n < 0 || n > 255) return undefined;
  return n;
}

function channelLuminance(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color: Rgb): number {
  return (
    0.2126 * channelLuminance(color.r) +
    0.7152 * channelLuminance(color.g) +
    0.0722 * channelLuminance(color.b)
  );
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function formatRatio(ratio: number): string {
  return (Math.round(ratio * 100) / 100).toFixed(2);
}

// One warning per failing text×surface pair on this theme. Callers attach
// slide numbers; check groups identical messages across slides.
export function contrastWarningsForTheme(
  theme: Theme,
): Omit<ContrastWarning, "slides">[] {
  const colors = theme.colors ?? {};
  const warnings: Omit<ContrastWarning, "slides">[] = [];
  for (const text of TEXT_TOKENS) {
    for (const surface of SURFACE_TOKENS) {
      const textValue = colors[text];
      const surfaceValue = colors[surface];
      if (textValue === undefined || surfaceValue === undefined) continue;
      const textColor = parseCssColor(textValue);
      const surfaceColor = parseCssColor(surfaceValue);
      if (!textColor || !surfaceColor) continue;
      const ratio = contrastRatio(textColor, surfaceColor);
      if (ratio >= CONTRAST_MIN) continue;
      warnings.push({
        code: "contrast",
        message: `colors.${text} on colors.${surface} is ${formatRatio(ratio)}:1 (need ${CONTRAST_MIN}:1).`,
        hint: `Change colors.${text} or colors.${surface} until the pair reaches ${CONTRAST_MIN}:1.`,
      });
    }
  }
  return warnings;
}
