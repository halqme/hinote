// A scanner for the parts of TypeScript and JSX source that are code:
// identifiers and punctuation, with strings, comments, template text, regular
// expressions, and JSX text left out. It is not a parser; it knows enough to
// tell code from text for the source checks and for rewriting import.meta.

// `at` is where the token starts in the source.
export type Tok = {
  k: "id" | "punct" | "jsx";
  v: string;
  line: number;
  at: number;
};
// An attribute written on a JSX element, kept apart from the tokens.
export type Attr = { tag: string; name: string; line: number };

// Comments and strings are not code. JSX text is not either: a slide may
// mention hinote.send as words. `<` after an identifier is a comparison or a
// generic, not a tag (`a < b`, `Box<T>`).
export function tokenize(
  source: string,
  attrs: Attr[] = [],
  // A .ts file has no JSX: `<T>(x) => x` is a generic, not a tag.
  jsx = true,
): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  let line = 1;
  const bump = (n = 1) => {
    for (let j = 0; j < n; j++) if (source[i + j] === "\n") line++;
    i += n;
  };
  const skipString = (quote: string) => {
    bump(1);
    while (i < source.length && source[i] !== quote) {
      if (source[i] === "\\") bump(2);
      else bump(1);
    }
    bump(1);
  };
  const skipTemplate = () => {
    bump(1);
    while (i < source.length && source[i] !== "`") {
      if (source[i] === "\\") {
        bump(2);
        continue;
      }
      if (source[i] === "$" && source[i + 1] === "{") {
        bump(2);
        code(true);
        continue;
      }
      bump(1);
    }
    bump(1);
  };
  const skipJsx = () => {
    const start = line;
    const from = i;
    bump(1);
    if (source[i] === ">") {
      bump(1);
      skipJsxChildren();
      out.push({ k: "jsx", v: "", line: start, at: from });
      return;
    }
    let name = "";
    while (i < source.length && /[\w$.-]/.test(source[i] ?? "")) {
      name += source[i];
      bump(1);
    }
    for (;;) {
      while (i < source.length && /\s/.test(source[i] ?? "")) bump(1);
      if (source[i] === "/" && source[i + 1] === ">") {
        bump(2);
        out.push({ k: "jsx", v: name, line: start, at: from });
        return;
      }
      if (source[i] === ">") {
        bump(1);
        skipJsxChildren();
        out.push({ k: "jsx", v: name, line: start, at: from });
        return;
      }
      if (source[i] === "{") {
        bump(1);
        code(true);
        continue;
      }
      if (source[i] === '"' || source[i] === "'") {
        skipString(source[i] ?? '"');
        continue;
      }
      if (/[A-Za-z_]/.test(source[i] ?? "")) {
        const at = line;
        let attr = "";
        while (i < source.length && /[\w:-]/.test(source[i] ?? "")) {
          attr += source[i];
          bump(1);
        }
        attrs.push({ tag: name, name: attr, line: at });
        continue;
      }
      bump(1);
    }
  };
  const skipJsxChildren = () => {
    while (i < source.length) {
      if (source[i] === "{") {
        bump(1);
        code(true);
        continue;
      }
      if (source[i] === "<" && source[i + 1] === "/") {
        bump(2);
        while (i < source.length && source[i] !== ">") bump(1);
        bump(1);
        return;
      }
      if (source[i] === "<") {
        skipJsx();
        continue;
      }
      bump(1);
    }
  };
  // `nested` reads one `{...}` expression and stops after its closing brace.
  // The top-level read must not: a `}` there is just the end of a block.
  // The caller consumed the opening brace without a token, so the closing one
  // gets none either; the scans below rely on balanced brackets.
  const code = (nested: boolean) => {
    let depth = nested ? 1 : 0;
    while (i < source.length) {
      const c = source[i] ?? "";
      if (c === "\n") {
        line++;
        i++;
        continue;
      }
      if (c === " " || c === "\t" || c === "\r") {
        i++;
        continue;
      }
      if (c === "/" && source[i + 1] === "/") {
        while (i < source.length && source[i] !== "\n") i++;
        continue;
      }
      if (c === "/" && source[i + 1] === "*") {
        bump(2);
        while (
          i < source.length &&
          !(source[i] === "*" && source[i + 1] === "/")
        )
          bump(1);
        bump(2);
        continue;
      }
      if (c === "'" || c === '"') {
        skipString(c);
        continue;
      }
      if (c === "`") {
        skipTemplate();
        continue;
      }
      if (c === "<" && jsx && jsxHere()) {
        skipJsx();
        continue;
      }
      if (/[A-Za-z_$]/.test(c)) {
        const at = line;
        const from = i;
        let v = "";
        while (i < source.length && /[\w$]/.test(source[i] ?? "")) {
          v += source[i];
          bump(1);
        }
        out.push({ k: "id", v, line: at, at: from });
        continue;
      }
      if (/[0-9]/.test(c)) {
        while (i < source.length && /[0-9.]/.test(source[i] ?? "")) bump(1);
        continue;
      }
      const two = source.slice(i, i + 2);
      if (["=>", "?.", "...", "&&", "||"].includes(two)) {
        out.push({ k: "punct", v: two, line, at: i });
        bump(2);
        continue;
      }
      if (nested && c === "}" && depth === 1) {
        bump(1);
        return;
      }
      if (c === "/" && regexHere()) {
        skipRegex();
        continue;
      }
      out.push({ k: "punct", v: c, line, at: i });
      bump(1);
      if (c === "{") depth++;
      else if (c === "}") depth--;
    }
  };
  // `/` starts a regular expression where an expression could start, and
  // divides after a value.
  const regexHere = () => {
    const prev = out[out.length - 1];
    if (!prev) return true;
    if (prev.k === "jsx") return false;
    if (prev.k === "id")
      return [
        "return",
        "typeof",
        "case",
        "do",
        "else",
        "in",
        "of",
        "void",
        "yield",
        "await",
      ].includes(prev.v);
    return prev.v !== ")" && prev.v !== "]" && prev.v !== "}";
  };
  const skipRegex = () => {
    bump(1);
    let inClass = false;
    while (i < source.length && source[i] !== "\n") {
      const c = source[i];
      if (c === "\\") {
        bump(2);
        continue;
      }
      if (c === "[") inClass = true;
      else if (c === "]") inClass = false;
      else if (c === "/" && !inClass) break;
      bump(1);
    }
    bump(1);
    while (i < source.length && /[a-z]/.test(source[i] ?? "")) bump(1);
    out.push({ k: "punct", v: "regex", line, at: i });
  };
  // `<` opens a tag only where an expression could start, not after a value.
  const jsxHere = () => {
    const prev = out[out.length - 1];
    if (
      prev &&
      (prev.k === "jsx" ||
        prev.v === ")" ||
        prev.v === "]" ||
        (prev.k === "id" && prev.v !== "return" && prev.v !== "await"))
    )
      return false;
    const n = source[i + 1] ?? "";
    return n === ">" || n === "/" || /[A-Za-z_]/.test(n);
  };
  code(false);
  return out;
}
