import { mkdir } from "node:fs/promises";
import { basename, dirname } from "node:path";

import type { ProjectContext } from "../types.js";
import { run } from "../utils/exec.js";
import { dlxCmd, installCmd } from "../utils/pm.js";

/**
 * React + Vite via create-vite. create-vite joins cwd + target naively, so an
 * absolute path doubles (/tmp/tmp/...) — run it from the parent with a relative
 * target. create-vite scaffolds without installing, so we install afterward.
 */
export async function scaffoldReactVite(ctx: ProjectContext): Promise<void> {
  const template = ctx.framework.language === "ts" ? "react-ts" : "react";
  const parent = dirname(ctx.webDir);
  await mkdir(parent, { recursive: true });

  await run(dlxCmd(ctx.packageManager, ["create-vite@latest", basename(ctx.webDir), "--template", template]), {
    cwd: parent,
  });
  await run(installCmd(ctx.packageManager), { cwd: ctx.webDir });
}
