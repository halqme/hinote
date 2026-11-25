import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { expect, test } from "bun:test";

const repo = resolve(import.meta.dir, "..");
// Tools shared by the workspace are installed at its root.
const workspace = resolve(repo, "../..");

async function tempDir() {
  const scratch = join(import.meta.dir, "../.tmp");
  await mkdir(scratch, { recursive: true });
  return mkdtemp(join(scratch, "hinote-"));
}

function tsc(dir: string, project: string) {
  return Bun.spawnSync(
    ["bun", "x", "tsc", "-p", project, "--pretty", "false", "--noEmit"],
    { cwd: dir, stdout: "pipe", stderr: "pipe" },
  );
}

// Paths are relative to the temp project, which sits in the repo, so they
// resolve the same source `bun` loads through the package exports.
test("a slide cannot see hinote, and a client file can import Position and Role", async () => {
  const dir = await tempDir();
  const clientTypes = relative(dir, join(repo, "src/client-global.ts"));
  const index = relative(dir, join(repo, "src/index.ts"));
  try {
    await writeFile(
      join(dir, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            target: "ESNext",
            module: "Preserve",
            moduleResolution: "bundler",
            jsx: "react-jsx",
            jsxImportSource: "hono/jsx",
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            paths: {
              "@hinote/core": [index],
              "@hinote/core/client": [clientTypes],
            },
          },
          files: ["slide.tsx"],
        },
        null,
        2,
      ),
    );
    await writeFile(
      join(dir, "slide.tsx"),
      `import { createSlide, type HinoteClient } from "@hinote/core";
export default createSlide(() => <p>{hinote.role}</p>);
export type Client = HinoteClient;
`,
    );
    const server = tsc(dir, "tsconfig.json");
    const serverText = `${server.stdout.toString()}${server.stderr.toString()}`;
    expect(server.exitCode).not.toBe(0);
    expect(serverText).toContain("HinoteClient");
    expect(serverText).toMatch(
      /Cannot find name 'hinote'|Cannot find name "hinote"/,
    );

    await writeFile(
      join(dir, "tsconfig.client.json"),
      JSON.stringify(
        {
          compilerOptions: {
            target: "ESNext",
            module: "Preserve",
            moduleResolution: "bundler",
            jsx: "react-jsx",
            jsxImportSource: "hono/jsx/dom",
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            // Same as the repo: the reference does not follow `paths`.
            typeRoots: [
              relative(dir, join(repo, "types")),
              relative(dir, join(workspace, "node_modules/@types")),
            ],
            paths: { "@hinote/core/client": [clientTypes] },
          },
          files: ["widget.client.tsx"],
        },
        null,
        2,
      ),
    );
    await writeFile(
      join(dir, "widget.client.tsx"),
      `/// <reference types="@hinote/core/client" />
import type { Position, Role } from "@hinote/core/client";
const role: Role = hinote.role;
hinote.on("position", (position: Position) => position.slide);
export { role };
`,
    );
    const client = tsc(dir, "tsconfig.client.json");
    expect(client.exitCode).toBe(0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
