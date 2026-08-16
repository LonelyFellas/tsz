import { act, renderHook } from "@testing-library/react";
import { HttpError } from "@tsz/api-client/http";
import { describe, expect, it, vi } from "vitest";
import { useLifecycleSurfaceCommand } from "./useLifecycleSurfaceCommand";

describe("useLifecycleSurfaceCommand", () => {
  it("业务 409 轮换 Idempotency-Key，目标状态重查可发起新命令", async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(
        new HttpError(409, "matches changed", [], "surface_matches_changed")
      )
      .mockResolvedValueOnce("restored");
    const { result } = renderHook(() => useLifecycleSurfaceCommand("word-1"));

    let first: Awaited<ReturnType<typeof result.current.run<string>>>;
    await act(async () => {
      first = await result.current.run(execute);
    });
    expect(first!.ok).toBe(false);
    await act(async () => {
      await result.current.run(execute);
    });
    expect(execute.mock.calls[0]![0]).not.toBe(execute.mock.calls[1]![0]);
  });

  it("响应未知的传输错误保留 Idempotency-Key 供精确重试", async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network failed"))
      .mockResolvedValueOnce("restored");
    const { result } = renderHook(() => useLifecycleSurfaceCommand("word-1"));

    await expect(act(async () => result.current.run(execute))).rejects.toThrow(
      "network failed"
    );
    await act(async () => {
      await result.current.run(execute);
    });
    expect(execute.mock.calls[0]![0]).toBe(execute.mock.calls[1]![0]);
  });
});
