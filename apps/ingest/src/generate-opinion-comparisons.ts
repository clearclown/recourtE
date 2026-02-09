/**
 * 裁判官意見比較AI生成スクリプト
 *
 * case_judges テーブルから複数裁判官が意見を持つ事件を取得し、
 * AIで意見比較分析を生成して opinion_comparisons テーブルに保存する。
 *
 * 使い方: pnpm --filter @recourt/ingest generate-comparisons
 */
import {
  case_judges,
  cases,
  createDatabase,
  judges,
  opinion_comparisons,
  runMigrations,
} from "@recourt/database";
import { generateObject } from "ai";
import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { z } from "zod";

import { loadConfig } from "./load-config.js";
import { getAiModel, getProviderName } from "./pipeline/ai-provider.js";

const DELAY_MS = 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** AI出力のZodスキーマ */
const comparisonSchema = z.object({
  majority_view: z.string().describe("多数意見の要約"),
  dissenting_views: z
    .array(
      z.object({
        judge_name: z.string().describe("裁判官名"),
        summary: z.string().describe("反対・補足意見の要約"),
      }),
    )
    .describe("反対・補足意見の一覧"),
  key_disagreements: z.array(z.string()).describe("主要な論点の相違点"),
});

/** 裁判官情報の型 */
interface JudgeOpinionInfo {
  judgeName: string;
  stance: string | null;
  opinionSummary: string | null;
  supplementaryOpinion: string | null;
}

/** AIプロンプトを構築 */
const buildPrompt = (caseTitle: string, judgeInfos: JudgeOpinionInfo[]): string => {
  const judgeLines = judgeInfos
    .map((j) => {
      const parts = [`- 裁判官: ${j.judgeName}`];
      if (j.stance) parts.push(`  立場: ${j.stance}`);
      if (j.opinionSummary) parts.push(`  意見要約: ${j.opinionSummary}`);
      if (j.supplementaryOpinion) parts.push(`  補足意見: ${j.supplementaryOpinion}`);
      return parts.join("\n");
    })
    .join("\n");

  return `あなたは日本の最高裁判所の判例分析専門家です。
以下の事件における各裁判官の意見を分析し、比較してください。

## 事件
${caseTitle}

## 各裁判官の意見
${judgeLines}

## 指示
1. 多数意見（majority_view）を簡潔にまとめてください。
2. 反対意見や補足意見がある裁判官について、それぞれの要約を作成してください。
3. 裁判官間の主要な意見の相違点をリストアップしてください。
4. 原文に書かれていない内容は推測せず、「不明」と記載してください。
5. です・ます調で記述してください。`;
};

/** Markdown形式の比較分析テキストを生成 */
const buildComparisonMarkdown = (
  caseTitle: string,
  result: z.infer<typeof comparisonSchema>,
): string => {
  const lines: string[] = [];
  lines.push(`## 意見比較: ${caseTitle}`);
  lines.push("");
  lines.push("### 多数意見");
  lines.push(result.majority_view);
  lines.push("");

  if (result.dissenting_views.length > 0) {
    lines.push("### 反対・補足意見");
    for (const view of result.dissenting_views) {
      lines.push(`#### ${view.judge_name}`);
      lines.push(view.summary);
      lines.push("");
    }
  }

  if (result.key_disagreements.length > 0) {
    lines.push("### 主要な論点の相違");
    for (const point of result.key_disagreements) {
      lines.push(`- ${point}`);
    }
    lines.push("");
  }

  return lines.join("\n");
};

// メイン処理
const config = loadConfig();
const db = createDatabase({
  url: config.turso.url,
  authToken: config.turso.authToken,
});
await runMigrations(db);

// 1. 2人以上の裁判官が意見を持つ事件のcase_idを取得
//    opinion_stance が null でない、または supplementary_opinion が null でない
const casesWithOpinions = await db
  .select({ case_id: case_judges.case_id })
  .from(case_judges)
  .where(or(isNotNull(case_judges.opinion_stance), isNotNull(case_judges.supplementary_opinion)))
  .groupBy(case_judges.case_id)
  .having(sql`count(*) >= 2`)
  .all();

