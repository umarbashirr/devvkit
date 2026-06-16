export type PackageManager = "pnpm" | "npm" | "yarn" | "bun";

export type DbChoice = "none" | "drizzle" | "prisma";

export interface FeatureSelection {
  /** Tailwind (via create-next-app) + shadcn/ui. */
  styling: boolean;
  /** Better Auth wired up. */
  auth: boolean;
  /** ORM scaffold. */
  database: DbChoice;
  /** Prettier + Husky + lint-staged + GitHub Actions CI. */
  tooling: boolean;
}

export interface ProjectContext {
  /** Bare project name (e.g. "my-app"). */
  name: string;
  /** Absolute path to the project directory. */
  dir: string;
  packageManager: PackageManager;
  /** ESLint requested (driven by create-next-app). */
  eslint: boolean;
  features: FeatureSelection;
}

/**
 * A feature module layers one capability onto the base Next.js app.
 * Modules run after create-next-app, in registry order.
 */
export interface FeatureModule {
  id: string;
  title: string;
  /** Decide whether this module should run for the given selection. */
  enabled: (ctx: ProjectContext) => boolean;
  /** Mutate the freshly-scaffolded project on disk. */
  apply: (ctx: ProjectContext) => Promise<void>;
}
