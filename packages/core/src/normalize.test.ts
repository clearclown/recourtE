import { describe, expect, it } from "vitest";
import { normalizeJudgeName, normalizeKeySegment } from "./normalize.js";

describe("normalizeJudgeName", () => {
  it("通常の名前をそのまま返す", () => {
    expect(normalizeJudgeName("山田太郎")).toBe("山田太郎");
  });

  it("全角スペースを除去する", () => {
    expect(normalizeJudgeName("山田　太郎")).toBe("山田太郎");
  });

  it("半角スペースを除去する", () => {
    expect(normalizeJudgeName("山田 太郎")).toBe("山田太郎");
  });

  it("複数のスペースを除去する", () => {
    expect(normalizeJudgeName("山田  太郎　一郎")).toBe("山田太郎一郎");
  });

  it("NFKC正規化を適用する", () => {
    // 全角数字→半角数字
    expect(normalizeJudgeName("裁判官１")).toBe("裁判官1");
  });

  it("前後の空白をトリムする", () => {
    expect(normalizeJudgeName(" 山田太郎 ")).toBe("山田太郎");
  });
});

describe("normalizeKeySegment", () => {
  it("通常の文字列をそのまま返す", () => {
    expect(normalizeKeySegment("test")).toBe("test");
  });

  it("スラッシュをアンダースコアに変換する", () => {
    expect(normalizeKeySegment("path/to/file")).toBe("path_to_file");
  });

  it("バックスラッシュをアンダースコアに変換する", () => {
    expect(normalizeKeySegment("path\\to\\file")).toBe("path_to_file");
  });

  it("混合パスを変換する", () => {
    expect(normalizeKeySegment("path/to\\file")).toBe("path_to_file");
  });

  it("NFKC正規化を適用する", () => {
    expect(normalizeKeySegment("令和５年")).toBe("令和5年");
  });

  it("前後の空白をトリムする", () => {
    expect(normalizeKeySegment(" test ")).toBe("test");
  });

  it("日本語の事件番号を正規化する", () => {
    expect(normalizeKeySegment("令和7(許)18")).toBe("令和7(許)18");
  });
});
