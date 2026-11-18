import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";
import { problemsInSource } from "../src/cli/conventions.ts";

const cli = resolve(import.meta.dir, "../src/cli.ts");
const api = resolve(import.meta.dir, "../src/index.ts");

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

  const referenced = problemsInSource(
    `/// <reference types="hinote/client" />\n${source(`export default createSlide(() => <p>ok</p>);`)}`,
    "deck.tsx",
  );
  expect(referenced.map((problem) => problem.code)).toEqual(["browser-global"]);

  const client = problemsInSource(
    `/// <reference types="hinote/client" />\nhinote.role\n`,
    "widget.client.tsx",
  );
  expect(client).toEqual([]);
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
