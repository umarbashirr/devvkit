import type { PackageManager } from "../types.js";

/** Detect which package manager invoked this process (via npm_config_user_agent). */
export function detectPackageManager(): PackageManager {
  const ua = process.env.npm_config_user_agent ?? "";
  if (ua.startsWith("pnpm")) return "pnpm";
  if (ua.startsWith("yarn")) return "yarn";
  if (ua.startsWith("bun")) return "bun";
  return "npm";
}

/** Command to add dependencies, e.g. ["pnpm", "add", ...deps]. */
export function addCmd(pm: PackageManager, deps: string[], dev = false): string[] {
  switch (pm) {
    case "pnpm":
      return ["pnpm", "add", ...(dev ? ["-D"] : []), ...deps];
    case "yarn":
      return ["yarn", "add", ...(dev ? ["-D"] : []), ...deps];
    case "bun":
      return ["bun", "add", ...(dev ? ["-d"] : []), ...deps];
    case "npm":
      return ["npm", "install", ...(dev ? ["-D"] : []), ...deps];
  }
}

/** Command to install all declared dependencies. */
export function installCmd(pm: PackageManager): string[] {
  return pm === "npm" ? ["npm", "install"] : [pm, "install"];
}

/** Command to run a one-off package binary (dlx/npx style). */
export function dlxCmd(pm: PackageManager, pkgAndArgs: string[]): string[] {
  switch (pm) {
    case "pnpm":
      return ["pnpm", "dlx", ...pkgAndArgs];
    case "yarn":
      return ["yarn", "dlx", ...pkgAndArgs];
    case "bun":
      return ["bunx", ...pkgAndArgs];
    case "npm":
      return ["npx", "-y", ...pkgAndArgs];
  }
}

/** create-next-app's package-manager flag. */
export function cnaPmFlag(pm: PackageManager): string {
  return `--use-${pm}`;
}
