# hinote showcase

An English deck that uses every package in this workspace: `<Code>`, `<Chart>`, `<D2>`, `<Mermaid>`, and `<Math>`, with `<Morph>`, `<Step effect>`, and the slide transitions. It depends on the packages through `workspace:*`, so it shows what the source in `packages/` does now.

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
