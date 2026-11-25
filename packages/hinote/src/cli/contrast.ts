import type { Theme } from "@hinote/core";

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

// The contrast a drawing on the slide asks for, written by a component as
// `data-hinote-contrast` (ContrastCheck in @hinote/types), such as the colors
// a deck passes to <Qr>.
export type MarkupContrast = {
  name: string;
  fg: string[];
  bg?: string;
  min: number;
  dark?: boolean;
};

function isMarkupContrast(value: unknown): value is MarkupContrast {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof value.name === "string" &&
    "fg" in value &&
    Array.isArray(value.fg) &&
    value.fg.every((c) => typeof c === "string") &&
    (!("bg" in value) || typeof value.bg === "string") &&
    "min" in value &&
    typeof value.min === "number" &&
    (!("dark" in value) || typeof value.dark === "boolean")
  );
}

const NAMED: Record<string, string> = { white: "#ffffff", black: "#000000" };

// A color as the slide draws it: theme variables and currentColor (the
// theme's text color) read from the slide's theme.
function resolveColor(value: string, theme: Theme): Rgb | undefined {
  const text = value.trim();
  if (text.toLowerCase() === "currentcolor")
    return resolveColor(theme.colors?.fg ?? "", theme);
  const variable = /^var\(\s*--hinote-color-([a-z0-9-]+)\s*\)$/i.exec(text);
  if (variable) {
    const token = theme.colors?.[variable[1]!];
    return token === undefined ? undefined : resolveColor(token, theme);
  }
  return parseCssColor(NAMED[text.toLowerCase()] ?? text);
}

export function markupContrastWarnings(
  html: string,
  theme: Theme,
): { code: "contrast"; message: string; hint: string }[] {
  const warnings: { code: "contrast"; message: string; hint: string }[] = [];
  for (const [, json] of html.matchAll(/\sdata-hinote-contrast="([^"]*)"/g)) {
    let check: unknown;
    try {
      check = JSON.parse(
        json!
          .replaceAll("&quot;", '"')
          .replaceAll("&#39;", "'")
          .replaceAll("&lt;", "<")
          .replaceAll("&gt;", ">")
          .replaceAll("&amp;", "&"),
      );
    } catch {
      continue;
    }
    if (!isMarkupContrast(check)) continue;
    const bgValue = check.bg ?? "var(--hinote-color-bg)";
    const bg =
      bgValue.trim() === "transparent"
        ? resolveColor("var(--hinote-color-bg)", theme)
        : resolveColor(bgValue, theme);
    for (const fgValue of check.fg) {
      const fg = resolveColor(fgValue, theme);
      const unknown = [...(fg ? [] : [fgValue]), ...(bg ? [] : [bgValue])];
      if (unknown.length > 0) {
        warnings.push({
          code: "contrast",
          message: `${check.name}: cannot tell the contrast of ${unknown.map((v) => `"${v}"`).join(" and ")}.`,
          hint: "Write the color as #rgb, #rrggbb, rgb(), white, black, or var(--hinote-color-<name>) so hinote check can compare it.",
        });
        continue;
      }
      const ratio = contrastRatio(fg!, bg!);
      const name = `${check.name}: ${fgValue} on ${check.bg ?? "the slide's background"}`;
      if (ratio < check.min)
        warnings.push({
          code: "contrast",
          message: `${name} is ${formatRatio(ratio)}:1 (need ${check.min}:1).`,
          hint: "Make one of the two colors darker or lighter until the pair reaches it.",
        });
      else if (check.dark && relativeLuminance(fg!) > relativeLuminance(bg!))
        warnings.push({
          code: "contrast",
          message: `${name} is light on dark, which some scanners cannot read.`,
          hint: "Make the drawn color the darker one of the two.",
        });
    }
  }
  return warnings;
}
