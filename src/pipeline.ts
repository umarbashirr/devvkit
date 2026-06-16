import { existsSync, readdirSync } from "node:fs";

import { scaffoldBackend } from "./backends/index.js";
import { applyAuth, applyCi, applyDatabase, applyLibraries } from "./features/index.js";
import { frameworkLabel, scaffoldFramework } from "./frameworks/index.js";
import { getPackageRoots, resolveLayout, scaffoldRoot } from "./layout.js";
import type { ProjectContext } from "./types.js";
import { run } from "./utils/exec.js";
import { finalizeNativeBuilds } from "./utils/native.js";
import { installCmd } from "./utils/pm.js";
import { task } from "./utils/ui.js";

async function tryGit(args: string[], cwd: string): Promise<void> {
  try {
    await run(["git", ...args], { cwd });
  } catch {
    // git missing/failed — non-fatal.
  }
}

function assertEmpty(dir: string): void {
  if (existsSync(dir) && readdirSync(dir).length > 0) {
    throw new Error(`Target "${dir}" already exists and is not empty.`);
  }
}

export async function runPipeline(ctx: ProjectContext): Promise<void> {
  resolveLayout(ctx);

  if (ctx.layout === "multi") {
    assertEmpty(ctx.webDir);
    if (ctx.apiDir) assertEmpty(ctx.apiDir);
  } else {
    assertEmpty(ctx.rootDir);
  }

  await task(`Scaffolding ${frameworkLabel(ctx)}`, async () => {
    await scaffoldRoot(ctx);
    await scaffoldFramework(ctx);
  });

  if (ctx.backend === "express") {
    await task(`Scaffolding Express (${ctx.backendLanguage})`, () => scaffoldBackend(ctx));
  }

  // Init git per repo root early so Husky can register hooks.
  const repos = getPackageRoots(ctx);
  await task("Initializing git", async () => {
    for (const root of repos) await tryGit(["init", "-q", "-b", "main"], root);
  });

  if (ctx.auth !== "none") {
    await task("Adding Better Auth", () => applyAuth(ctx));
  }
  if (ctx.dbEngine !== "none" && ctx.orm) {
    await task(`Adding database (${ctx.dbEngine} · ${ctx.orm})`, () => applyDatabase(ctx));
  }

  const libs = ctx.libraries;
  if (libs.prettier || libs.husky || libs.editorconfig) {
    await task("Adding libraries", () => applyLibraries(ctx));
  }
  if (ctx.ci) {
    await task("Adding CI", () => applyCi(ctx));
  }

  if (ctx.layout === "monorepo") {
    await task("Installing workspace", () => run(installCmd(ctx.packageManager), { cwd: ctx.rootDir }));
  }

  if (ctx.packageManager === "pnpm" && ctx.nativeBuilds.length > 0) {
    await task("Building native deps", () => finalizeNativeBuilds(ctx));
  }

  await task("Creating initial commit", async () => {
    for (const root of repos) {
      await tryGit(["add", "-A"], root);
      await tryGit(
        ["-c", "user.email=devvkit@local", "-c", "user.name=devvkit", "commit", "-q", "-m", "chore: initial scaffold from devvkit"],
        root,
      );
    }
  });
}
