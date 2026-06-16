# devvkit

CLI for scaffolding opinionated starter kits. It wraps official scaffolders
(`create-next-app`, `create-vite`) for the base, then layers selected modules
(backend, auth, database, libraries, CI) on top.

## Usage

```bash
# interactive
npx devvkit my-app

# non-interactive (flags + defaults)
npx devvkit my-app --yes --framework react-vite-ts --backend express-ts \
  --layout monorepo --monorepo-tool turborepo --auth better-auth --db drizzle \
  --libraries prettier,husky,editorconfig --ci
```

## Prompt flow

```
1. Package manager   pnpm · npm · yarn · bun
2. Framework         React+Vite (TS/JS) · Vue+Vite (TS/JS)* · Next.js · Next.js Full Stack
3. Backend           (skipped for Next.js Full Stack)  None · Express (JS) · Express (TS)
4. Repo layout       (only with a separate backend)    Monorepo · Flat · Multi-repo
      └ if Monorepo  Turborepo · pnpm workspaces · Nx*
5. Auth              (only if a server exists)          None · Better Auth
6. Database engine   (only if a server exists)          None · SQLite · PostgreSQL · MySQL · MongoDB
7. ORM               (only if an engine is chosen)      MongoDB → Mongoose · SQL → Drizzle · Prisma · TypeORM
8. Libraries         Prettier · Husky+lint-staged · EditorConfig
9. CI                GitHub Actions yes/no
                                                        * = stub (selectable, "coming soon")
```

"Server" = the Next.js app (Full Stack) or the Express api. With no server,
auth & database are skipped.

## Layouts

| Layout | Structure | Repos |
|--------|-----------|-------|
| single | one app at root (no separate backend) | 1 |
| monorepo | `apps/web` + `apps/api` (Turborepo or pnpm workspaces) | 1 |
| flat | `client/` + `server/` under a light root | 1 |
| multi | `<name>-web` + `<name>-api` side by side | 2 |

## What each module does

- **frameworks** — `create-next-app` (TS, App Router, Tailwind) or `create-vite` (react / react-ts)
- **backends** — Express (JS/TS) from scratch: `/health`, CORS, dev/build/start scripts; mounts Better Auth when selected
- **auth** — Better Auth (email/password) + standalone SQLite; Next route handler or Express node handler
- **database** — two steps: engine then ORM. SQLite / PostgreSQL / MySQL with Drizzle, Prisma, or TypeORM; MongoDB with Mongoose. Generates the right driver, config/schema (or entity/model), client, and `db:*` scripts. Prisma pinned to v6; TypeORM enables decorator metadata in the target's tsconfig.
- **libraries** — Prettier, Husky + lint-staged, EditorConfig — per repo root
- **ci** — GitHub Actions workflow per repo (install + lint/build when present)

## Flags

`--pm`, `--framework`, `--backend`, `--layout`, `--monorepo-tool`, `--auth`,
`--db` (engine), `--orm`, `--libraries` (csv), `--ci`, `-y/--yes`. Run `devvkit --help` for values.

## Architecture

```
src/
  index.ts      bin entry (shebang added by tsup)
  cli.ts        commander flags + clack prompts -> ProjectContext
  pipeline.ts   root -> framework -> backend -> features -> native rebuild -> git
  layout.ts     resolve dirs; scaffold workspace/flat root; package roots
  types.ts      ProjectContext + capability helpers
  frameworks/   next, react-vite, vue-vite (stub) + registry
  backends/     express + registry
  features/     auth, database, libraries, ci
  utils/        exec (execa), pm (commands+detect), fs (file/json), native (pnpm builds)
```

Add a framework in `src/frameworks/`, a backend in `src/backends/`, or a module
in `src/features/`, then register it — the registries are the extension points.

## Develop

```bash
pnpm install
pnpm build          # bundle to dist/ via tsup
pnpm typecheck
node dist/index.js my-app --yes --framework next-fullstack   # run locally
```

## Notes

- `create-next-app` initializes its own git commit; devvkit adds a second commit with the layered files.
- pnpm 10 blocks dependency build scripts by default — devvkit allowlists and rebuilds native deps (better-sqlite3, esbuild) at the workspace root.
