import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import * as p from "@clack/prompts";
import { Command } from "commander";
import pc from "picocolors";

import { featureModules } from "./features/index.js";
import { scaffoldBase } from "./scaffold.js";
import type { DbChoice, PackageManager, ProjectContext } from "./types.js";
import { run } from "./utils/exec.js";
import { detectPackageManager } from "./utils/pm.js";

interface CliOptions {
  pm?: PackageManager;
  db?: DbChoice;
  styling?: boolean;
  auth?: boolean;
  tooling?: boolean;
  eslint?: boolean;
  yes?: boolean;
}

const PMS: PackageManager[] = ["pnpm", "npm", "yarn", "bun"];
const DBS: DbChoice[] = ["none", "drizzle", "prisma"];

function onCancel(): never {
  p.cancel("Cancelled.");
  process.exit(0);
}

function unwrap<T>(value: T | symbol): T {
  if (p.isCancel(value)) onCancel();
  return value as T;
}

async function gatherContext(nameArg: string | undefined, opts: CliOptions): Promise<ProjectContext> {
  p.intro(pc.bgCyan(pc.black(" devvkit ")) + pc.dim(" Next.js starter kit"));

  // Project name
  let name = nameArg;
  if (!name) {
    name = unwrap(
      await p.text({
        message: "Project name?",
        placeholder: "my-app",
        validate: (v) => {
          if (!v) return "Project name is required.";
          if (/[^a-zA-Z0-9._-]/.test(v)) return "Use only letters, numbers, '.', '-', '_'.";
          return undefined;
        },
      }),
    );
  }
  const dir = resolve(process.cwd(), name);
  if (existsSync(dir) && readdirSync(dir).length > 0) {
    p.cancel(`Directory "${name}" already exists and is not empty.`);
    process.exit(1);
  }

  // Package manager
  const pm: PackageManager =
    opts.pm ??
    (opts.yes
      ? detectPackageManager()
      : unwrap(
          await p.select({
            message: "Package manager?",
            initialValue: detectPackageManager(),
            options: PMS.map((m) => ({ value: m, label: m })),
          }),
        ));

  // Non-interactive path: defaults tuned by explicit flags.
  if (opts.yes) {
    return {
      name,
      dir,
      packageManager: pm,
      eslint: opts.eslint ?? true,
      features: {
        styling: opts.styling ?? true,
        auth: opts.auth ?? false,
        database: opts.db ?? "none",
        tooling: opts.tooling ?? true,
      },
    };
  }

  // ESLint
  const eslint = unwrap(await p.confirm({ message: "Add ESLint?", initialValue: true }));

  // Features
  const picked = unwrap(
    await p.multiselect({
      message: "Select features (space to toggle):",
      required: false,
      initialValues: ["styling", "tooling"],
      options: [
        { value: "styling", label: "Tailwind + shadcn/ui", hint: "styling" },
        { value: "database", label: "Database / ORM", hint: "Drizzle or Prisma" },
        { value: "auth", label: "Better Auth", hint: "email + password" },
        { value: "tooling", label: "Prettier + Husky + CI", hint: "lint/format/CI" },
      ],
    }),
  ) as string[];

  let database: DbChoice = "none";
  if (picked.includes("database")) {
    database = unwrap(
      await p.select({
        message: "Which ORM?",
        initialValue: "drizzle" as DbChoice,
        options: [
          { value: "drizzle", label: "Drizzle", hint: "SQLite" },
          { value: "prisma", label: "Prisma", hint: "SQLite" },
        ],
      }),
    );
  }

  return {
    name,
    dir,
    packageManager: pm,
    eslint,
    features: {
      styling: picked.includes("styling"),
      auth: picked.includes("auth"),
      database,
      tooling: picked.includes("tooling"),
    },
  };
}

function summary(ctx: ProjectContext): string {
  const f = ctx.features;
  const on = (b: boolean, label: string) => (b ? pc.green("✓ ") + label : pc.dim("· " + label));
  return [
    `${pc.bold("Project")}    ${ctx.name}`,
    `${pc.bold("Manager")}    ${ctx.packageManager}`,
    `${pc.bold("Features")}   ${on(f.styling, "Tailwind+shadcn")}`,
    `           ${f.database !== "none" ? pc.green("✓ ") + "DB:" + f.database : pc.dim("· Database")}`,
    `           ${on(f.auth, "Better Auth")}`,
    `           ${on(ctx.eslint, "ESLint")}`,
    `           ${on(f.tooling, "Prettier+Husky+CI")}`,
  ].join("\n");
}

async function tryGit(args: string[], cwd: string): Promise<void> {
  try {
    await run(["git", ...args], { cwd });
  } catch {
    // git missing or failed — non-fatal for scaffolding.
  }
}

async function runProject(ctx: ProjectContext): Promise<void> {
  p.log.step("Scaffolding Next.js base via create-next-app…");
  await scaffoldBase(ctx);

  // Init git up front so Husky hooks register and we can make an initial commit.
  await tryGit(["init", "-q", "-b", "main"], ctx.dir);

  for (const mod of featureModules) {
    if (!mod.enabled(ctx)) continue;
    p.log.step(`Adding ${pc.cyan(mod.title)}…`);
    await mod.apply(ctx);
  }

  await tryGit(["add", "-A"], ctx.dir);
  await tryGit(
    ["-c", "user.email=devvkit@local", "-c", "user.name=devvkit", "commit", "-q", "-m", "chore: initial scaffold from devvkit"],
    ctx.dir,
  );
}

export async function main(argv: string[]): Promise<void> {
  const program = new Command();
  program
    .name("devvkit")
    .description("Scaffold an opinionated Next.js starter kit.")
    .argument("[name]", "project directory name")
    .option("--pm <manager>", "package manager: pnpm | npm | yarn | bun")
    .option("--db <orm>", "database: none | drizzle | prisma")
    .option("--styling", "include Tailwind + shadcn/ui")
    .option("--no-styling", "exclude Tailwind + shadcn/ui")
    .option("--auth", "include Better Auth")
    .option("--no-auth", "exclude Better Auth")
    .option("--tooling", "include Prettier + Husky + CI")
    .option("--no-tooling", "exclude Prettier + Husky + CI")
    .option("--eslint", "include ESLint")
    .option("--no-eslint", "exclude ESLint")
    .option("-y, --yes", "skip prompts; use defaults (tuned by flags)")
    .allowExcessArguments(false);

  program.parse(argv);
  const nameArg = program.args[0];
  const opts = program.opts<CliOptions>();

  if (opts.pm && !PMS.includes(opts.pm)) {
    p.cancel(`Invalid --pm "${opts.pm}". Use one of: ${PMS.join(", ")}`);
    process.exit(1);
  }
  if (opts.db && !DBS.includes(opts.db)) {
    p.cancel(`Invalid --db "${opts.db}". Use one of: ${DBS.join(", ")}`);
    process.exit(1);
  }

  const ctx = await gatherContext(nameArg, opts);

  p.note(summary(ctx), "Plan");
  if (!opts.yes) {
    const go = unwrap(await p.confirm({ message: "Create project?", initialValue: true }));
    if (!go) onCancel();
  }

  await runProject(ctx);

  p.outro(
    `${pc.green("Done.")} Next:\n  cd ${ctx.name}\n  ${ctx.packageManager}${ctx.packageManager === "npm" ? " run" : ""} dev`,
  );
}
