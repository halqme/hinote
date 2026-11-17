import type { Child } from "hono/jsx";
import { HinoteError } from "./errors.ts";

export type LayoutProps = {
  gap?: string | number;
  align?: string;
  justify?: string;
  children?: Child;
};

function cssToken(value: string, label: string): string {
  if (value.trim() === "" || /[<>;{}]|[\u0000-\u001f]/.test(value)) {
    throw new HinoteError(
      `${label} must be a CSS value without braces or semicolons.`,
    );
  }
  return value;
}

function gapValue(gap: string | number | undefined): string | undefined {
  if (gap === undefined) return undefined;
  if (typeof gap === "number") {
    if (!Number.isFinite(gap))
      throw new HinoteError("gap must be a finite number or a CSS length.");
    return `calc(var(--hinote-space-unit) * ${gap})`;
  }
  return cssToken(gap, "gap");
}

function layoutStyle(
  direction: "row" | "column",
  props: LayoutProps,
  defaults: { align: string; justify: string; flex?: string },
): Record<string, string> {
  const style: Record<string, string> = {
    display: "flex",
    "flex-direction": direction,
    "align-items": cssToken(props.align ?? defaults.align, "align"),
    "justify-content": cssToken(props.justify ?? defaults.justify, "justify"),
    width: "100%",
  };
  const gap = gapValue(props.gap);
  if (gap !== undefined) style.gap = gap;
  if (defaults.flex) style.flex = defaults.flex;
  return style;
}

export function Column(props: LayoutProps) {
  return (
    <div
      style={layoutStyle("column", props, {
        align: "stretch",
        justify: "start",
      })}
    >
      {props.children}
    </div>
  );
}

export function Row(props: LayoutProps) {
  return (
    <div
      style={layoutStyle("row", props, { align: "stretch", justify: "start" })}
    >
      {props.children}
    </div>
  );
}

export function Center(props: LayoutProps) {
  return (
    <div
      style={layoutStyle("column", props, {
        align: "center",
        justify: "center",
        flex: "1",
      })}
    >
      {props.children}
    </div>
  );
}
