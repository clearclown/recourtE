/**
 * AI生成品質採点スクリプト
 *
 * case_explanations の AI 生成コンテンツを DeepSeek で批判的に採点し、
 * 結果を ai_review_scores テーブルに保存する。
 *
 * 使い方: pnpm --filter @recourt/ingest review-quality
 */
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createUuidV7 } from "@recourt/core";
import {
  ai_review_scores,
  case_explanations,
  cases,
  createDatabase,
  runMigrations,
} from "@recourt/database";
import { generateObject } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";

const DELAY_MS = 1500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 採点結果の Zod スキーマ */
const reviewScoreSchema = z.object({
  quality_score: z.number().int().min(1).max(100).describe("総合品質スコア (1-100)"),
  accuracy_score: z
    .number()
    .int()
    .min(1)
    .max(100)
    .describe("正確性スコア: 法的概念の正確さ、原文との整合性 (1-100)"),
  completeness_score: z
    .number()
    .int()
    .min(1)
    .max(100)
    .describe("完全性スコア: 重要論点の網羅度 (1-100)"),
  clarity_score: z
    .number()
    .int()
    .min(1)
    .max(100)
    .describe("明瞭性スコア: 一般読者にとっての分かりやすさ (1-100)"),
  feedback: z.object({
    strengths: z.array(z.string()).describe("良い点"),
    weaknesses: z.array(z.string()).describe("改善すべき点"),
    suggestions: z.array(z.string()).describe("具体的な改善提案"),
  }),
});

/** 採点プロンプトを構築 */
const buildReviewPrompt = (input: {
  caseTitle: string;
  summary: string;
  background: string;
  issuesJson: string;
  reasoningJson: string;
  impact: string;
  whatWeLearned: string;
  glossaryJson: string;
}): string => {
  return `あなたは日本の法律の専門家であり、AIが生成した判例解説の品質を批判的に評価するレビュアーです。

以下のAI生成コンテンツを厳密に評価してください。

## 事件名
${input.caseTitle}

## AI生成コンテンツ

### 要約
${input.summary}

### 背景
${input.background}

### 争点
${input.issuesJson}

### 判決理由
${input.reasoningJson}

### 社会的影響
${input.impact}

### 学んだこと
${input.whatWeLearned}

### 用語解説
${input.glossaryJson}

## 評価基準

1. **正確性 (accuracy_score)**: 法的概念が正しく使われているか、事実関係に矛盾がないか、推測を事実として断定していないか
2. **完全性 (completeness_score)**: 重要な争点や論点が漏れなく網羅されているか、背景情報は十分か
3. **明瞭性 (clarity_score)**: 法律の専門知識がない一般読者が理解できるか、用語解説は適切か
4. **総合品質 (quality_score)**: 上記を総合した全体的な品質

各スコアは1-100の整数で、70以上が合格水準です。
厳しく評価してください。曖昧な表現や不正確な法的解釈には低いスコアをつけてください。`;
};

// メイン処理
const dbUrl = process.env.TURSO_DATABASE_URL;
if (!dbUrl) throw new Error("Missing env var: TURSO_DATABASE_URL");

const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
if (!deepseekApiKey) throw new Error("Missing env var: DEEPSEEK_API_KEY");

const db = createDatabase({
  url: dbUrl,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
await runMigrations(db);

// 採点対象: case_explanations にあるが ai_review_scores にまだない事件
const allExplanations = await db
  .select({
    case_id: case_explanations.case_id,
    summary: case_explanations.summary,
    background: case_explanations.background,
    issues_json: case_explanations.issues_json,
    reasoning_json: case_explanations.reasoning_json,
    impact: case_explanations.impact,
    what_we_learned: case_explanations.what_we_learned,
    glossary_json: case_explanations.glossary_json,
  })
  .from(case_explanations)
  .all();

const existingReviews = await db
  .select({ case_id: ai_review_scores.case_id })
  .from(ai_review_scores)
  .all();

const reviewedSet = new Set(existingReviews.map((r) => r.case_id));
const targets = allExplanations.filter((e) => !reviewedSet.has(e.case_id));

console.log(
  `[review] 全解説: ${allExplanations.length} 件, 採点済: ${reviewedSet.size} 件, 対象: ${targets.length} 件`,
);

if (targets.length === 0) {
  console.log("[review] 採点対象がありません。終了します。");
  process.exit(0);
}

// DeepSeek モデル準備
const reviewModelName = process.env.REVIEW_MODEL ?? "deepseek-chat";
const deepseek = createDeepSeek({ apiKey: deepseekApiKey });
const model = deepseek(reviewModelName);

// 生成に使用されたモデル名を環境変数から取得
const generatedByModel = process.env.AI_MODEL ?? process.env.AI_PROVIDER ?? "unknown";

console.log(`[review] 採点モデル: ${reviewModelName}, 生成モデル: ${generatedByModel}`);

let successCount = 0;
let errorCount = 0;

for (const exp of targets) {
  try {
    // 事件タイトルを取得
    const caseRow = await db
      .select({ case_title: cases.case_title })
      .from(cases)
      .where(eq(cases.case_id, exp.case_id))
      .get();

    const caseTitle = caseRow?.case_title ?? exp.case_id;
    console.log(`[review] 採点中: ${caseTitle}`);

    const prompt = buildReviewPrompt({
      caseTitle,
      summary: exp.summary,
      background: exp.background,
      issuesJson: exp.issues_json,
      reasoningJson: exp.reasoning_json,
      impact: exp.impact,
      whatWeLearned: exp.what_we_learned,
      glossaryJson: exp.glossary_json,
    });

    const { object: result } = await generateObject({
      model,
      schema: reviewScoreSchema,
      prompt,
    });

    // DBに保存
    await db
      .insert(ai_review_scores)
      .values({
        review_id: createUuidV7(),
        case_id: exp.case_id,
        reviewed_by_model: reviewModelName,
        generated_by_model: generatedByModel,
        quality_score: result.quality_score,
        accuracy_score: result.accuracy_score,
        completeness_score: result.completeness_score,
        clarity_score: result.clarity_score,
        feedback_json: JSON.stringify(result.feedback),
        reviewed_at: new Date().toISOString(),
      })
      .onConflictDoNothing()
      .run();

    console.log(
      `[review] case=${exp.case_id} quality_score=${result.quality_score} accuracy=${result.accuracy_score} completeness=${result.completeness_score} clarity=${result.clarity_score}`,
    );
    successCount++;

    await sleep(DELAY_MS);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[review] エラー (${exp.case_id}): ${message}`);
    errorCount++;
  }
}

console.log(`[review] 処理完了: 成功 ${successCount} 件, エラー ${errorCount} 件`);
