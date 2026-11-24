// Builds a package's dist/ from its src/ with TypeScript, as configured by the
// package's tsconfig.build.json. Run it from the package directory:
//   bun ../../scripts/build-package.ts [outDir]
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";

const tsc = join(import.meta.dir, "../node_modules/.bin/tsc");

export async function buildPackage(dir: string, outDir = join(dir, "dist")) {
  await rm(outDir, { recursive: true, force: true });
  const run = Bun.spawnSync(
    [tsc, "-p", "tsconfig.build.json", "--outDir", resolve(outDir)],
    { cwd: dir, stdout: "inherit", stderr: "inherit" },
  );
  if (run.exitCode !== 0)
    throw new Error(`tsc failed in ${dir} with exit code ${run.exitCode}.`);
  return outDir;
}

if (import.meta.main) {
  try {
    console.log(await buildPackage(process.cwd(), process.argv[2]));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
