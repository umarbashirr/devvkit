import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { hasSeparateBackend, type ProjectContext } from "./types.js";
import { run, runQuiet } from "./utils/exec.js";
import { addCmd } from "./utils/pm.js";
import { writeText } from "./utils/fs.js";

/** Compute rootDir / webDir / apiDir / server target from the selection. */
export function resolveLayout(ctx: ProjectContext): void {
  const sep = hasSeparateBackend(ctx.framework, ctx.backend);
  const root = resolve(ctx.cwd, ctx.name);

  if (!sep) {
    ctx.layout = "single";
    ctx.rootDir = root;
    ctx.webDir = root;
    ctx.apiDir = null;
  } else if (ctx.layout === "monorepo") {
    ctx.rootDir = root;
    ctx.webDir = join(root, "apps", "web");
    ctx.apiDir = join(root, "apps", "api");
  } else if (ctx.layout === "flat") {
    ctx.rootDir = root;
    ctx.webDir = join(root, "client");
    ctx.apiDir = join(root, "server");
  } else {
    // multi-repo: two sibling directories, no shared container.
    ctx.rootDir = ctx.cwd;
    ctx.webDir = resolve(ctx.cwd, `${ctx.name}-web`);
    ctx.apiDir = resolve(ctx.cwd, `${ctx.name}-api`);
  }

  if (ctx.framework.fullstack) {
    ctx.server = { dir: ctx.webDir, language: "ts", kind: "next" };
  } else if (ctx.apiDir) {
    ctx.server = { dir: ctx.apiDir, language: ctx.backendLanguage, kind: "express" };
  } else {
    ctx.server = null;
  }
}

const ROOT_GITIGNORE = `node_modules
dist
build
.turbo
.next
*.log
.DS_Store
.env
*.db
*.db-journal
`;

const TURBO_JSON = `{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "dev": { "cache": false, "persistent": true },
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**"] },
    "lint": {}
  }
}
`;

/**
 * Package roots that receive shared tooling (Prettier/Husky/CI) and get their
 * own git repo. One repo for single/monorepo/flat; two for multi-repo.
 */
export function getPackageRoots(ctx: ProjectContext): string[] {
  switch (ctx.layout) {
    case "single":
      return [ctx.webDir];
    case "monorepo":
    case "flat":
      return [ctx.rootDir];
    case "multi":
      return ctx.apiDir ? [ctx.webDir, ctx.apiDir] : [ctx.webDir];
  }
}

/**
 * Create a shared container before apps are scaffolded so installs resolve.
 * Monorepo => workspace; flat => a light root package for shared tooling.
 * single/multi need no container.
 */
export async function scaffoldRoot(ctx: ProjectContext): Promise<void> {
  if (ctx.layout === "flat") {
    await mkdir(ctx.rootDir, { recursive: true });
    const rootPkg = { name: ctx.name, version: "0.1.0", private: true, scripts: {} };
    await writeText(ctx.rootDir, "package.json", JSON.stringify(rootPkg, null, 2));
    await writeText(ctx.rootDir, ".gitignore", ROOT_GITIGNORE);
    return;
  }
  if (ctx.layout !== "monorepo") return;
  if (ctx.monorepoTool === "nx") {
    throw new Error("Nx monorepo support is coming soon — pick Turborepo or pnpm workspaces for now.");
  }

  await mkdir(join(ctx.rootDir, "apps"), { recursive: true });

  const useTurbo = ctx.monorepoTool === "turborepo";
  const scripts: Record<string, string> = useTurbo
    ? { dev: "turbo run dev", build: "turbo run build", lint: "turbo run lint" }
    : {
        dev: `${ctx.packageManager} -r --parallel run dev`,
        build: `${ctx.packageManager} -r run build`,
        lint: `${ctx.packageManager} -r run lint`,
      };

  // Turbo requires a packageManager field to resolve the workspace.
  let pmVersion = "";
  try {
    pmVersion = (await runQuiet([ctx.packageManager, "--version"])).trim();
  } catch {
    pmVersion = "";
  }

  const rootPkg: Record<string, unknown> = {
    name: ctx.name,
    version: "0.1.0",
    private: true,
    ...(pmVersion ? { packageManager: `${ctx.packageManager}@${pmVersion}` } : {}),
    // npm/yarn/bun read this; pnpm reads pnpm-workspace.yaml (both written).
    workspaces: ["apps/*"],
    scripts,
  };
  await writeText(ctx.rootDir, "package.json", JSON.stringify(rootPkg, null, 2));
  await writeText(ctx.rootDir, ".gitignore", ROOT_GITIGNORE);
  await writeText(ctx.rootDir, "pnpm-workspace.yaml", 'packages:\n  - "apps/*"\n');

  if (useTurbo) {
    await writeText(ctx.rootDir, "turbo.json", TURBO_JSON);
    await run(addCmd(ctx.packageManager, ["turbo"], true), { cwd: ctx.rootDir });
  }
}
