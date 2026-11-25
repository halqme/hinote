import { HtmlEscapedCallbackPhase, resolveCallback } from "hono/utils/html";
import { HinoteError } from "../errors.ts";

// Hono/JSX renders to a string, or to a promise of one when a component is
// async. `message` is the error when `node` is not JSX.
export async function elementHtml(
  node: unknown,
  message = "Slide renderers must return JSX.",
): Promise<string> {
  // Read without binding: it is called on the node below.
  const toHtml: unknown =
    node && typeof node === "object"
      ? Reflect.get(node, "toString")
      : undefined;
  if (typeof toHtml !== "function") throw new HinoteError(message);
  // An escaped String object can carry callbacks (Suspense, ErrorBoundary);
  // resolving them is what Hono itself does before sending a response.
  const rendered: unknown = await toHtml.call(node);
  // Hono's escaped strings are String objects made in this realm.
  // oxlint-disable-next-line unicorn/no-instanceof-builtins
  if (typeof rendered !== "string" && !(rendered instanceof String))
    throw new HinoteError(message);
  return resolveCallback(
    // Hono types its escaped strings as primitives, but they are String
    // objects, and converting one would drop its callbacks.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    rendered as string,
    HtmlEscapedCallbackPhase.Stringify,
    false,
    {},
  );
}
