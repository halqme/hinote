// Builds a package's dist/ from its src/ with tsdown, as configured by the
// package's tsconfig.build.json. Run it from the package directory:
//   bun ../../scripts/build-package.ts [outDir]
// Each file in src/ becomes one file in dist/, with its declarations, and
// `./x.ts` imports become `./x.js`. Nothing is bundled, so a deck's bundler
// keeps only the modules the deck imports.
import { join, resolve } from "node:path";
import { build } from "tsdown";

export async function buildPackage(dir: string, outDir = join(dir, "dist")) {
  await build({
    config: false,
    cwd: dir,
    entry: ["src/**/*.{ts,tsx}", "!src/**/*.d.ts"],
    unbundle: true,
    format: "esm",
    platform: "node",
    outDir: resolve(outDir),
    clean: true,
    fixedExtension: false,
    tsconfig: "tsconfig.build.json",
    dts: { tsgo: {} },
    logLevel: "warn",
  });
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
