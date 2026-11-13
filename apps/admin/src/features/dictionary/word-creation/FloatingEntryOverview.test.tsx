import { createRef } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FloatingEntryOverview } from "./FloatingEntryOverview";
import { createPortal } from "react-dom";

const key = "tsz:entry-overview-position";
function mount(portal = false) {
  const pageRef = createRef<HTMLDivElement>();
  const view = render(
    <div ref={pageRef}>
      <FloatingEntryOverview pageRef={pageRef}>
        <input aria-label="概览筛选" defaultValue="保留内容" />
      </FloatingEntryOverview>
      {portal ? (
        createPortal(
          <div className="v3-step-actions">
            <footer className="word-step-actions">保存草稿</footer>
          </div>,
          document.body
        )
      ) : (
        <footer className="word-step-actions">保存草稿</footer>
      )}
    </div>
  );
  const button = screen.getByRole("button", { name: "展开词条概览" });
  button.setPointerCapture = vi.fn();
  button.hasPointerCapture = vi.fn(() => true);
  button.releasePointerCapture = vi.fn();
  return { ...view, button };
}
function drag(
  button: HTMLElement,
  end: { clientX: number; clientY: number },
  cancel = false
) {
  fireEvent.pointerDown(button, {
    pointerId: 1,
    button: 0,
    clientX: 500,
    clientY: 500
  });
  fireEvent.pointerMove(button, { pointerId: 1, ...end });
  if (cancel) fireEvent.pointerCancel(button, { pointerId: 1 });
  else fireEvent.pointerUp(button, { pointerId: 1 });
}

describe("FloatingEntryOverview", () => {
  beforeEach(() => {
    localStorage.removeItem(key);
    vi.stubGlobal(
      "PointerEvent",
      class extends MouseEvent {
        pointerId: number;
        constructor(type: string, props: PointerEventInit) {
          super(type, props);
          this.pointerId = props.pointerId ?? 0;
        }
      }
    );
  });
  afterEach(() => {
    localStorage.removeItem(key);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("点击展开，Escape 收起并返回焦点，重新展开保留内容", () => {
    const { button } = mount();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(button);
    const input = screen.getByRole("textbox", { name: "概览筛选" });
    fireEvent.change(input, { target: { value: "已修改" } });
    input.focus();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(button).toHaveFocus();
    fireEvent.click(button);
    expect(screen.getByRole("textbox")).toHaveValue("已修改");
  });

  it("拖动不触发点击，限制屏幕边界，重新挂载恢复位置", () => {
    const { button, unmount } = mount();
    drag(button, { clientX: -2000, clientY: -2000 });
    fireEvent.click(button, { detail: 1 });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveStyle({ left: "16px", top: "16px" });
    unmount();
    const restored = mount().button;
    expect(restored).toHaveStyle({ left: "16px", top: "16px" });
    fireEvent.click(restored, { detail: 1 });
    expect(screen.getByRole("dialog")).toBeVisible();
  });

  it("展开后拖动面板跟随，取消拖动释放捕获，键盘仍可移动和展开", () => {
    const { button } = mount();
    fireEvent.click(button);
    const panel = screen.getByRole("dialog");
    const originalLeft = panel.style.left;
    drag(button, { clientX: 300, clientY: 300 }, true);
    expect(panel.style.left).not.toBe(originalLeft);
    expect(panel).toBeVisible();
    expect(button.releasePointerCapture).toHaveBeenCalledWith(1);
    const left = parseFloat(button.style.left);
    fireEvent.keyDown(button, { key: "ArrowLeft", shiftKey: true });
    expect(parseFloat(button.style.left)).toBe(left - 24);
    fireEvent.click(button, { detail: 0 });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each([false, true])("避开底部保存栏（portal: %s）", (portal) => {
    const { button } = mount(portal);
    const footer = screen.getByText("保存草稿");
    vi.spyOn(footer, "getBoundingClientRect").mockReturnValue({
      top: 500,
      bottom: 568,
      height: 68
    } as DOMRect);
    vi.stubGlobal("innerWidth", 390);
    vi.stubGlobal("innerHeight", 568);
    act(() => window.dispatchEvent(new Event("resize")));
    expect(button).toHaveStyle({ left: "320px", top: "430px" });
    fireEvent.click(button);
    const panel = screen.getByRole("dialog");
    expect(parseFloat(panel.style.left)).toBeGreaterThanOrEqual(16);
    expect(parseFloat(panel.style.width)).toBeLessThanOrEqual(358);
    expect(within(panel).getByRole("textbox")).toBeVisible();
  });

  it("损坏的位置记录或不可写存储不阻止使用，小幅移动仍算点击", () => {
    localStorage.setItem(key, '{"x":null,"y":-5000}');
    const { button } = mount();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("unavailable");
    });
    drag(button, { clientX: 502, clientY: 501 });
    fireEvent.click(button, { detail: 1 });
    expect(screen.getByRole("dialog")).toBeVisible();
    fireEvent.keyDown(button, { key: "ArrowUp" });
    expect(screen.getByRole("dialog")).toBeVisible();
  });
});
