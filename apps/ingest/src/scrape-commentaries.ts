/**
 * 識者コメント収集スクリプト
 *
 * DuckDuckGo API を使って、各事件に関する弁護士・専門家の
 * 解説記事を収集し、case_commentaries テーブルに保存する。
 *
 * 使い方: pnpm --filter @recourt/ingest scrape-commentaries
 */
import { createUuidV7 } from "@recourt/core";
import { case_commentaries, cases, createDatabase, runMigrations } from "@recourt/database";
import { isNotNull } from "drizzle-orm";
import { SafeSearchType, search } from "duck-duck-scrape";

const BASE_DELAY_MS = 4000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** リトライ付き検索（DuckDuckGo レート制限対策） */
const searchWithRetry = async (query: string, maxRetries = 3): Promise<CommentaryItem[]> => {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await searchCommentaries(query);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("anomaly") && attempt < maxRetries) {
        const backoff = BASE_DELAY_MS * 2 ** (attempt + 1);
        console.log(`[commentaries] レート制限、${backoff / 1000}秒待機後にリトライ (${attempt + 1}/${maxRetries})`);
        await sleep(backoff);
        continue;
      }
      throw err;
    }
  }
  return [];
};

interface CommentaryItem {
  title: string;
  url: string;
  sourceName: string;
  excerpt: string | null;
}

/** DuckDuckGo API で検索して記事情報を取得 */
const searchCommentaries = async (query: string): Promise<CommentaryItem[]> => {
  const results = await search(query, {
    safeSearch: SafeSearchType.OFF,
    locale: "ja-JP",
  });

  return results.results
    .filter((r) => r.url && r.title)
    .map((r) => {
      let sourceName = "不明";
      try {
        sourceName = new URL(r.url).hostname.replace(/^www\./, "");
      } catch {
        // URLパース失敗時はデフォルト値のまま
      }

      // HTMLタグを除去
      const rawSnippet = r.description ?? "";
      const excerpt = rawSnippet.replace(/<[^>]*>/g, "").trim() || null;

      return {
        title: r.title,
        url: r.url,
        sourceName,
        excerpt,
      };
    });
};

// メイン処理
const dbUrl = process.env.TURSO_DATABASE_URL;
if (!dbUrl) throw new Error("Missing env var: TURSO_DATABASE_URL");

const db = createDatabase({
  url: dbUrl,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
await runMigrations(db);

// case_title_short が存在する全事件を取得
const allCases = await db
  .select({
    case_id: cases.case_id,
    case_title_short: cases.case_title_short,
  })
  .from(cases)
  .where(isNotNull(cases.case_title_short))
  .all();

console.log(`[commentaries] 対象事件数: ${allCases.length}`);

// 各事件に対して複数の検索クエリを実行
const queryTemplates = [
  (title: string) => `${title} 解説 弁護士`,
  (title: string) => `${title} コメント 専門家`,
];

let totalInserted = 0;
let totalSkipped = 0;

for (const c of allCases) {
  console.log(`[commentaries] 処理中: ${c.case_title_short}`);

  for (const buildQuery of queryTemplates) {
    const query = buildQuery(c.case_title_short as string);

    console.log(`[commentaries] 検索中: "${query}"`);

    try {
      await sleep(BASE_DELAY_MS);
      const items = await searchWithRetry(query);
      console.log(`[commentaries] ${items.length} 件の結果を検出`);

      for (const item of items) {
        try {
          // INSERT OR IGNORE: url のunique制約で重複を自動スキップ
          const result = await db
            .insert(case_commentaries)
            .values({
              commentary_id: createUuidV7(),
              case_id: c.case_id,
              title: item.title,
              source_url: item.url,
              source_name: item.sourceName,
              excerpt: item.excerpt,
              fetched_at: new Date().toISOString(),
            })
            .onConflictDoNothing()
            .run();

          if (Number(result.rowsAffected ?? 0) > 0) {
            totalInserted++;
          } else {
            totalSkipped++;
          }
        } catch (err) {
          console.log(`[commentaries] 保存エラー: ${item.url} — ${err}`);
        }
      }
    } catch (err) {
      console.log(`[commentaries] 取得エラー: ${query} — ${err}`);
    }

  }
}

console.log(`[commentaries] 処理完了: 新規 ${totalInserted} 件, スキップ ${totalSkipped} 件`);
