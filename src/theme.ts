import { HinoteError } from "./errors.ts";

// Each group holds named tokens. The listed names are the ones hinote's own CSS
// reads; any other name is allowed and becomes a CSS variable the same way.
type Tokens<Known extends string> = { [K in Known]?: string } & {
  [name: string]: string | undefined;
};

export type Theme = {
  colors?: Tokens<"bg" | "fg" | "accent" | "muted">;
  fonts?: Tokens<"base" | "heading" | "mono">;
  typography?: Tokens<"h1" | "h2" | "body" | "small" | "code">;
  shadows?: Tokens<"sm" | "md" | "lg">;
  spacing?: Tokens<"unit">;
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

export const defaultTheme: Theme = {
  colors: { bg: "#0f1115", fg: "#f4f4f5", accent: "#7dd3fc", muted: "#a1a1aa" },
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
    code: "1.25rem",
  },
  shadows: {
    sm: "0 1px 2px rgb(0 0 0 / 0.3)",
    md: "0 8px 24px rgb(0 0 0 / 0.35)",
    lg: "0 24px 48px rgb(0 0 0 / 0.45)",
  },
  spacing: { unit: "8px" },
  radius: "12px",
};

// Token names become part of a CSS variable name.
const TOKEN_NAME = /^[A-Za-z][A-Za-z0-9-]*$/;

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
