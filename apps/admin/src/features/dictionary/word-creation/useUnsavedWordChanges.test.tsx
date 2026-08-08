import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUnsavedWordChanges } from "./useUnsavedWordChanges";

const router = vi.hoisted(() => ({ useBlocker: vi.fn() }));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useBlocker: router.useBlocker
}));

type BlockPredicate = (args: {
  currentLocation: { pathname: string };
  nextLocation: { pathname: string };
}) => boolean;

const unblocked = {
  state: "unblocked",
  proceed: vi.fn(),
  reset: vi.fn()
};

function predicate(): BlockPredicate {
  return router.useBlocker.mock.calls.at(-1)?.[0] as BlockPredicate;
}

beforeEach(() => {
  vi.clearAllMocks();
  router.useBlocker.mockReturnValue(unblocked);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useUnsavedWordChanges", () => {
  it("dirty=false 或 pathname 未变化时不拦截，且不注册 beforeunload", () => {
    const add = vi.spyOn(window, "addEventListener");
    renderHook(() => useUnsavedWordChanges(false));

    expect(
      predicate()({
        currentLocation: { pathname: "/words/w-1/wizard/forms" },
        nextLocation: { pathname: "/words/w-1/wizard/meanings" }
      })
    ).toBe(false);
    expect(add).not.toHaveBeenCalledWith("beforeunload", expect.any(Function));

    renderHook(() => useUnsavedWordChanges(true));
    expect(
      predicate()({
        currentLocation: { pathname: "/words/w-1/wizard/forms" },
        nextLocation: { pathname: "/words/w-1/wizard/forms" }
      })
    ).toBe(false);
  });

  it("dirty=true 拦截跨 pathname 导航并保护刷新，卸载时移除监听", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const hook = renderHook(() => useUnsavedWordChanges(true));

    expect(
      predicate()({
        currentLocation: { pathname: "/words/w-1/wizard/forms" },
        nextLocation: { pathname: "/words/w-1/wizard/meanings" }
      })
    ).toBe(true);
    expect(add).toHaveBeenCalledWith("beforeunload", expect.any(Function));

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);

    hook.unmount();
    expect(remove).toHaveBeenCalledWith("beforeunload", expect.any(Function));
  });

  it.each([
    [true, "proceed"],
    [false, "reset"]
  ] as const)("blocked 时 confirm=%s 调用 %s", (confirmed, expectedAction) => {
    const blocker = {
      state: "blocked",
      proceed: vi.fn(),
      reset: vi.fn()
    };
    router.useBlocker.mockReturnValue(blocker);
    vi.spyOn(window, "confirm").mockReturnValue(confirmed);

    renderHook(() => useUnsavedWordChanges(true));

    expect(window.confirm).toHaveBeenCalledWith(
      "当前步骤有尚未保存的修改，确定离开吗？"
    );
    expect(blocker[expectedAction]).toHaveBeenCalledTimes(1);
    expect(
      blocker[expectedAction === "proceed" ? "reset" : "proceed"]
    ).not.toHaveBeenCalled();
  });

  it("保存成功后的放行只持续到下一个 macrotask", () => {
    vi.useFakeTimers();
    const hook = renderHook(() => useUnsavedWordChanges(true));
    const transition = {
      currentLocation: { pathname: "/words/w-1/wizard/forms" },
      nextLocation: { pathname: "/words/w-1/wizard/meanings" }
    };

    expect(predicate()(transition)).toBe(true);
    act(() => hook.result.current());
    expect(predicate()(transition)).toBe(false);

    act(() => vi.runOnlyPendingTimers());
    expect(predicate()(transition)).toBe(true);
  });
});
