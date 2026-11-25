import { expect, test } from "bun:test";
import { createSlide } from "@hinote/core";
import jsQR from "jsqr";
import { Qr } from "../src/index.tsx";

async function render(node: () => unknown) {
  return createSlide([createSlide(node as () => never)]).render("static");
}

function svg(html: string): string {
  return /<svg[^>]*>[\s\S]*?<\/svg>/.exec(html)?.[0] ?? "";
}

function attribute(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
}

// Paints the code's path, dark on light, a few pixels per module, and reads
// it back as a phone would.
function read(code: string): string | undefined {
  const side = Number(attribute(code, "viewBox")?.split(" ")[2]);
  const scale = 4;
  const width = side * scale;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  const d = /<path[^>]*\sd="([^"]*)"/.exec(code)?.[1] ?? "";
  // Each subpath is a rectangle: a corner, its width, its height, and back.
  for (const [, x, y, w, h] of d.matchAll(/M(\d+) (\d+)h(\d+)v(\d+)h-\d+z/g)) {
    for (let py = +y! * scale; py < (+y! + +h!) * scale; py++)
      pixels.fill(
        0,
        (py * width + +x! * scale) * 4,
        (py * width + (+x! + +w!) * scale) * 4,
      );
  }
  // fill(0) cleared alpha too; a reader looks only at the color.
  return jsQR(pixels, width, width)?.data;
}

test("draws a code a phone reads back as the value", async () => {
  const code = svg(await render(() => <Qr value="https://example.com" />));
  expect(read(code)).toBe("https://example.com");
});

test("reads back text that is not ASCII", async () => {
  const value = "https://example.com/スライド?q=a&b=c";
  expect(read(svg(await render(() => <Qr value={value} />)))).toBe(value);
});

test("leaves the quiet zone a reader needs around the code", async () => {
  const code = svg(await render(() => <Qr value="https://example.com" />));
  // Version 2, 25 modules, and four on each side.
  expect(attribute(code, "viewBox")).toBe("0 0 33 33");
  expect(code).toContain("M4 4h7v1h-7z");
});

test("is drawn in the deck's text color on its background", async () => {
  const code = svg(await render(() => <Qr value="https://example.com" />));
  expect(code).toContain(
    '<rect width="33" height="33" fill="var(--hinote-color-bg)"/>',
  );
  expect(code).toContain('<path fill="var(--hinote-color-fg)"');
});

test("takes colors of its own", async () => {
  const code = svg(
    await render(() => (
      <Qr value="https://example.com" color="#000" background="white" />
    )),
  );
  expect(code).toContain('fill="white"');
  expect(code).toContain('<path fill="#000"');
});

test("is a third of the canvas by default, and sizes in pixels for a number", async () => {
  const code = svg(await render(() => <Qr value="https://example.com" />));
  expect(attribute(code, "width")).toBe("360px");
  expect(attribute(code, "height")).toBe("360px");
  expect(
    attribute(svg(await render(() => <Qr value="x" size={200} />)), "width"),
  ).toBe("200px");
  expect(
    attribute(svg(await render(() => <Qr value="x" size="40vh" />)), "height"),
  ).toBe("40vh");
});

test("a higher level makes a denser code that still reads", async () => {
  const code = svg(
    await render(() => <Qr value="https://example.com" level="H" />),
  );
  expect(Number(attribute(code, "viewBox")?.split(" ")[2])).toBeGreaterThan(33);
  expect(read(code)).toBe("https://example.com");
});

test("names the code for a screen reader by its value or a label", async () => {
  const code = svg(await render(() => <Qr value="https://example.com/?a&b" />));
  expect(attribute(code, "role")).toBe("img");
  expect(attribute(code, "aria-label")).toBe("https://example.com/?a&amp;b");
  const labelled = svg(
    await render(() => (
      <Qr value="https://example.com" label={'The "slides"'} class="end" />
    )),
  );
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

test("rejects a level that is not one", async () => {
  await expect(
    render(() => <Qr value="x" level={"X" as never} />),
  ).rejects.toMatchObject({ code: "qr", hint: 'Use "L", "M", "Q", or "H".' });
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
