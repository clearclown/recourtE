import { describe, expect, it } from "vitest";
import {
  buildIncidentId,
  normalizeStance,
  parseGlossary,
  parseSources,
  parseStringArray,
} from "./case-helpers";

describe("normalizeStance", () => {
  it("有効なスタンス値をそのまま返す", () => {
    expect(normalizeStance("agree")).toBe("agree");
    expect(normalizeStance("dissent")).toBe("dissent");
    expect(normalizeStance("supplement")).toBe("supplement");
    expect(normalizeStance("other")).toBe("other");
  });

  it("無効な値は unknown を返す", () => {
    expect(normalizeStance("invalid")).toBe("unknown");
    expect(normalizeStance("")).toBe("unknown");
  });

  it("null/undefined は unknown を返す", () => {
    expect(normalizeStance(null)).toBe("unknown");
    expect(normalizeStance(undefined)).toBe("unknown");
  });
});

describe("parseStringArray", () => {
  it("有効なJSON配列をパースする", () => {
    expect(parseStringArray('["a","b","c"]')).toEqual(["a", "b", "c"]);
  });

  it("空の配列をパースする", () => {
    expect(parseStringArray("[]")).toEqual([]);
  });

  it("文字列以外の要素をフィルタする", () => {
    expect(parseStringArray('[1,"a",null,"b",true]')).toEqual(["a", "b"]);
  });

  it("無効なJSONは空配列を返す", () => {
    expect(parseStringArray("not json")).toEqual([]);
  });

  it("配列でないJSONは空配列を返す", () => {
    expect(parseStringArray('{"key":"value"}')).toEqual([]);
  });

  it("null/undefined は空配列を返す", () => {
    expect(parseStringArray(null)).toEqual([]);
    expect(parseStringArray(undefined)).toEqual([]);
  });

  it("空文字列は空配列を返す", () => {
    expect(parseStringArray("")).toEqual([]);
  });
});

describe("parseGlossary", () => {
  it("有効な用語解説配列をパースする", () => {
    const input = '[{"term":"上告","explanation":"上級裁判所に訴える手続き"}]';
    const result = parseGlossary(input);
    expect(result).toEqual([{ term: "上告", explanation: "上級裁判所に訴える手続き" }]);
  });

  it("複数の用語をパースする", () => {
    const input =
      '[{"term":"A","explanation":"説明A"},{"term":"B","explanation":"説明B"}]';
    const result = parseGlossary(input);
    expect(result).toHaveLength(2);
  });

  it("不完全なオブジェクトをフィルタする", () => {
    const input = '[{"term":"A"},{"term":"B","explanation":"説明B"},{"explanation":"説明C"}]';
    const result = parseGlossary(input);
    expect(result).toEqual([{ term: "B", explanation: "説明B" }]);
  });

  it("null/undefined は空配列を返す", () => {
    expect(parseGlossary(null)).toEqual([]);
    expect(parseGlossary(undefined)).toEqual([]);
  });

  it("無効なJSONは空配列を返す", () => {
    expect(parseGlossary("not json")).toEqual([]);
  });

  it("配列でないJSONは空配列を返す", () => {
    expect(parseGlossary('{"term":"A","explanation":"B"}')).toEqual([]);
  });

  it("空配列を返す", () => {
    expect(parseGlossary("[]")).toEqual([]);
  });
});

describe("buildIncidentId", () => {
  it("全パラメータがある場合に事件番号を構築する", () => {
    const result = buildIncidentId({
      era: "令和",
      year: "5",
      code: "行ヒ",
      number: "339",
    });
    expect(result).toBe("令和5年(行ヒ)339");
  });

  it("パラメータが不足している場合は undefined を返す", () => {
    expect(buildIncidentId({ era: "令和" })).toBeUndefined();
    expect(buildIncidentId({ era: "令和", year: "5" })).toBeUndefined();
    expect(buildIncidentId({ era: "令和", year: "5", code: "行ヒ" })).toBeUndefined();
    expect(buildIncidentId({})).toBeUndefined();
  });

  it("空文字列のパラメータは undefined を返す", () => {
    expect(buildIncidentId({ era: "", year: "5", code: "行ヒ", number: "339" })).toBeUndefined();
  });
});

describe("parseSources", () => {
  it("有効な引用元配列をパースする", () => {
    const input = '[{"label":"最高裁判所HP","url":"https://www.courts.go.jp/"}]';
    const result = parseSources(input);
    expect(result).toEqual([{ label: "最高裁判所HP", url: "https://www.courts.go.jp/" }]);
  });

  it("複数の引用元をパースする", () => {
    const input =
      '[{"label":"出典A","url":"https://a.example.com"},{"label":"出典B","url":"https://b.example.com"}]';
    const result = parseSources(input);
    expect(result).toHaveLength(2);
    expect(result[0].label).toBe("出典A");
    expect(result[1].label).toBe("出典B");
  });

  it("不完全なオブジェクトをフィルタする", () => {
    const input =
      '[{"label":"A"},{"label":"B","url":"https://b.example.com"},{"url":"https://c.example.com"}]';
    const result = parseSources(input);
    expect(result).toEqual([{ label: "B", url: "https://b.example.com" }]);
  });

  it("null/undefined は空配列を返す", () => {
    expect(parseSources(null)).toEqual([]);
    expect(parseSources(undefined)).toEqual([]);
  });

  it("無効なJSONは空配列を返す", () => {
    expect(parseSources("not json")).toEqual([]);
  });

  it("配列でないJSONは空配列を返す", () => {
    expect(parseSources('{"label":"A","url":"https://a.example.com"}')).toEqual([]);
  });

  it("空配列を返す", () => {
    expect(parseSources("[]")).toEqual([]);
  });

  it("空文字列は空配列を返す", () => {
    expect(parseSources("")).toEqual([]);
  });
});
