import type { ProjectContext } from "../types.js";
import { run } from "./exec.js";
import { patchJson } from "./fs.js";

/**
 * pnpm 10 blocks dependency build scripts (postinstall) by default, which breaks
 * native modules like better-sqlite3 and esbuild's platform binary fetch.
 * Allowlist them in the generated package.json and rebuild so they work.
 * No-op for other package managers, which build by default.
 */
export async function allowNativeBuilds(ctx: ProjectContext, pkgs: string[]): Promise<void> {
  if (ctx.packageManager !== "pnpm" || pkgs.length === 0) return;

  await patchJson(ctx.dir, "package.json", (pkg) => {
    const pnpm = (pkg.pnpm as Record<string, unknown> | undefined) ?? {};
    const existing = Array.isArray(pnpm.onlyBuiltDependencies)
      ? (pnpm.onlyBuiltDependencies as string[])
      : [];
    pnpm.onlyBuiltDependencies = Array.from(new Set([...existing, ...pkgs]));
    pkg.pnpm = pnpm;
  });

  await run(["pnpm", "rebuild", ...pkgs], { cwd: ctx.dir });
}
