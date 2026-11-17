// What the CLI needs from its runtime: bundling a deck and serving it. On Bun
// these are Bun.build and Bun.serve. On Node they are esbuild and
// @hono/node-server, optional peer dependencies that `hinote init` adds when it
// runs on Node. The library itself (src/index.ts) needs neither.
import { readFile } from "node:fs/promises";
import { HinoteError } from "./errors.ts";

export const isBun = typeof Bun !== "undefined";

export const NODE_PACKAGES = ["esbuild", "@hono/node-server"] as const;

// A plugin in the shape both Bun.build and esbuild accept.
export type LoadPlugin = {
  name: string;
  setup(build: {
    onLoad(
      options: { filter: RegExp },
      callback: (args: {
        path: string;
      }) => Promise<{ contents: string; loader: string }>,
    ): void;
  }): void;
};

export function loaderFor(path: string): string {
  if (path.endsWith(".tsx")) return "tsx";
  if (/\.[cm]?ts$/.test(path)) return "ts";
  if (path.endsWith(".jsx")) return "jsx";
  return "js";
}

export function readText(path: string): Promise<string> {
  return readFile(path, "utf8");
}

async function optional<T>(name: string): Promise<T> {
  try {
    return (await import(name)) as T;
  } catch {
    throw new HinoteError(
      `hinote needs ${name} to run on Node. Install it with: npm install -D ${NODE_PACKAGES.join(" ")}`,
    );
  }
}

// Whether the Node-only packages can be loaded. The CLI hands itself to Bun
// instead when they cannot and Bun is installed.
export async function hasNodePackages(): Promise<boolean> {
  try {
    await Promise.all(NODE_PACKAGES.map((name) => import(name)));
    return true;
  } catch {
    return false;
  }
}

// Bundles `entry` and everything it imports into one ES module.
export async function bundle(
  entry: string,
  plugins: LoadPlugin[],
): Promise<string> {
  if (isBun) {
    const built = await Bun.build({
      entrypoints: [entry],
      format: "esm",
      target: "bun",
      packages: "bundle",
      plugins: plugins as unknown as import("bun").BunPlugin[],
      jsx: {
        runtime: "automatic",
        importSource: "hono/jsx",
        development: false,
      },
    });
    if (!built.success)
      throw new HinoteError(
        built.logs.map((log) => log.message).join("\n") || "build failed.",
      );
    const artifact = built.outputs[0];
    if (!artifact) throw new HinoteError("build produced no output.");
    return artifact.text();
  }
  const esbuild = await optional<typeof import("esbuild")>("esbuild");
  try {
    const result = await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      format: "esm",
      platform: "node",
      write: false,
      logLevel: "silent",
      plugins: plugins as unknown as import("esbuild").Plugin[],
      jsx: "automatic",
      jsxImportSource: "hono/jsx",
    });
    const output = result.outputFiles[0];
    if (!output) throw new HinoteError("build produced no output.");
    return output.text;
  } catch (error) {
    if (error instanceof HinoteError) throw error;
    const errors = (error as { errors?: { text: string }[] }).errors;
    throw new HinoteError(
      errors?.map((entry) => entry.text).join("\n") ||
        (error instanceof Error ? error.message : String(error)),
    );
  }
}

export type Server = { port: number; stop(): void };

export async function serve(options: {
  port: number;
  hostname: string;
  fetch: (request: Request) => Response | Promise<Response>;
}): Promise<Server> {
  const inUse = () =>
    new HinoteError(
      `Port ${options.port} is in use. Stop the other server or pass --port <number>.`,
    );
  if (isBun) {
    try {
      const server = Bun.serve(options);
      return {
        port: server.port ?? options.port,
        stop: () => server.stop(true),
      };
    } catch (error) {
      if ((error as { code?: unknown }).code === "EADDRINUSE") throw inUse();
      throw error;
    }
  }
  const { serve } =
    await optional<typeof import("@hono/node-server")>("@hono/node-server");
  return new Promise((resolve, reject) => {
    const server = serve(options, (info) => {
      resolve({
        port: info.port,
        stop: () => {
          server.close();
          (
            server as { closeAllConnections?: () => void }
          ).closeAllConnections?.();
        },
      });
    });
    server.once("error", (error: NodeJS.ErrnoException) =>
      reject(error.code === "EADDRINUSE" ? inUse() : error),
    );
  });
}
