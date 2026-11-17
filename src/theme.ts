import { HinoteError } from "./errors.ts";

export type Theme = {
  colors: { bg: string; fg: string; accent: string; muted?: string };
  fonts: { base: string; heading?: string; mono?: string };
  typography: { h1?: string; h2?: string; body?: string; small?: string };
  shadows: { sm?: string; md?: string; lg?: string };
  spacing?: { unit?: string };
  radius?: string;
};

export type ThemeOverride = {
  colors?: Partial<Theme["colors"]>;
  fonts?: Partial<Theme["fonts"]>;
  typography?: Partial<Theme["typography"]>;
  shadows?: Partial<Theme["shadows"]>;
  spacing?: { unit?: string };
  radius?: string;
};

export const defaultTheme: Theme = {
  colors: {
    bg: "#0f1115",
    fg: "#f4f4f5",
    accent: "#7dd3fc",
    muted: "#a1a1aa",
  },
  fonts: {
    base: "system-ui, sans-serif",
    heading: "system-ui, sans-serif",
    mono: "ui-monospace, monospace",
  },
  typography: {
    h1: "4.5rem",
    h2: "2.5rem",
    body: "1.5rem",
    small: "1rem",
  },
  shadows: {
    sm: "0 1px 2px rgb(0 0 0 / 0.3)",
    md: "0 8px 24px rgb(0 0 0 / 0.35)",
    lg: "0 24px 48px rgb(0 0 0 / 0.45)",
  },
  spacing: { unit: "8px" },
  radius: "12px",
};

const GROUPS = {
  colors: ["bg", "fg", "accent", "muted"],
  fonts: ["base", "heading", "mono"],
  typography: ["h1", "h2", "body", "small"],
  shadows: ["sm", "md", "lg"],
  spacing: ["unit"],
} as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function cssValue(value: string, label: string): string {
  if (/[<>{}]|[\u0000-\u001f]|;/.test(value)) {
    throw new HinoteError(
      `${label} cannot contain '<', '>', '{', '}', ';', or control characters.`,
    );
  }
  return value;
}

export function parseThemeOverride(
  value: unknown,
  label = "theme",
): ThemeOverride {
  if (!isPlainObject(value))
    throw new HinoteError(`${label} must be an object.`);
  const override: ThemeOverride = {};
  for (const key of Object.keys(value)) {
    if (key === "radius") {
      if (typeof value.radius !== "string")
        throw new HinoteError(`${label}.radius must be a string.`);
      override.radius = cssValue(value.radius, `${label}.radius`);
      continue;
    }
    if (!Object.hasOwn(GROUPS, key))
      throw new HinoteError(`${label}.${key} is not a theme field.`);
    const group = value[key];
    if (!isPlainObject(group))
      throw new HinoteError(`${label}.${key} must be an object.`);
    const allowed = GROUPS[key as keyof typeof GROUPS] as readonly string[];
    const parsed: Record<string, string> = {};
    for (const prop of Object.keys(group)) {
      if (!allowed.includes(prop)) {
        throw new HinoteError(`${label}.${key}.${prop} is not a theme field.`);
      }
      const entry = group[prop];
      if (typeof entry !== "string")
        throw new HinoteError(`${label}.${key}.${prop} must be a string.`);
      parsed[prop] = cssValue(entry, `${label}.${key}.${prop}`);
    }
    if (key === "colors") override.colors = parsed;
    else if (key === "fonts") override.fonts = parsed;
    else if (key === "typography") override.typography = parsed;
    else if (key === "shadows") override.shadows = parsed;
    else override.spacing = parsed;
  }
  return override;
}

export function mergeTheme(
  base: Theme,
  override: ThemeOverride | undefined,
): Theme {
  if (!override) return base;
  return {
    colors: { ...base.colors, ...override.colors },
    fonts: { ...base.fonts, ...override.fonts },
    typography: { ...base.typography, ...override.typography },
    shadows: { ...base.shadows, ...override.shadows },
    spacing: { ...base.spacing, ...override.spacing },
    radius: override.radius ?? base.radius,
  };
}

export function themeDeclarations(theme: Theme): Record<string, string> {
  return {
    "--hinote-bg": theme.colors.bg,
    "--hinote-fg": theme.colors.fg,
    "--hinote-accent": theme.colors.accent,
    "--hinote-muted": theme.colors.muted ?? theme.colors.fg,
    "--hinote-font": theme.fonts.base,
    "--hinote-font-heading": theme.fonts.heading ?? theme.fonts.base,
    "--hinote-font-mono": theme.fonts.mono ?? "ui-monospace, monospace",
    "--hinote-h1": theme.typography.h1 ?? "4.5rem",
    "--hinote-h2": theme.typography.h2 ?? "2.5rem",
    "--hinote-body": theme.typography.body ?? "1.5rem",
    "--hinote-small": theme.typography.small ?? "1rem",
    "--hinote-shadow-sm": theme.shadows.sm ?? "none",
    "--hinote-shadow-md": theme.shadows.md ?? "none",
    "--hinote-shadow-lg": theme.shadows.lg ?? "none",
    "--hinote-space": theme.spacing?.unit ?? "8px",
    "--hinote-radius": theme.radius ?? "0px",
  };
}

export function themeCss(theme: Theme): string {
  const body = Object.entries(themeDeclarations(theme))
    .map(([key, value]) => `${key}:${value}`)
    .join(";");
  return `:root{${body}}`;
}
