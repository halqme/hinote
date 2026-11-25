// The steps the everyday commands are made of. Each does one thing, reads a
// deck or HTML, and writes text or HTML that the next step can take, so an
// agent can run them one at a time to see where something goes wrong.
import { existsSync } from "node:fs";
import { text as readText } from "node:stream/consumers";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { decode, referencedPaths, remoteUrls } from "../build/assets.ts";
import {
  contrastWarningsForTheme,
  type ContrastWarning,
} from "../deck/contrast.ts";
import type { Deck } from "../deck/deck.ts";
import { conventionProblems } from "./conventions.ts";
import { HinoteError, isHinoteError, UsageError } from "../errors.ts";
import { deckPath, loadDeckFile } from "../build/load.ts";
import { inlineScripts } from "../build/scripts.ts";
import { resolveInside } from "../build/server.ts";
import { defaultTheme, mergeTheme } from "../deck/theme.ts";
import { stringFlag } from "./args.ts";
import type { Command } from "./command.ts";
import { stepsIn } from "../components/step.tsx";

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
  return readText(process.stdin);
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
  // What <Link to> names it by.
  id?: string;
  // The section of each nested deck around it, outermost first.
  sections?: string[];
  title?: string;
  notes?: string;
  // Key presses that reveal a step before the slide moves on.
  steps: number;
  class?: string;
  transition?: string;
  // Relative paths the slide loads, as written.
  files: string[];
  // Files it loads from the network, which a built page shows only online.
  remote?: string[];
  // Why the slide did not render, and the code and hint of an error that
  // carries them, such as one a component threw.
  error?: string;
  errorCode?: string;
  errorHint?: string;
  // What renders but is likely not what was meant.
  warnings?: MarkupWarning[];
};

export type MarkupWarning = { code: string; message: string; hint: string };

const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

// A <Step> left as a <div> directly inside a list makes the list invalid
// HTML: a list holds only <li>.
export function markupWarnings(html: string): MarkupWarning[] {
  const stack: string[] = [];
  let found = false;
  for (const [, close, name = "", attributes = "", self] of html.matchAll(
    /<(\/?)([a-z][a-z0-9-]*)\b([^>]*?)(\/?)>/g,
  )) {
    if (close) {
      const at = stack.lastIndexOf(name);
      if (at >= 0) stack.length = at;
      continue;
    }
    const parent = stack.at(-1);
    if (
      (parent === "ul" || parent === "ol") &&
      name !== "li" &&
      /\sdata-hinote-step=/.test(attributes)
    )
      found = true;
    if (!self && !VOID.has(name)) stack.push(name);
  }
  return found
    ? [
        {
          code: "step-in-list",
          message:
            "A <Step> inside a list renders as a <div>, which a list cannot hold.",
          hint: 'Write <Step as="li"> for a list item.',
        },
      ]
    : [];
}

// Errors any code can throw, read back with what to do about them.
function renderHint(message: string): string | undefined {
  if (message.includes("hinote is not defined"))
    return "hinote exists only in the browser. Use it from a *.client.tsx file. See: hinote skills get core --ref client";
  if (/Invalid URL/.test(message))
    return 'new URL() with a relative path needs a base: new URL("./widget.client.tsx", import.meta.url).';
  return undefined;
}

