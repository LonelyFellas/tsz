import { beforeEach, describe, expect, it, vi } from "vitest";
import { addHistory, readHistory, writeHistory } from "./history";
beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
describe("本地查词历史", () => {
  it("归一化、大小写去重、最近前置并限制10条", () => {
    expect(addHistory(["apple", "pear"], "  APPLE  ")).toEqual([
      "APPLE",
      "pear"
    ]);
    const terms = Array.from({ length: 25 }, (_, i) => `word${i}`).reduce(
      addHistory,
      [] as string[]
    );
    expect(terms).toEqual(
      Array.from({ length: 10 }, (_, i) => `word${24 - i}`)
    );
  });
  it("读取旧历史时也只保留最近10条", () => {
    const terms = Array.from({ length: 20 }, (_, i) => `word${i}`);
    localStorage.setItem("tsz:dictionary:history:a", JSON.stringify(terms));
    expect(readHistory("a")).toEqual(terms.slice(0, 10));
  });
  it("按账号隔离并支持删除后的持久化", () => {
    writeHistory("a", ["apple", "pear"]);
    writeHistory("b", ["centre"]);
    expect(readHistory("a")).toEqual(["apple", "pear"]);
    writeHistory(
      "a",
      readHistory("a").filter((v) => v !== "apple")
    );
    expect(readHistory("a")).toEqual(["pear"]);
    expect(readHistory("b")).toEqual(["centre"]);
  });
  it("损坏数据和禁用存储不影响查词", () => {
    localStorage.setItem("tsz:dictionary:history:a", "{");
    expect(readHistory("a")).toEqual([]);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => writeHistory("a", ["apple"])).not.toThrow();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(readHistory("a")).toEqual([]);
  });
});
