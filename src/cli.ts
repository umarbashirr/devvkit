import * as p from "@clack/prompts";
import { Command } from "commander";
import pc from "picocolors";

import { backendChoiceByValue, BACKEND_CHOICES } from "./backends/index.js";
import { frameworkChoiceByValue, FRAMEWORK_CHOICES } from "./frameworks/index.js";
import { runPipeline } from "./pipeline.js";
import {
  hasSeparateBackend,
  hasServer,
  ormsForEngine,
  type AuthChoice,
  type DbEngine,
  type LayoutId,
  type MonorepoTool,
  type Orm,
  type PackageManager,
  type ProjectContext,
} from "./types.js";
import { detectPackageManager } from "./utils/pm.js";
import { banner, gradient } from "./utils/ui.js";
import pkg from "../package.json";

interface CliOptions {
  pm?: PackageManager;
  framework?: string;
  backend?: string;
  layout?: LayoutId;
  monorepoTool?: MonorepoTool;
  auth?: AuthChoice;
  db?: DbEngine;
  orm?: Orm;
  libraries?: string;
  ci?: boolean;
  yes?: boolean;
}

const PMS: PackageManager[] = ["pnpm", "npm", "yarn", "bun"];

const ENGINE_OPTIONS: Opt[] = [
  { value: "none", label: "None" },
  { value: "sqlite", label: "SQLite", hint: "file" },
  { value: "postgresql", label: "PostgreSQL" },
  { value: "mysql", label: "MySQL" },
  { value: "mongodb", label: "MongoDB" },
];

const ORM_LABELS: Record<Orm, string> = {
  drizzle: "Drizzle",
  prisma: "Prisma",
  typeorm: "TypeORM",
  mongoose: "Mongoose",
};

function onCancel(): never {
  p.cancel("Cancelled.");
  process.exit(0);
}

function unwrap<T>(value: T | symbol): T {
  if (p.isCancel(value)) onCancel();
  return value as T;
}

type Opt = { value: string; label: string; hint?: string };

/** select() over dynamically-mapped string options (sidesteps clack inference). */
function selectValue(message: string, options: Opt[]): Promise<string | symbol> {
  return p.select({ message, options } as Parameters<typeof p.select>[0]) as Promise<string | symbol>;
}

function fail(message: string): never {
  p.cancel(message);
  process.exit(1);
}

/** Build context non-interactively from flags + defaults (used with --yes). */
function contextFromFlags(name: string, opts: CliOptions): ProjectContext {
  const fwChoice = frameworkChoiceByValue(opts.framework ?? "next-fullstack");
  if (!fwChoice) fail(`Invalid --framework. Options: ${FRAMEWORK_CHOICES.map((c) => c.value).join(", ")}`);
  const beChoice = backendChoiceByValue(opts.backend ?? "none");
  if (!beChoice) fail(`Invalid --backend. Options: ${BACKEND_CHOICES.map((c) => c.value).join(", ")}`);

  const framework = fwChoice.selection;
  const backend = beChoice.backend;
  const sep = hasSeparateBackend(framework, backend);
  const server = hasServer(framework, backend);
  const libs = (opts.libraries ?? "prettier,husky").split(",").map((s) => s.trim());

  const engines: DbEngine[] = ["none", "sqlite", "postgresql", "mysql", "mongodb"];
  if (opts.db && !engines.includes(opts.db)) fail(`Invalid --db. Options: ${engines.join(", ")}`);

  const dbEngine: DbEngine = server ? (opts.db ?? "none") : "none";
  const orm: Orm | null =
    dbEngine === "none" ? null : (opts.orm ?? ormsForEngine(dbEngine)[0] ?? null);
  if (orm && !ormsForEngine(dbEngine).includes(orm)) {
    fail(`ORM "${orm}" is not available for ${dbEngine}. Options: ${ormsForEngine(dbEngine).join(", ")}`);
  }

  return {
    name,
    cwd: process.cwd(),
    packageManager: opts.pm ?? detectPackageManager(),
    framework,
    backend,
    backendLanguage: beChoice.language,
    layout: sep ? (opts.layout ?? "monorepo") : "single",
    monorepoTool: sep && (opts.layout ?? "monorepo") === "monorepo" ? (opts.monorepoTool ?? "turborepo") : null,
    auth: server ? (opts.auth ?? "none") : "none",
    dbEngine,
    orm,
    libraries: {
      prettier: libs.includes("prettier"),
      husky: libs.includes("husky"),
      editorconfig: libs.includes("editorconfig"),
    },
    ci: opts.ci ?? false,
    rootDir: "",
    webDir: "",
    apiDir: null,
    server: null,
    nativeBuilds: [],
  };
}

