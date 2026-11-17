// The steps the everyday commands are made of. Each does one thing, reads a
// deck or HTML, and writes text or HTML that the next step can take, so an
// agent can run them one at a time to see where something goes wrong.
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { decode, referencedPaths } from "../assets.ts";
import type { Deck } from "../deck.ts";
import { HinoteError, UsageError } from "../errors.ts";
import { deckPath, loadDeckFile } from "../load.ts";
import type { Page } from "../render.ts";
import { inlineScripts } from "../scripts.ts";
import { resolveInside } from "../server.ts";
import type { Command } from "./command.ts";

export const DECK_ARG = "[deck.tsx]";

export const OUTPUT_FLAG = (what: string, fallback?: string) => ({
  type: "string" as const,
  alias: "o",
  value: "path",
  description: what,
  default: fallback,
});

// Writes through a temporary file, so a reader never sees half a page.
export async function writeOutput(file: string, text: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, text);
  try {
    await rename(temporary, file);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

async function readInput(file: string | undefined): Promise<string> {
  if (file !== undefined && file !== "-") {
    try {
      return await readFile(resolve(file), "utf8");
    } catch {
      throw new HinoteError(`Could not read ${resolve(file)}.`, {
        code: "file-not-found",
      });
    }
  }
  if (process.stdin.isTTY)
    throw new UsageError(
      "inline reads HTML from a file or from stdin.",
      "hinote render | hinote inline > deck.html",
    );
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

// Prints HTML, or writes it to -o and says where.
function emit(out: Parameters<Command["run"]>[1], html: string, file?: string) {
  if (file === undefined) {
    if (out.json) out.result({ html });
    else out.raw(html);
    return Promise.resolve();
  }
  const output = resolve(file);
  return writeOutput(output, html).then(() => out.result({ output }, output));
}

export type SlideInfo = {
  // Counted from 1, as in the URL /3.
  number: number;
  title?: string;
  notes?: string;
  // Key presses that reveal a step before the slide moves on.
  steps: number;
  class?: string;
  transition?: string;
  // Relative paths the slide loads, as written.
  files: string[];
  // Why the slide did not render.
  error?: string;
};

// Renders each slide by itself and reads back what a person would see.
export async function describeSlides(deck: Deck): Promise<SlideInfo[]> {
  const rendered = await deck.renderEach("view");
  return deck.slides.map((slide, index) => {
    const result = rendered[index] ?? { error: "not rendered" };
    const info: SlideInfo = {
      number: index + 1,
      title: slide.options.title,
      notes: slide.options.notes,
      steps: 0,
      class: slide.options.class,
      transition: slide.options.transition ?? deck.config.transition,
      files: [],
    };
    if ("error" in result) {
      const error = result.error;
      info.error = error instanceof Error ? error.message : String(error);
      return info;
    }
    const body = result.html.slice(result.html.indexOf('<div id="deck"'));
    info.title ??= firstHeading(body);
    info.steps = new Set(
      [...body.matchAll(/data-hinote-step="(\d+)"/g)].map((m) => m[1]),
    ).size;
    info.files = referencedPaths(result.html);
    return info;
  });
}

function firstHeading(html: string): string | undefined {
  const match = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/i.exec(html);
  const text = decode((match?.[2] ?? "").replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
}

const PAGES = ["view", "presenter", "static"] as const;

export const render: Command = {
  name: "render",
  group: "plumbing",
  summary: "Print one page of the deck as HTML",
  args: DECK_ARG,
  maxArgs: 1,
  description: `Renders the deck and prints one page. <Script> files stay as placeholders; pipe the page through \`hinote inline\` to bundle them in.

static is the one-file page that build writes. view and presenter are the pages a server answers at / and /presenter, here without sync.`,
  flags: {
    page: {
      type: "string",
      value: PAGES.join("|"),
      default: "static",
      description: "Which page to render.",
    },
    base: {
      type: "string",
      value: "/path",
      description: "The path view and presenter pages are served under.",
    },
    output: OUTPUT_FLAG("Write the page to a file instead of stdout."),
  },
  examples: [
    "hinote render",
    "hinote render --page presenter -o presenter.html",
    "hinote render | hinote inline > deck.html",
  ],
  bundles: true,
  async run(args, out) {
    const page = (args.flags.page ?? "static") as Page;
    if (!PAGES.includes(page))
      throw new UsageError(
        `--page must be one of ${PAGES.join(", ")}.`,
        "hinote help render",
      );
    const deck = await loadDeckFile(deckPath(args.positionals[0]));
    const base = page === "static" ? undefined : String(args.flags.base ?? "");
    await emit(
      out,
      await deck.render(page, { base }),
      args.flags.output as string | undefined,
    );
  },
};

export const inline: Command = {
  name: "inline",
  group: "plumbing",
  summary: "Bundle the <Script> files of a page into it",
  args: "[page.html | -]",
  maxArgs: 1,
  description: `Reads a page from the file, or from stdin, bundles each <Script> file it names for the browser, and prints the page with the code inline.`,
  flags: { output: OUTPUT_FLAG("Write the page to a file instead of stdout.") },
  examples: [
    "hinote render | hinote inline > deck.html",
    "hinote inline page.html -o deck.html",
  ],
  bundles: true,
  async run(args, out) {
    const html = await readInput(args.positionals[0]);
    await emit(
      out,
      await inlineScripts(html),
      args.flags.output as string | undefined,
    );
  },
};

export const refs: Command = {
  name: "refs",
  group: "plumbing",
  summary: "List the files the slides refer to",
  args: DECK_ARG,
  maxArgs: 1,
  description: `Lists every relative path the slides load (src, href, srcset, and url() in CSS), relative to the deck file, and whether the file is there. These are the files build, prerender, and assets copy.`,
  flags: {},
  examples: ["hinote refs", "hinote refs talk/deck.tsx --json"],
  bundles: true,
  async run(args, out) {
    const file = deckPath(args.positionals[0]);
    const deck = await loadDeckFile(file);
    const files = referencedPaths(await deck.render("static")).map((path) => ({
      path,
      exists: resolveInside(dirname(file), path) !== null,
    }));
    out.result(
      files,
      files.map((f) => (f.exists ? f.path : `${f.path}\t(missing)`)),
    );
  },
};

export const inspect: Command = {
  name: "inspect",
  group: "plumbing",
  summary: "Describe the deck: slides, titles, steps, notes",
  args: DECK_ARG,
  maxArgs: 1,
  description: `Loads the deck and renders each slide by itself, then reports what is in it: for each slide its number (as in /3), title (the title option or its first heading), steps, notes, and the files it loads. A slide that fails to render is listed with its error.`,
  flags: {},
  examples: ["hinote inspect", "hinote inspect --json"],
  bundles: true,
  async run(args, out) {
    const file = deckPath(args.positionals[0]);
    const deck = await loadDeckFile(file);
    const slides = await describeSlides(deck);
    const data = {
      file,
      title: deck.config.title ?? slides.find((s) => s.title)?.title,
      aspect: deck.config.aspect ?? "16:9",
      canvas: deck.canvas,
      presenter: deck.presenter,
      slides,
    };
    out.result(data, [
      `${file}: ${slides.length} slides, ${data.aspect}`,
      ...slides.map((s) =>
        [
          String(s.number).padStart(3),
          s.error ? `error: ${s.error}` : (s.title ?? "(no title)"),
          s.steps > 0 ? `steps ${s.steps}` : "",
          s.notes ? "notes" : "",
          s.files.length > 0 ? `files ${s.files.join(" ")}` : "",
        ]
          .filter(Boolean)
          .join("  "),
      ),
    ]);
  },
};

type Problem = {
  code: string;
  message: string;
  slides?: number[];
  hint?: string;
};

export const check: Command = {
  name: "check",
  group: "plumbing",
  summary: "Render every slide and report what is broken",
  args: DECK_ARG,
  maxArgs: 1,
  description: `Loads the deck, renders each slide by itself, looks for the files the slides refer to, and bundles every <Script>. Each problem names its slides and has a code:

  deck-not-found, deck-load, deck-export   The deck file could not be loaded
  render                                   A slide threw while rendering
  missing-file                             A slide loads a file that is not there
  script                                   A <Script> file did not bundle

Exits 1 when there is a problem, so it can gate a build: hinote check && hinote build`,
  flags: {},
  examples: [
    "hinote check",
    "hinote check --json",
    "hinote check && hinote build",
  ],
  bundles: true,
  async run(args, out) {
    const file = deckPath(args.positionals[0]);
    const problems: Problem[] = [];
    let count = 0;
    try {
      const deck = await loadDeckFile(file);
      const slides = await describeSlides(deck);
      count = slides.length;
      for (const slide of slides)
        if (slide.error)
          problems.push({
            code: "render",
            message: slide.error,
            slides: [slide.number],
          });
      const users = new Map<string, number[]>();
      for (const slide of slides)
        for (const path of slide.files)
          users.set(path, [...(users.get(path) ?? []), slide.number]);
      for (const [path, numbers] of users)
        if (!resolveInside(dirname(file), path))
          problems.push({
            code: "missing-file",
            message: `"${path}" is not in ${dirname(file)}.`,
            // The deck's own CSS reaches every slide; name it once.
            slides: numbers.length === slides.length ? undefined : numbers,
            hint: "Paths are relative to the deck file, and must stay inside its directory.",
          });
      if (problems.every((p) => p.code !== "render"))
        await inlineScripts(await deck.render("static")).catch((error) => {
          if (!(error instanceof HinoteError)) throw error;
          problems.push({ code: "script", message: error.message });
        });
    } catch (error) {
      if (!(error instanceof HinoteError)) throw error;
      problems.push({
        code: error.code,
        message: error.message,
        hint: error.hint,
      });
    }
    const ok = problems.length === 0;
    out.result(
      { file, slides: count, problems },
      ok
        ? `ok: ${count} slides, no problems`
        : [
            ...problems.flatMap((p) => [
              `${p.slides ? `slide ${p.slides.join(", ")}: ` : ""}${p.code}: ${p.message}`,
              ...(p.hint ? [`  hint: ${p.hint}`] : []),
            ]),
            `${problems.length} problem${problems.length > 1 ? "s" : ""}`,
          ],
      ok,
    );
    return ok ? 0 : 1;
  },
};
