import { expect, test } from "bun:test";
import { createSlide } from "@hinote/core";
import { Resvg } from "@resvg/resvg-js";
import jsQR from "jsqr";
import { Qr } from "../src/index.tsx";

async function render(node: () => unknown) {
  return createSlide([createSlide(node as () => never)]).render();
}

async function svg(node: () => unknown): Promise<string> {
  return /<svg[^>]*>[\s\S]*?<\/svg>/.exec(await render(node))?.[0] ?? "";
}

function attribute(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
}

// Draws the code on white, where currentColor is black, and reads it back as
// a phone would, without trying it inverted.
function read(code: string): string | undefined {
  const image = new Resvg(code, {
    background: "white",
    fitTo: { mode: "width", value: 400 },
  }).render();
  return jsQR(new Uint8ClampedArray(image.pixels), image.width, image.height, {
    inversionAttempts: "dontInvert",
  })?.data;
}

// A 1×1 dark gray PNG.
const LOGO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==";

test("draws a code a phone reads back as the value", async () => {
  const code = await svg(() => <Qr value="https://example.com" />);
  expect(read(code)).toBe("https://example.com");
});

test("reads back text that is not ASCII", async () => {
  const value = "https://example.com/スライド?q=a&b=c";
  expect(read(await svg(() => <Qr value={value} />))).toBe(value);
});

test("is drawn in the text's color with nothing under it", async () => {
  const code = await svg(() => <Qr value="https://example.com" />);
  expect(code).toContain('fill="currentColor"');
  expect(code).not.toContain("<rect");
  // Nothing for hinote check to compare: the theme's own check covers it.
  expect(code).not.toContain("data-hinote-contrast");
});

test("leaves the quiet zone a reader needs, or the margin given", async () => {
  // Version 2, 25 modules, and four on each side.
  const code = await svg(() => <Qr value="https://example.com" />);
  expect(attribute(code, "viewBox")).toBe("0 0 33 33");
  const tight = await svg(() => <Qr value="https://example.com" margin={1} />);
  expect(attribute(tight, "viewBox")).toBe("0 0 27 27");
});

test("takes colors of its own, and tells hinote check about them", async () => {
  const code = await svg(() => (
    <Qr
      value="https://example.com"
      color="#1e3a8a"
      background="#fff"
      finderColor="#be123c"
    />
  ));
  expect(code).toContain('<rect width="33" height="33" fill="#fff"/>');
  expect(code).toContain('fill="#1e3a8a"');
  expect(code).toContain('fill="#be123c"');
  const check = attribute(code, "data-hinote-contrast")!;
  const json = check
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
  expect(JSON.parse(json)).toEqual({
    name: '<Qr value="https://example.com">',
    fg: ["#1e3a8a", "#be123c"],
    bg: "#fff",
    min: 4.5,
    dark: true,
  });
  expect(read(code)).toBe("https://example.com");
});

test("a background alone is checked against the text's color", async () => {
  const code = await svg(() => <Qr value="x" background="#fff" />);
  expect(attribute(code, "data-hinote-contrast")).toContain("currentColor");
});

test("draws a gradient from several colors", async () => {
  const code = await svg(() => (
    <Qr value="https://example.com" color={["#1e3a8a", "#6d28d9"]} />
  ));
  const id = /<linearGradient id="([^"]+)"/.exec(code)?.[1];
  expect(id).toBeDefined();
  expect(code).toContain(`fill="url(#${id})"`);
  expect(code.match(/<stop /g)).toHaveLength(2);
  expect(read(code)).toBe("https://example.com");
});

for (const shape of ["rounded", "dot"] as const)
  test(`reads back with ${shape} modules and corner squares`, async () => {
    const square = await svg(() => <Qr value="https://example.com" />);
    const code = await svg(() => (
      <Qr value="https://example.com" shape={shape} finder={shape} />
    ));
    expect(code).not.toBe(square);
    expect(read(code)).toBe("https://example.com");
  });

test("puts a logo in the middle and still reads, at level H", async () => {
  const plain = await svg(() => <Qr value="https://example.com" level="H" />);
  const code = await svg(() => (
    <Qr value="https://example.com" logo={LOGO} logoSize={0.3} />
  ));
  // Level H is the one a logo needs, so the code is as big as one at H.
  expect(attribute(code, "viewBox")).toBe(attribute(plain, "viewBox"));
  expect(code).toContain(`<image href="${LOGO}"`);
  expect(read(code)).toBe("https://example.com");
});

test("is a third of the canvas by default, and sizes in pixels for a number", async () => {
  const code = await svg(() => <Qr value="https://example.com" />);
  expect(attribute(code, "width")).toBe("360px");
  expect(attribute(code, "height")).toBe("360px");
  expect(attribute(await svg(() => <Qr value="x" size={200} />), "width")).toBe(
    "200px",
  );
  expect(
    attribute(await svg(() => <Qr value="x" size="40vh" />), "height"),
  ).toBe("40vh");
});

test("a higher level makes a denser code that still reads", async () => {
  const code = await svg(() => <Qr value="https://example.com" level="H" />);
  expect(Number(attribute(code, "viewBox")?.split(" ")[2])).toBeGreaterThan(33);
  expect(read(code)).toBe("https://example.com");
});

test("names the code for a screen reader by its value or a label", async () => {
  const code = await svg(() => <Qr value="https://example.com/?a&b" />);
  expect(attribute(code, "role")).toBe("img");
  expect(attribute(code, "aria-label")).toBe("https://example.com/?a&amp;b");
  const labelled = await svg(() => (
    <Qr value="https://example.com" label={'The "slides"'} class="end" />
  ));
  expect(attribute(labelled, "aria-label")).toBe("The &quot;slides&quot;");
  expect(attribute(labelled, "class")).toBe("end");
});

test("rejects a missing value, with how to pass one", async () => {
  await expect(
    render(() => <Qr value={undefined as never} />),
  ).rejects.toMatchObject({
    name: "HinoteError",
    code: "qr",
    hint: expect.stringContaining('<Qr value="https://example.com" />'),
  });
});

test("rejects options it does not know, with the ones it does", async () => {
  const cases: [object, unknown][] = [
    [{ level: "X" }, 'Use "L", "M", "Q", or "H".'],
    [{ shape: "star" }, 'Use "square", "rounded", or "dot".'],
    [{ finder: "star" }, 'Use "square", "rounded", or "dot".'],
    [{ margin: -1 }, expect.stringContaining("whole number")],
    [{ color: ["#000"] }, expect.stringContaining("one color")],
  ];
  for (const [props, hint] of cases)
    await expect(
      render(() => <Qr value="x" {...props} />),
    ).rejects.toMatchObject({ code: "qr", hint });
});

test("rejects a logo too big, or at a level that cannot recover it", async () => {
  await expect(
    render(() => <Qr value="x" logo={LOGO} logoSize={0.5} />),
  ).rejects.toMatchObject({ code: "qr", hint: expect.stringContaining("0.3") });
  await expect(
    render(() => <Qr value="x" logo={LOGO} level="M" />),
  ).rejects.toMatchObject({
    code: "qr",
    hint: expect.stringContaining('level="H"'),
  });
});

test("rejects a value too long for a code, with what to do", async () => {
  await expect(
    render(() => <Qr value={"x".repeat(3000)} level="H" />),
  ).rejects.toMatchObject({
    code: "qr",
    message: expect.stringContaining("3000 characters"),
    hint: expect.stringContaining('level="L"'),
  });
});
