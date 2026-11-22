import { expect, test } from "bun:test";
import { parseNotes } from "../src/client/notes.ts";

test("notes without markup are paragraphs that keep their line breaks", () => {
  expect(parseNotes("Say hello.\nThen the agenda.\n\nAsk a question.")).toEqual(
    [
      {
        kind: "paragraph",
        content: [{ kind: "text", text: "Say hello.\nThen the agenda." }],
      },
      {
        kind: "paragraph",
        content: [{ kind: "text", text: "Ask a question." }],
      },
    ],
  );
  expect(parseNotes("")).toEqual([]);
});

test("headings, bullet and numbered lists, and inline marks become structure", () => {
  expect(
    parseNotes(
      "## Bridge\nNext: **the method**\n- one\n* two\n1. first\n2) second",
    ),
  ).toEqual([
    { kind: "heading", level: 2, content: [{ kind: "text", text: "Bridge" }] },
    {
      kind: "paragraph",
      content: [
        { kind: "text", text: "Next: " },
        { kind: "strong", text: "the method" },
      ],
    },
    {
      kind: "list",
      ordered: false,
      items: [[{ kind: "text", text: "one" }], [{ kind: "text", text: "two" }]],
    },
    {
      kind: "list",
      ordered: true,
      items: [
        [{ kind: "text", text: "first" }],
        [{ kind: "text", text: "second" }],
      ],
    },
  ]);
  expect(parseNotes("an *em*, _em_, and `x < y`")[0]).toEqual({
    kind: "paragraph",
    content: [
      { kind: "text", text: "an " },
      { kind: "em", text: "em" },
      { kind: "text", text: ", " },
      { kind: "em", text: "em" },
      { kind: "text", text: ", and " },
      { kind: "code", text: "x < y" },
    ],
  });
});

test("a mark without its closing mark, and #tags without a space, stay text", () => {
  expect(parseNotes("call load_deck_file here")[0]).toEqual({
    kind: "paragraph",
    content: [{ kind: "text", text: "call load_deck_file here" }],
  });
  expect(parseNotes("2 * 3 = 6 and **open\n#hashtag")).toEqual([
    {
      kind: "paragraph",
      content: [{ kind: "text", text: "2 * 3 = 6 and **open\n#hashtag" }],
    },
  ]);
});