async function gatherInteractive(name: string, opts: CliOptions): Promise<ProjectContext> {
  // 1. Package manager
  const packageManager: PackageManager =
    opts.pm ??
    unwrap(
      await p.select({
        message: "Package manager?",
        initialValue: detectPackageManager(),
        options: PMS.map((m) => ({ value: m, label: m })),
      }),
    );

  // 2. Framework
  const fwValue = unwrap(
    await selectValue(
      "Framework?",
      FRAMEWORK_CHOICES.map((c) => ({ value: c.value, label: c.label, hint: c.hint })),
    ),
  );
  const fwChoice = frameworkChoiceByValue(fwValue)!;
  const framework = fwChoice.selection;

  // 3. Backend (skipped for Next.js Full Stack)
  let backend = backendChoiceByValue("none")!;
  if (!framework.fullstack) {
    const beValue = unwrap(
      await selectValue(
        "Backend?",
        BACKEND_CHOICES.map((c) => ({ value: c.value, label: c.label, hint: c.hint })),
      ),
    );
    backend = backendChoiceByValue(beValue)!;
  }

  const sep = hasSeparateBackend(framework, backend.backend);

  // 4. Repo layout (+ monorepo tool) — only with a separate backend
  let layout: LayoutId = "single";
  let monorepoTool: MonorepoTool | null = null;
  if (sep) {
    layout = unwrap(
      await p.select({
        message: "Repo layout?",
        options: [
          { value: "monorepo", label: "Monorepo", hint: "apps/web + apps/api" },
          { value: "flat", label: "Flat", hint: "client/ + server/" },
          { value: "multi", label: "Multi-repo", hint: "two separate dirs" },
        ],
      }),
    ) as LayoutId;
    if (layout === "monorepo") {
      monorepoTool = unwrap(
        await p.select({
          message: "Monorepo tool?",
          options: [
            { value: "turborepo", label: "Turborepo" },
            { value: "pnpm", label: "pnpm workspaces" },
            { value: "nx", label: "Nx", hint: "coming soon" },
          ],
        }),
      ) as MonorepoTool;
    }
  }

  const server = hasServer(framework, backend.backend);

  // 5. Auth + 6. Database engine + 7. ORM — only if a server exists
  let auth: AuthChoice = "none";
  let dbEngine: DbEngine = "none";
  let orm: Orm | null = null;
  if (server) {
    auth = unwrap(
      await p.select({
        message: "Auth?",
        options: [
          { value: "none", label: "None" },
          { value: "better-auth", label: "Better Auth", hint: "email + password" },
        ],
      }),
    ) as AuthChoice;

    dbEngine = unwrap(await selectValue("Database?", ENGINE_OPTIONS)) as DbEngine;

    if (dbEngine !== "none") {
      const orms = ormsForEngine(dbEngine);
      orm = unwrap(
        await selectValue(
          "ORM?",
          orms.map((o) => ({ value: o, label: ORM_LABELS[o] })),
        ),
      ) as Orm;
    }
  } else {
    p.log.info(pc.dim("No backend selected — skipping auth & database."));
  }

  // 7. Libraries
  const libs = unwrap(
    await p.multiselect({
      message: "Libraries (space to toggle):",
      required: false,
      initialValues: ["prettier", "husky"],
      options: [
        { value: "prettier", label: "Prettier" },
        { value: "husky", label: "Husky + lint-staged" },
        { value: "editorconfig", label: "EditorConfig" },
      ],
    }),
  ) as string[];

  // 8. CI
  const ci = unwrap(await p.confirm({ message: "GitHub Actions CI?", initialValue: true }));

  return {
    name,
    cwd: process.cwd(),
    packageManager,
    framework,
    backend: backend.backend,
    backendLanguage: backend.language,
    layout,
    monorepoTool,
    auth,
    dbEngine,
    orm,
    libraries: {
      prettier: libs.includes("prettier"),
      husky: libs.includes("husky"),
      editorconfig: libs.includes("editorconfig"),
    },
    ci,
    rootDir: "",
    webDir: "",
    apiDir: null,
    server: null,
    nativeBuilds: [],
  };
}

function assertSupported(ctx: ProjectContext): void {
  const fw = FRAMEWORK_CHOICES.find(
    (c) => c.selection.id === ctx.framework.id && c.selection.language === ctx.framework.language,
  );
  if (fw && !fw.supported) fail(`${fw.label} is coming soon — pick a React or Next.js option for now.`);
  if (ctx.layout === "monorepo" && ctx.monorepoTool === "nx") {
    fail("Nx monorepo support is coming soon — pick Turborepo or pnpm workspaces for now.");
  }
}

