import type { ProjectContext } from "../types.js";
import { run } from "../utils/exec.js";
import { cnaPmFlag, dlxCmd } from "../utils/pm.js";

/**
 * Base Next.js app via the official create-next-app (TypeScript, App Router,
 * Tailwind on by default). Used for both the frontend-only and full-stack
 * variants — they differ only in which feature modules attach afterward.
 */
export async function scaffoldNext(ctx: ProjectContext): Promise<void> {
  const flags = [
    "--ts",
    "--app",
    "--src-dir",
    "--import-alias",
    "@/*",
    "--eslint",
    "--tailwind",
    "--no-git",
    cnaPmFlag(ctx.packageManager),
    "--yes",
  ];
  await run(dlxCmd(ctx.packageManager, ["create-next-app@latest", ctx.webDir, ...flags]));
}
