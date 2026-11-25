// The sections of a flattened deck, as <Contents> and SlideContext.contents
// show them.
import type { ContentsEntry } from "@hinote/types";
import type { Slide } from "./slide.ts";

type Section = {
  name: string;
  title?: string;
  id?: string;
  // Flattened indexes of its first slide and of the slide after its last.
  start: number;
  end: number;
  sections: Section[];
};

// A section is a run of slides that share it at the same depth, so two
// nested decks with one name next to each other read as one section.
export function outline(slides: readonly Slide[]): Section[] {
  const top: Section[] = [];
  let open: Section[] = [];
  for (const [index, slide] of slides.entries()) {
    const names = slide.sections ?? [];
    let same = 0;
    while (same < open.length && open[same]?.name === names[same]) same++;
    for (const section of open.slice(same)) section.end = index;
    open = open.slice(0, same);
    for (const name of names.slice(same)) {
      const section: Section = {
        name,
        title: slide.options.title,
        id: slide.options.id,
        start: index,
        end: slides.length,
        sections: [],
      };
      (open.at(-1)?.sections ?? top).push(section);
      open.push(section);
    }
  }
  return top;
}

// The outline as the slide at `index` sees it.
export function contentsAt(
  sections: readonly Section[],
  index: number,
): ContentsEntry[] {
  return sections.map((section) => ({
    name: section.name,
    ...(section.title === undefined ? {} : { title: section.title }),
    ...(section.id === undefined ? {} : { id: section.id }),
    current: section.start <= index && index < section.end,
    sections: contentsAt(section.sections, index),
  }));
}
