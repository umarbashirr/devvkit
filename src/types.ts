export type PackageManager = "pnpm" | "npm" | "yarn" | "bun";

export type Language = "ts" | "js";

/** Frontend framework family. */
export type FrameworkId = "next" | "react-vite" | "vue-vite";

export type BackendId = "none" | "express";

/** How the generated project(s) are laid out on disk. */
export type LayoutId = "single" | "monorepo" | "flat" | "multi";

export type MonorepoTool = "turborepo" | "nx" | "pnpm";

export type AuthChoice = "none" | "better-auth";

export type DbChoice = "none" | "drizzle" | "prisma";

export interface FrameworkSelection {
  id: FrameworkId;
  language: Language;
  /** Next.js only: self-contained backend (API routes / server actions). */
  fullstack: boolean;
}

export interface LibrarySelection {
  prettier: boolean;
  husky: boolean;
  editorconfig: boolean;
}

/**
 * Where auth/db attach. The Next app (full-stack) or the Express api.
 * Null when the project is frontend-only with no backend.
 */
export interface ServerTarget {
  dir: string;
  language: Language;
  kind: "next" | "express";
}

export interface ProjectContext {
  name: string;
  /** Absolute root the user runs in (parent for multi-repo). */
  cwd: string;
  packageManager: PackageManager;

  framework: FrameworkSelection;
  backend: BackendId;
  backendLanguage: Language;
  layout: LayoutId;
  monorepoTool: MonorepoTool | null;

  auth: AuthChoice;
  db: DbChoice;
  libraries: LibrarySelection;
  ci: boolean;

  // ---- Resolved paths (filled by resolveLayout) ----
  /** Container dir (workspace root, or the single project). */
  rootDir: string;
  /** Frontend app dir. */
  webDir: string;
  /** Backend app dir, or null. */
  apiDir: string | null;
  /** Where auth/db go, or null if no backend. */
  server: ServerTarget | null;
  /** Native deps needing build scripts (pnpm), rebuilt at the end. */
  nativeBuilds: string[];
}

/** Does this project have a separate backend app (Express)? */
export function hasSeparateBackend(
  framework: FrameworkSelection,
  backend: BackendId,
): boolean {
  return !framework.fullstack && backend !== "none";
}

/** Does this project expose a server where auth/db can live? */
export function hasServer(
  framework: FrameworkSelection,
  backend: BackendId,
): boolean {
  return framework.fullstack || backend !== "none";
}
