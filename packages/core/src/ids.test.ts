import { describe, expect, it } from "vitest";
import { createUuidV7 } from "./ids.js";

describe("createUuidV7", () => {
  it("UUID v7 形式の文字列を返す", () => {
    const uuid = createUuidV7();
    // UUID形式: 8-4-4-4-12
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("毎回異なる値を返す", () => {
    const uuid1 = createUuidV7();
    const uuid2 = createUuidV7();
    expect(uuid1).not.toBe(uuid2);
  });

  it("時系列的にソート可能である", () => {
    const uuid1 = createUuidV7();
    const uuid2 = createUuidV7();
    // UUID v7は時系列順序を保持する
    expect(uuid1 < uuid2 || uuid1 === uuid2).toBe(true);
  });
});
