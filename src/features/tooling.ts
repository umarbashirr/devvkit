import { chmod } from "node:fs/promises";
import { join } from "node:path";

import type { FeatureModule, PackageManager } from "../types.js";
import { run } from "../utils/exec.js";
import { addCmd } from "../utils/pm.js";
import { addScripts, patchJson, writeText } from "../utils/fs.js";

const PRETTIERRC = `{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100
}
`;

const PRETTIERIGNORE = `node_modules
.next
dist
pnpm-lock.yaml
package-lock.json
yarn.lock
bun.lockb
`;

const PRE_COMMIT = `npx lint-staged
`;

function ciWorkflow(pm: PackageManager, eslint: boolean): string {
  const install = pm === "npm" ? "npm ci" : `${pm} install --frozen-lockfile`;
  const steps = [
    eslint ? `      - run: ${pm} run lint` : null,
    `      - run: ${pm} run build`,
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
      - run: ${install}
${steps.join("\n")}
`;
}

/** Prettier + Husky + lint-staged + a GitHub Actions CI workflow. */
export const toolingModule: FeatureModule = {
  id: "tooling",
  title: "Lint / format / CI",
  enabled: (ctx) => ctx.features.tooling,
  async apply(ctx) {
    const pm = ctx.packageManager;
    await run(addCmd(pm, ["prettier", "husky", "lint-staged"], true), { cwd: ctx.dir });

    await writeText(ctx.dir, ".prettierrc", PRETTIERRC);
    await writeText(ctx.dir, ".prettierignore", PRETTIERIGNORE);
    await writeText(ctx.dir, ".github/workflows/ci.yml", ciWorkflow(pm, ctx.eslint));

    // Husky hook. We set core.hooksPath directly (git is already initialized),
    // and keep a prepare script so it re-installs on fresh clones.
    await writeText(ctx.dir, ".husky/pre-commit", PRE_COMMIT);
    await chmod(join(ctx.dir, ".husky/pre-commit"), 0o755);
    await run(["git", "config", "core.hooksPath", ".husky"], { cwd: ctx.dir });

    const lintStaged: Record<string, string | string[]> = {
      "*.{ts,tsx,js,jsx,json,css,md}": "prettier --write",
    };
    if (ctx.eslint) lintStaged["*.{ts,tsx,js,jsx}"] = ["eslint --fix", "prettier --write"];

    await patchJson(ctx.dir, "package.json", (pkg) => {
      pkg["lint-staged"] = lintStaged;
    });
    await addScripts(ctx.dir, {
      format: "prettier --write .",
      prepare: "husky",
    });
  },
};
