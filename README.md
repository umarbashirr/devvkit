# devvkit

CLI for scaffolding opinionated starter kits. First (and currently only) target: **Next.js**.

It wraps the official `create-next-app` for the base, then layers selected feature
modules on top — so the base stays current with Next.js defaults and devvkit only
owns the extras.

## Usage

```bash
# interactive
npx devvkit my-app

# non-interactive (defaults, tuned by flags)
npx devvkit my-app --yes --pm pnpm --db drizzle --auth
```

### Options

| Flag | Description |
|------|-------------|
| `[name]` | Project directory name (prompted if omitted) |
| `--pm <manager>` | `pnpm` \| `npm` \| `yarn` \| `bun` |
| `--db <orm>` | `none` \| `drizzle` \| `prisma` |
| `--styling` / `--no-styling` | Tailwind + shadcn/ui |
| `--auth` / `--no-auth` | Better Auth (email + password) |
| `--tooling` / `--no-tooling` | Prettier + Husky + lint-staged + GitHub Actions CI |
| `--eslint` / `--no-eslint` | ESLint |
| `-y, --yes` | Skip prompts; use defaults (overridable by flags) |

## Feature modules

| Module | What it does |
|--------|--------------|
| **styling** | `--tailwind` via create-next-app, then `shadcn init` + button/card/input |
| **database** | Drizzle or Prisma scaffold against SQLite (client, schema, `db:*` scripts) |
| **auth** | Better Auth wired with email/password + standalone SQLite, Next.js route handler |
| **tooling** | Prettier config, Husky `pre-commit` running lint-staged, CI workflow |

Each module is a `FeatureModule` in `src/features/`. Add a new one and register it
in `src/features/index.ts` to grow the kit. New kit targets (beyond Next.js) can
follow the same registry pattern.

## Develop

```bash
pnpm install
pnpm build        # bundle to dist/ via tsup
pnpm typecheck
node dist/index.js my-app   # run locally
```

## Architecture

```
src/
  index.ts          bin entry (shebang added by tsup)
  cli.ts            commander flags + clack prompts -> ProjectContext -> pipeline
  scaffold.ts       create-next-app wrapper
  types.ts          ProjectContext + FeatureModule contracts
  features/         one file per module + registry
  utils/            exec (execa), pm (package-manager commands), fs (file/json helpers)
```
