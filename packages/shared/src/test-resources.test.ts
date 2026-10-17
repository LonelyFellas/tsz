import { afterEach, expect, it, vi } from "vitest";
import { readTestResourceRun } from "./test-resources";

afterEach(() => vi.unstubAllGlobals());

it("未开启测试时不因浏览器禁用 sessionStorage 影响普通请求", () => {
  vi.stubGlobal("window", {
    location: { search: "" },
    sessionStorage: {
      getItem: () => {
        throw new Error("storage blocked");
      }
    }
  });
  expect(readTestResourceRun()).toBeUndefined();
});

it("只在显式参数开启后保留当前标签页的批次，off 清除", () => {
  const values = new Map<string, string>();
  const location = { search: "" };
  vi.stubGlobal("window", {
    location,
    sessionStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key)
    }
  });
  expect(readTestResourceRun()).toBeUndefined();
  location.search = "?tsz_test_run=fixture-20261017";
  expect(readTestResourceRun()).toBe("fixture-20261017");
  location.search = "";
  expect(readTestResourceRun()).toBe("fixture-20261017");
  location.search = "?tsz_test_run=off";
  expect(readTestResourceRun()).toBeUndefined();
  location.search = "";
  expect(readTestResourceRun()).toBeUndefined();
});

it("显式批次无法保存时中止，不回退普通资源请求", () => {
  vi.stubGlobal("window", {
    location: { search: "?tsz_test_run=fixture-20261017" },
    sessionStorage: {
      setItem: () => {
        throw new Error("storage blocked");
      }
    }
  });
  expect(readTestResourceRun).toThrow("storage blocked");
});
