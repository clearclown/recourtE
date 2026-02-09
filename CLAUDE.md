# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**See also [`AGENTS.md`](./AGENTS.md)** for detailed code style conventions, naming rules, error handling patterns, formatting (Biome) settings, frontend/database patterns, and per-package commands. Always follow AGENTS.md when writing or modifying code.

## 言語規則

- ユーザーへの返答、コード内コメントはすべて日本語で記述する
- CLAUDE.md / AGENTS.md は英語で記述する

## Project Overview

recourtE — A fork of [tukiminya/recourt](https://github.com/tukiminya/recourt). A web app that collects Japan's Supreme Court case data, generates AI explanations, and presents them in a user-friendly interface. Note: The original project name and logo are NOT licensed under MPL-2.0 and require prior permission for use.

## Tech Stack

- **Monorepo**: pnpm 10.28.1 + Turborepo, TypeScript ESM throughout
- **Frontend**: TanStack Start + Vite + React (file-based routing with `$param` segments)
- **Database**: LibSQL/Turso + Drizzle ORM (SQLite)
- **Crawler**: Crawlee + CheerioCrawler
- **AI**: Google Gemini for case explanation generation
- **Storage**: Cloudflare R2 for PDF/AI output storage
- **Linter/Formatter**: Biome (2 spaces, 100 cols, semicolons, double quotes)

## Common Commands

```bash
pnpm install                                    # Install deps
pnpm dev                                        # Dev all apps
pnpm build                                      # Build all
pnpm lint                                       # Lint all (Biome)
pnpm test                                       # Test all
pnpm typecheck                                  # Typecheck all

# Package-scoped (use --filter)
pnpm --filter @recourt/frontend dev
pnpm --filter @recourt/frontend test
pnpm --filter @recourt/frontend test -- src/path/to/file.test.tsx   # Single test file
pnpm --filter @recourt/frontend test -- -t "test name"              # Single test by name
pnpm --filter @recourt/crawler crawl
pnpm --filter @recourt/ingest process
pnpm --filter @recourt/database generate        # Generate Drizzle migration
pnpm --filter @recourt/database migrate          # Apply migrations
pnpm --filter @recourt/database dev              # Local Turso dev
```

## Architecture

### Data Pipeline

```
Crawler → Turso (cases + ingest_jobs) → Ingest → Gemini + R2 → Turso (explanations, judges, outcomes)
```

1. **Crawler** (`apps/crawler`): Scrapes Supreme Court search pages by date range, saves raw case data and queues ingest jobs
2. **Ingest** (`apps/ingest`): Processes pending jobs — downloads PDFs, calls Gemini for structured explanations, stores results in R2 and Turso
3. **Frontend** (`apps/frontend`): Renders cases with AI-generated explanations, judge info, and outcomes via TanStack Start server functions

### Shared Packages

- **`packages/core`**: R2 client, Gemini API helpers, text normalization, hashing, UUID v7 generation
- **`packages/database`**: Drizzle schema, `createDatabase`/`runMigrations` helpers

### CI/CD Workflows

- `crawler.yml`: Daily cron (01:00 UTC) + manual dispatch, crawls last 7 days by default
- `ingest.yml`: Triggers after successful crawler run or manually
- `database-migrate.yml`: Auto-runs on push to main when `packages/database/migrations/**` changes
- `database-migration-check.yml`: PR check — fails if `schema.ts` changed without corresponding migration files

## Database Schema Changes

1. Edit `packages/database/src/schema.ts`
2. Run `pnpm --filter @recourt/database generate`
3. Run `pnpm --filter @recourt/database migrate`
4. Never manually edit files under `packages/database/migrations/`

## Key Domain Tables

- `cases`: Core case records with court info, PDF URLs, decision dates
- `case_explanations`: AI-generated summaries, reasoning, impact, glossary (JSON stored as text)
- `judges` / `case_judges`: Judge records with per-case opinions and stances
- `outcomes`: Case verdict type and result text
- `ingest_jobs`: Pipeline job tracking (pending → processing → done/error)

## Import Conventions

- In packages and non-frontend apps: use `.js` extensions in relative imports (`./config.js`)
- In frontend UI code: no extension by default, but use `.js` for server module imports (`./db.server.js`)
- Group imports: third-party → workspace packages → relative paths (Biome enforces blank line between groups)

## GitHub Operations

**IMPORTANT**: This repository is a fork. All issues, pull requests, and pushes MUST target this fork only:

- **Repository**: `clearclown/recourtE` (`https://github.com/clearclown/recourtE`)
- **Never** push to, create PRs against, or open issues on the upstream (forked-from) repository
- When creating PRs with `gh pr create`, always verify the base repo is `clearclown/recourtE`

## Testing

Only `apps/frontend` has a test runner (Vitest). Other packages echo "no test yet".
