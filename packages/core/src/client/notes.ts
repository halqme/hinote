// Speaker notes are a string. A small part of Markdown gives them structure in
// the presenter view: headings (#), lists (-, *, + or 1.), paragraphs split by
// blank lines, and **strong**, *emphasis*, and `code` inside a line. Notes
// with none of that read as before: each paragraph keeps its line breaks.
//
// Everything becomes text nodes, never HTML, so markup typed into a note is
// shown as written and never runs.

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "strong" | "em" | "code"; text: string };

export type Block =
  | { kind: "heading"; level: number; content: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }
  | { kind: "paragraph"; content: Inline[] };

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

export function parseNotes(notes: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const endParagraph = () => {
    if (paragraph.length > 0)
      blocks.push({
        kind: "paragraph",
        content: parseInline(paragraph.join("\n")),
      });
    paragraph = [];
  };
  for (const line of notes.replace(/\r\n?/g, "\n").split("\n")) {
    const heading = HEADING.exec(line);
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (heading) {
      endParagraph();
      blocks.push({
        kind: "heading",
        level: heading[1]?.length ?? 1,
        content: parseInline(heading[2] ?? ""),
      });
    } else if (bullet || numbered) {
      endParagraph();
      const ordered = numbered !== null;
      const item = parseInline((bullet ?? numbered)?.[1] ?? "");
      const last = blocks.at(-1);
      if (last?.kind === "list" && last.ordered === ordered)
        last.items.push(item);
      else blocks.push({ kind: "list", ordered, items: [item] });
    } else if (line.trim() === "") {
      endParagraph();
    } else paragraph.push(line);
  }
  endParagraph();
  return blocks;
}

// **strong**, *em* or _em_, and `code`. An opening mark without its closing
// mark stays as text, and so does an underscore inside a word (snake_case).
const INLINE =
  /`([^`]+)`|\*\*(.+?)\*\*|\*([^*\s][^*]*?)\*|(?<!\w)_([^_\s][^_]*?)_(?!\w)/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let at = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > at)
      out.push({ kind: "text", text: text.slice(at, match.index) });
    const [, code, strong, star, underscore] = match;
    if (code !== undefined) out.push({ kind: "code", text: code });
    else if (strong !== undefined) out.push({ kind: "strong", text: strong });
    else out.push({ kind: "em", text: star ?? underscore ?? "" });
    at = match.index + match[0].length;
  }
  if (at < text.length) out.push({ kind: "text", text: text.slice(at) });
  return out;
}

export function renderNotes(doc: Document, notes: string): Node[] {
  const inline = (parent: HTMLElement, content: Inline[]) => {
    for (const part of content) {
      if (part.kind === "text") parent.append(doc.createTextNode(part.text));
      else {
        const el = doc.createElement(part.kind);
        el.textContent = part.text;
        parent.append(el);
      }
    }
    return parent;
  };
  return parseNotes(notes).map((block) => {
    if (block.kind === "heading")
      return inline(doc.createElement(`h${block.level}`), block.content);
    if (block.kind === "paragraph")
      return inline(doc.createElement("p"), block.content);
    const list = doc.createElement(block.ordered ? "ol" : "ul");
    for (const item of block.items)
      list.append(inline(doc.createElement("li"), item));
    return list;
  });
}
