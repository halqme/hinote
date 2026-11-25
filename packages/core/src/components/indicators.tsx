// Where the talk is, drawn from the deck's sections: the sections in a row,
// a dot for each slide of the current section, and a bar through the deck.
import type { ContentsEntry, SlideContext } from "@hinote/types";
import { Link } from "./link.tsx";

export type IndicatorProps = {
  // The context the slide's render function received.
  slide: SlideContext;
  class?: string;
};

function classNames(base: string, extra: string | undefined) {
  return extra ? `${base} ${extra}` : base;
}

// The innermost section the slide is in, or undefined outside every section.
function ownSection(
  entries: readonly ContentsEntry[],
): ContentsEntry | undefined {
  const entry = entries.find((candidate) => candidate.current);
  return entry && (ownSection(entry.sections) ?? entry);
}

// The outermost sections in a row, each a link to its first slide when that
// slide has an id. The one the slide is in is `is-current`.
export function SectionBar(props: IndicatorProps) {
  return (
    <nav class={classNames("hinote-section-bar", props.class)}>
      <ol>
        {props.slide.contents.map((entry) => (
          <li
            class={
              entry.current
                ? "hinote-section-bar-item is-current"
                : "hinote-section-bar-item"
            }
            aria-current={entry.current ? "true" : undefined}
          >
            {entry.id === undefined ? (
              <span class="hinote-section-bar-name">{entry.name}</span>
            ) : (
              <Link to={entry.id} class="hinote-section-bar-name">
                {entry.name}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

// One dot for each slide of the innermost section the slide is in, this
// slide's dot `is-current`. Nothing outside every section.
export function SectionDots(props: IndicatorProps) {
  const section = ownSection(props.slide.contents);
  if (section === undefined) return null;
  const at = props.slide.number - section.first;
  return (
    <ol
      class={classNames("hinote-section-dots", props.class)}
      aria-label={`${section.name}: slide ${at + 1} of ${section.count}`}
    >
      {Array.from({ length: section.count }, (_, index) => (
        <li class={index === at ? "is-current" : undefined} />
      ))}
    </ol>
  );
}

// A bar filled as far as this slide is through the deck, with a tick where
// each outermost section after the first slide starts.
export function Progress(props: IndicatorProps) {
  const { number, total } = props.slide;
  return (
    <div
      class={classNames("hinote-progress", props.class)}
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={number}
      style={{ "--hinote-progress": String(number / total) }}
    >
      <span class="hinote-progress-bar" />
      {props.slide.contents
        .filter((entry) => entry.first > 1)
        .map((entry) => (
          <span
            class="hinote-progress-tick"
            style={{ "--hinote-at": String((entry.first - 1) / total) }}
          />
        ))}
    </div>
  );
}
