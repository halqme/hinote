import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import packageJson from "../../package.json" with { type: "json" };
import { HinoteError } from "../errors.ts";
import { isPlainObject } from "../guards.ts";
import { isBun } from "../build/runtime.ts";

const DECK = `import { Center, Code, Column, Step, createSlide } from "hinote";
import style from "./style.css" with { type: "text" };

const title = createSlide({ title: "My talk", notes: "What to say first" }, () => (
  <Center>
    <h1>My talk</h1>
    <p>Press → to go on</p>
  </Center>
));

const points = createSlide({ title: "Points" }, () => (
  <Column gap={3}>
    <h2>Three points</h2>
    <ul>
      <Step as="li">One</Step>
      <Step as="li">Two</Step>
      <Step as="li">Three</Step>
    </ul>
  </Column>
));

const code = createSlide({ title: "Code" }, () => (
  <Column gap={3}>
    <h2>Code</h2>
    <Code lang="ts">{\`
      const deck = createSlide([title, points, code]);
    \`}</Code>
  </Column>
));

export default createSlide({ aspect: "16:9", transition: "fade", css: style }, [
  title,
  points,
  code,
]);
`;

const STYLE = `/* CSS for every slide. Selectors match inside a slide; & is the slide itself. */

h2 {
  color: var(--hinote-color-accent);
}
`;

// *.client.tsx is browser code. Leaving it in this program would be checked as
// server JSX, and a reference to hinote/client would type `hinote` into slides.
const TSCONFIG = `{
  "compilerOptions": {
    "target": "ESNext",
    "module": "Preserve",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "hono/jsx",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true
  },
  "exclude": ["**/*.client.ts", "**/*.client.tsx"]
}
`;

const TSCONFIG_CLIENT = `{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "jsxImportSource": "hono/jsx/dom"
  },
  "include": ["**/*.client.ts", "**/*.client.tsx"],
  "exclude": ["node_modules"]
}
`;

export type PackageManager = "bun" | "npm" | "pnpm" | "yarn";

// bunx, npx, pnpm dlx, and yarn dlx name themselves in npm_config_user_agent.
// The CLI itself may run on Node even under bunx, which follows the node
// shebang when Node is installed, so the runtime alone cannot tell.
export function packageManager(
  userAgent = process.env.npm_config_user_agent,
): PackageManager {
  const name = userAgent?.split("/")[0];
  if (name === "bun" || name === "npm" || name === "pnpm" || name === "yarn")
    return name;
  return isBun ? "bun" : "npm";
}

export const COMMANDS: Record<
  PackageManager,
  { install: string[]; add: string; addDev: string; hinote: string }
> = {
  bun: {
    install: ["bun", "install"],
    add: "bun add",
    addDev: "bun add -d",
    hinote: "bunx hinote",
  },
  npm: {
    install: ["npm", "install"],
    add: "npm install",
    addDev: "npm install -D",
    hinote: "npx hinote",
  },
  pnpm: {
    install: ["pnpm", "install"],
    add: "pnpm add",
    addDev: "pnpm add -D",
    hinote: "pnpm exec hinote",
  },
  yarn: {
    install: ["yarn", "install"],
    add: "yarn add",
    addDev: "yarn add -D",
    hinote: "yarn hinote",
  },
};

// Outside Bun, the CLI also needs a bundler and a server; Bun has its own.
export const NODE_DEV_PACKAGES = ["esbuild", "@hono/node-server"] as const;

// The packages init puts in package.json, with the ranges of this version.
function packageRanges(pm: PackageManager) {
  const peers = packageJson.peerDependencies;
  return {
    dependencies: { hinote: `^${packageJson.version}`, hono: peers.hono },
    devDependencies:
      pm === "bun"
        ? undefined
        : {
            "@hono/node-server": peers["@hono/node-server"],
            esbuild: peers.esbuild,
          },
  };
}

function packageFile(name: string, pm: PackageManager): string {
  const { dependencies, devDependencies } = packageRanges(pm);
  return `${JSON.stringify(
    {
      name,
      private: true,
      type: "module",
      dependencies,
      ...(devDependencies && { devDependencies }),
    },
    null,
    2,
  )}\n`;
}

