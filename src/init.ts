import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import packageJson from "../package.json" with { type: "json" };
import { HinoteError } from "./errors.ts";
import { isBun } from "./runtime.ts";

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
  }
}
`;

// On Node, the CLI also needs a bundler and a server; Bun has its own.
function packageFile(name: string): string {
  const peers = packageJson.peerDependencies;
  const node = isBun
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
      scripts: {
        dev: "hinote dev",
        build: "hinote build",
      },
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
// write exists, it writes nothing. An existing package.json is left alone.
export async function initProject(dir: string): Promise<string[]> {
  const root = resolve(dir);
  const files: [string, string][] = [
    ["deck.tsx", DECK],
    ["style.css", STYLE],
    ["tsconfig.json", TSCONFIG],
  ];
  const hasPackage = existsSync(join(root, "package.json"));
  if (!hasPackage)
    files.push([
      "package.json",
      packageFile(
        basename(root)
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "-"),
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
  return files.map(([name]) => join(root, name));
}
