import { expect, test } from "bun:test";
import { hinoteConsumer, type PackPaths } from "./run.ts";

const packs: PackPaths = {
  hinote: "/packs/hinote.tgz",
  code: "/packs/code.tgz",
  core: "/packs/core.tgz",
  types: "/packs/types.tgz",
  shared: "/packs/shared.tgz",
};

const deck = {
  name: "bench-hinote",
  dependencies: { hono: "^4.13.19", katex: "^0.19.1" },
  devDependencies: { esbuild: "^0.28.2" },
};

test("main installs the checkout tarballs, including @hinote/shared", () => {
  const pkg = hinoteConsumer(deck, "main", packs);
  expect(pkg.overrides).toEqual({
    "@hinote/core": "file:/packs/core.tgz",
    "@hinote/types": "file:/packs/types.tgz",
    "@hinote/shared": "file:/packs/shared.tgz",
  });
  expect(pkg.dependencies).toEqual({
    hono: "^4.13.19",
    katex: "^0.19.1",
    hinote: "file:/packs/hinote.tgz",
    "@hinote/code": "file:/packs/code.tgz",
  });
  expect(pkg.devDependencies).toEqual({ esbuild: "^0.28.2" });
});

test("release installs latest from npm and does not override with this checkout", () => {
  const pkg = hinoteConsumer(deck, "release", packs);
  expect(pkg.overrides).toBeUndefined();
  expect(pkg.dependencies).toEqual({
    hono: "^4.13.19",
    katex: "^0.19.1",
    hinote: "latest",
    "@hinote/code": "latest",
  });
});
