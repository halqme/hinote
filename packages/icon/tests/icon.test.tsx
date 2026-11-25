import { expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { createSlide } from "@hinote/core";
import { addCollection, Icon } from "../src/index.tsx";

async function render(node: () => unknown) {
  return createSlide([createSlide(node as () => never)]).render("static");
}

function svg(html: string): string {
  return /<svg[^>]*>[\s\S]*?<\/svg>/.exec(html)?.[0] ?? "";
}

test("draws an icon named as icones.js.org names it, as tall as the text", async () => {
  const icon = svg(await render(() => <Icon name="lucide:rocket" />));
  expect(icon).toContain('viewBox="0 0 24 24"');
  expect(icon).toContain('height="1em"');
  expect(icon).toContain('width="1em"');
  // A one-color icon takes the color of the text around it.
  expect(icon).toContain('stroke="currentColor"');
  expect(icon).toContain('aria-hidden="true"');
});

test("sizes by height, in pixels for a number", async () => {
  expect(
    svg(await render(() => <Icon name="lucide:rocket" size={48} />)),
  ).toContain('height="48px"');
  expect(
    svg(await render(() => <Icon name="lucide:rocket" size="2rem" />)),
  ).toContain('height="2rem"');
});

test("a label names the icon for a screen reader", async () => {
  const icon = svg(
    await render(() => (
      <Icon name="lucide:rocket" label={'Launch "now"'} class="big" />
    )),
  );
  expect(icon).toContain('role="img"');
  expect(icon).toContain('aria-label="Launch &quot;now&quot;"');
  expect(icon).toContain('class="big"');
  expect(icon).not.toContain("aria-hidden");
});

// icones lists an icon's old names too; the set keeps them as aliases.
test("draws an icon by an alias", async () => {
  expect(
    svg(await render(() => <Icon name="lucide:alert-circle" />)),
  ).toContain("<circle");
});

test("draws an icon by its UnoCSS class too", async () => {
  const id = svg(await render(() => <Icon name="lucide:rocket" />));
  expect(svg(await render(() => <Icon name="i-lucide-rocket" />))).toBe(id);
  expect(svg(await render(() => <Icon name="i-lucide:rocket" />))).toBe(id);
});

// In a class any hyphen may end the prefix.
test("finds a set whose prefix has hyphens from its UnoCSS class", async () => {
  const icon = svg(await render(() => <Icon name="i-flat-color-icons-home" />));
  // A multicolor icon keeps its own colors.
  expect(icon).toMatch(/fill="#[0-9A-Fa-f]{6}"/);
  expect(icon).not.toContain("currentColor");
});

// The sets are found from where the package is installed.
test("finds the sets whichever directory it runs in", async () => {
  const cwd = process.cwd();
  process.chdir(tmpdir());
  try {
    expect(svg(await render(() => <Icon name="lucide:rocket" />))).toContain(
      "<svg",
    );
  } finally {
    process.chdir(cwd);
  }
});

// Where the deck cannot read files, it passes the sets it imports.
test("draws from a set added in code, which needs no package", async () => {
  addCollection({
    prefix: "deck-own",
    width: 16,
    height: 16,
    icons: { dot: { body: '<circle cx="8" cy="8" r="4"/>' } },
  });
  const icon = svg(await render(() => <Icon name="i-deck-own-dot" />));
  expect(icon).toContain('viewBox="0 0 16 16"');
  expect(icon).toContain('<circle cx="8" cy="8" r="4"/>');
});

test("rejects a name without the set's prefix, with how to write it", async () => {
  await expect(render(() => <Icon name="rocket" />)).rejects.toMatchObject({
    name: "HinoteError",
    code: "icon",
    hint: expect.stringContaining('name="mdi:home"'),
  });
});

test("rejects a set that is not installed, with the package to install", async () => {
  await expect(
    render(() => <Icon name="not-a-set:home" />),
  ).rejects.toMatchObject({
    code: "icon",
    hint: "Install it in the deck: bun add @iconify-json/not-a-set",
  });
});

test("rejects an icon the set does not have, with where to find it", async () => {
  await expect(
    render(() => <Icon name="lucide:rockett" />),
  ).rejects.toMatchObject({
    code: "icon",
    message: expect.stringContaining('has no icon "rockett"'),
    hint: "Find its name at https://icones.js.org/collection/lucide",
  });
});
