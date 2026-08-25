import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpError } from "@tsz/api-client/http";
import type { SurfaceMatchPageAny, SurfaceMatchPageV2 } from "@tsz/types";
import { describe, expect, it, vi } from "vitest";
import { useLifecycleSurfaceCommand } from "./useLifecycleSurfaceCommand";

describe("useLifecycleSurfaceCommand", () => {
  const page: SurfaceMatchPageV2 = {
    schema_version: 2,
    snapshot_id: "019c0000-0000-7000-8000-000000000001",
    items: [],
    total: 0,
    matched_entry_contexts: [],
    confirmation_reasons: ["visibility_activation"],
    policy_name: "allow_multiple_active_exact_headword_publications",
    policy_epoch: 2,
    continuation_policy: "enabled",
    next_cursor: null,
    surface_confirmation_token: "restore-command-token"
  };

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

  it("非 surface 的业务 409 也轮换 key 并要求刷新目标状态", async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(
        new HttpError(409, "revision conflict", [], "revision_conflict")
      )
      .mockResolvedValueOnce("restored");
    const { result } = renderHook(() => useLifecycleSurfaceCommand("word-1"));

    let first: Awaited<ReturnType<typeof result.current.run<string>>>;
    await act(async () => {
      first = await result.current.run(execute);
    });
    expect(first!).toMatchObject({
      ok: false,
      confirmationRequired: false,
      refreshRequired: true
    });
    await act(async () => {
      await result.current.run(execute);
    });
    expect(execute.mock.calls[0]![0]).not.toBe(execute.mock.calls[1]![0]);
  });

  it("带新 snapshot 的业务 409 保留确认页且不要求刷新目标", async () => {
    const execute = vi
      .fn()
      .mockRejectedValue(
        new HttpError(
          409,
          "confirmation required",
          [],
          "surface_match_acknowledgement_required",
          [],
          { surface_match_page: page }
        )
      );
    const { result } = renderHook(() => useLifecycleSurfaceCommand("word-1"));

    let outcome: Awaited<ReturnType<typeof result.current.run<string>>>;
    await act(async () => {
      outcome = await result.current.run(execute);
    });
    expect(outcome!).toMatchObject({
      ok: false,
      confirmationRequired: true,
      refreshRequired: false
    });
    expect(result.current.page).toBe(page);
  });

  it("V3 restore warning 顺序加载终页并携 token 重试原命令", async () => {
    const firstPage: SurfaceMatchPageAny = {
      schema_version: 3,
      snapshot_id: "v3-restore-snapshot",
      items: [],
      total: 0,
      matched_entry_contexts: [],
      confirmation_reasons: ["visibility_activation"],
      policy_name: "allow_multiple_active_exact_headword_publications",
      policy_epoch: 4,
      continuation_policy: "enabled",
      next_cursor: "v3-next"
    };
    const terminalPage: SurfaceMatchPageAny = {
      ...firstPage,
      continuation_policy: "enabled",
      next_cursor: null,
      surface_confirmation_token: "v3-restore-token"
    };
    const fetchPage = vi.fn().mockResolvedValue(terminalPage);
    const execute = vi
      .fn()
      .mockRejectedValueOnce(
        new HttpError(
          409,
          "confirmation required",
          [],
          "surface_match_acknowledgement_required",
          [],
          { surface_match_page: firstPage }
        )
      )
      .mockResolvedValueOnce("restored");
    const hook = renderHook(() =>
      useLifecycleSurfaceCommand("v3-word", fetchPage)
    );

    await act(async () => {
      await hook.result.current.run(execute);
    });
    await waitFor(() =>
      expect(hook.result.current.snapshot.phase).toBe("ready")
    );
    expect(hook.result.current.page?.schema_version).toBe(3);
    expect(fetchPage).toHaveBeenCalledWith(
      "v3-restore-snapshot",
      "v3-next",
      expect.any(AbortSignal)
    );

    await act(async () => {
      await hook.result.current.run(execute);
    });
    expect(execute.mock.calls[1]![1]).toBe("v3-restore-token");
    expect(hook.result.current.page).toBeUndefined();
  });

  it("非 409/410 的 HTTP 错误不轮换精确重试 key", async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new HttpError(503, "unavailable"))
      .mockResolvedValueOnce("restored");
    const { result } = renderHook(() => useLifecycleSurfaceCommand("word-1"));

    await expect(act(async () => result.current.run(execute))).rejects.toThrow(
      "unavailable"
    );
    await act(async () => {
      await result.current.run(execute);
    });
    expect(execute.mock.calls[0]![0]).toBe(execute.mock.calls[1]![0]);
  });
});
