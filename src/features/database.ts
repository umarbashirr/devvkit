import type { DbEngine, ProjectContext, ServerTarget } from "../types.js";
import { run } from "../utils/exec.js";
import { addCmd, dlxCmd } from "../utils/pm.js";
import { addScripts, appendLines, patchJson, writeText } from "../utils/fs.js";
import { markNativeBuild } from "../utils/native.js";

type Engine = Exclude<DbEngine, "none">;

/** Sensible local connection string per engine. */
function dbUrl(engine: Engine, name: string): string {
  const db = name.replace(/[^a-zA-Z0-9_]/g, "_");
  switch (engine) {
    case "sqlite":
      return "./sqlite.db";
    case "postgresql":
      return `postgresql://postgres:postgres@localhost:5432/${db}`;
    case "mysql":
      return `mysql://root:password@localhost:3306/${db}`;
    case "mongodb":
      return `mongodb://localhost:27017/${db}`;
  }
}

// ---------------------------------------------------------------- Drizzle ----

function drizzleConfig(engine: Engine, ext: string): string {
  const dialect = engine === "postgresql" ? "postgresql" : engine;
  const creds =
    engine === "sqlite"
      ? `{ url: process.env.DATABASE_URL ?? "./sqlite.db" }`
      : `{ url: process.env.DATABASE_URL! }`;
  // Drop the TS non-null assertion for JS configs.
  const credsJs = ext === "js" ? creds.replace("!", "") : creds;
  return `import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.${ext}",
  out: "./drizzle",
  dialect: "${dialect}",
  dbCredentials: ${credsJs},
});
`;
}

function drizzleSchema(engine: Engine): string {
  if (engine === "sqlite") {
    return `import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: text("created_at").default(sql\`(CURRENT_TIMESTAMP)\`).notNull(),
});
`;
  }
  if (engine === "postgresql") {
    return `import { pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
`;
  }
  return `import { int, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
`;
}

function drizzleClient(engine: Engine, ts: boolean, relExt: string): string {
  const bang = ts ? "!" : "";
  if (engine === "sqlite") {
    return `import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema${relExt}";

const sqlite = new Database(process.env.DATABASE_URL ?? "./sqlite.db");
export const db = drizzle(sqlite, { schema });
`;
  }
  if (engine === "postgresql") {
    return `import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema${relExt}";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
`;
  }
  return `import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

import * as schema from "./schema${relExt}";

const pool = mysql.createPool(process.env.DATABASE_URL${bang});
export const db = drizzle(pool, { schema, mode: "default" });
`;
}

async function setupDrizzle(ctx: ProjectContext, target: ServerTarget, engine: Engine): Promise<void> {
  const pm = ctx.packageManager;
  const ts = target.language === "ts";
  const ext = target.language;
  const relExt = target.kind === "next" ? "" : ".js";

  const deps = ["drizzle-orm"];
  const dev = ["drizzle-kit"];
  if (engine === "sqlite") {
    deps.push("better-sqlite3");
    if (ts) dev.push("@types/better-sqlite3");
  } else if (engine === "postgresql") {
    deps.push("pg");
    if (ts) dev.push("@types/pg");
  } else {
    deps.push("mysql2");
  }

  await run(addCmd(pm, deps), { cwd: target.dir });
  await run(addCmd(pm, dev, true), { cwd: target.dir });
  markNativeBuild(ctx, engine === "sqlite" ? ["better-sqlite3", "esbuild"] : ["esbuild"]);

  await writeText(target.dir, `drizzle.config.${ext}`, drizzleConfig(engine, ext));
  await writeText(target.dir, `src/db/schema.${ext}`, drizzleSchema(engine));
  await writeText(target.dir, `src/db/index.${ext}`, drizzleClient(engine, ts, relExt));

  await appendLines(target.dir, ".env", ["# Database", `DATABASE_URL=${dbUrl(engine, ctx.name)}`]);
  if (engine === "sqlite") {
    await appendLines(target.dir, ".gitignore", ["", "# SQLite", "*.db", "*.db-journal"]);
  }
  await addScripts(target.dir, {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio",
  });
}

// ----------------------------------------------------------------- Prisma ----

function prismaSchema(engine: Engine): string {
  const provider = engine === "postgresql" ? "postgresql" : engine;
  return `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "${provider}"
  url      = env("DATABASE_URL")
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
}
`;
}

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

async function setupPrisma(ctx: ProjectContext, target: ServerTarget, engine: Engine): Promise<void> {
  const pm = ctx.packageManager;
  const ext = target.language;
  const provider = engine === "postgresql" ? "postgresql" : engine;

  // Pinned to v6 (v7 changed the generator/client import surface).
  await run(addCmd(pm, ["@prisma/client@^6"]), { cwd: target.dir });
  await run(addCmd(pm, ["prisma@^6"], true), { cwd: target.dir });
  await run(dlxCmd(pm, ["prisma@6", "init", "--datasource-provider", provider]), { cwd: target.dir });

  await writeText(target.dir, "prisma/schema.prisma", prismaSchema(engine));
  await writeText(target.dir, `src/lib/prisma.${ext}`, prismaClient(ext === "ts"));

  await addScripts(target.dir, {
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:studio": "prisma studio",
  });
  await run(dlxCmd(pm, ["prisma@6", "generate"]), { cwd: target.dir });
}