// Renders each slide by itself and reads back what a person would see.
export async function describeSlides(deck: Deck): Promise<SlideInfo[]> {
  const rendered = await deck.renderEach("view");
  return deck.slides.map((slide, index) => {
    const result = rendered[index] ?? { error: "not rendered" };
    const info: SlideInfo = {
      number: index + 1,
      ...(slide.options.id ? { id: slide.options.id } : {}),
      ...(slide.sections?.length ? { sections: [...slide.sections] } : {}),
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
      if (isHinoteError(error)) {
        if (error.code !== "error") info.errorCode = error.code;
        if (error.hint) info.errorHint = error.hint;
      }
      return info;
    }
    const body = result.html.slice(result.html.indexOf('<div id="deck"'));
    info.title ??= firstHeading(body);
    info.steps = stepsIn(body).size;
    const warnings = markupWarnings(body);
    if (warnings.length > 0) info.warnings = warnings;
    info.files = referencedPaths(result.html);
    const remote = remoteUrls(result.html);
    if (remote.length > 0) info.remote = remote;
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
  async run(args, out) {
    const requested = stringFlag(args, "page") ?? "static";
    const page = PAGES.find((name) => name === requested);
    if (!page)
      throw new UsageError(
        `--page must be one of ${PAGES.join(", ")}.`,
        "hinote help render",
      );
    const deck = await loadDeckFile(deckPath(args.positionals[0]));
    const base =
      page === "static" ? undefined : (stringFlag(args, "base") ?? "");
    await emit(
      out,
      await deck.render(page, { base }),
      stringFlag(args, "output"),
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
  async run(args, out) {
    const html = await readInput(args.positionals[0]);
    await emit(out, await inlineScripts(html), stringFlag(args, "output"));
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
  description: `Loads the deck and renders each slide by itself, then reports what is in it: for each slide its number (as in /3), title (the title option or its first heading), id, the sections of the decks around it, steps, notes, transition, and the files it loads. The text lists slides under the section they belong to. A slide that fails to render is listed with its error.`,
  flags: {},
  examples: ["hinote inspect", "hinote inspect --json"],
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
    // Slides indent under the sections of their nested decks, each named
    // where it starts, so the outline of the talk shows and a slide back at
    // the top level is back at the margin.
    const lines = [`${file}: ${slides.length} slides, ${data.aspect}`];
    let open: string[] = [];
    for (const s of slides) {
      const sections = s.sections ?? [];
      let same = 0;
      while (same < open.length && open[same] === sections[same]) same++;
      for (let depth = same; depth < sections.length; depth++)
        lines.push(`${"  ".repeat(depth + 1)}${sections[depth]}`);
      open = sections;
      lines.push(
        "  ".repeat(sections.length) +
          [
            String(s.number).padStart(3),
            s.error ? `error: ${s.error}` : (s.title ?? "(no title)"),
            s.id ? `id ${s.id}` : "",
            s.steps > 0 ? `steps ${s.steps}` : "",
            s.notes ? "notes" : "",
            s.transition && s.transition !== "none"
              ? `transition ${s.transition}`
              : "",
            s.files.length > 0 ? `files ${s.files.join(" ")}` : "",
          ]
            .filter(Boolean)
            .join("  "),
      );
    }
    out.result(data, lines);
  },
};

type Problem = {
  code: string;
  message: string;
  slides?: number[];
  hint?: string;
};

// Effective colors after default → deck → slide (nested decks already merged
// into each slide's theme). Group identical failures across slides.
function themeContrastWarnings(deck: Deck): ContrastWarning[] {
  const base = mergeTheme(defaultTheme, deck.config.theme);
  const groups = new Map<string, ContrastWarning>();
  for (let i = 0; i < deck.slides.length; i++) {
    const theme = mergeTheme(base, deck.slides[i]!.options.theme);
    const number = i + 1;
    for (const warning of contrastWarningsForTheme(theme)) {
      const key = `${warning.message}\0${warning.hint}`;
      const existing = groups.get(key);
      if (existing) existing.slides.push(number);
      else groups.set(key, { ...warning, slides: [number] });
    }
  }
  return [...groups.values()];
}

export const check: Command = {
  name: "check",
  group: "plumbing",
  summary: "Render every slide and report what is broken",
  args: DECK_ARG,
  maxArgs: 1,
  description: `Loads the deck, renders each slide by itself, looks for the files the slides refer to, bundles every <Script>, and reads the source for mistakes a render cannot see. Each problem names its slides when it can, and has a code and a hint:

  deck-not-found, deck-load, deck-export   The deck file could not be loaded
  slide-shape                              createSlide got something other than a render function or slides
  render                                   A slide threw while rendering
  script-src                               <Script src> is a source file as a string
  missing-file                             A slide loads a file that is not there
  script                                   A <Script> file did not bundle
  flattened-deck                           A deck was mapped or flattened into slides
  browser-global                           hinote was used outside a *.client.tsx file
  server-handler                           An on* handler on a slide, where it never runs
  server-hook                              A state or effect hook in a slide file

A component's own error keeps its code, such as math from @hinote/katex.

Warnings keep exit 0:

  contrast       fg, muted, or accent reach less than 7:1 against bg or surface
                 (#rgb, #rrggbb, and rgb() values; var() and color-mix() are skipped)
  step-in-list   A <Step> inside a list without as="li"
  remote-file    A slide loads a file from the network, which a built page shows only online

Exits 1 when there is a problem, so it can gate a build: hinote check && hinote build`,
  flags: {},
  examples: [
    "hinote check",
    "hinote check --json",
    "hinote check && hinote build",
  ],
  async run(args, out) {
    const file = deckPath(args.positionals[0]);
    const problems: Problem[] = [];
    const warnings: (
      ContrastWarning | (MarkupWarning & { slides: number[] })
    )[] = [];
    let count = 0;
    try {
      const deck = await loadDeckFile(file);
      const slides = await describeSlides(deck);
      count = slides.length;
      const markup = new Map<
        string,
        { warning: MarkupWarning; slides: number[] }
      >();
      for (const slide of slides)
        for (const warning of slide.warnings ?? []) {
          const seen = markup.get(warning.code) ?? { warning, slides: [] };
          seen.slides.push(slide.number);
          markup.set(warning.code, seen);
        }
      for (const { warning, slides: numbers } of markup.values())
        warnings.push({ ...warning, slides: numbers });
      const remote = new Map<string, number[]>();
      for (const slide of slides)
        for (const url of slide.remote ?? [])
          remote.set(url, [...(remote.get(url) ?? []), slide.number]);
      for (const [url, numbers] of remote)
        warnings.push({
          code: "remote-file",
          message: `"${url}" is loaded from the network, so the built page shows it only while online.`,
          slides: numbers,
          hint: "Save the file next to the deck and load it by a relative path; hinote build copies it, and build --embed puts it in the HTML.",
        });
      for (const slide of slides)
        if (slide.error)
          problems.push({
            code: slide.errorCode ?? "render",
            message: slide.error,
            slides: [slide.number],
            hint: slide.errorHint ?? renderHint(slide.error),
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
          if (!isHinoteError(error)) throw error;
          problems.push({ code: "script", message: error.message });
        });
      for (const warning of themeContrastWarnings(deck)) warnings.push(warning);
    } catch (error) {
      if (!isHinoteError(error)) throw error;
      problems.push({
        code: error.code,
        message: error.message,
        hint: error.hint,
      });
    }
    // Read the source even when the deck failed to load: flattening a deck is
    // often why the array is rejected, and that hint is the one to follow.
    if (existsSync(file))
      for (const problem of conventionProblems(file)) problems.push(problem);
    const ok = problems.length === 0;
    const lines = ok
      ? warnings.length === 0
        ? `ok: ${count} slides, no problems`
        : [
            ...warnings.flatMap((w) => [
              `slide ${w.slides.join(", ")}: warning ${w.code}: ${w.message}`,
              ...(w.hint ? [`  hint: ${w.hint}`] : []),
            ]),
            `${warnings.length} warning${warnings.length > 1 ? "s" : ""}`,
          ]
      : [
          ...problems.flatMap((p) => [
            `${p.slides ? `slide ${p.slides.join(", ")}: ` : ""}${p.code}: ${p.message}`,
            ...(p.hint ? [`  hint: ${p.hint}`] : []),
          ]),
          ...warnings.flatMap((w) => [
            `slide ${w.slides.join(", ")}: warning ${w.code}: ${w.message}`,
            ...(w.hint ? [`  hint: ${w.hint}`] : []),
          ]),
          `${problems.length} problem${problems.length > 1 ? "s" : ""}`,
        ];
    out.result({ file, slides: count, problems, warnings }, lines, ok);
    return ok ? 0 : 1;
  },
};
