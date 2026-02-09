import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { buildIncidentId } from "../../lib/case-helpers";
import { listCases, listIncidentCategories } from "../../server/cases.functions";

const caseTypeLabels: Record<string, string> = {
  civil: "民事",
  criminal: "刑事",
  unknown: "不明",
};

const searchSchema = z.object({
  era: z.string().optional(),
  year: z.string().optional(),
  code: z.string().optional(),
  number: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  sort: z.enum(["desc", "asc"]).optional().default("desc"),
});

export const Route = createFileRoute("/cases/")({
  validateSearch: (search) => searchSchema.parse(search),
  loader: (ctx) => {
    const search = searchSchema.parse((ctx as { search?: unknown }).search ?? {});
    return Promise.all([
      listCases({
        data: {
          incidentId: buildIncidentId(search),
          from: search.from,
          to: search.to,
          sort: search.sort,
        },
      }),
      listIncidentCategories(),
    ]).then(([cases, categories]) => ({ cases, categories }));
  },
  component: CasesIndex,
});

function CasesIndex() {
  type CaseListItem = Awaited<ReturnType<typeof listCases>>[number];
  // categories は事件番号検索で使用（現在無効）
  const { cases } = Route.useLoaderData() as {
    cases: CaseListItem[];
  };
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  // 事件番号検索は引き続き無効
  // const [era, setEra] = useState<string | undefined>(search.era);
  // const [year, setYear] = useState(search.year ?? "");
  // const [code, setCode] = useState<string | undefined>(search.code);
  // const [number, setNumber] = useState(search.number ?? "");
  const [from, setFrom] = useState(search.from ?? "");
  const [to, setTo] = useState(search.to ?? "");
  const [sort, setSort] = useState<"desc" | "asc">(search.sort ?? "desc");

  return (
    <div className="min-h-screen text-[var(--ink-1)] scv-page">
      <div className="scv-container py-12">
        <div className="space-y-10">
          <section className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] items-start">
            <div className="space-y-4">
              <p className="scv-kicker">recourtE</p>
              <h1 className="scv-title">判例一覧</h1>
              <p className="scv-lead">判決日で最高裁判例を絞り込み、並び順を変更できます。</p>
              <div className="flex flex-wrap gap-2">
                <span className="scv-chip">判決日で絞り込み</span>
                <span className="scv-chip">新旧順を切替</span>
              </div>
            </div>
            <div className="scv-panel p-5">
              <div className="grid gap-3 text-xs text-[var(--ink-3)]">
                <div className="flex items-center justify-between border-b border-[var(--border-1)] pb-2">
                  <span>検索対象</span>
                  <span className="text-[var(--ink-2)]">最高裁判例</span>
                </div>
                <div className="flex items-center justify-between border-b border-[var(--border-1)] pb-2">
                  <span>更新頻度</span>
                  <span className="text-[var(--ink-2)]">随時</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>並び替え</span>
                  <span className="text-[var(--ink-2)]">判決日</span>
                </div>
              </div>
            </div>
          </section>

          <form
            className="scv-card grid gap-4 p-6 md:grid-cols-12"
            onSubmit={(event) => {
              event.preventDefault();
              const next = searchSchema.parse({
                from: from || undefined,
                to: to || undefined,
                sort,
              });
              navigate({ search: () => next });
            }}
          >
            <div className="md:col-span-12 grid gap-3">
              <p className="text-sm font-semibold text-[var(--ink-2)]">判決日で絞り込む</p>
              <div className="grid gap-4 md:grid-cols-12">
                <div className="md:col-span-3">
                  <label className="text-xs text-[var(--ink-3)]" htmlFor="decision-from">
                    判決日（開始）
                  </label>
                  <Input
                    id="decision-from"
                    name="from"
                    type="date"
                    value={from}
                    className="scv-input h-10 mt-1"
                    onChange={(event) => setFrom(event.target.value)}
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="text-xs text-[var(--ink-3)]" htmlFor="decision-to">
                    判決日（終了）
                  </label>
                  <Input
                    id="decision-to"
                    name="to"
                    type="date"
                    value={to}
                    className="scv-input h-10 mt-1"
                    onChange={(event) => setTo(event.target.value)}
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="text-xs text-[var(--ink-3)]" htmlFor="decision-sort">
                    並び順
                  </label>
                  <Select
                    value={sort}
                    onValueChange={(value) => setSort(value === "asc" ? "asc" : "desc")}
                  >
                    <SelectTrigger id="decision-sort" className="scv-select h-10 w-full mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent
                      className="bg-[var(--paper-1)] text-[var(--ink-1)] border-[var(--border-1)]"
                      side="bottom"
                      position="popper"
                    >
                      <SelectItem value="desc">判決日 (新しい順)</SelectItem>
                      <SelectItem value="asc">判決日 (古い順)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-3 flex items-end">
                  <Button type="submit" className="scv-button h-10 w-full">
                    絞り込み
                  </Button>
                </div>
              </div>
            </div>
          </form>

          <section className="space-y-4">
            {cases.length === 0 ? (
              <div className="scv-panel p-6 text-center text-[var(--ink-3)]">
                該当する判例がありません。
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">検索結果</h2>
                  <p className="text-xs text-[var(--ink-3)]">全 {cases.length} 件</p>
                </div>

                <div className="md:hidden space-y-4">
                  {cases.map((caseItem: CaseListItem, index: number) => (
                    <div
                      key={caseItem.case_id}
                      className="scv-card p-4 scv-rise"
                      style={{ animationDelay: `${index * 45}ms` }}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <a className="scv-link" href={`/cases/${caseItem.case_id}`}>
                            {caseItem.case_title_short ?? caseItem.case_title}
                          </a>
                          {caseItem.case_title_short && (
                            <p className="mt-1 text-xs text-[var(--ink-3)]">
                              {caseItem.case_title}
                            </p>
                          )}
                        </div>
                        <span className="scv-chip">{caseItem.decision_date}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--ink-3)]">
                        <span className="scv-chip">
                          {caseTypeLabels[caseItem.case_type_guess] ?? "不明"}
                        </span>
                        <span>{caseItem.court_name ?? "-"}</span>
                        <span>{caseItem.court_incident_id}</span>
                        <span>{caseItem.result ?? "-"}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden md:block overflow-hidden scv-card">
                  <table className="scv-table w-full text-left text-sm">
                    <thead className="bg-[var(--paper-2)] text-[var(--ink-2)]">
                      <tr>
                        <th className="px-4 py-3">事件名</th>
                        <th className="px-4 py-3">種別</th>
                        <th className="px-4 py-3">判決日</th>
                        <th className="px-4 py-3">法廷</th>
                        <th className="px-4 py-3">事件番号</th>
                        <th className="px-4 py-3">結果</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-1)]">
                      {cases.map((caseItem: CaseListItem, index: number) => (
                        <tr
                          key={caseItem.case_id}
                          className="hover:bg-[var(--table-hover)] scv-rise"
                          style={{ animationDelay: `${index * 35}ms` }}
                        >
                          <td className="px-4 py-3">
                            <a className="scv-link" href={`/cases/${caseItem.case_id}`}>
                              {caseItem.case_title_short ?? caseItem.case_title}
                            </a>
                            {caseItem.case_title_short && (
                              <p className="mt-1 text-xs text-[var(--ink-3)]">
                                {caseItem.case_title}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 min-w-fit">
                            <span className="scv-chip">
                              {caseTypeLabels[caseItem.case_type_guess] ?? "不明"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[var(--ink-2)] min-w-fit">
                            {caseItem.decision_date}
                          </td>
                          <td className="px-4 py-3 text-[var(--ink-3)] min-w-fit">
                            {caseItem.court_name ?? "-"}
                          </td>
                          <td className="px-4 py-3 text-[var(--ink-3)] min-w-fit">
                            {caseItem.court_incident_id}
                          </td>
                          <td className="px-4 py-3 text-[var(--ink-2)] min-w-fit">
                            {caseItem.result ?? "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
