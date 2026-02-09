# ── base ──────────────────────────────────────────────
FROM docker.io/library/node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

# ── deps ──────────────────────────────────────────────
FROM base AS deps
WORKDIR /app

# better-sqlite3 ビルドに必要 + crawlee のメモリ監視に procps (ps) が必要
RUN apt-get update && apt-get install -y python3 make g++ procps && rm -rf /var/lib/apt/lists/*

# pnpm workspace 設定
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# 各 workspace の package.json をコピー
COPY apps/frontend/package.json apps/frontend/package.json
COPY apps/crawler/package.json apps/crawler/package.json
COPY apps/ingest/package.json apps/ingest/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/database/package.json packages/database/package.json

RUN pnpm install --frozen-lockfile

# ── source ────────────────────────────────────────────
# 全ソースをコピーする共通ステージ
FROM deps AS source
COPY . .

# ── frontend-builder ──────────────────────────────────
FROM source AS frontend-builder
RUN pnpm --filter @recourt/frontend build

# ── frontend-prod ─────────────────────────────────────
FROM base AS frontend-prod
WORKDIR /app
COPY --from=frontend-builder /app/.output .output
ENV PORT=3001
EXPOSE 3001
CMD ["node", ".output/server/index.mjs"]

# ── frontend-dev ──────────────────────────────────────
FROM source AS frontend-dev
WORKDIR /app/apps/frontend
ENV PORT=3001
EXPOSE 3001
CMD ["npx", "vite", "dev", "--host", "0.0.0.0", "--port", "3001"]

# ── crawler ───────────────────────────────────────────
FROM source AS crawler
# コンテナでは env_file 経由で環境変数が渡されるため、空の .env を作成
# .containerignore で **/.env を除外しているので、各 workspace にも空 .env が必要
RUN touch /app/.env /app/apps/crawler/.env
CMD ["pnpm", "--filter", "@recourt/crawler", "crawl"]

# ── ingest ────────────────────────────────────────────
FROM source AS ingest
RUN touch /app/.env /app/apps/ingest/.env
CMD ["pnpm", "--filter", "@recourt/ingest", "process"]

# ── enrich-judges ─────────────────────────────────────
FROM source AS enrich-judges
RUN touch /app/.env /app/apps/ingest/.env
CMD ["pnpm", "--filter", "@recourt/ingest", "enrich-judges"]

# ── generate-comparisons ─────────────────────────────
FROM source AS generate-comparisons
RUN touch /app/.env /app/apps/ingest/.env
CMD ["pnpm", "--filter", "@recourt/ingest", "generate-comparisons"]

# ── scrape-news ──────────────────────────────────────
FROM source AS scrape-news
RUN touch /app/.env /app/apps/ingest/.env
CMD ["pnpm", "--filter", "@recourt/ingest", "scrape-news"]

# ── review-quality ───────────────────────────────────
FROM source AS review-quality
RUN touch /app/.env /app/apps/ingest/.env
CMD ["pnpm", "--filter", "@recourt/ingest", "review-quality"]
