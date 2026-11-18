import type { Child } from "hono/jsx";
import { HinoteError } from "../errors.ts";

export type LayoutProps = {
  gap?: string | number;
  align?: string;
  justify?: string;
  children?: Child;
};

function cssToken(value: string, label: string): string {
  // Control characters are what this rejects.
  // oxlint-disable-next-line no-control-regex
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

// Props become CSS variables on the element. The real flex rules live on
// `.hinote-row` / `.hinote-column` / `.hinote-center` in `@layer hinote`, so
// deck CSS in a later layer can override gap, alignment, and width without
// `!important`.
function layoutVars(props: LayoutProps): Record<string, string> | undefined {
  const style: Record<string, string> = {};
  const gap = gapValue(props.gap);
  if (gap !== undefined) style["--hinote-gap"] = gap;
  if (props.align !== undefined)
    style["--hinote-align"] = cssToken(props.align, "align");
  if (props.justify !== undefined)
    style["--hinote-justify"] = cssToken(props.justify, "justify");
  return Object.keys(style).length > 0 ? style : undefined;
}

export function Column(props: LayoutProps) {
  return (
    <div class="hinote-column" style={layoutVars(props)}>
      {props.children}
    </div>
  );
}

export function Row(props: LayoutProps) {
  return (
    <div class="hinote-row" style={layoutVars(props)}>
      {props.children}
    </div>
  );
}

export function Center(props: LayoutProps) {
  return (
    <div class="hinote-center" style={layoutVars(props)}>
      {props.children}
    </div>
  );
}
