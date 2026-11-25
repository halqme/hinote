# hinote showcase

An English deck that uses every package in this workspace: `<Code>`, `<Chart>`, `<D2>`, `<Mermaid>`, and `<Math>`, with the layout components, links, nested sections, `<Morph>`, `<Step>`, and scripts that run in the browser, including a k-means figure stepped by buttons on the slide. It depends on the packages through `workspace:*`, so it shows what the source in `packages/` does now.

`deck.tsx` holds the order. The theme and the shared pieces live in `parts.tsx`. Cover and end are single slides. The other files in `slides/` are nested decks, one section each, and `contents.tsx` lists them.

The packages resolve to their built `dist/`, so build them first:

```sh
# at the repository root
bun install
bun run build

# here
bun run dev        # present at http://localhost:4321
bun run build      # dist/index.html, one file
bun run check
bun run snapshot   # shots/<n>.png
```

Rebuild the packages after changing their source. `snapshot` photographs a chart while its bars are still growing in.
