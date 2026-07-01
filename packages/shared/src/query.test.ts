import { describe, expect, it } from "vitest";
import { browserQueryDefaults } from "./query";

describe("browserQueryDefaults", () => {
  it("提供浏览器端 React Query 默认项：staleTime 60s", () => {
    expect(browserQueryDefaults.queries.staleTime).toBe(60 * 1000);
  });
});
