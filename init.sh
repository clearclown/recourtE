#!/bin/bash
# recourtE フルパイプライン実行スクリプト
# 使い方: bash init.sh
#
# 前提:
#   - .env ファイルが存在すること (cp .env.example .env して編集)
#   - podman が利用可能であること
set -e

BATCH="-f podman-compose.batch.yml"
NET="recourte_default"

echo "=== recourtE パイプライン開始 ==="

# 0. ネットワーク作成（なければ）
podman network exists "$NET" 2>/dev/null || podman network create "$NET"

# 1. LibSQL起動
echo "[1/8] LibSQL サーバー起動..."
podman-compose up -d libsql
echo "       LibSQL 起動待ち..."
sleep 3

# 2. マイグレーション実行（ホスト側で実行）
echo "[2/8] マイグレーション実行..."
pnpm --filter @recourt/database migrate

# バッチイメージをビルド
echo "       バッチイメージをビルド中..."
podman-compose $BATCH build crawler ingest enrich-judges generate-comparisons scrape-news scrape-commentaries

# バッチ実行用関数: podman run --rm でイメージを直接実行
# podman-compose run は 1.0.6 で depends_on 衝突バグがあるため回避
# --env-file はコメント行で問題が起きるため、grep でフィルタリング
ENV_CLEAN=$(mktemp)
grep -v '^#' .env | grep -v '^\s*$' > "$ENV_CLEAN"
trap "rm -f $ENV_CLEAN" EXIT

run_batch() {
  local image="$1"
  shift
  podman run --rm \
    --network "$NET" \
    --add-host=host.containers.internal:host-gateway \
    --env-file "$ENV_CLEAN" \
    -e "TURSO_DATABASE_URL=http://libsql:8080" \
    -e "TURSO_AUTH_TOKEN=" \
    "$image" "$@"
}

# 3. クローラー実行
echo "[3/8] クローラー実行..."
run_batch localhost/recourte_crawler

# 4. インジェスト実行
echo "[4/8] インジェスト実行..."
run_batch localhost/recourte_ingest

# 5. 裁判官エンリッチメント
echo "[5/8] 裁判官エンリッチメント実行..."
run_batch localhost/recourte_enrich-judges

# 6. 意見比較生成
echo "[6/8] 意見比較生成..."
run_batch localhost/recourte_generate-comparisons

# 7. ニュース収集
echo "[7/8] ニュース収集..."
run_batch localhost/recourte_scrape-news

# 8. 識者コメント収集
echo "[8/8] 識者コメント収集..."
run_batch localhost/recourte_scrape-news pnpm --filter @recourt/ingest scrape-commentaries

# フロントエンド起動
echo "=== フロントエンド起動 ==="
podman-compose up -d frontend-dev

echo ""
echo "=== 完了 ==="
echo "フロントエンド: http://localhost:3001"
echo ""
echo "停止: podman-compose down"
