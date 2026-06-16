import type { ProjectContext } from "../types.js";
import { run } from "./exec.js";
import { patchJson } from "./fs.js";

/** Record native deps that need build scripts; rebuilt by finalizeNativeBuilds. */
export function markNativeBuild(ctx: ProjectContext, pkgs: string[]): void {
  for (const pkg of pkgs) {
    if (!ctx.nativeBuilds.includes(pkg)) ctx.nativeBuilds.push(pkg);
  }
}

/**
 * pnpm 10 blocks dependency build scripts by default; the allowlist is a
 * workspace-ROOT setting. Patch the install root's package.json and rebuild,
 * once, after all installs (so the final workspace install can't wipe it).
 * No-op for other package managers, which build by default.
 */
export async function finalizeNativeBuilds(ctx: ProjectContext): Promise<void> {
  if (ctx.packageManager !== "pnpm" || ctx.nativeBuilds.length === 0) return;

  // For a workspace, builds resolve at the root; otherwise at the server target.
  const root =
    ctx.layout === "monorepo" ? ctx.rootDir : (ctx.server?.dir ?? ctx.webDir);

  await patchJson(root, "package.json", (pkg) => {
    const pnpm = (pkg.pnpm as Record<string, unknown> | undefined) ?? {};
    const existing = Array.isArray(pnpm.onlyBuiltDependencies)
      ? (pnpm.onlyBuiltDependencies as string[])
      : [];
    pnpm.onlyBuiltDependencies = Array.from(new Set([...existing, ...ctx.nativeBuilds]));
    pkg.pnpm = pnpm;
  });

  // Monorepo deps live in workspace packages, so rebuild recursively.
  const cmd = ctx.layout === "monorepo" ? ["pnpm", "-r", "rebuild"] : ["pnpm", "rebuild"];
  await run([...cmd, ...ctx.nativeBuilds], { cwd: root });
}
