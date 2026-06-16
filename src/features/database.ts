import type { ProjectContext, ServerTarget } from "../types.js";
import { run } from "../utils/exec.js";
import { addCmd, dlxCmd } from "../utils/pm.js";
import { addScripts, appendLines, writeText } from "../utils/fs.js";
import { markNativeBuild } from "../utils/native.js";

function drizzleConfig(ext: string): string {
  return `import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.${ext}",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: { url: process.env.DATABASE_URL ?? "./sqlite.db" },
});
`;
}

const DRIZZLE_SCHEMA = `import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: text("created_at").default(sql\`(CURRENT_TIMESTAMP)\`).notNull(),
});
`;

function drizzleClient(relExt: string): string {
  return `import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema${relExt}";

const sqlite = new Database(process.env.DATABASE_URL ?? "./sqlite.db");
export const db = drizzle(sqlite, { schema });
`;
}

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

function prismaClient(ts: boolean): string {
  const decl = ts
    ? "const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };"
    : "const globalForPrisma = globalThis;";
  return `import { PrismaClient } from "@prisma/client";

${decl}

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
`;
}

/** Scaffold the chosen ORM (Drizzle or Prisma) into the server target. */
export async function applyDatabase(ctx: ProjectContext): Promise<void> {
  if (ctx.db === "none" || !ctx.server) return;
  const target: ServerTarget = ctx.server;
  const pm = ctx.packageManager;
  const ext = target.language;
  const ts = target.language === "ts";
  // Next uses bundler resolution (no ext); Express uses NodeNext (.js).
  const relExt = target.kind === "next" ? "" : ".js";

  if (ctx.db === "drizzle") {
    await run(addCmd(pm, ["drizzle-orm", "better-sqlite3"]), { cwd: target.dir });
    const dev = ["drizzle-kit"];
    if (ts) dev.push("@types/better-sqlite3");
    await run(addCmd(pm, dev, true), { cwd: target.dir });
    markNativeBuild(ctx, ["better-sqlite3", "esbuild"]);

    await writeText(target.dir, `drizzle.config.${ext}`, drizzleConfig(ext));
    await writeText(target.dir, `src/db/schema.${ext}`, DRIZZLE_SCHEMA);
    await writeText(target.dir, `src/db/index.${ext}`, drizzleClient(relExt));

    await appendLines(target.dir, ".env", ["# Database", "DATABASE_URL=./sqlite.db"]);
    await appendLines(target.dir, ".gitignore", ["", "# SQLite", "*.db", "*.db-journal"]);
    await addScripts(target.dir, {
      "db:generate": "drizzle-kit generate",
      "db:migrate": "drizzle-kit migrate",
      "db:studio": "drizzle-kit studio",
    });
    return;
  }

  // Prisma — pinned to v6 (v7 changed the generator/client import surface).
  await run(addCmd(pm, ["@prisma/client@^6"]), { cwd: target.dir });
  await run(addCmd(pm, ["prisma@^6"], true), { cwd: target.dir });
  await run(dlxCmd(pm, ["prisma@6", "init", "--datasource-provider", "sqlite"]), { cwd: target.dir });

  await writeText(target.dir, "prisma/schema.prisma", PRISMA_SCHEMA);
  await writeText(target.dir, `src/lib/prisma.${ext}`, prismaClient(ts));

  await appendLines(target.dir, ".gitignore", ["", "# SQLite", "prisma/*.db", "prisma/*.db-journal"]);
  await addScripts(target.dir, {
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:studio": "prisma studio",
  });
  await run(dlxCmd(pm, ["prisma@6", "generate"]), { cwd: target.dir });
}
