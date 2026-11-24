# Changelog

What changed in each published version of hinote. Newest first. The GitHub release for a version uses that version's section as its body.

## Unreleased

- Breaking: `<Code>` moved to the new package `@hinote/code`, and its themes to `@hinote/code/themes`. `hinote` no longer exports `Code`, `CodeProps`, or `hinote/code-themes`, and no longer installs `@pierre/highlights`. Add `@hinote/code` and change the import.
- New package `@hinote/katex`: `<Math tex="...">` renders LaTeX as MathML while the slide renders, as a block or `inline`.
- `hinote init` writes a deck with no `<Code>`, so a new deck needs only `hinote` and `hono`.
- An error a `@hinote/*` package throws is reported like hinote's own, with its code and hint.
- `Theme` and `SlideContext` are defined in the new `@hinote/types` package, which hinote now depends on. `hinote` still exports both, so existing imports keep working.

## 0.5.2

- A top-level deck can set `lang` to a language tag such as `"ja"`. It is written on `<html lang>` of the audience page, the presenter page, and the built file.
- The published package includes `CHANGELOG.md`.
- `hinote snapshot --slides 2,5,8` photographs and reports only those slides. Pictures keep their slide number.
- `hinote snapshot` warns with `title-wrap` when a slide's first heading takes more than one line.
- A deck whose `lang` is `ja` or `ja-*` breaks slide text between phrases (`word-break: auto-phrase`), and `hinote snapshot` warns with `lone-character` when wrapped text leaves one character alone on a line.
- `<Flow>` lays out boxes with an arrow between each pair and can emphasize one of them.
- `<Card footer={...}>` pins a footer, such as a source, to the card's last row. Cards in a Grid now all span the band's largest row count, so footers line up across columns.
- `<Table widths={[2, 1]} emphasis={[1]}>` styles a table from the theme, sets the column ratio, and emphasizes body rows.
- A slide can take an `id` option, and `<Link to="id">` links to it with the right URL for dev, a mounted base, prerender, and the built file. A click moves there without reloading.
- Speaker notes take a small part of Markdown (headings, lists, paragraphs, strong, emphasis, code), shown with that structure in the presenter view. Plain notes read as before, and HTML in a note stays text.

## 0.5.1

- Nothinig changed in package.

## 0.5.0

- Bump the "dependencies" group with 1 update across multiple ecosystems
- Fix leftovers after removing examples/ and docs/
- Report canvas overflow and reveal Steps in snapshot
- Improve Chrome snapshot launch for containers
- Darken paper and slate text colors to 7:1 contrast
- Allow deck CSS to override Row / Column / Center
- Warn on theme contrast below 7:1 in hinote check
- Add Grid and Card with subgrid-aligned rows
- Add section context, init --diff, type-aware lint, and design guidance
