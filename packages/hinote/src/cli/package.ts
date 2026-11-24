import { readFileSync } from "node:fs";
import { isPlainObject } from "../guards.ts";

// The peers `hinote init` writes into a new deck's package.json.
const PEERS = ["hono", "esbuild", "@hono/node-server"] as const;

type PackageJson = {
  version: string;
  peerDependencies: Record<(typeof PEERS)[number], string>;
};

let read: PackageJson | undefined;

// hinote's own package.json, read when first needed. It sits one level above
// src/ and dist/ alike, so the same path works from the source and the build.
export function ownPackage(): PackageJson {
  if (read) return read;
  const parsed: unknown = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  );
  const peers = isPlainObject(parsed) ? parsed.peerDependencies : undefined;
  if (
    !isPlainObject(parsed) ||
    typeof parsed.version !== "string" ||
    !isPlainObject(peers) ||
    PEERS.some((name) => typeof peers[name] !== "string")
  )
    throw new Error("hinote's package.json lacks its version or peer ranges.");
  read = {
    version: parsed.version,
    peerDependencies: {
      hono: String(peers.hono),
      esbuild: String(peers.esbuild),
      "@hono/node-server": String(peers["@hono/node-server"]),
    },
  };
  return read;
}
