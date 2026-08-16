import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpError } from "@tsz/api-client/http";
import type { SurfaceMatchPageV2 } from "@tsz/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminWordsDataSource } from "./dataSource";
import { useSurfaceSnapshot } from "./useSurfaceSnapshot";

vi.mock("./dataSource", () => ({
  adminWordsDataSource: { surfaceMatchSnapshotPage: vi.fn() }
}));

function page(
  next_cursor: string | null,
  token = "surface-token",
  impactToken?: string
): SurfaceMatchPageV2 {
  const base = {
    snapshot_id: "snapshot-1",
    items: [],
    total: 0,
    matched_entry_contexts: [],
    confirmation_reasons: ["unacknowledged_surface_matches" as const],
    policy_name: "allow_new_exact_headword_entries" as const,
    policy_epoch: 1
  };
  return next_cursor === null
    ? {
        ...base,
        continuation_policy: "enabled",
        next_cursor: null,
        surface_confirmation_token: token,
        ...(impactToken ? { impact_confirmation_token: impactToken } : {})
      }
    : { ...base, continuation_policy: "enabled", next_cursor };
}

describe("useSurfaceSnapshot", () => {
  beforeEach(() => vi.clearAllMocks());

  it("没有首页时保持 idle，收到首页后使用默认 data source 顺序加载到终页", async () => {
    vi.mocked(adminWordsDataSource.surfaceMatchSnapshotPage).mockResolvedValue(
      page(null, "surface-token", "impact-token")
    );
    const hook = renderHook(
      ({ initialPage }) => useSurfaceSnapshot(initialPage, "same-key"),
      {
        initialProps: {
          initialPage: undefined as SurfaceMatchPageV2 | undefined
        }
      }
    );
    expect(hook.result.current.phase).toBe("idle");

    hook.rerender({ initialPage: page("cursor-2") });
    await waitFor(() => expect(hook.result.current.phase).toBe("ready"));
    expect(adminWordsDataSource.surfaceMatchSnapshotPage).toHaveBeenCalledWith(
      "snapshot-1",
      "cursor-2",
      expect.any(AbortSignal)
    );
    expect(hook.result.current.surface_confirmation_token).toBe(
      "surface-token"
    );
    expect(hook.result.current.impact_confirmation_token).toBe("impact-token");
  });

  it.each([
    [
      "HttpError",
      new HttpError(410, "expired", [], "surface_match_snapshot_expired"),
      "expired"
    ],
    [
      "plain problem",
      { status: 410, code: "surface_match_snapshot_expired" },
      "expired"
    ],
    [
      "policy changed HttpError",
      new HttpError(409, "changed", [], "surface_policy_changed"),
      "expired"
    ],
    [
      "plain policy changed problem",
      { status: 409, code: "surface_policy_changed" },
      "expired"
    ],
    ["other error", new Error("network"), "error"]
  ] as const)("将 %s 分页失败归类为 %s", async (_name, error, phase) => {
    const fetchPage = vi.fn().mockRejectedValue(error);
    const initialPage = page("cursor-2");
    const hook = renderHook(() =>
      useSurfaceSnapshot(initialPage, "key", fetchPage)
    );

    await waitFor(() => expect(hook.result.current.phase).toBe(phase));
    expect(hook.result.current.surface_confirmation_token).toBeUndefined();
    expect(hook.result.current.impact_confirmation_token).toBeUndefined();
  });

  it("retry 会重置 generation 并重新加载同一首页", async () => {
    const fetchPage = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce(page(null, "new-token"));
    const initialPage = page("cursor-2");
    const hook = renderHook(() =>
      useSurfaceSnapshot(initialPage, "key", fetchPage)
    );
    await waitFor(() => expect(hook.result.current.phase).toBe("error"));

    act(() => hook.result.current.retry());
    await waitFor(() => expect(hook.result.current.phase).toBe("ready"));
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(hook.result.current.surface_confirmation_token).toBe("new-token");
  });

  it("卸载时取消在途分页，并丢弃取消后的失败响应", async () => {
    let rejectRequest!: (reason: unknown) => void;
    const fetchPage = vi.fn(
      (_snapshotId: string, _cursor: string, signal: AbortSignal) =>
        new Promise<SurfaceMatchPageV2>((_resolve, reject) => {
          rejectRequest = reject;
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        })
    );
    const initialPage = page("cursor-2");
    const hook = renderHook(() =>
      useSurfaceSnapshot(initialPage, "key", fetchPage)
    );
    await waitFor(() => expect(fetchPage).toHaveBeenCalledOnce());
    const signal = fetchPage.mock.calls[0]![2];

    hook.unmount();
    expect(signal.aborted).toBe(true);
    rejectRequest(new Error("late failure"));
    await Promise.resolve();
  });
});
