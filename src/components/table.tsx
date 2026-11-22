import { jsx, type Child } from "hono/jsx";
import { HinoteError } from "../errors.ts";

export type TableProps = {
  // Column widths as a ratio, such as [2, 1, 1]. Omitted, the browser sizes
  // the columns from their content.
  widths?: number[];
  // Body rows to emphasize, counted from 1 and skipping thead and tfoot.
  emphasis?: number[];
  class?: string;
  children?: Child;
};

type Element = {
  tag: unknown;
  props: { children?: Child; [prop: string]: unknown };
};

function isElement(child: Child): child is Child & Element {
  return typeof child === "object" && child !== null && "tag" in child;
}

function children(value: Child | undefined): Child[] {
  if (value == null || value === false || value === true) return [];
  if (Array.isArray(value)) return value.flatMap(children);
  return [value];
}

function positiveNumbers(values: number[], label: string, integer: boolean) {
  for (const value of values)
    if (
      !Number.isFinite(value) ||
      value <= 0 ||
      (integer && !Number.isInteger(value))
    )
      throw new HinoteError(
        `<Table ${label}> must hold positive ${integer ? "integers" : "numbers"}.`,
      );
}

// A table written as ordinary <thead>, <tbody>, and <tr> markup. `widths`
// becomes one <col> per ratio, and `emphasis` marks body rows with
// `is-emphasis`. Widths and styles live in `@layer hinote`, so deck CSS can
// override them without `!important`.
export function Table(props: TableProps) {
  const widths = props.widths ?? [];
  const emphasis = new Set(props.emphasis ?? []);
  positiveNumbers(widths, "widths", false);
  positiveNumbers([...emphasis], "emphasis", true);
  const total = widths.reduce((sum, width) => sum + width, 0);

  let row = 0;
  const markRow = (child: Child): Child => {
    if (!isElement(child) || child.tag !== "tr") return child;
    row++;
    if (!emphasis.has(row)) return child;
    const { children: cells, class: extra, ...rest } = child.props;
    const marked =
      typeof extra === "string" && extra
        ? `${extra} is-emphasis`
        : "is-emphasis";
    return jsx("tr", { ...rest, class: marked }, ...children(cells));
  };
  const body = children(props.children).map((child) => {
    if (isElement(child) && child.tag === "tbody") {
      const { children: rows, ...rest } = child.props;
      return jsx("tbody", rest, ...children(rows).map(markRow));
    }
    return markRow(child);
  });
  const missing = [...emphasis].filter((n) => n > row);
  if (missing.length > 0)
    throw new HinoteError(
      `<Table emphasis> names row ${missing.join(", ")}, but the table has ${row} body row${row === 1 ? "" : "s"}.`,
    );

  return jsx(
    "table",
    {
      class: props.class ? `hinote-table ${props.class}` : "hinote-table",
      "data-hinote-widths": widths.length > 0 ? "" : undefined,
    },
    ...(widths.length > 0
      ? [
          jsx(
            "colgroup",
            {},
            ...widths.map((width) =>
              jsx("col", {
                style: {
                  "--hinote-column-width": `${+((width / total) * 100).toFixed(4)}%`,
                },
              }),
            ),
          ),
        ]
      : []),
    ...body,
  );
}
