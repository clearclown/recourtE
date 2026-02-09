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
