import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { HinoteError } from "../errors.ts";
import { bundle } from "./runtime.ts";

const PLACEHOLDER =
  /<script type="module" data-hinote-src="([^"]+)"><\/script>/g;

// TypeScript's rule for relative imports: `./x.js` names the file compiled
// from `./x.ts` or `./x.tsx`. A package written that way can point <Script> at
// `new URL("./x.client.js", import.meta.url)` and find its source in src/
// and its build in dist/.
export function scriptPath(path: string): string {
  if (existsSync(path) || !/\.[cm]?js$/.test(path)) return path;
  const stem = path.replace(/\.([cm]?)js$/, ".$1ts");
  for (const source of [stem, `${stem}x`])
    if (existsSync(source)) return source;
  return path;
}

// Replaces each <Script> placeholder with nothing and appends one inline
// module per file before </body>, after the runtime that defines
// window.hinote. Module scripts run once the page is parsed, and copies of a
// slide (the presenter's previews) do not run them again.
export async function inlineScripts(html: string): Promise<string> {
  const files = [
    ...new Set([...html.matchAll(PLACEHOLDER)].map((m) => m[1] ?? "")),
  ];
  if (files.length === 0) return html;
  const modules: string[] = [];
  for (const href of files) {
    const path = scriptPath(fileURLToPath(href.replace(/&amp;/g, "&")));
    let code: string;
    try {
      code = await bundle(path, [], "browser");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new HinoteError(`Could not bundle <Script> ${path}: ${message}`);
    }
    // The HTML parser ends a script at "</script".
    modules.push(
      `<script type="module">${code.replace(/<\/script/gi, "\\u003c/script")}</script>`,
    );
  }
  const page = html.replace(PLACEHOLDER, "");
  const end = page.lastIndexOf("</body>");
  return end < 0
    ? page + modules.join("")
    : page.slice(0, end) + modules.join("") + page.slice(end);
}
