import { HinoteError } from "../errors.ts";

// Each group holds named tokens. The listed names are the ones hinote's own CSS
// reads; any other name is allowed and becomes a CSS variable the same way.
type Tokens<Known extends string> = { [K in Known]?: string } & {
  [name: string]: string | undefined;
};

export type Theme = {
  colors?: Tokens<"bg" | "fg" | "accent" | "muted" | "surface" | "border">;
  fonts?: Tokens<"base" | "heading" | "mono">;
  typography?: Tokens<"h1" | "h2" | "h3" | "body" | "small" | "code">;
  shadows?: Tokens<"sm" | "md" | "lg">;
  spacing?: Tokens<"unit" | "safe">;
  radius?: string;
};

// Group to CSS variable prefix: `colors.bg` is `--hinote-color-bg`.
const GROUPS = {
  colors: "color",
  fonts: "font",
  typography: "text",
  shadows: "shadow",
  spacing: "space",
} as const;

type Group = keyof typeof GROUPS;

const GROUP_NAMES = Object.keys(GROUPS) as Group[];

// The dark palette. `defaultTheme` uses the same colors, so a deck with no
// theme matches `themes.ink`.
const inkColors = {
  bg: "#0f1115",
  fg: "#f4f4f5",
  accent: "#7dd3fc",
  muted: "#a1a1aa",
  surface: "#181b22",
  border: "#2c313c",
};

// Named starting points. Pass one as a deck `theme` instead of writing a palette.
// Anything a preset leaves out stays at `defaultTheme`.
export const themes = {
  ink: { colors: { ...inkColors } },
  paper: {
    colors: {
      bg: "#f6f1e7",
      fg: "#1c1915",
      accent: "#843d07",
      muted: "#595047",
      surface: "#fffdf8",
      border: "#e3d8c8",
    },
    fonts: {
      heading: "Georgia, 'Hiragino Mincho ProN', 'Yu Mincho', serif",
    },
  },
  slate: {
    colors: {
      bg: "#f8fafc",
      fg: "#0f172a",
      accent: "#035a8b",
      muted: "#4b5769",
      surface: "#ffffff",
      border: "#e2e8f0",
    },
    radius: "8px",
  },
} as const satisfies Record<string, Theme>;

export const defaultTheme: Theme = {
  colors: { ...inkColors },
  fonts: {
    base: "system-ui, sans-serif",
    heading: "system-ui, sans-serif",
    mono: "ui-monospace, monospace",
  },
  // Sizes for a canvas 1080 px tall, where 1rem is 16px.
  typography: {
    h1: "6rem",
    h2: "3.5rem",
    h3: "2.75rem",
    body: "2.25rem",
    small: "1.5rem",
    code: "1.75rem",
  },
  shadows: {
    sm: "0 1px 2px rgb(0 0 0 / 0.3)",
    md: "0 8px 24px rgb(0 0 0 / 0.35)",
    lg: "0 24px 48px rgb(0 0 0 / 0.45)",
  },
  // `safe` is the inset from each canvas edge. Slide padding reads it, so a
  // deck that sets neither keeps the old 48px margin (unit × 6).
  spacing: { unit: "8px", safe: "calc(var(--hinote-space-unit) * 6)" },
  radius: "12px",
};

// Token names become part of a CSS variable name.
const TOKEN_NAME = /^[A-Za-z][A-Za-z0-9-]*$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function cssValue(value: string, label: string): string {
  // Control characters are what this rejects.
  // oxlint-disable-next-line no-control-regex
  if (/[<>{}]|[\u0000-\u001f]|;/.test(value)) {
    throw new HinoteError(
      `${label} cannot contain '<', '>', '{', '}', ';', or control characters.`,
    );
  }
  return value;
}

export function parseTheme(value: unknown, label = "theme"): Theme {
  if (!isPlainObject(value))
    throw new HinoteError(`${label} must be an object.`);
  const theme: Theme = {};
  for (const [key, group] of Object.entries(value)) {
    if (key === "radius") {
      if (typeof group !== "string")
        throw new HinoteError(`${label}.radius must be a string.`);
      theme.radius = cssValue(group, `${label}.radius`);
      continue;
    }
    if (!Object.hasOwn(GROUPS, key))
      throw new HinoteError(
        `${label}.${key} is not a theme group. Use ${GROUP_NAMES.join(", ")}, or radius.`,
      );
    if (!isPlainObject(group))
      throw new HinoteError(`${label}.${key} must be an object.`);
    const tokens: Record<string, string> = {};
    for (const [name, token] of Object.entries(group)) {
      if (!TOKEN_NAME.test(name))
        throw new HinoteError(
          `${label}.${key}.${name} must start with a letter and use only letters, digits, and '-'.`,
        );
      if (typeof token !== "string")
        throw new HinoteError(`${label}.${key}.${name} must be a string.`);
      tokens[name] = cssValue(token, `${label}.${key}.${name}`);
    }
    theme[key as Group] = tokens;
  }
  return theme;
}

// Tokens in `override` replace the same tokens in `base`; the rest are kept.
export function mergeTheme(base: Theme, override: Theme | undefined): Theme {
  if (!override) return base;
  const merged: Theme = {};
  for (const group of GROUP_NAMES) {
    if (base[group] || override[group])
      merged[group] = { ...base[group], ...override[group] };
  }
  const radius = override.radius ?? base.radius;
  if (radius !== undefined) merged.radius = radius;
  return merged;
}

// Only the tokens present become declarations, so a slide theme sets just
// what it changes and inherits the rest from the deck.
export function themeDeclarations(theme: Theme): Record<string, string> {
  const declarations: Record<string, string> = {};
  for (const group of GROUP_NAMES) {
    for (const [name, value] of Object.entries(theme[group] ?? {})) {
      if (value !== undefined)
        declarations[`--hinote-${GROUPS[group]}-${name}`] = value;
    }
  }
  if (theme.radius !== undefined)
    declarations["--hinote-radius"] = theme.radius;
  return declarations;
}

export function themeCss(theme: Theme): string {
  const body = Object.entries(themeDeclarations(theme))
    .map(([key, value]) => `${key}:${value}`)
    .join(";");
  return `:root{${body}}`;
}
