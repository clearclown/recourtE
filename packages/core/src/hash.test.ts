import { describe, expect, it } from "vitest";
import { hashBuffer } from "./hash.js";

describe("hashBuffer", () => {
  it("Uint8Array のハッシュを計算する", () => {
    const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const result = hashBuffer(data);
    expect(result).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("同じ入力は同じハッシュを返す", () => {
    const data1 = new Uint8Array([1, 2, 3]);
    const data2 = new Uint8Array([1, 2, 3]);
    expect(hashBuffer(data1)).toBe(hashBuffer(data2));
  });

  it("異なる入力は異なるハッシュを返す", () => {
    const data1 = new Uint8Array([1, 2, 3]);
    const data2 = new Uint8Array([4, 5, 6]);
    expect(hashBuffer(data1)).not.toBe(hashBuffer(data2));
  });

  it("Buffer のハッシュを計算する", () => {
    const data = Buffer.from("Hello");
    const result = hashBuffer(data);
    expect(result).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("空のバッファでもハッシュを返す", () => {
    const data = new Uint8Array([]);
    const result = hashBuffer(data);
    expect(result).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
