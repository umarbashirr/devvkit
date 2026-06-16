import type { FeatureModule } from "../types.js";
import { run } from "../utils/exec.js";
import { addCmd, dlxCmd } from "../utils/pm.js";
import { addScripts, appendLines, writeText } from "../utils/fs.js";
import { allowNativeBuilds } from "../utils/native.js";

const DRIZZLE_CONFIG = `import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: { url: process.env.DATABASE_URL ?? "./sqlite.db" },
});
`;

const DRIZZLE_SCHEMA = `import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: text("created_at").default(sql\`(CURRENT_TIMESTAMP)\`).notNull(),
});
`;

const DRIZZLE_CLIENT = `import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema";

const sqlite = new Database(process.env.DATABASE_URL ?? "./sqlite.db");
export const db = drizzle(sqlite, { schema });
`;

const PRISMA_SCHEMA = `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
}
`;

const PRISMA_CLIENT = `import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
`;

/** Scaffold the chosen ORM (Drizzle or Prisma) against SQLite. */
export const databaseModule: FeatureModule = {
  id: "database",
  title: "Database / ORM",
  enabled: (ctx) => ctx.features.database !== "none",
  async apply(ctx) {
    const pm = ctx.packageManager;

    if (ctx.features.database === "drizzle") {
      await run(addCmd(pm, ["drizzle-orm", "better-sqlite3"]), { cwd: ctx.dir });
      await run(addCmd(pm, ["drizzle-kit", "@types/better-sqlite3"], true), { cwd: ctx.dir });
      await allowNativeBuilds(ctx, ["better-sqlite3", "esbuild"]);

      await writeText(ctx.dir, "drizzle.config.ts", DRIZZLE_CONFIG);
      await writeText(ctx.dir, "src/db/schema.ts", DRIZZLE_SCHEMA);
      await writeText(ctx.dir, "src/db/index.ts", DRIZZLE_CLIENT);

      await appendLines(ctx.dir, ".env", ["# Database", "DATABASE_URL=./sqlite.db"]);
      await appendLines(ctx.dir, ".gitignore", ["", "# SQLite", "*.db", "*.db-journal"]);
      await addScripts(ctx.dir, {
        "db:generate": "drizzle-kit generate",
        "db:migrate": "drizzle-kit migrate",
        "db:studio": "drizzle-kit studio",
      });
      return;
    }

    if (ctx.features.database === "prisma") {
      // prisma init writes prisma/schema.prisma and a DATABASE_URL into .env.
      await run(dlxCmd(pm, ["prisma", "init", "--datasource-provider", "sqlite"]), {
        cwd: ctx.dir,
      });
      await run(addCmd(pm, ["@prisma/client"]), { cwd: ctx.dir });
      await run(addCmd(pm, ["prisma"], true), { cwd: ctx.dir });
      await allowNativeBuilds(ctx, ["@prisma/client", "prisma", "esbuild"]);

      await writeText(ctx.dir, "prisma/schema.prisma", PRISMA_SCHEMA);
      await writeText(ctx.dir, "src/lib/prisma.ts", PRISMA_CLIENT);

      await appendLines(ctx.dir, ".gitignore", ["", "# SQLite", "prisma/*.db", "prisma/*.db-journal"]);
      await addScripts(ctx.dir, {
        "db:generate": "prisma generate",
        "db:migrate": "prisma migrate dev",
        "db:studio": "prisma studio",
      });

      // Generate the client so the project type-checks out of the box.
      await run(dlxCmd(pm, ["prisma", "generate"]), { cwd: ctx.dir });
    }
  },
};