function summary(ctx: ProjectContext): string {
  const lib = Object.entries(ctx.libraries)
    .filter(([, v]) => v)
    .map(([k]) => k);
  const row = (label: string, value: string) =>
    `${pc.cyan("◇")} ${pc.dim(label.padEnd(10))} ${value}`;
  const off = (label: string) => `${pc.dim("◌")} ${pc.dim(label.padEnd(10))} ${pc.dim("—")}`;

  const lines = [
    row("name", pc.bold(ctx.name)),
    row("manager", ctx.packageManager),
    row(
      "framework",
      `${ctx.framework.id}${ctx.framework.fullstack ? pc.dim(" full-stack") : ""} ${pc.dim(`[${ctx.framework.language}]`)}`,
    ),
  ];
  lines.push(
    ctx.backend !== "none" ? row("backend", `express ${pc.dim(`[${ctx.backendLanguage}]`)}`) : off("backend"),
  );
  if (ctx.layout !== "single")
    lines.push(row("layout", `${ctx.layout}${ctx.monorepoTool ? pc.dim(` · ${ctx.monorepoTool}`) : ""}`));
  lines.push(ctx.auth !== "none" ? row("auth", ctx.auth) : off("auth"));
  lines.push(
    ctx.dbEngine !== "none"
      ? row("database", `${ctx.dbEngine}${ctx.orm ? pc.dim(` · ${ctx.orm}`) : ""}`)
      : off("database"),
  );
  lines.push(lib.length ? row("libraries", lib.join(", ")) : off("libraries"));
  lines.push(ctx.ci ? row("ci", "github actions") : off("ci"));
  return lines.join("\n");
}

/** Multi-line "next steps" block for the outro. */
function nextSteps(ctx: ProjectContext): string {
  const dev = ctx.packageManager === "npm" ? "npm run dev" : `${ctx.packageManager} dev`;
  const step = (s: string) => `  ${pc.cyan("›")} ${s}`;
  const out: string[] = [];

  if (ctx.layout === "multi") {
    out.push(step(pc.bold(`cd ${ctx.name}-web`) + pc.dim(`  &  cd ${ctx.name}-api`)));
  } else {
    out.push(step(pc.bold(`cd ${ctx.name}`)));
    out.push(step(dev));
  }
  if (ctx.dbEngine !== "none" && ctx.orm !== "mongoose" && ctx.orm !== "typeorm")
    out.push(step(`${ctx.packageManager} run db:migrate ${pc.dim("# set up the database")}`));
  if (ctx.auth !== "none") out.push(step(pc.dim("review .env (auth secret was generated)")));
  return out.join("\n");
}

export async function main(argv: string[]): Promise<void> {
  const program = new Command();
  program
    .name("devvkit")
    .description("Scaffold an opinionated starter kit.")
    .argument("[name]", "project directory name")
    .option("--pm <manager>", "pnpm | npm | yarn | bun")
    .option("--framework <value>", FRAMEWORK_CHOICES.map((c) => c.value).join(" | "))
    .option("--backend <value>", BACKEND_CHOICES.map((c) => c.value).join(" | "))
    .option("--layout <value>", "monorepo | flat | multi")
    .option("--monorepo-tool <value>", "turborepo | pnpm | nx")
    .option("--auth <value>", "none | better-auth")
    .option("--db <engine>", "none | sqlite | postgresql | mysql | mongodb")
    .option("--orm <value>", "drizzle | prisma | typeorm | mongoose")
    .option("--libraries <csv>", "prettier,husky,editorconfig")
    .option("--ci", "add GitHub Actions CI")
    .option("-y, --yes", "skip prompts; use flags + defaults")
    .allowExcessArguments(false);

  program.parse(argv);
  const opts = program.opts<CliOptions>();
  if (opts.pm && !PMS.includes(opts.pm)) fail(`Invalid --pm. Options: ${PMS.join(", ")}`);

  banner(pkg.version);
  p.intro(gradient(" let's build something "));

  let name = program.args[0];
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

  const ctx = opts.yes ? contextFromFlags(name, opts) : await gatherInteractive(name, opts);
  assertSupported(ctx);

  p.note(summary(ctx), gradient(" your kit "));
  if (!opts.yes) {
    const go = unwrap(await p.confirm({ message: "Create project?", initialValue: true }));
    if (!go) onCancel();
  }

  p.log.message("");
  await runPipeline(ctx);

  p.note(nextSteps(ctx), gradient(" next steps "));
  p.outro(`${pc.green("✓")} ${gradient("done — happy building")}`);
}