// ----------------------------------------------------------------- TypeORM ----

function typeormType(engine: Engine): string {
  if (engine === "sqlite") return "better-sqlite3";
  if (engine === "postgresql") return "postgres";
  return "mysql";
}

function typeormEntityTs(): string {
  return `import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  email!: string;

  @Column({ nullable: true })
  name?: string;

  @CreateDateColumn()
  createdAt!: Date;
}
`;
}

function typeormEntityJs(): string {
  return `import { EntitySchema } from "typeorm";

export const User = new EntitySchema({
  name: "User",
  tableName: "users",
  columns: {
    id: { type: Number, primary: true, generated: true },
    email: { type: String, unique: true },
    name: { type: String, nullable: true },
    createdAt: { type: Date, createDate: true },
  },
});
`;
}

function typeormDataSource(engine: Engine, ts: boolean, relExt: string): string {
  const type = typeormType(engine);
  const conn =
    engine === "sqlite"
      ? `  database: process.env.DATABASE_URL ?? "./sqlite.db",`
      : `  url: process.env.DATABASE_URL,`;
  return `import "reflect-metadata";
import { DataSource } from "typeorm";

import { User } from "./entities/user${relExt}";

export const AppDataSource = new DataSource({
  type: "${type}",
${conn}
  synchronize: true,
  logging: false,
  entities: [User],
});
`;
}

async function setupTypeorm(ctx: ProjectContext, target: ServerTarget, engine: Engine): Promise<void> {
  const pm = ctx.packageManager;
  const ts = target.language === "ts";
  const ext = target.language;
  const relExt = target.kind === "next" ? "" : ".js";

  const deps = ["typeorm", "reflect-metadata"];
  const dev: string[] = [];
  if (engine === "sqlite") {
    deps.push("better-sqlite3");
    if (ts) dev.push("@types/better-sqlite3");
  } else if (engine === "postgresql") {
    deps.push("pg");
    if (ts) dev.push("@types/pg");
  } else {
    deps.push("mysql2");
  }

  await run(addCmd(pm, deps), { cwd: target.dir });
  if (dev.length) await run(addCmd(pm, dev, true), { cwd: target.dir });
  if (engine === "sqlite") markNativeBuild(ctx, ["better-sqlite3"]);

  // TypeORM decorators need these compiler options.
  if (ts) {
    await patchJson(target.dir, "tsconfig.json", (json) => {
      const co = (json.compilerOptions as Record<string, unknown> | undefined) ?? {};
      co.experimentalDecorators = true;
      co.emitDecoratorMetadata = true;
      json.compilerOptions = co;
    });
  }

  await writeText(
    target.dir,
    `src/db/entities/user.${ext}`,
    ts ? typeormEntityTs() : typeormEntityJs(),
  );
  await writeText(target.dir, `src/db/data-source.${ext}`, typeormDataSource(engine, ts, relExt));

  await appendLines(target.dir, ".env", ["# Database", `DATABASE_URL=${dbUrl(engine, ctx.name)}`]);
  if (engine === "sqlite") {
    await appendLines(target.dir, ".gitignore", ["", "# SQLite", "*.db", "*.db-journal"]);
  }
}

// ---------------------------------------------------------------- Mongoose ----

function mongooseConnect(name: string): string {
  return `import mongoose from "mongoose";

const uri = process.env.DATABASE_URL ?? "mongodb://localhost:27017/${name.replace(/[^a-zA-Z0-9_]/g, "_")}";

export async function connectDB() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  return mongoose.connect(uri);
}
`;
}

function mongooseModel(ts: boolean): string {
  if (ts) {
    return `import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true },
    name: { type: String },
  },
  { timestamps: true },
);

export const User = mongoose.models.User ?? mongoose.model("User", userSchema);
`;
  }
  return `import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true },
    name: { type: String },
  },
  { timestamps: true },
);

export const User = mongoose.models.User ?? mongoose.model("User", userSchema);
`;
}

async function setupMongoose(ctx: ProjectContext, target: ServerTarget): Promise<void> {
  const pm = ctx.packageManager;
  const ext = target.language;

  await run(addCmd(pm, ["mongoose"]), { cwd: target.dir });

  await writeText(target.dir, `src/db/index.${ext}`, mongooseConnect(ctx.name));
  await writeText(target.dir, `src/db/models/user.${ext}`, mongooseModel(ext === "ts"));

  await appendLines(target.dir, ".env", ["# Database", `DATABASE_URL=${dbUrl("mongodb", ctx.name)}`]);
}

// ------------------------------------------------------------------ Dispatch ----

/** Scaffold the chosen engine + ORM into the server target. */
export async function applyDatabase(ctx: ProjectContext): Promise<void> {
  if (ctx.dbEngine === "none" || !ctx.orm || !ctx.server) return;
  const target = ctx.server;
  const engine = ctx.dbEngine as Engine;

  switch (ctx.orm) {
    case "drizzle":
      return setupDrizzle(ctx, target, engine);
    case "prisma":
      return setupPrisma(ctx, target, engine);
    case "typeorm":
      return setupTypeorm(ctx, target, engine);
    case "mongoose":
      return setupMongoose(ctx, target);
  }
}
