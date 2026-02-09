/**
 * 識者コメント収集スクリプト
 *
 * Google検索結果をスクレイピングして、各事件に関する弁護士・専門家の
 * 解説記事を収集し、case_commentaries テーブルに保存する。
 *
 * 使い方: pnpm --filter @recourt/ingest scrape-commentaries
 */
import { createUuidV7 } from "@recourt/core";
import { case_commentaries, cases, createDatabase, runMigrations } from "@recourt/database";
import * as cheerio from "cheerio";
import { isNotNull } from "drizzle-orm";

const DELAY_MS = 2000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Google検索URLを構築 */
const buildSearchUrl = (query: string): string => {
  const params = new URLSearchParams({
    q: query,
    hl: "ja",
    num: "5",
  });
  return `https://www.google.com/search?${params}`;
};

interface CommentaryItem {
  title: string;
  url: string;
  sourceName: string;
  excerpt: string | null;
}

/** Google検索結果HTMLをパースして記事情報を抽出 */
const parseSearchResults = (html: string): CommentaryItem[] => {
  const $ = cheerio.load(html);
  const items: CommentaryItem[] = [];

  // Google検索結果のリンクパターン: a[href^="/url?q="]
  $('a[href^="/url?q="]').each((_, el) => {
    const rawHref = $(el).attr("href") ?? "";
    // /url?q=ACTUAL_URL&sa=... からURLを抽出
    const urlMatch = rawHref.match(/\/url\?q=([^&]+)/);
    if (!urlMatch) return;

    const url = decodeURIComponent(urlMatch[1]);
    // Google自身のURLやキャッシュ等を除外
    if (url.includes("google.com") || url.includes("webcache.")) return;

    // タイトル: 直近の h3 テキスト
    const h3 = $(el).find("h3").text().trim() || $(el).text().trim();
    if (!h3) return;

    // ソース名: URLのホスト名を使用
    let sourceName = "不明";
    try {
      sourceName = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      // URLパース失敗時はデフォルト値のまま
    }

    // スニペット: リンク要素の後続テキスト
    const parentBlock = $(el).closest("div");
    const snippet = parentBlock.find("span").last().text().trim() || null;

    items.push({
      title: h3,
      url,
      sourceName,
      excerpt: snippet,
    });
  });

  // 重複URLを除去
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
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
    const searchUrl = buildSearchUrl(query);

    console.log(`[commentaries] 検索中: "${query}"`);

    try {
      const res = await fetch(searchUrl, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "ja,en;q=0.5",
        },
      });

      if (!res.ok) {
        console.log(`[commentaries] 検索失敗 (${res.status}): ${query}`);
        await sleep(DELAY_MS);
        continue;
      }

      const html = await res.text();
      const items = parseSearchResults(html);
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

    await sleep(DELAY_MS);
  }
}

console.log(`[commentaries] 処理完了: 新規 ${totalInserted} 件, スキップ ${totalSkipped} 件`);
