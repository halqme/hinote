import type { Child } from "hono/jsx";
import { HinoteError } from "../errors.ts";

export type LayoutProps = {
  gap?: string | number;
  align?: string;
  justify?: string;
  children?: Child;
};

export type GridProps = {
  // Number of columns. Defaults to 2 in CSS when omitted.
  columns?: number;
  gap?: string | number;
  class?: string;
  children?: Child;
};

export type CardProps = {
  // How many grid columns this card spans. Defaults to 1.
  span?: number;
  class?: string;
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

function positiveInt(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1)
    throw new HinoteError(`${label} must be a positive integer.`);
  return value;
}

// Flatten JSX children so each visible child is one Card row. Hono drops
// whitespace between tags, so a typical <Card><h3/><p/></Card> is two rows.
function childList(children: Child): Child[] {
  if (children == null || children === false || children === true) return [];
  if (Array.isArray(children)) return children.flatMap(childList);
  return [children];
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

function classNames(
  base: string,
  extra: string | undefined,
): string | undefined {
  if (!extra) return base;
  return `${base} ${extra}`;
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

// Columns for a band of Cards. Each Card spans N parent rows (one per child)
// with `grid-template-rows: subgrid`, so cards in the same band share row
// heights: a taller heading stretches every card's heading track.
export function Grid(props: GridProps) {
  const style: Record<string, string> = {};
  if (props.columns !== undefined)
    style["--hinote-grid-columns"] = String(
      positiveInt(props.columns, "columns"),
    );
  const gap = gapValue(props.gap);
  if (gap !== undefined) style["--hinote-gap"] = gap;
  return (
    <div
      class={classNames("hinote-grid", props.class)}
      style={Object.keys(style).length > 0 ? style : undefined}
    >
      {props.children}
    </div>
  );
}

// One cell of a Grid. Direct children are the card's rows (heading, body, …).
export function Card(props: CardProps) {
  const rows = childList(props.children);
  const style: Record<string, string> = {
    "--hinote-card-rows": String(Math.max(rows.length, 1)),
  };
  if (props.span !== undefined)
    style["--hinote-card-span"] = String(positiveInt(props.span, "span"));
  return (
    <div class={classNames("hinote-card", props.class)} style={style}>
      {rows.map((child) => (
        <div class="hinote-card-cell">{child}</div>
      ))}
    </div>
  );
}
