import type { ContentsEntry, SlideContext } from "@hinote/types";
import { HinoteError } from "../errors.ts";
import { Link } from "./link.tsx";

export type ContentsProps = {
  // The context the slide's render function received.
  slide: SlideContext;
  // How many levels of nested sections to list. Every level when omitted.
  depth?: number;
  // Leaves out the section the slide is in, the innermost one, such as the
  // section a contents page sits in itself.
  skipCurrent?: boolean;
  class?: string;
};

// The innermost section the slide is in: current, with no current section inside.
function isOwn(entry: ContentsEntry): boolean {
  return entry.current && !entry.sections.some((inner) => inner.current);
}

function Entries(props: {
  entries: readonly ContentsEntry[];
  depth: number;
  skipCurrent: boolean;
}) {
  const entries = props.skipCurrent
    ? props.entries.filter((entry) => !isOwn(entry))
    : props.entries;
  return (
    <ol>
      {entries.map((entry) => {
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
              <Entries
                entries={entry.sections}
                depth={props.depth - 1}
                skipCurrent={props.skipCurrent}
              />
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
      <Entries
        entries={props.slide.contents}
        depth={depth}
        skipCurrent={props.skipCurrent === true}
      />
    </nav>
  );
}
