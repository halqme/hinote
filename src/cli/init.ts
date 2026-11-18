import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import packageJson from "../../package.json" with { type: "json" };
import { HinoteError } from "../errors.ts";
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

function packageFile(name: string, pm: PackageManager): string {
  const peers = packageJson.peerDependencies;
  const node =
    pm === "bun"
      ? {}
      : {
          devDependencies: {
            "@hono/node-server": peers["@hono/node-server"],
            esbuild: peers.esbuild,
          },
        };
  return `${JSON.stringify(
    {
      name,
      private: true,
      type: "module",
      dependencies: {
        hinote: `^${packageJson.version}`,
        hono: peers.hono,
      },
      ...node,
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
      throw new HinoteError(`${join(root, name)} already exists.`);
  }
  await mkdir(root, { recursive: true });
  for (const [name, content] of files) {
    await writeFile(join(root, name), content, { flag: "wx" });
  }
  return { files: files.map(([name]) => join(root, name)), wrotePackage };
}
