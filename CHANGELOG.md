# Changelog

What changed in each published version of hinote. Newest first. The GitHub release for a version uses that version's section as its body.

## Unreleased

- A top-level deck can set `lang` to a language tag such as `"ja"`. It is written on `<html lang>` of the audience page, the presenter page, and the built file. (G-46, #10)
- `hinote snapshot --slides 2,5,8` photographs and reports only those slides. Pictures keep their slide number. (G-53)

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
