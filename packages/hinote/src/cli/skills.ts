import { existsSync, readdirSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HinoteError, UsageError } from "../errors.ts";
import { stringFlag } from "./args.ts";
import type { Command } from "./command.ts";
import { ownPackage } from "./package.ts";

// The skills ship in the package, so they always match this version of the
// CLI. This file runs from src/cli/ or, bundled, from dist/, so look upward.
function skillsDir(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidate = join(dir, "skills");
    if (existsSync(join(candidate, "core", "SKILL.md"))) return candidate;
    const parent = dirname(dir);
    if (parent === dir)
      throw new HinoteError("The skills are missing from this install.", {
        code: "skills-missing",
        hint: "Reinstall hinote.",
      });
    dir = parent;
  }
}

type Skill = {
  // The directory, which `get` takes.
  name: string;
  // What the skill calls itself, the directory an agent installs it as.
  id: string;
  description: string;
  path: string;
  references: string[];
};

function frontmatter(text: string, key: string): string {
  const head = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? "";
  return new RegExp(`^${key}:\\s*(.*)$`, "m").exec(head)?.[1]?.trim() ?? "";
}

// Every directory with a SKILL.md, described by its own frontmatter. Read
// synchronously so help can list them too.
function listSkills(): Skill[] {
  const root = skillsDir();
  const skills: Skill[] = [];
  for (const name of readdirSync(root).sort()) {
    const file = join(root, name, "SKILL.md");
    if (!existsSync(file)) continue;
    const refs = join(root, name, "references");
    const text = readFileSync(file, "utf8");
    skills.push({
      name,
      id: frontmatter(text, "name") || name,
      description: frontmatter(text, "description"),
      path: join(root, name),
      references: existsSync(refs)
        ? readdirSync(refs)
            .filter((f) => f.endsWith(".md"))
            .map((f) => f.slice(0, -3))
            .sort()
        : [],
    });
  }
  return skills;
}

function skillLines(all: readonly Skill[]): string[] {
  return all.map(
    (s) =>
      `  ${s.name.padEnd(12)}${s.description}` +
      (s.references.length > 0
        ? `\n  ${"".padEnd(12)}references: ${s.references.join(", ")}`
        : ""),
  );
}

function findSkill(name: string | undefined): Skill {
  const skills = listSkills();
  const skill = skills.find((s) => s.name === (name ?? "core"));
  if (!skill)
    throw new HinoteError(`There is no skill "${name}".`, {
      code: "skill-not-found",
      hint: `Skills: ${skills.map((s) => s.name).join(", ")}`,
    });
  return skill;
}

// A package's guide ships here, with this hinote. The packages are released
// with hinote's version, so a different version of the package in the deck
// may not match the guide. Nothing is said when it is not installed.
async function versionNotice(skill: string): Promise<string | undefined> {
  if (skill === "core") return undefined;
  for (let dir = process.cwd(); ; dir = dirname(dir)) {
    const file = join(dir, "node_modules", "@hinote", skill, "package.json");
    if (existsSync(file)) {
      const json: unknown = JSON.parse(await readFile(file, "utf8"));
      const version =
        typeof json === "object" && json !== null && "version" in json
          ? String(json.version)
          : undefined;
      const own = ownPackage().version;
      return version === undefined || version === own
        ? undefined
        : `This guide is for @hinote/${skill} ${own}, with hinote ${own}; the deck has ${version}. Install the same version as hinote.`;
    }
    if (dirname(dir) === dir) return undefined;
  }
}

export const skills: Command = {
  name: "skills",
  group: "agent",
  summary: "Guides for agents writing decks, matched to this version",
  args: "[list|get|path] [name]",
  maxArgs: 2,
  description: `Prints the guides that ship with this hinote, so an agent learns the version it is driving instead of guessing from flags. Each guide is a skill directory: its SKILL.md says what it is for, and its references hold the details; --ref loads one, --full appends all of them.

To install a skill for an agent that reads skill directories, copy the directory skills path prints.`,
  flags: {
    full: {
      type: "boolean",
      description: "With get: append every reference.",
    },
    ref: {
      type: "string",
      value: "name",
      description: "With get: print one reference instead of the guide.",
    },
  },
  examples: ["hinote skills"],
  // The guides and their examples come from the skill directories, so help
  // lists what this install has.
  dynamicHelp() {
    const all = listSkills();
    const first = all.find((s) => s.references.length > 0) ?? all[0];
    return {
      sections: [{ title: "Skills", lines: skillLines(all) }],
      examples: first
        ? [
            ...all.map((s) => `hinote skills get ${s.name}`),
            ...(first.references[0]
              ? [`hinote skills get ${first.name} --ref ${first.references[0]}`]
              : []),
            `hinote skills get ${first.name} --full`,
            `cp -R "$(hinote skills path ${first.name})" .claude/skills/${first.id}`,
          ]
        : [],
    };
  },
  async run(args, out) {
    const [action = "list", name] = args.positionals;
    if (action === "list") {
      if (name !== undefined)
        throw new UsageError(
          "skills list takes no name.",
          "hinote skills get <name>",
        );
      const all = listSkills();
      out.result(
        all.map((s) => ({
          name: s.name,
          description: s.description,
          references: s.references,
        })),
        skillLines(all),
      );
      return;
    }
    if (action === "path") {
      const skill = findSkill(name);
      out.result({ name: skill.name, path: skill.path }, skill.path);
      return;
    }
    if (action !== "get")
      throw new UsageError(
        `skills has no action "${action}".`,
        "hinote skills [list | get <name> | path [name]]",
      );
    const skill = findSkill(name);
    const ref = stringFlag(args, "ref");
    if (ref !== undefined) {
      if (!skill.references.includes(ref))
        throw new HinoteError(`${skill.name} has no reference "${ref}".`, {
          code: "reference-not-found",
          hint: `References: ${skill.references.join(", ")}`,
        });
      const text = await readFile(
        join(skill.path, "references", `${ref}.md`),
        "utf8",
      );
      out.result({ name: skill.name, reference: ref, content: text }, text);
      return;
    }
    let text = await readFile(join(skill.path, "SKILL.md"), "utf8");
    if (args.flags.full)
      for (const reference of skill.references)
        text += `\n\n${await readFile(join(skill.path, "references", `${reference}.md`), "utf8")}`;
    const warning = await versionNotice(skill.name);
    if (warning && !out.json) console.error(`warning: ${warning}`);
    out.result(
      { name: skill.name, content: text, ...(warning ? { warning } : {}) },
      text,
    );
  },
};
