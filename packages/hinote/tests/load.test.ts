import { expect, test } from "bun:test";
import { fixImportMeta } from "../src/build/load.ts";

const values = { url: "file:///deck/a.tsx", dir: "/deck" };

// The bundle runs from elsewhere, so code that reads import.meta gets the
// file's real place. Words that only mention it stay as written.
test("rewrites import.meta in code, and leaves strings, comments, regexes, and slide text alone", () => {
  const source = `const a = import.meta.url; // import.meta.url
/* import.meta.dir */ const s = "import.meta.url";
const t = \`text import.meta.url \${import.meta.dir}\`;
const r = /import.meta.url/;
const spaced = import . meta . url;
const other = import.meta.env;
export const P = () => <p title="import.meta.url">import.meta.url {import.meta.url}</p>;`;
  expect(fixImportMeta(source, values, true))
    .toBe(`const a = "file:///deck/a.tsx"; // import.meta.url
/* import.meta.dir */ const s = "import.meta.url";
const t = \`text import.meta.url \${"/deck"}\`;
const r = /import.meta.url/;
const spaced = "file:///deck/a.tsx";
const other = import.meta.env;
export const P = () => <p title="import.meta.url">import.meta.url {"file:///deck/a.tsx"}</p>;`);
});

// In a .ts file `<T>` is a generic, so what follows is still code.
test("reads a generic in a file without JSX as code", () => {
  const source = "const id = <T>(x: T) => x; const u = import.meta.url;";
  expect(fixImportMeta(source, values, false)).toBe(
    'const id = <T>(x: T) => x; const u = "file:///deck/a.tsx";',
  );
});
