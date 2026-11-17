import type { Child } from "hono/jsx";

// A panel styled by `.card` in ../style.css. `accent` outlines it.
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
      class={props.accent ? "card accent" : "card"}
      data-hinote-step={props.step}
    >
      <h3>{props.title}</h3>
      {props.children}
    </div>
  );
}
