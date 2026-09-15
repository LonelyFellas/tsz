import { describe, expect, it } from "vitest";

// 临时探针，验证完删除：只在 CI 的第 1 个 run attempt 失败，用来确认
// gh run rerun --failed 之后 coverage-merge 合并的是新 attempt 的分片产物。
describe("CI rerun probe", () => {
  it("fails only on the first run attempt", () => {
    expect(process.env.GITHUB_RUN_ATTEMPT).not.toBe("1");
  });
});
