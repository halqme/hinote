// What the CLI needs from its runtime: bundling a deck and serving it.
// Rolldown bundles on every runtime. Bun serves with Bun.serve, and Node with
// node:http through the adapter at the end of this file. The library itself
// (src/index.ts) needs neither.
import { once } from "node:events";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { Plugin } from "rolldown";
import { HinoteError } from "../errors.ts";
import { isPlainObject } from "@hinote/core/internal";

export const isBun = typeof Bun !== "undefined";

// Bundles `entry` and everything it imports into one ES module: for the
// server (a deck, JSX from hono/jsx) or for the browser (a <Script> file,
// JSX from hono/jsx/dom, minified). CSS is imported as text, as
// `import style from "./style.css" with { type: "text" }` asks.
export async function bundle(
  entry: string,
  plugins: Plugin[] = [],
  target: "server" | "browser" = "server",
): Promise<string> {
  const browser = target === "browser";
  // Loaded when first needed: the commands that do not bundle start faster.
  const { rolldown } = await import("rolldown");
  try {
    const build = await rolldown({
      input: entry,
      platform: browser ? "browser" : "node",
      moduleTypes: { ".css": "text" },
      transform: {
        jsx: {
          runtime: "automatic",
          importSource: browser ? "hono/jsx/dom" : "hono/jsx",
          development: false,
        },
      },
      plugins,
      logLevel: "silent",
    });
    try {
      const { output } = await build.generate({
        format: "esm",
        codeSplitting: false,
        minify: browser,
      });
      const [chunk] = output;
      if (!chunk) throw new HinoteError("build produced no output.");
      return chunk.code;
    } finally {
      await build.close();
    }
  } catch (error) {
    if (error instanceof HinoteError) throw error;
    // Rolldown throws one error whose `errors` lists each reason.
    const reasons =
      isPlainObject(error) && Array.isArray(error.errors) ? error.errors : [];
    const messages = reasons
      .map((item: unknown) => (isPlainObject(item) ? item.message : undefined))
      .filter((text) => typeof text === "string");
    throw new HinoteError(
      messages.join("\n") ||
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
      if (isPlainObject(error) && error.code === "EADDRINUSE") throw inUse();
      throw error;
    }
  }
  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      void respond(options.fetch, request, response);
    });
    server.once("error", (error: NodeJS.ErrnoException) =>
      reject(error.code === "EADDRINUSE" ? inUse() : error),
    );
    server.listen(options.port, options.hostname, () => {
      const address = server.address();
      resolve({
        port:
          typeof address === "object" && address ? address.port : options.port,
        stop: () => {
          server.close();
          server.closeAllConnections();
        },
      });
    });
  });
}

// Node's server speaks IncomingMessage and ServerResponse, the app Request and
// Response. The response body is streamed, so an event stream stays open; when
// the client goes away, the request's signal aborts and the body is cancelled.
// A request body is read whole: the deck's server takes only small ones.
async function respond(
  fetch: (request: Request) => Response | Promise<Response>,
  incoming: IncomingMessage,
  outgoing: ServerResponse,
): Promise<void> {
  const aborted = new AbortController();
  outgoing.once("close", () => aborted.abort());
  try {
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers))
      for (const item of [value ?? []].flat()) headers.append(name, item);
    const method = incoming.method ?? "GET";
    const url = new URL(incoming.url ?? "/", `http://${incoming.headers.host}`);
    let body: Uint8Array<ArrayBuffer> | undefined;
    if (method !== "GET" && method !== "HEAD") {
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
      body = new Uint8Array(Buffer.concat(chunks));
    }
    const response = await fetch(
      new Request(url, { method, headers, body, signal: aborted.signal }),
    );
    outgoing.statusCode = response.status;
    for (const [name, value] of response.headers)
      if (name !== "set-cookie") outgoing.setHeader(name, value);
    const cookies = response.headers.getSetCookie();
    if (cookies.length > 0) outgoing.setHeader("set-cookie", cookies);
    if (!response.body) {
      outgoing.end();
      return;
    }
    outgoing.flushHeaders();
    const reader = response.body.getReader();
    aborted.signal.addEventListener("abort", () => {
      reader.cancel().catch(() => {});
    });
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!outgoing.write(value))
        await once(outgoing, "drain", { signal: aborted.signal });
    }
    outgoing.end();
  } catch {
    // A client that left mid-stream ends the pipeline; nothing to answer.
    if (!outgoing.headersSent) outgoing.writeHead(500);
    if (!outgoing.writableEnded) outgoing.end();
  }
}
