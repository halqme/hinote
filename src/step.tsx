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

// Components may be async, so a step cannot know its place while it renders.
// It writes `auto`, and `numberSteps` numbers the finished slide in document order.
const AUTO = "auto";

export function numberSteps(html: string): string {
  let next = 1;
  return html.replace(/ data-hinote-step="(auto|\d+)"/g, (_, value: string) => {
    const at = value === AUTO ? next : Number(value);
    next = Math.max(next, at + 1);
    return ` data-hinote-step="${at}"`;
  });
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
