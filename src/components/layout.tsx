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
  // Pinned to the card's last row. Cards in a Grid end on the same row, so
  // footers such as a source line up across columns.
  footer?: Child;
  class?: string;
  children?: Child;
};

export type FlowProps = {
  // Which box to emphasize, counted from 1 in reading order.
  emphasis?: number;
  gap?: string | number;
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
  // Every Card spans the most rows any Card here has, so the cards in a band
  // end on the same line and each footer sits in the same last track. Set even
  // when no Card is visible here, so a nested Grid never inherits the outer one.
  const style: Record<string, string> = {
    "--hinote-grid-rows": String(
      Math.max(1, ...childList(props.children).map(cardRows)),
    ),
  };
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

// The rows a Card child of Grid takes: one per child, plus its footer.
// Anything else, including a component that wraps a Card, counts as none; that
// Card still spans its own rows.
function cardRows(child: Child): number {
  if (typeof child !== "object" || child === null || !("tag" in child))
    return 0;
  if (child.tag !== Card) return 0;
  const props = child.props as CardProps;
  return (
    Math.max(childList(props.children).length, 1) +
    (childList(props.footer).length > 0 ? 1 : 0)
  );
}

// One cell of a Grid. Direct children are the card's rows (heading, body, …);
// `footer` is one more row, always the card's last.
export function Card(props: CardProps) {
  const rows = childList(props.children);
  const footer = childList(props.footer);
  const style: Record<string, string> = {
    "--hinote-card-rows": String(
      Math.max(rows.length, 1) + (footer.length > 0 ? 1 : 0),
    ),
  };
  if (props.span !== undefined)
    style["--hinote-card-span"] = String(positiveInt(props.span, "span"));
  return (
    <div class={classNames("hinote-card", props.class)} style={style}>
      {rows.map((child) => (
        <div class="hinote-card-cell">{child}</div>
      ))}
      {footer.length > 0 && (
        <div class="hinote-card-cell hinote-card-footer">{props.footer}</div>
      )}
    </div>
  );
}

// Boxes in reading order with an arrow between each pair. Each child is one
// box, so two boxes and three boxes are the same component. The arrow is a
// CSS ::before on `.hinote-flow-arrow`, so deck CSS can redraw it.
export function Flow(props: FlowProps) {
  const boxes = childList(props.children);
  if (
    props.emphasis !== undefined &&
    positiveInt(props.emphasis, "emphasis") > boxes.length
  )
    throw new HinoteError(
      `emphasis is ${props.emphasis}, but this Flow has ${boxes.length} box${boxes.length === 1 ? "" : "es"}.`,
    );
  const gap = gapValue(props.gap);
  return (
    <div
      class={classNames("hinote-flow", props.class)}
      style={gap === undefined ? undefined : { "--hinote-gap": gap }}
    >
      {boxes.flatMap((child, index) => [
        ...(index > 0
          ? [<span class="hinote-flow-arrow" aria-hidden="true" />]
          : []),
        <div
          class={
            index + 1 === props.emphasis
              ? "hinote-flow-box is-emphasis"
              : "hinote-flow-box"
          }
        >
          {child}
        </div>,
      ])}
    </div>
  );
}
