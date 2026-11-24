import { jsx, type Child } from "hono/jsx";
import { HinoteError } from "../errors.ts";

export type StepProps = {
  // 1-based step that reveals this element. Without it, steps count up in document order.
  at?: number;
  // Element to render, such as "li" inside a list. Defaults to "div".
  as?: string;
  class?: string;
  children?: Child;
};

// Components may be async, so a step cannot know its place while it renders.
// It writes `auto`, and `numberSteps` numbers the finished slide in document
// order. An element that reserves steps for itself writes
// `data-hinote-steps="auto:N"` and gets the next N, as `data-hinote-steps="from-to"`.
const AUTO = "auto";

const STEPS = / data-hinote-step(s?)="(auto|\d+|auto:\d+)"/g;

export function numberSteps(html: string): string {
  let next = 1;
  return html.replace(STEPS, (whole, many: string, value: string) => {
    if (many) {
      const count = Number(value.slice(AUTO.length + 1));
      if (!(count >= 1)) return whole;
      const from = next;
      next += count;
      return ` data-hinote-steps="${from}-${next - 1}"`;
    }
    const at = value === AUTO ? next : Number(value);
    next = Math.max(next, at + 1);
    return ` data-hinote-step="${at}"`;
  });
}

// Every step a finished slide uses, reserved ranges included.
export function stepsIn(html: string): Set<number> {
  const steps = new Set<number>();
  for (const [, at] of html.matchAll(/ data-hinote-step="(\d+)"/g))
    steps.add(Number(at));
  for (const [, from, to] of html.matchAll(/ data-hinote-steps="(\d+)-(\d+)"/g))
    for (let at = Number(from); at <= Number(to); at++) steps.add(at);
  return steps;
}

const TAG = /^[a-z][a-z0-9-]*$/;

export function Step(props: StepProps) {
  const { at } = props;
  if (at !== undefined && (!Number.isInteger(at) || at < 1))
    throw new HinoteError("<Step at> must be a positive integer.");
  const tag = props.as ?? "div";
  if (!TAG.test(tag))
    throw new HinoteError(`<Step as="${tag}"> must be a lowercase tag name.`);
  return jsx(
    tag,
    {
      "data-hinote-step": at === undefined ? AUTO : String(at),
      class: props.class,
    },
    props.children,
  );
}

export type StepsProps = {
  // How many steps the element takes, numbered with the slide's other steps
  // in document order. Its script reads its own step with hinote.observe.
  count: number;
  // Element to render. Defaults to "div".
  as?: string;
  class?: string;
  children?: Child;
};

// Reserves steps for code in the page to play, such as a chart that changes
// at each one. Nothing inside is hidden: the script decides what a step does.
export function Steps(props: StepsProps) {
  const { count } = props;
  if (!Number.isInteger(count) || count < 1)
    throw new HinoteError("<Steps count> must be a positive integer.");
  const tag = props.as ?? "div";
  if (!TAG.test(tag))
    throw new HinoteError(`<Steps as="${tag}"> must be a lowercase tag name.`);
  return jsx(
    tag,
    { "data-hinote-steps": `${AUTO}:${count}`, class: props.class },
    props.children,
  );
}
