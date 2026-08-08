import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useWordValidationIssue,
  useWordValidationIssueFocus
} from "./useWordValidationIssueFocus";

function wrapper(state: unknown) {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[{ pathname: "/words/w-1", state }]}>
      {children}
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = "";
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("word validation issue location hooks", () => {
  it("仅接受 nodeId/field 均为非空字符串的 location state", () => {
    const valid = renderHook(() => useWordValidationIssue(), {
      wrapper: wrapper({ nodeId: "sense-1", field: "definitions" })
    });
    expect(valid.result.current).toEqual({
      nodeId: "sense-1",
      field: "definitions"
    });
    valid.unmount();

    for (const state of [
      undefined,
      null,
      "sense-1",
      {},
      { nodeId: "", field: "definitions" },
      { nodeId: "sense-1", field: "" },
      { nodeId: 1, field: "definitions" }
    ]) {
      const invalid = renderHook(() => useWordValidationIssue(), {
        wrapper: wrapper(state)
      });
      expect(invalid.result.current).toBeUndefined();
      invalid.unmount();
    }
  });

  it("优先定位 node+field，滚动、聚焦并在 1800ms 后清除高亮", () => {
    const scroll = vi.fn();
    const wrongField = document.createElement("button");
    wrongField.dataset.wordNodeId = "sense-1";
    wrongField.dataset.wordField = "level";
    const target = document.createElement("section");
    target.dataset.wordNodeId = "sense-1";
    target.dataset.wordField = "definitions";
    target.scrollIntoView = scroll;
    const input = document.createElement("input");
    target.append(input);
    document.body.append(wrongField, target);

    renderHook(() => useWordValidationIssueFocus("noun"), {
      wrapper: wrapper({ nodeId: "sense-1", field: "definitions" })
    });
    act(() => vi.advanceTimersByTime(0));

    expect(scroll).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center"
    });
    expect(target).toHaveClass("word-validation-focus");
    expect(input).toHaveFocus();
    expect(wrongField).not.toHaveClass("word-validation-focus");

    act(() => vi.advanceTimersByTime(1800));
    expect(target).not.toHaveClass("word-validation-focus");
  });

  it("field 不匹配时回退同 node 的首个可聚焦元素", () => {
    const target = document.createElement("button");
    target.dataset.wordNodeId = "sense-2";
    target.dataset.wordField = "level";
    document.body.append(target);

    renderHook(() => useWordValidationIssueFocus("noun"), {
      wrapper: wrapper({ nodeId: "sense-2", field: "unknown" })
    });
    act(() => vi.advanceTimersByTime(0));

    expect(target).toHaveClass("word-validation-focus");
    expect(target).toHaveFocus();
  });

  it("目标稍后渲染时每 40ms 重试；卸载后取消后续定位", () => {
    const first = renderHook(() => useWordValidationIssueFocus("noun"), {
      wrapper: wrapper({ nodeId: "late-node", field: "content" })
    });
    act(() => vi.advanceTimersByTime(80));

    const late = document.createElement("input");
    late.dataset.wordNodeId = "late-node";
    late.dataset.wordField = "content";
    document.body.append(late);
    act(() => vi.advanceTimersByTime(40));
    expect(late).toHaveFocus();
    first.unmount();

    const cancelled = document.createElement("input");
    cancelled.dataset.wordNodeId = "cancelled-node";
    document.body.append(cancelled);
    const second = renderHook(() => useWordValidationIssueFocus("verb"), {
      wrapper: wrapper({ nodeId: "cancelled-node", field: "content" })
    });
    // 即使底层计时器在 cleanup 后仍意外回调，cancelled 哨兵也必须阻止定位。
    vi.spyOn(window, "clearTimeout").mockImplementation(() => undefined);
    second.unmount();
    act(() => vi.runOnlyPendingTimers());
    expect(cancelled).not.toHaveFocus();
  });

  it("目标始终不存在时最多尝试 6 次并安全结束", () => {
    const query = vi.spyOn(document, "querySelectorAll");

    renderHook(() => useWordValidationIssueFocus("noun"), {
      wrapper: wrapper({ nodeId: "never-rendered", field: "content" })
    });
    act(() => vi.advanceTimersByTime(200));

    expect(query).toHaveBeenCalledTimes(6);
    expect(vi.getTimerCount()).toBe(0);
    expect(document.activeElement).toBe(document.body);
  });

  it("无效 state 不安排定位，也不触碰已有节点", () => {
    const target = document.createElement("input");
    target.dataset.wordNodeId = "sense-1";
    document.body.append(target);

    renderHook(() => useWordValidationIssueFocus("noun"), {
      wrapper: wrapper({ nodeId: "", field: "definitions" })
    });
    act(() => vi.runOnlyPendingTimers());

    expect(target).not.toHaveClass("word-validation-focus");
    expect(target).not.toHaveFocus();
  });
});
