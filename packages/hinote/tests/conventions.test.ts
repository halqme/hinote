import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";
import { problemsInSource } from "../src/cli/conventions.ts";

const cli = resolve(import.meta.dir, "../src/cli.ts");
const api = resolve(import.meta.dir, "../../core/src/index.ts");

function source(body: string): string {
  return `import { createSlide } from ${JSON.stringify(api)}\n${body}\n`;
}

async function tempDir() {
  const scratch = join(import.meta.dir, "../.tmp");
  await mkdir(scratch, { recursive: true });
  return mkdtemp(join(scratch, "hinote-"));
}

test("a deck flattened into slides is reported, and a render is not", () => {
  const flat = problemsInSource(
    source(`const sections = [{ slides: [] }];
export default createSlide([
  sections.flatMap((section) => section.slides),
]);`),
    "deck.tsx",
  );
  expect(flat.map((problem) => problem.code)).toEqual(["flattened-deck"]);
  expect(flat[0]?.hint).toContain("nested deck");

  const named = problemsInSource(
    source(`const sections = [{ slides: [] }];
const slides = sections.flat();
export default createSlide(slides);`),
    "deck.tsx",
  );
  expect(named.map((problem) => problem.code)).toEqual(["flattened-deck"]);

  const built = problemsInSource(
    source(`const items = ["a"];
export default createSlide([
  items.map((item) => createSlide(() => <p>{item}</p>)),
]);`),
    "deck.tsx",
  );
  expect(built).toEqual([]);

  const data = problemsInSource(
    source(`const rows = [{ n: 1 }];
export default createSlide(() => (
  <svg>{rows.map((row) => <rect data-n={row.n} />)}</svg>
));`),
    "deck.tsx",
  );
  expect(data).toEqual([]);
});

test("a .map on a later binding is not blamed on a slide with embedded expressions", () => {
  for (const body of [
    `<pre>{"B > Z"}</pre>`,
    `<p class={tone}>text</p>`,
    "`${title}`",
  ]) {
    const problems = problemsInSource(
      source(`const a = createSlide(() => (${body}));
const b = [1].map((x) => x);
export default createSlide([a]);`),
      "deck.tsx",
    );
    expect(problems).toEqual([]);
  }
});

test("hinote outside a client file is reported, including a reference that would type it everywhere", () => {
  const used = problemsInSource(
    source(`export default createSlide(() => <p>{hinote.role}</p>);`),
    "deck.tsx",
  );
  expect(used.map((problem) => problem.code)).toEqual(["browser-global"]);
  expect(used[0]?.message).toContain("deck.tsx:");

  const mentioned = problemsInSource(
    source(`// hinote.send is for the browser
export default createSlide(() => <p>hinote.send</p>);`),
    "deck.tsx",
  );
  expect(mentioned).toEqual([]);

  // hinote/client and the @hinote/core/client it re-exports.
  for (const types of ["hinote/client", "@hinote/core/client"]) {
    const referenced = problemsInSource(
      `/// <reference types="${types}" />\n${source(`export default createSlide(() => <p>ok</p>);`)}`,
      "deck.tsx",
    );
    expect(referenced.map((problem) => problem.code)).toEqual([
      "browser-global",
    ]);
  }

  const client = problemsInSource(
    `/// <reference types="hinote/client" />\nhinote.role\n`,
    "widget.client.tsx",
  );
  expect(client).toEqual([]);
});

// JSX in a prop after a closed sibling once sent the check into a loop it
// never left, depending on how the prop's text ended.
test("JSX in a prop is read as JSX whatever its text ends with", () => {
  for (const footer of [
    "<p>2020</p>",
    "<p>x2020</p>",
    "<p>凡例</p>",
    "<p>{n}</p>",
    "<span can>{n}</span>",
  ]) {
    const problems = problemsInSource(
      source(`const n = 1;
export default createSlide([
  createSlide(() => (
    <div>
      <p>lead</p>
      <section title={${footer}}>
        <p>body</p>
      </section>
    </div>
  )),
]);`),
      "deck.tsx",
    );
    expect(problems).toEqual([]);
  }

  const handler = problemsInSource(
    source(`export default createSlide(() => (
  <div><p>lead</p><section title={<button onClick={() => {}}>2020</button>} /></div>
));`),
    "deck.tsx",
  );
  expect(handler.map((problem) => problem.message)).toEqual([
    "deck.tsx:3: <button onClick> is on a slide, where it never runs.",
  ]);
});

// Both are inert on a slide, which renders once on the server; a client file
// is where they belong, and a component's own on* prop is its business.
test("an event handler or a state hook on a slide is reported, and not in a client file", () => {
  const slide = problemsInSource(
    source(`import { useState } from "hono/jsx";
const Counter = (props: { onPick: () => void }) => <b />;
export default createSlide(() => {
  const [n] = useState(0);
  return <div><button onClick={() => alert(n)}>+</button><Counter onPick={() => {}} /></div>;
});`),
    "slides/counter.tsx",
  );
  expect(slide.map((problem) => problem.code)).toEqual([
    "server-handler",
    "server-hook",
  ]);
  expect(slide[0]?.message).toContain("<button onClick>");
  expect(slide[0]?.hint).toContain("*.client.tsx");
  expect(slide[1]?.message).toContain("useState");

  const client = problemsInSource(
    `import { useState } from "hono/jsx/dom";
const [n] = useState(0);
export const B = () => <button onClick={() => n}>+</button>;`,
    "counter.client.tsx",
  );
  expect(client).toEqual([]);

  // A type import and hooks that do not change the page are fine.
  const quiet = problemsInSource(
    source(`import { useContext, type FC } from "hono/jsx";
import type { useState } from "hono/jsx";
export default createSlide(() => <p onclick="x">a</p>);`),
    "deck.tsx",
  );
  expect(quiet).toEqual([]);
});

test("check exits 1 with the code and the hint, and follows a local import", async () => {
  const dir = await tempDir();
  try {
    await mkdir(join(dir, "sections"));
    await writeFile(
      join(dir, "sections/open.tsx"),
      source(`const extra = createSlide(() => <p>extra</p>);
const parts = [{ slides: [extra] }];
export const open = createSlide(parts.flatMap((part) => part.slides));`),
    );
    await writeFile(
      join(dir, "deck.tsx"),
      `import { open } from "./sections/open.tsx";
${source(`export default createSlide([open]);`)}`,
    );
    const proc = Bun.spawn(["bun", cli, "check", "--json"], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    expect(await proc.exited).toBe(1);
    const report = JSON.parse(stdout);
    expect(report.ok).toBe(false);
    expect(report.data.problems).toEqual([
      expect.objectContaining({
        code: "flattened-deck",
        hint: expect.stringContaining("nested deck"),
      }),
    ]);
    expect(report.data.problems[0].message).toContain("sections/open.tsx");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
