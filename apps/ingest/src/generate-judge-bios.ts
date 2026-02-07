import { case_judges, cases, createDatabase, judges, runMigrations } from "@recourt/database";
import { generateText } from "ai";
import { eq } from "drizzle-orm";

import { loadConfig } from "./load-config.js";
import { getAiModel, getProviderName } from "./pipeline/ai-provider.js";

const config = loadConfig();

const db = createDatabase({
  url: config.turso.url,
  authToken: config.turso.authToken,
});
await runMigrations(db);

const model = getAiModel();
const providerName = getProviderName();
console.log(`[generate-bios] AI プロバイダ: ${providerName}, モデル: ${model.modelId}`);

// 全裁判官を取得
const allJudges = await db
  .select({
    judge_id: judges.judge_id,
    judge_name: judges.judge_name,
    bio: judges.bio,
  })
  .from(judges)
  .all();

console.log(`[generate-bios] 対象裁判官: ${allJudges.length} 名`);

for (const judge of allJudges) {
  if (judge.bio) {
    console.log(`[generate-bios] スキップ（既存bio）: ${judge.judge_name}`);
    continue;
  }

  // 裁判官の関与事件データを取得
  const caseData = await db
    .select({
      case_title: cases.case_title,
      decision_date: cases.decision_date,
      opinion_stance: case_judges.opinion_stance,
      opinion_summary: case_judges.opinion_summary,
    })
    .from(case_judges)
    .innerJoin(cases, eq(cases.case_id, case_judges.case_id))
    .where(eq(case_judges.judge_id, judge.judge_id))
    .all();

  if (caseData.length === 0) {
    console.log(`[generate-bios] スキップ（関与事件なし）: ${judge.judge_name}`);
    continue;
  }

  // スタンス統計を集計
  const stanceCounts: Record<string, number> = {};
  for (const c of caseData) {
    const stance = c.opinion_stance ?? "unknown";
    stanceCounts[stance] = (stanceCounts[stance] ?? 0) + 1;
  }

  const stanceSummary = Object.entries(stanceCounts)
    .map(([stance, count]) => `${stance}: ${count}件`)
    .join(", ");

  // 代表的な事件名（最大5件）
  const representativeCases = caseData
    .slice(0, 5)
    .map((c) => `${c.case_title}（${c.decision_date}）`)
    .join("\n  ");

  const prompt = `以下の最高裁判所裁判官の関与データに基づき、簡潔な紹介文を生成してください。

重要な制約:
- 推測は禁止。データに基づく事実のみ記述してください。
- 200文字程度でまとめてください。
- です・ます調で書いてください。

裁判官名: ${judge.judge_name}
関与事件数: ${caseData.length}件
スタンス傾向: ${stanceSummary}
代表的な事件:
  ${representativeCases}

紹介文のみを出力してください。`;

  console.log(`[generate-bios] 生成中: ${judge.judge_name}（${caseData.length}件）`);

  try {
    const result = await generateText({
      model,
      messages: [{ role: "user", content: prompt }],
    });

    const bio = result.text.trim();
    await db.update(judges).set({ bio }).where(eq(judges.judge_id, judge.judge_id)).run();
    console.log(`[generate-bios] 完了: ${judge.judge_name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[generate-bios] エラー: ${judge.judge_name} - ${message}`);
  }
}

console.log("[generate-bios] 全裁判官の処理が完了しました");
