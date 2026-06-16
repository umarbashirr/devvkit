import { randomBytes } from "node:crypto";

import type { ProjectContext, ServerTarget } from "../types.js";
import { run } from "../utils/exec.js";
import { addCmd } from "../utils/pm.js";
import { appendLines, writeText } from "../utils/fs.js";
import { markNativeBuild } from "../utils/native.js";

const authConfig = `import { betterAuth } from "better-auth";
import Database from "better-sqlite3";

// Standalone SQLite for a zero-config start. Swap \`database\` for the matching
// adapter (drizzleAdapter / prismaAdapter) to share your ORM connection:
// https://www.better-auth.com/docs/adapters
export const auth = betterAuth({
  database: new Database("./auth.db"),
  emailAndPassword: { enabled: true },
});
`;

const AUTH_CLIENT = `import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
export const { signIn, signUp, signOut, useSession } = authClient;
`;

const NEXT_ROUTE = `import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
`;

/** Wire Better Auth (email/password + SQLite) into the server target. */
export async function applyAuth(ctx: ProjectContext): Promise<void> {
  if (ctx.auth !== "better-auth" || !ctx.server) return;
  const target: ServerTarget = ctx.server;
  const pm = ctx.packageManager;
  const ext = target.language;

  await run(addCmd(pm, ["better-auth", "better-sqlite3"]), { cwd: target.dir });
  if (target.language === "ts") {
    await run(addCmd(pm, ["@types/better-sqlite3"], true), { cwd: target.dir });
  }
  markNativeBuild(ctx, ["better-sqlite3"]);

  await writeText(target.dir, `src/lib/auth.${ext}`, authConfig);

  if (target.kind === "next") {
    await writeText(target.dir, "src/lib/auth-client.ts", AUTH_CLIENT);
    await writeText(target.dir, "src/app/api/auth/[...all]/route.ts", NEXT_ROUTE);
  }
  // Express mounts the handler in its generated index (auth-aware scaffolder).

  const secret = randomBytes(32).toString("hex");
  const url = target.kind === "next" ? "http://localhost:3000" : "http://localhost:4000";
  await appendLines(target.dir, ".env", [
    "# Better Auth",
    `BETTER_AUTH_SECRET=${secret}`,
    `BETTER_AUTH_URL=${url}`,
  ]);
  await appendLines(target.dir, ".gitignore", ["", "# Better Auth (local SQLite)", "auth.db"]);
}
