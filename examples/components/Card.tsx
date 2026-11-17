import type { Child } from "hono/jsx";

// A panel on the theme's own `surface` color. `accent` outlines it.
// `step` reveals the card on that step: any element with data-hinote-step
// works like <Step>, and the card itself stays the flex item in a Row.
export function Card(props: {
  title: string;
  accent?: boolean;
  step?: number;
  children?: Child;
}) {
  return (
    <div
      data-hinote-step={props.step}
      style={{
        flex: "1",
        padding: "calc(var(--hinote-space-unit) * 5)",
        borderRadius: "var(--hinote-radius)",
        background: "var(--hinote-color-surface)",
        border: `3px solid ${props.accent ? "var(--hinote-color-accent)" : "transparent"}`,
      }}
    >
      <h3 style={{ marginBottom: "0.5em" }}>{props.title}</h3>
      {props.children}
    </div>
  );
}
