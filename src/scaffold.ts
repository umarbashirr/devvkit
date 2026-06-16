import type { ProjectContext } from "./types.js";
import { run } from "./utils/exec.js";
import { cnaPmFlag, dlxCmd } from "./utils/pm.js";

/**
 * Scaffold the base Next.js app via the official create-next-app.
 * Tailwind and ESLint baselines are delegated to create-next-app flags;
 * everything else is layered by feature modules afterward.
 */
export async function scaffoldBase(ctx: ProjectContext): Promise<void> {
  const flags = [
    "--ts",
    "--app",
    "--src-dir",
    "--import-alias",
    "@/*",
    ctx.eslint ? "--eslint" : "--no-eslint",
    ctx.features.styling ? "--tailwind" : "--no-tailwind",
    // We init git ourselves at the end, after modules have written files.
    "--no-git",
    cnaPmFlag(ctx.packageManager),
    // Accept defaults for anything not explicitly flagged (e.g. Turbopack).
    "--yes",
  ];

  await run(dlxCmd(ctx.packageManager, ["create-next-app@latest", ctx.dir, ...flags]));
}