const caseIds = casesWithOpinions.map((r) => r.case_id);
console.log(`[comparisons] 意見比較対象の事件数: ${caseIds.length}`);

if (caseIds.length === 0) {
  console.log("[comparisons] 対象事件がありません。終了します。");
  process.exit(0);
}

// 2. 既に opinion_comparisons に存在する事件を除外
const existingComparisons = await db
  .select({ case_id: opinion_comparisons.case_id })
  .from(opinion_comparisons)
  .where(inArray(opinion_comparisons.case_id, caseIds))
  .all();

const existingSet = new Set(existingComparisons.map((r) => r.case_id));
const targetCaseIds = caseIds.filter((id) => !existingSet.has(id));

console.log(`[comparisons] 既存: ${existingSet.size} 件, 新規対象: ${targetCaseIds.length} 件`);

if (targetCaseIds.length === 0) {
  console.log("[comparisons] 新規対象がありません。終了します。");
  process.exit(0);
}

// 3. AIモデル準備
const model = getAiModel();
const providerName = getProviderName();
console.log(`[comparisons] AIプロバイダー: ${providerName}`);

let successCount = 0;
let errorCount = 0;

// 4. 各事件を処理
for (const caseId of targetCaseIds) {
  try {
    // 事件タイトルを取得
    const caseRow = await db
      .select({ case_title: cases.case_title })
      .from(cases)
      .where(eq(cases.case_id, caseId))
      .get();

    if (!caseRow) {
      console.log(`[comparisons] 事件が見つかりません: ${caseId}`);
      errorCount++;
      continue;
    }

    // 裁判官情報を取得（case_judges + judges JOIN）
    const judgeRows = await db
      .select({
        judge_name: judges.judge_name,
        opinion_stance: case_judges.opinion_stance,
        opinion_summary: case_judges.opinion_summary,
        supplementary_opinion: case_judges.supplementary_opinion,
      })
      .from(case_judges)
      .innerJoin(judges, eq(case_judges.judge_id, judges.judge_id))
      .where(
        and(
          eq(case_judges.case_id, caseId),
          or(isNotNull(case_judges.opinion_stance), isNotNull(case_judges.supplementary_opinion)),
        ),
      )
      .all();

    if (judgeRows.length < 2) {
      console.log(`[comparisons] 裁判官が2人未満のためスキップ: ${caseId}`);
      continue;
    }

    const judgeInfos: JudgeOpinionInfo[] = judgeRows.map((r) => ({
      judgeName: r.judge_name,
      stance: r.opinion_stance,
      opinionSummary: r.opinion_summary,
      supplementaryOpinion: r.supplementary_opinion,
    }));

    console.log(`[comparisons] 処理中: ${caseRow.case_title} (裁判官: ${judgeInfos.length} 名)`);

    // AI呼び出し
    const prompt = buildPrompt(caseRow.case_title, judgeInfos);
    const { object: result } = await generateObject({
      model,
      schema: comparisonSchema,
      prompt,
    });

    // Markdown生成
    const markdown = buildComparisonMarkdown(caseRow.case_title, result);

    // DBに保存
    await db
      .insert(opinion_comparisons)
      .values({
        case_id: caseId,
        comparison_json: JSON.stringify(result),
        comparison_markdown: markdown,
        ai_model: providerName,
        created_at: new Date().toISOString(),
      })
      .run();

    console.log(`[comparisons] 完了: ${caseRow.case_title}`);
    successCount++;

    // レート制限: 次のAI呼び出しまで遅延
    await sleep(DELAY_MS);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[comparisons] エラー (${caseId}): ${message}`);
    errorCount++;
  }
}

console.log(`[comparisons] 処理完了: 成功 ${successCount} 件, エラー ${errorCount} 件`);
