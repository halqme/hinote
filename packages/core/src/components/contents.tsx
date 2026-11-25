import type { ContentsEntry, SlideContext } from "@hinote/types";
import { HinoteError } from "../errors.ts";
import { Link } from "./link.tsx";

export type ContentsProps = {
  // The context the slide's render function received.
  slide: SlideContext;
  // How many levels of nested sections to list. Every level when omitted.
  depth?: number;
  class?: string;
};

function Entries(props: { entries: readonly ContentsEntry[]; depth: number }) {
  return (
    <ol>
      {props.entries.map((entry) => {
        const label = [
          <span class="hinote-contents-name">{entry.name}</span>,
          entry.title === undefined ? null : (
            <span class="hinote-contents-title">{entry.title}</span>
          ),
        ];
        return (
          <li
            class={
              entry.current
                ? "hinote-contents-item is-current"
                : "hinote-contents-item"
            }
            aria-current={entry.current ? "true" : undefined}
          >
            {entry.id === undefined ? (
              <span class="hinote-contents-entry">{label}</span>
            ) : (
              <Link to={entry.id} class="hinote-contents-entry">
                {label}
              </Link>
            )}
            {props.depth > 1 && entry.sections.length > 0 && (
              <Entries entries={entry.sections} depth={props.depth - 1} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// The deck's sections as a list, each a link to the section's first slide
// when that slide has an id. The section the slide is in is `is-current`.
export function Contents(props: ContentsProps) {
  const depth = props.depth ?? Infinity;
  if (depth !== Infinity && !(Number.isInteger(depth) && depth > 0))
    throw new HinoteError(
      `<Contents depth> must be a positive integer, not ${String(props.depth)}.`,
    );
  return (
    <nav
      class={props.class ? `hinote-contents ${props.class}` : "hinote-contents"}
    >
      <Entries entries={props.slide.contents} depth={depth} />
    </nav>
  );
}
