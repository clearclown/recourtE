#!/bin/bash
# recourtE フルパイプライン実行スクリプト
# 使い方: bash init.sh
set -e

echo "=== recourtE パイプライン開始 ==="

# 1. LibSQL起動
echo "[1/7] LibSQL サーバー起動..."
podman-compose up -d libsql
sleep 3

# 2. マイグレーション実行（ホスト側で実行）
echo "[2/7] マイグレーション実行..."
pnpm --filter @recourt/database migrate

# 3. クローラー実行
echo "[3/7] クローラー実行..."
podman-compose run --rm crawler

# 4. インジェスト実行
echo "[4/7] インジェスト実行..."
podman-compose run --rm ingest

# 5. 裁判官エンリッチメント
echo "[5/7] 裁判官エンリッチメント実行..."
podman-compose run --rm enrich-judges

# 6. 意見比較生成
echo "[6/7] 意見比較生成..."
podman-compose run --rm generate-comparisons

# 7. ニュース・識者コメント収集
echo "[7/7] ニュース・識者コメント収集..."
podman-compose run --rm scrape-news

# フロントエンド起動
echo "=== フロントエンド起動 ==="
podman-compose up -d frontend-dev

echo ""
echo "=== 完了 ==="
echo "フロントエンド: http://localhost:3001"
echo ""
echo "停止: podman-compose down"
