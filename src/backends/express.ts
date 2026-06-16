import { basename } from "node:path";

import type { ProjectContext } from "../types.js";
import { run } from "../utils/exec.js";
import { addCmd } from "../utils/pm.js";
import { appendLines, writeText } from "../utils/fs.js";

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
`;

function indexFile(ctx: ProjectContext, ext: "ts" | "js"): string {
  const auth = ctx.auth === "better-auth";
  const importExt = ".js"; // ESM + NodeNext: relative imports keep .js
  const imports = [
    `import express from "express";`,
    `import cors from "cors";`,
    auth ? `import { toNodeHandler } from "better-auth/node";` : null,
    auth ? `import { auth } from "./lib/auth${importExt}";` : null,
  ].filter(Boolean);

  const portDecl =
    ext === "ts"
      ? "const port = Number(process.env.PORT) || 4000;"
      : "const port = Number(process.env.PORT) || 4000;";

  const reqRes = ext === "ts" ? "(_req: express.Request, res: express.Response)" : "(_req, res)";

  return `${imports.join("\n")}

const app = express();
${portDecl}

app.use(cors());
${auth ? "// Better Auth must be mounted before express.json().\napp.all(\"/api/auth/*\", toNodeHandler(auth));\n" : ""}app.use(express.json());

app.get("/health", ${reqRes} => {
  res.json({ status: "ok" });
});

app.listen(port, () => {
  console.log(\`API listening on http://localhost:\${port}\`);
});
`;
}

/** Scaffold an Express server (JS or TS) into ctx.apiDir. */
export async function scaffoldExpress(ctx: ProjectContext): Promise<void> {
  if (!ctx.apiDir) return;
  const pm = ctx.packageManager;
  const ts = ctx.backendLanguage === "ts";
  const name = basename(ctx.apiDir);

  const scripts: Record<string, string> = ts
    ? {
        dev: "tsx watch src/index.ts",
        build: "tsc",
        start: "node dist/index.js",
      }
    : {
        dev: "node --watch src/index.js",
        start: "node src/index.js",
      };

  const pkg = {
    name,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts,
  };
  await writeText(ctx.apiDir, "package.json", JSON.stringify(pkg, null, 2));

  await run(addCmd(pm, ["express@^4", "cors"]), { cwd: ctx.apiDir });
  if (ts) {
    await run(addCmd(pm, ["typescript", "tsx", "@types/express", "@types/cors", "@types/node"], true), {
      cwd: ctx.apiDir,
    });
    await writeText(ctx.apiDir, "tsconfig.json", TSCONFIG);
    await writeText(ctx.apiDir, "src/index.ts", indexFile(ctx, "ts"));
  } else {
    await writeText(ctx.apiDir, "src/index.js", indexFile(ctx, "js"));
  }

  await writeText(ctx.apiDir, ".gitignore", "node_modules\ndist\n.env\n");
  await appendLines(ctx.apiDir, ".env", ["PORT=4000"]);
}
