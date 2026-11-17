import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HinoteError, UsageError } from "../errors.ts";
import type { Command } from "./command.ts";

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
  name: string;
  description: string;
  path: string;
  references: string[];
};

function frontmatter(text: string, key: string): string {
  const head = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? "";
  return new RegExp(`^${key}:\\s*(.*)$`, "m").exec(head)?.[1]?.trim() ?? "";
}

async function listSkills(): Promise<Skill[]> {
  const root = skillsDir();
  const skills: Skill[] = [];
  for (const name of (await readdir(root)).sort()) {
    const file = join(root, name, "SKILL.md");
    if (!existsSync(file)) continue;
    const refs = join(root, name, "references");
    skills.push({
      name,
      description: frontmatter(await readFile(file, "utf8"), "description"),
      path: join(root, name),
      references: existsSync(refs)
        ? (await readdir(refs))
            .filter((f) => f.endsWith(".md"))
            .map((f) => f.slice(0, -3))
            .sort()
        : [],
    });
  }
  return skills;
}

async function findSkill(name: string | undefined): Promise<Skill> {
  const skills = await listSkills();
  const skill = skills.find((s) => s.name === (name ?? "core"));
  if (!skill)
    throw new HinoteError(`There is no skill "${name}".`, {
      code: "skill-not-found",
      hint: `Skills: ${skills.map((s) => s.name).join(", ")}`,
    });
  return skill;
}

export const skills: Command = {
  name: "skills",
  group: "agent",
  summary: "Guides for agents writing decks, matched to this version",
  args: "[list|get|path] [name]",
  maxArgs: 2,
  description: `Prints the guides that ship with this hinote, so an agent learns the version it is driving instead of guessing from flags. Start with core: the deck model, the edit-and-check loop, and what tends to go wrong. Its references hold the details; --ref loads one, --full appends all of them.

To install a skill for an agent that reads skill directories, copy the directory skills path prints, e.g.
  cp -R "$(hinote skills path core)" .claude/skills/hinote`,
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
  examples: [
    "hinote skills",
    "hinote skills get core",
    "hinote skills get core --ref api",
    "hinote skills get core --full",
  ],
  async run(args, out) {
    const [action = "list", name] = args.positionals;
    if (action === "list") {
      if (name !== undefined)
        throw new UsageError(
          "skills list takes no name.",
          "hinote skills get <name>",
        );
      const all = await listSkills();
      out.result(
        all.map((s) => ({
          name: s.name,
          description: s.description,
          references: s.references,
        })),
        all.map(
          (s) =>
            `  ${s.name.padEnd(12)}${s.description}` +
            (s.references.length > 0
              ? `\n  ${"".padEnd(12)}references: ${s.references.join(", ")}`
              : ""),
        ),
      );
      return;
    }
    if (action === "path") {
      const skill = await findSkill(name);
      out.result({ name: skill.name, path: skill.path }, skill.path);
      return;
    }
    if (action !== "get")
      throw new UsageError(
        `skills has no action "${action}".`,
        "hinote skills [list | get <name> | path [name]]",
      );
    const skill = await findSkill(name);
    const ref = args.flags.ref as string | undefined;
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
    out.result({ name: skill.name, content: text }, text);
  },
};
