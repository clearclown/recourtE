// 裁判官スタンスの型定義
export type OpinionStance = "agree" | "dissent" | "supplement" | "other" | "unknown";

// スタンス値を正規化する
export const normalizeStance = (value: string | null | undefined): OpinionStance => {
  if (value === "agree" || value === "dissent" || value === "supplement" || value === "other") {
    return value;
  }
  return "unknown";
};

// JSON文字列を文字列配列にパースする
export const parseStringArray = (value: string | null | undefined): string[] => {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item) => typeof item === "string");
  } catch {
    return [];
  }
};

// 用語解説のJSONをパースする
export const parseGlossary = (
  value: string | null | undefined,
): { term: string; explanation: string }[] => {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof item.term === "string" &&
        typeof item.explanation === "string",
    );
  } catch {
    return [];
  }
};

// 事件番号を構築する
export const buildIncidentId = (search: {
  era?: string;
  year?: string;
  code?: string;
  number?: string;
}) => {
  if (!search.era || !search.year || !search.code || !search.number) {
    return undefined;
  }
  return `${search.era}${search.year}年(${search.code})${search.number}`;
};

// 意見比較JSONをパースする
export interface OpinionComparisonData {
  majority_view: string;
  dissenting_views: { judge_name: string; summary: string }[];
  key_disagreements: string[];
}

export const parseOpinionComparison = (
  value: string | null | undefined,
): OpinionComparisonData | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      majority_view: parsed.majority_view ?? "",
      dissenting_views: Array.isArray(parsed.dissenting_views) ? parsed.dissenting_views : [],
      key_disagreements: Array.isArray(parsed.key_disagreements) ? parsed.key_disagreements : [],
    };
  } catch {
    return null;
  }
};

// 引用元URLのJSONをパースする
export const parseSources = (
  value: string | null | undefined,
): { label: string; url: string }[] => {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof item.label === "string" &&
        typeof item.url === "string",
    );
  } catch {
    return [];
  }
};
