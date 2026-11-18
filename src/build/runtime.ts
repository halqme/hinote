// What the CLI needs from its runtime: bundling a deck and serving it. On Bun
// these are Bun.build and Bun.serve. On Node they are esbuild and
// @hono/node-server, optional peer dependencies that `hinote init` adds when it
// runs on Node. The library itself (src/index.ts) needs neither.
import { readFile } from "node:fs/promises";
import { HinoteError } from "../errors.ts";
import { isPlainObject } from "../guards.ts";

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

// The Node-only packages, each imported by a literal specifier so tools that
// follow imports can see them.
const NODE_IMPORTS = {
  esbuild: () => import("esbuild"),
  "@hono/node-server": () => import("@hono/node-server"),
} satisfies Record<(typeof NODE_PACKAGES)[number], () => Promise<unknown>>;

async function optional<T>(
  name: keyof typeof NODE_IMPORTS,
  load: () => Promise<T>,
): Promise<T> {
  try {
    return await load();
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
    await Promise.all(NODE_PACKAGES.map((name) => NODE_IMPORTS[name]()));
    return true;
  } catch {
    return false;
  }
}

// Bundles `entry` and everything it imports into one ES module: for the
// server (a deck, JSX from hono/jsx) or for the browser (a <Script> file,
// JSX from hono/jsx/dom, minified).
export async function bundle(
  entry: string,
  plugins: LoadPlugin[],
  target: "server" | "browser" = "server",
): Promise<string> {
  const browser = target === "browser";
  const jsxSource = browser ? "hono/jsx/dom" : "hono/jsx";
  if (isBun) {
    const built = await Bun.build({
      entrypoints: [entry],
      format: "esm",
      target: browser ? "browser" : "bun",
      packages: "bundle",
      minify: browser,
      // LoadPlugin is the part of a plugin both bundlers share.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      plugins: plugins as unknown as import("bun").BunPlugin[],
      jsx: {
        runtime: "automatic",
        importSource: jsxSource,
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
  const esbuild = await optional("esbuild", NODE_IMPORTS.esbuild);
  try {
    const result = await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      format: "esm",
      platform: browser ? "browser" : "node",
      minify: browser,
      write: false,
      logLevel: "silent",
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      plugins: plugins as unknown as import("esbuild").Plugin[],
      jsx: "automatic",
      jsxImportSource: jsxSource,
    });
    const output = result.outputFiles[0];
    if (!output) throw new HinoteError("build produced no output.");
    return output.text;
  } catch (error) {
    if (error instanceof HinoteError) throw error;
    // esbuild throws an error with the build's messages in `errors`.
    const errors =
      isPlainObject(error) && Array.isArray(error.errors) ? error.errors : [];
    throw new HinoteError(
      errors
        .map((item: unknown) => (isPlainObject(item) ? item.text : undefined))
        .filter((text) => typeof text === "string")
        .join("\n") || (error instanceof Error ? error.message : String(error)),
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
      if (isPlainObject(error) && error.code === "EADDRINUSE") throw inUse();
      throw error;
    }
  }
  const { serve: serveNode } = await optional(
    "@hono/node-server",
    NODE_IMPORTS["@hono/node-server"],
  );
  return new Promise((resolve, reject) => {
    const server = serveNode(options, (info) => {
      resolve({
        port: info.port,
        stop: () => {
          server.close();
          if ("closeAllConnections" in server) server.closeAllConnections();
        },
      });
    });
    server.once("error", (error: NodeJS.ErrnoException) =>
      reject(error.code === "EADDRINUSE" ? inUse() : error),
    );
  });
}
