# Changelog

What changed in each published version of hinote. Newest first. The GitHub release for a version uses that version's section as its body.

## Unreleased

- A top-level deck can set `lang` to a language tag such as `"ja"`. It is written on `<html lang>` of the audience page, the presenter page, and the built file. (G-46, #10)
- `hinote snapshot --slides 2,5,8` photographs and reports only those slides. Pictures keep their slide number. (G-53)
- `hinote snapshot` warns with `title-wrap` when a slide's first heading takes more than one line. (G-51)
- A deck whose `lang` is `ja` or `ja-*` breaks slide text between phrases (`word-break: auto-phrase`), and `hinote snapshot` warns with `lone-character` when wrapped text leaves one character alone on a line. (G-52)
- `<Flow>` lays out boxes with an arrow between each pair and can emphasize one of them. (G-48)
- `<Card footer={...}>` pins a footer, such as a source, to the card's last row. Cards in a Grid now all span the band's largest row count, so footers line up across columns. (G-49)
- `<Table widths={[2, 1]} emphasis={[1]}>` styles a table from the theme, sets the column ratio, and emphasizes body rows. (G-50)
- A slide can take an `id` option, and `<Link to="id">` links to it with the right URL for dev, a mounted base, prerender, and the built file. A click moves there without reloading. (G-56)

## 0.5.1

- [Full changes](https://github.com/halqme/hinote/compare/v0.5.0...v0.5.1)

## 0.5.0

- Bump the "dependencies" group with 1 update across multiple ecosystems (#1)
- Fix leftovers after removing examples/ and docs/ (G-36, #2)
- Report canvas overflow and reveal Steps in snapshot (G-32, G-37, #3)
- Improve Chrome snapshot launch for containers (G-38, #4)
- Darken paper and slate text colors to 7:1 contrast (G-44, #5)
- Allow deck CSS to override Row / Column / Center (G-41, #6)
- Warn on theme contrast below 7:1 in hinote check (#7)
- Add Grid and Card with subgrid-aligned rows (#8)
- Add section context, init --diff, type-aware lint, and design guidance (#9)
