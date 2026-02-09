import { createFileRoute } from "@tanstack/react-router";

import { parseSources } from "../../lib/case-helpers";
import { getJudgeDetail } from "../../server/judges.functions";

export const Route = createFileRoute("/judges/$judgeId")({
  loader: ({ params }) => getJudgeDetail({ data: { judgeId: params.judgeId } }),
  component: JudgeDetail,
});

const stanceLabels: Record<string, string> = {
  agree: "同意",
  dissent: "反対",
  supplement: "補足",
  other: "その他",
  unknown: "不明",
};

function JudgeDetail() {
  type JudgeDetailData = Awaited<ReturnType<typeof getJudgeDetail>>;
  const data = Route.useLoaderData() as JudgeDetailData;

  if (!data) {
    return (
      <div className="min-h-screen text-[var(--ink-1)] scv-page">
        <div className="scv-container py-12">
          <div className="scv-panel p-6 text-center text-[var(--ink-3)]">
            裁判官が見つかりません。
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-[var(--ink-1)] scv-page">
      <div className="scv-container py-12">
        <div className="space-y-8">
          <div className="space-y-3">
            <p className="scv-kicker">裁判官詳細</p>
            <h1 className="scv-title">{data.judge.judge_name}</h1>
            <p className="text-[var(--ink-3)]">最高裁判例における関与記録を整理します。</p>
          </div>

          {data.judge.bio && (
            <section className="scv-panel p-5">
              <h2 className="text-base font-semibold mb-3">紹介</h2>
              <p className="text-sm text-[var(--ink-2)] leading-relaxed">{data.judge.bio}</p>
            </section>
          )}

          {data.judge.education && (
            <section className="scv-panel p-5">
              <h2 className="text-base font-semibold mb-3">学歴</h2>
              <div className="text-sm text-[var(--ink-2)] leading-relaxed whitespace-pre-wrap">
                {data.judge.education}
              </div>
            </section>
          )}

          {data.judge.career && (
            <section className="scv-panel p-5">
              <h2 className="text-base font-semibold mb-3">経歴</h2>
              <div className="text-sm text-[var(--ink-2)] leading-relaxed whitespace-pre-wrap">
                {data.judge.career}
              </div>
            </section>
          )}

          {data.judge.profile && (
            <section className="scv-panel p-5">
              <h2 className="text-base font-semibold mb-3">プロフィール</h2>
              <p className="text-sm text-[var(--ink-2)] leading-relaxed">{data.judge.profile}</p>
            </section>
          )}

          {(() => {
            const sources = parseSources(data.judge.sources_json);
            if (sources.length === 0) return null;
            return (
              <section className="scv-panel p-5">
                <h2 className="text-base font-semibold mb-3">引用元</h2>
                <ul className="space-y-1">
                  {sources.map((source) => (
                    <li key={source.url} className="text-sm">
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="scv-link"
                      >
                        {source.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })()}

          {data.cases.length > 0 &&
            (() => {
              const stanceCounts = data.cases.reduce(
                (acc, c) => {
                  const stance = c.opinion_stance ?? "unknown";
                  acc[stance] = (acc[stance] ?? 0) + 1;
                  return acc;
                },
                {} as Record<string, number>,
              );
              const stanceOrder = ["agree", "dissent", "supplement", "other", "unknown"];
              const entries = stanceOrder
                .filter((s) => stanceCounts[s])
                .map((s) => ({ stance: s, count: stanceCounts[s] }));

              return (
                <section className="scv-panel p-5">
                  <h2 className="text-base font-semibold mb-3">スタンス傾向</h2>
                  <p className="text-xs text-[var(--ink-3)] mb-3">
                    関与した {data.cases.length} 件の判例における意見スタンスの内訳
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {entries.map(({ stance, count }) => (
                      <div key={stance} className="flex items-center gap-2">
                        <span className="scv-chip">{stanceLabels[stance] ?? stance}</span>
                        <span className="text-sm text-[var(--ink-2)] font-medium">{count} 件</span>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })()}

          <section className="scv-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">関与事件</h2>
              <span className="text-xs text-[var(--ink-3)]">全 {data.cases.length} 件</span>
            </div>
            {data.cases.length === 0 && (
              <p className="text-sm text-[var(--ink-3)]">関与事件がありません。</p>
            )}
            <div className="space-y-4">
              {data.cases.map((caseRow: (typeof data.cases)[number], index: number) => (
                <div
                  key={caseRow.case_id}
                  className="scv-panel p-4 text-sm text-[var(--ink-2)] scv-rise"
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <a className="scv-link" href={`/cases/${caseRow.case_id}`}>
                      {caseRow.case_title}
                    </a>
                    <span className="scv-chip shrink-0">
                      {stanceLabels[caseRow.opinion_stance ?? "unknown"] ?? "不明"}
                    </span>
                  </div>
                  {caseRow.opinion_summary && (
                    <p className="mt-2 text-xs text-[var(--ink-2)]">{caseRow.opinion_summary}</p>
                  )}
                  <div className="mt-2 text-xs text-[var(--ink-3)]">
                    {caseRow.decision_date} · {caseRow.court_name ?? "-"} ·{" "}
                    {caseRow.result ?? "結果未登録"}
                  </div>
                  {caseRow.supplementary_opinion && (
                    <div className="mt-2 text-[var(--ink-3)]">{caseRow.supplementary_opinion}</div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
