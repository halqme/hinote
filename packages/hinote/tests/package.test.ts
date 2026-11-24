import { resolve } from "node:path";
import { expect, test } from "bun:test";

const repo = resolve(import.meta.dir, "..");

test("the changelog ships in the package and has a section for its version", async () => {
  const pkg: unknown = await Bun.file(resolve(repo, "package.json")).json();
  if (
    typeof pkg !== "object" ||
    pkg === null ||
    !("version" in pkg) ||
    !("files" in pkg)
  )
    throw new Error("package.json has no version or files");
  expect(pkg.files).toContain("CHANGELOG.md");

  const headings = (await Bun.file(resolve(repo, "CHANGELOG.md")).text())
    .split("\n")
    .filter((line) => line.startsWith("## "))
    .map((line) => line.slice(3));
  expect(headings).toContain(String(pkg.version));
  // Unreleased, when present, is the newest section.
  expect(headings.indexOf("Unreleased")).toBeLessThanOrEqual(0);
});
