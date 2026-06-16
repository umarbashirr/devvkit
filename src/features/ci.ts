import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { getPackageRoots } from "../layout.js";
import type { PackageManager, ProjectContext } from "../types.js";
import { writeText } from "../utils/fs.js";

async function scriptsOf(root: string): Promise<Record<string, string>> {
  try {
    const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    return pkg.scripts ?? {};
  } catch {
    return {};
  }
}

function workflow(pm: PackageManager, hasLint: boolean, hasBuild: boolean): string {
  const install = pm === "npm" ? "npm install" : `${pm} install`;
  const steps = [
    `      - run: ${install}`,
    hasLint ? `      - run: ${pm} run lint` : null,
    hasBuild ? `      - run: ${pm} run build` : null,
  ].filter(Boolean);

  return `name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: corepack enable
${steps.join("\n")}
`;
}

/** GitHub Actions CI workflow, one per repo (package root). */
export async function applyCi(ctx: ProjectContext): Promise<void> {
  if (!ctx.ci) return;
  for (const root of getPackageRoots(ctx)) {
    const scripts = await scriptsOf(root);
    await writeText(
      root,
      ".github/workflows/ci.yml",
      workflow(ctx.packageManager, "lint" in scripts, "build" in scripts),
    );
  }
}
