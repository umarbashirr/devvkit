import { randomBytes } from "node:crypto";

import type { FeatureModule } from "../types.js";
import { run } from "../utils/exec.js";
import { addCmd } from "../utils/pm.js";
import { appendLines, writeText } from "../utils/fs.js";
import { allowNativeBuilds } from "../utils/native.js";

const AUTH_TS = `import { betterAuth } from "better-auth";
import Database from "better-sqlite3";

// Standalone SQLite for a zero-config start. To use your ORM instead, swap
// \`database\` for the matching Better Auth adapter (drizzleAdapter / prismaAdapter):
// https://www.better-auth.com/docs/adapters
export const auth = betterAuth({
  database: new Database("./auth.db"),
  emailAndPassword: { enabled: true },
});
`;

const AUTH_CLIENT_TS = `import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
export const { signIn, signUp, signOut, useSession } = authClient;
`;

const ROUTE_TS = `import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
`;

/** Wire up Better Auth with email/password and a standalone SQLite store. */
export const authModule: FeatureModule = {
  id: "auth",
  title: "Better Auth",
  enabled: (ctx) => ctx.features.auth,
  async apply(ctx) {
    const pm = ctx.packageManager;
    await run(addCmd(pm, ["better-auth", "better-sqlite3"]), { cwd: ctx.dir });
    await run(addCmd(pm, ["@types/better-sqlite3"], true), { cwd: ctx.dir });
    await allowNativeBuilds(ctx, ["better-sqlite3"]);

    await writeText(ctx.dir, "src/lib/auth.ts", AUTH_TS);
    await writeText(ctx.dir, "src/lib/auth-client.ts", AUTH_CLIENT_TS);
    await writeText(ctx.dir, "src/app/api/auth/[...all]/route.ts", ROUTE_TS);

    const secret = randomBytes(32).toString("hex");
    await appendLines(ctx.dir, ".env", [
      "# Better Auth",
      `BETTER_AUTH_SECRET=${secret}`,
      "BETTER_AUTH_URL=http://localhost:3000",
    ]);
    await appendLines(ctx.dir, ".gitignore", ["", "# Better Auth (local SQLite)", "auth.db"]);
  },
};
