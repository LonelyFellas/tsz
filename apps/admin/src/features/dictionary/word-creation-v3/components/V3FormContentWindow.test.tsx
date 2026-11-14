import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { V3FormContentWindow } from "./V3FormContentWindow";

beforeEach(() => {
  vi.stubGlobal("innerWidth", 1440);
  vi.stubGlobal("innerHeight", 900);
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
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      return {
        width: this.classList.contains("is-collapsed") ? 420 : 1200,
        height: this.classList.contains("is-collapsed") ? 72 : 800
      } as DOMRect;
    }
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function drag(handle: HTMLElement, deltaY: number, cancel = false, deltaX = 0) {
  handle.setPointerCapture = vi.fn();
  handle.hasPointerCapture = vi.fn(() => true);
  handle.releasePointerCapture = vi.fn();
  fireEvent.pointerDown(handle, {
    pointerId: 1,
    button: 0,
    clientX: 300,
    clientY: 100
  });
  fireEvent.pointerMove(handle, {
    pointerId: 1,
    clientX: 300 + deltaX,
    clientY: 100 + deltaY
  });
  fireEvent[cancel ? "pointerCancel" : "pointerUp"](handle, { pointerId: 1 });
}

it("上下可移出视口，始终留出可拖回区域，往返保留草稿", () => {
  render(
    <V3FormContentWindow title="词形内容设置" footer="操作" onClose={vi.fn()}>
      <input aria-label="词形" defaultValue="center" />
    </V3FormContentWindow>
  );
  const panel = screen.getByRole("dialog");
  const header = screen.getAllByRole("button", {
    name: "拖动词形内容设置"
  })[0]!;
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "centre" }
  });
  drag(header, -2000);
  expect(parseFloat(panel.style.top) + 800).toBe(48);

  const footer = screen.getAllByRole("button", {
    name: "拖动词形内容设置"
  })[1]!;
  drag(footer, 900);
  expect(parseFloat(panel.style.top)).toBe(148);
  drag(footer, 2000);
  expect(parseFloat(panel.style.top)).toBe(852);
  drag(header, -500, true);
  expect(parseFloat(panel.style.top)).toBe(352);
  expect(header.releasePointerCapture).toHaveBeenCalledWith(1);
  fireEvent.pointerMove(header, { pointerId: 1, clientY: 2000 });
  expect(parseFloat(panel.style.top)).toBe(352);
  expect(screen.getByRole("textbox")).toHaveValue("centre");

  fireEvent.keyDown(footer, { key: "ArrowUp", shiftKey: true });
  expect(parseFloat(panel.style.top)).toBe(328);
  drag(header, -2000);
  fireEvent.click(screen.getByRole("button", { name: "收起" }));
  expect(parseFloat(panel.style.top) + 72).toBe(48);
  fireEvent.click(screen.getByRole("button", { name: "展开" }));
  expect(screen.getByRole("textbox")).toHaveValue("centre");

  drag(header, 2000);
  vi.stubGlobal("innerHeight", 600);
  fireEvent(window, new Event("resize"));
  expect(parseFloat(panel.style.top)).toBe(552);
});

it.each([
  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: 1, y: 1 }
])("左右及四角可拖回（方向 $x, $y）", ({ x, y }) => {
  render(
    <V3FormContentWindow title="词形内容设置" footer="操作" onClose={vi.fn()}>
      <input aria-label="词形" defaultValue="center" />
    </V3FormContentWindow>
  );
  const panel = screen.getByRole("dialog");
  const header = screen.getAllByRole("button", {
    name: "拖动词形内容设置"
  })[0]!;
  drag(header, y * 2000, false, x * 2000);
  expect(parseFloat(panel.style.left)).toBe(x < 0 ? -1152 : 1392);
  expect(parseFloat(panel.style.top)).toBe(y < 0 ? -752 : 852);
  const recovery = screen.getAllByRole("button", {
    name: "拖动词形内容设置"
  })[2]!;
  expect(recovery).toBeVisible();
  drag(recovery, -y * 800, false, -x * 1200);
  expect(parseFloat(panel.style.left)).toBe(x < 0 ? 48 : 192);
  expect(parseFloat(panel.style.top)).toBe(y < 0 ? 48 : 52);
  expect(recovery).not.toBeVisible();
  expect(screen.getByRole("textbox")).toHaveValue("center");

  drag(header, 0, false, x * 2000);
  fireEvent.click(screen.getByRole("button", { name: "收起" }));
  expect(parseFloat(panel.style.left)).toBe(x < 0 ? -372 : 1392);
  expect(recovery).toBeVisible();
  vi.stubGlobal("innerWidth", 1024);
  fireEvent(window, new Event("resize"));
  expect(parseFloat(panel.style.left)).toBe(x < 0 ? -372 : 976);
  fireEvent.click(screen.getByRole("button", { name: "展开" }));
  expect(screen.getByRole("textbox")).toHaveValue("center");
});
