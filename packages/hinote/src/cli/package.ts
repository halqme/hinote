import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isPlainObject } from "../guards.ts";

// The peers `hinote init` writes into a new deck's package.json.
const PEERS = ["hono", "esbuild", "@hono/node-server"] as const;

type PackageJson = {
  version: string;
  peerDependencies: Record<(typeof PEERS)[number], string>;
};

let read: PackageJson | undefined;

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"));
}

// In the hinote repository the ranges are `catalog:`, kept once in the
// workspace root; a published package has the ranges themselves.
function workspaceCatalog(from: string): Record<string, unknown> | undefined {
  for (let dir = dirname(from); ; dir = dirname(dir)) {
    const file = join(dir, "package.json");
    if (dir !== dirname(from) && existsSync(file)) {
      const json = readJson(file);
      const workspaces = isPlainObject(json) ? json.workspaces : undefined;
      if (isPlainObject(workspaces) && isPlainObject(workspaces.catalog))
        return workspaces.catalog;
    }
    if (dirname(dir) === dir) return undefined;
  }
}

// hinote's own package.json, read when first needed. It sits one level above
// src/ and dist/ alike, so the same path works from the source and the build.
export function ownPackage(): PackageJson {
  if (read) return read;
  const file = fileURLToPath(new URL("../../package.json", import.meta.url));
  const parsed = readJson(file);
  const peers = isPlainObject(parsed) ? parsed.peerDependencies : undefined;
  if (
    !isPlainObject(parsed) ||
    typeof parsed.version !== "string" ||
    !isPlainObject(peers)
  )
    throw new Error("hinote's package.json lacks its version or peer ranges.");
  const catalog = Object.values(peers).includes("catalog:")
    ? workspaceCatalog(file)
    : undefined;
  const range = (name: (typeof PEERS)[number]): string => {
    const value = peers[name] === "catalog:" ? catalog?.[name] : peers[name];
    if (typeof value !== "string")
      throw new Error(`hinote's package.json has no range for ${name}.`);
    return value;
  };
  read = {
    version: parsed.version,
    peerDependencies: {
      hono: range("hono"),
      esbuild: range("esbuild"),
      "@hono/node-server": range("@hono/node-server"),
    },
  };
  return read;
}
