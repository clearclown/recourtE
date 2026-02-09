/**
 * ニュース記事収集スクリプト
 *
 * Google News RSSを使って、DB内の各事件に関連するニュース記事を収集し、
 * case_news テーブルに保存する。
 *
 * 使い方: pnpm --filter @recourt/ingest scrape-news
 */
import { createUuidV7 } from "@recourt/core";
import { case_news, cases, createDatabase, runMigrations } from "@recourt/database";
import * as cheerio from "cheerio";
import { isNotNull } from "drizzle-orm";

const DELAY_MS = 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Google News RSS URLを構築 */
const buildNewsRssUrl = (query: string): string => {
  const params = new URLSearchParams({
    q: query,
    hl: "ja",
    gl: "JP",
    ceid: "JP:ja",
  });
  return `https://news.google.com/rss/search?${params}`;
};

interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string | null;
  snippet: string | null;
}

/** RSS XMLをパースしてニュース記事を抽出 */
const parseRssItems = (xml: string): NewsItem[] => {
  const $ = cheerio.load(xml, { xmlMode: true });
  const items: NewsItem[] = [];

  $("item").each((_, el) => {
    const title = $(el).find("title").text().trim();
    const link = $(el).find("link").text().trim();
    const source = $(el).find("source").text().trim() || "不明";
    const pubDate = $(el).find("pubDate").text().trim() || null;
    const description = $(el).find("description").text().trim() || null;

    if (title && link) {
      items.push({
        title,
        url: link,
        source,
        publishedAt: pubDate ? new Date(pubDate).toISOString() : null,
        snippet: description,
      });
    }
  });

  return items;
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

console.log(`[news] 対象事件数: ${allCases.length}`);

let totalInserted = 0;
let totalSkipped = 0;

for (const c of allCases) {
  const query = `${c.case_title_short} 最高裁`;
  const rssUrl = buildNewsRssUrl(query);

  console.log(`[news] 検索中: "${query}"`);

  try {
    const res = await fetch(rssUrl);
    if (!res.ok) {
      console.log(`[news] RSS取得失敗 (${res.status}): ${c.case_title_short}`);
      await sleep(DELAY_MS);
      continue;
    }

    const xml = await res.text();
    const items = parseRssItems(xml);
    console.log(`[news] ${items.length} 件の記事を検出: ${c.case_title_short}`);

    for (const item of items) {
      try {
        // INSERT OR IGNORE: url のunique制約で重複を自動スキップ
        const result = await db
          .insert(case_news)
          .values({
            news_id: createUuidV7(),
            case_id: c.case_id,
            title: item.title,
            url: item.url,
            source: item.source,
            published_at: item.publishedAt,
            snippet: item.snippet,
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
        console.log(`[news] 記事保存エラー: ${item.url} — ${err}`);
      }
    }
  } catch (err) {
    console.log(`[news] 取得エラー: ${c.case_title_short} — ${err}`);
  }

  await sleep(DELAY_MS);
}

console.log(`[news] 処理完了: 新規 ${totalInserted} 件, スキップ ${totalSkipped} 件`);
