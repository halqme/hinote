import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { expect, test } from "bun:test";

const repo = resolve(import.meta.dir, "..");

async function tempDir() {
  const scratch = join(import.meta.dir, "../.tmp");
  await mkdir(scratch, { recursive: true });
  return mkdtemp(join(scratch, "hinote-"));
}

// Each line under @ts-expect-error must be a type error, or tsc reports the
// unused directive; every other line must compile. So a value that renders
// wrong in silence (a misspelled alignment, a tag that does not exist, a
// length without its unit) stops the author before the slide does.
test("layout values, step tags, and gaps that would render wrong are type errors", async () => {
  const dir = await tempDir();
  try {
    await writeFile(
      join(dir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ESNext",
          module: "Preserve",
          moduleResolution: "bundler",
          jsx: "react-jsx",
          jsxImportSource: "hono/jsx",
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          // @hinote/core's source imports with .ts and takes its shared types
          // from the workspace.
          allowImportingTsExtensions: true,
          types: ["bun"],
          paths: {
            "@hinote/core": [relative(dir, join(repo, "src/index.ts"))],
            "@hinote/types": [relative(dir, join(repo, "../types/index.d.ts"))],
          },
        },
        files: ["deck.tsx"],
      }),
    );
    await writeFile(
      join(dir, "deck.tsx"),
      `import { Column, Grid, Row, Step, Steps, createSlide } from "@hinote/core";
export default createSlide(() => (
  <Column gap={2} align="center" justify="space-between">
    <Row gap="1.5rem" align="start" />
    <Grid gap="var(--space)" columns={3} />
    <Row gap="calc(1rem + 2px)" justify="end" />
    <ul>
      <Step as="li">a</Step>
    </ul>
    <Steps as="section" count={2} />
    {/* @ts-expect-error not an alignment */}
    <Row align="centre" />
    {/* @ts-expect-error not a justification */}
    <Row justify="middle" />
    {/* @ts-expect-error not an HTML element */}
    <Step as="lii">b</Step>
    {/* @ts-expect-error a length without its unit */}
    <Column gap="2" />
  </Column>
));
`,
    );
    const run = Bun.spawnSync(
      ["bun", "x", "tsc", "-p", "tsconfig.json", "--pretty", "false"],
      { cwd: dir, stdout: "pipe", stderr: "pipe" },
    );
    expect(`${run.stdout.toString()}${run.stderr.toString()}`).toBe("");
    expect(run.exitCode).toBe(0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