// Writes a starter deck into `dir`. It never overwrites: if any file it would
// write exists, it writes nothing. An existing package.json is left alone,
// and `wrotePackage` says whether there is one of ours to install.
export async function initProject(
  dir: string,
  pm: PackageManager,
): Promise<{ files: string[]; wrotePackage: boolean }> {
  const root = resolve(dir);
  const files: [string, string][] = [
    ["deck.tsx", DECK],
    ["style.css", STYLE],
    ["tsconfig.json", TSCONFIG],
    ["tsconfig.client.json", TSCONFIG_CLIENT],
  ];
  const wrotePackage = !existsSync(join(root, "package.json"));
  if (wrotePackage)
    files.push([
      "package.json",
      packageFile(
        basename(root)
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "-"),
        pm,
      ),
    ]);
  for (const [name] of files) {
    if (existsSync(join(root, name)))
      throw new HinoteError(`${join(root, name)} already exists.`, {
        hint: `To compare the project with this version's init: hinote init --diff ${dir}`,
      });
  }
  await mkdir(root, { recursive: true });
  for (const [name, content] of files) {
    await writeFile(join(root, name), content, { flag: "wx" });
  }
  return { files: files.map(([name]) => join(root, name)), wrotePackage };
}

// The settings files init writes. deck.tsx and style.css are the author's
// from the first edit, so a diff leaves them out.
const SETTINGS: readonly [string, string][] = [
  ["tsconfig.json", TSCONFIG],
  ["tsconfig.client.json", TSCONFIG_CLIENT],
];

export type FileDiff = {
  file: string;
  status: "same" | "missing" | "differs";
  // Lines as a unified diff body: " " kept, "-" in the project, "+" from init.
  lines?: string[];
};

export type PackageDiff = {
  name: string;
  // The range this version's init writes, and the one the project has.
  want: string;
  have?: string;
};

// What differs between a project and what this version's init would write.
// It reads only; the author decides what to take.
export async function diffProject(
  dir: string,
  pm: PackageManager,
): Promise<{ version: string; files: FileDiff[]; packages: PackageDiff[] }> {
  const root = resolve(dir);
  const files: FileDiff[] = [];
  for (const [file, want] of SETTINGS) {
    const path = join(root, file);
    if (!existsSync(path)) {
      files.push({ file, status: "missing" });
      continue;
    }
    const have = await readFile(path, "utf8");
    files.push(
      have.trimEnd() === want.trimEnd()
        ? { file, status: "same" }
        : { file, status: "differs", lines: lineDiff(have, want) },
    );
  }
  const packages: PackageDiff[] = [];
  const path = join(root, "package.json");
  let manifest: unknown;
  try {
    manifest = JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new HinoteError(`${path} is missing or is not JSON.`, {
      code: "file-not-found",
      hint: "Run hinote init in an empty directory to start a project.",
    });
  }
  const installed = (section: string): Record<string, unknown> => {
    const value = isPlainObject(manifest) ? manifest[section] : undefined;
    return isPlainObject(value) ? value : {};
  };
  const have = {
    ...installed("devDependencies"),
    ...installed("dependencies"),
  };
  const { dependencies, devDependencies } = packageRanges(pm);
  for (const [name, want] of Object.entries({
    ...dependencies,
    ...devDependencies,
  })) {
    const range = have[name];
    if (range === want) continue;
    packages.push(
      typeof range === "string" ? { name, want, have: range } : { name, want },
    );
  }
  return { version: packageJson.version, files, packages };
}

// A line diff by longest common subsequence. Settings files are a few dozen
// lines, so the quadratic table is fine.
function lineDiff(before: string, after: string): string[] {
  const a = before.trimEnd().split("\n");
  const b = after.trimEnd().split("\n");
  // common[i][j]: lines in common between a from i and b from j.
  const common = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0),
  );
  const at = (i: number, j: number) => common[i]?.[j] ?? 0;
  for (let i = a.length - 1; i >= 0; i--) {
    const row = common[i];
    if (!row) continue;
    for (let j = b.length - 1; j >= 0; j--)
      row[j] =
        a[i] === b[j]
          ? at(i + 1, j + 1) + 1
          : Math.max(at(i + 1, j), at(i, j + 1));
  }
  const lines: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      lines.push(` ${a[i]}`);
      i++;
      j++;
    } else if (
      i < a.length &&
      (j === b.length || at(i + 1, j) >= at(i, j + 1))
    ) {
      lines.push(`-${a[i]}`);
      i++;
    } else {
      lines.push(`+${b[j]}`);
      j++;
    }
  }
  return lines;
}
