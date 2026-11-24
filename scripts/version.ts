// Every package in the workspace has the same version, and a release
// publishes them together.
//   bun scripts/version.ts          print the version; fail if they differ
//   bun scripts/version.ts 0.6.0    set every package to 0.6.0
import { join } from "node:path";

const root = join(import.meta.dir, "..");

export type Manifest = { file: string; name: string; version: string };

export async function manifests(): Promise<Manifest[]> {
  const found: Manifest[] = [];
  for await (const path of new Bun.Glob("packages/*/package.json").scan(root)) {
    const file = join(root, path);
    const json: unknown = await Bun.file(file).json();
    if (
      typeof json !== "object" ||
      json === null ||
      !("name" in json) ||
      !("version" in json) ||
      typeof json.name !== "string" ||
      typeof json.version !== "string"
    )
      throw new Error(`${path} has no name or version.`);
    found.push({ file, name: json.name, version: json.version });
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

async function setVersion(version: string) {
  if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version))
    throw new Error(`${version} is not a version such as 0.6.0.`);
  for (const { file } of await manifests()) {
    const text = await Bun.file(file).text();
    // Only the top-level "version", so the file keeps its order and format.
    const next = text.replace(/^(  "version": )"[^"]*"/m, `$1"${version}"`);
    if (next === text && !text.includes(`"version": "${version}"`))
      throw new Error(`${file} has no top-level "version" to change.`);
    await Bun.write(file, next);
  }
}

if (import.meta.main) {
  const wanted = process.argv[2];
  if (wanted) await setVersion(wanted);
  const all = await manifests();
  const versions = new Set(all.map((m) => m.version));
  if (versions.size !== 1) {
    for (const m of all) console.error(`${m.name} ${m.version}`);
    console.error("Every package must have the same version.");
    process.exit(1);
  }
  console.log([...versions][0]);
}
