import { chmod } from "node:fs/promises";
import { join } from "node:path";

import { getPackageRoots } from "../layout.js";
import type { ProjectContext } from "../types.js";
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
build
pnpm-lock.yaml
package-lock.json
yarn.lock
bun.lockb
`;

const EDITORCONFIG = `root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true
`;

/** Prettier, Husky + lint-staged, EditorConfig — applied to each package root. */
export async function applyLibraries(ctx: ProjectContext): Promise<void> {
  const { prettier, husky, editorconfig } = ctx.libraries;
  if (!prettier && !husky && !editorconfig) return;
  const pm = ctx.packageManager;

  for (const root of getPackageRoots(ctx)) {
    if (editorconfig) await writeText(root, ".editorconfig", EDITORCONFIG);

    if (prettier) {
      await run(addCmd(pm, ["prettier"], true), { cwd: root });
      await writeText(root, ".prettierrc", PRETTIERRC);
      await writeText(root, ".prettierignore", PRETTIERIGNORE);
      await addScripts(root, { format: "prettier --write ." });
    }

    if (husky) {
      const deps = prettier ? ["husky", "lint-staged"] : ["husky"];
      await run(addCmd(pm, deps, true), { cwd: root });

      const hook = prettier ? "npx lint-staged\n" : "# add pre-commit checks here\n";
      await writeText(root, ".husky/pre-commit", hook);
      await chmod(join(root, ".husky/pre-commit"), 0o755);
      // git repo is initialized by the pipeline before this runs.
      await run(["git", "config", "core.hooksPath", ".husky"], { cwd: root });

      if (prettier) {
        await patchJson(root, "package.json", (pkg) => {
          pkg["lint-staged"] = { "*.{ts,tsx,js,jsx,json,css,md}": "prettier --write" };
        });
      }
      await addScripts(root, { prepare: "husky" });
    }
  }
}
