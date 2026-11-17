import { jsx, type Child } from "hono/jsx";
import { HinoteError } from "./errors.ts";

export type StepProps = {
  // 1-based step that reveals this element. Without it, steps count up in document order.
  at?: number;
  // Element to render, such as "li" inside a list. Defaults to "div".
  as?: string;
  class?: string;
  children?: Child;
};

// Hono/JSX calls components while the slide is turned into a string, so the
// counter is set for exactly that synchronous call. See `withStepCounter`.
let counter: { next: number } | undefined;

export function withStepCounter<T>(render: () => T): T {
  const previous = counter;
  counter = { next: 1 };
  try {
    return render();
  } finally {
    counter = previous;
  }
}

const TAG = /^[a-z][a-z0-9-]*$/;

export function Step(props: StepProps) {
  if (!counter)
    throw new HinoteError("<Step> can only be used inside a slide.");
  let at = props.at;
  if (at === undefined) at = counter.next;
  else if (!Number.isInteger(at) || at < 1)
    throw new HinoteError("<Step at> must be a positive integer.");
  counter.next = Math.max(counter.next, at + 1);
  const tag = props.as ?? "div";
  if (!TAG.test(tag))
    throw new HinoteError(`<Step as="${tag}"> must be a lowercase tag name.`);
  return jsx(
    tag,
    { "data-hinote-step": String(at), class: props.class },
    props.children,
  );
}
