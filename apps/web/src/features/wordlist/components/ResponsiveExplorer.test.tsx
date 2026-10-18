import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { ResponsiveExplorer } from "./ResponsiveExplorer";
let wide = false;
let hover = false;
const listeners = new Set<() => void>();
beforeEach(() => {
  HTMLElement.prototype.scrollTo = function (
    options: ScrollToOptions | number = 0,
    y: number = 0
  ) {
    this.scrollTop = typeof options === "number" ? y : (options.top ?? 0);
  };
  wide = false;
  hover = false;
  listeners.clear();
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      get matches() {
        return query.includes("min-width") ? wide : hover;
      },
      media: query,
      addEventListener: (_: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (_: string, cb: () => void) => listeners.delete(cb)
    }))
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function Contents({ choose }: { choose: () => void }) {
  const [value, setValue] = useState("");
  return (
    <>
      <input
        aria-label="保留的目录状态"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button onClick={choose}>选择词表</button>
    </>
  );
}
function view(overlayActive = false) {
  return (
    <>
      <button>背景编辑操作</button>
      <ResponsiveExplorer overlayActive={overlayActive}>
        {({ closeDrawer }) => (
          <div data-explorer-scroll data-testid="directory-scroll">
            <Contents choose={closeDrawer} />
          </div>
        )}
      </ResponsiveExplorer>
      <div data-explorer-popup>目录菜单</div>
    </>
  );
}
it("keeps the mounted tree state across drawer close and desktop resizing, restores background and focus", () => {
  render(view());
  const trigger = screen.getByRole("button", { name: "目录" });
  fireEvent.click(trigger);
  expect(screen.getByRole("dialog", { name: "目录抽屉" })).toHaveAttribute(
    "aria-modal",
    "true"
  );
  expect(document.body.style.overflow).toBe("hidden");
  expect(screen.getByRole("button", { name: "背景编辑操作" })).toHaveAttribute(
    "inert"
  );
  fireEvent.change(screen.getByLabelText("保留的目录状态"), {
    target: { value: "展开 雅思" }
  });
  fireEvent.click(screen.getByRole("button", { name: "选择词表" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.body.style.overflow).not.toBe("hidden");
  expect(trigger).toHaveFocus();
  act(() => {
    wide = true;
    listeners.forEach((cb) => cb());
  });
  expect(
    screen.getByRole("complementary", { name: "目录区域" })
  ).toBeInTheDocument();
  expect(screen.getByLabelText("保留的目录状态")).toHaveValue("展开 雅思");
});

it("keeps the desktop footer in the available viewport as the page moves and resizes", () => {
  wide = true;
  vi.stubGlobal("innerHeight", 900);
  let top = 200;
  const bounds = vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(() => ({
      top,
      bottom: top,
      left: 0,
      right: 0,
      width: 0,
      height: 0,
      x: 0,
      y: top,
      toJSON: () => ({})
    }));
  try {
    const result = render(view());
    const panel = screen.getByRole("complementary", { name: "目录区域" });
    expect(panel.style.getPropertyValue("--explorer-height")).toBe("684px");
    top = 80;
    fireEvent.scroll(window);
    expect(panel.style.getPropertyValue("--explorer-height")).toBe("804px");
    vi.stubGlobal("innerHeight", 720);
    fireEvent.resize(window);
    expect(panel.style.getPropertyValue("--explorer-height")).toBe("624px");
    top = 160;
    result.rerender(view());
    expect(panel.style.getPropertyValue("--explorer-height")).toBe("544px");
  } finally {
    bounds.mockRestore();
  }
});
it("delays hover opening, stays open over portaled menus, pins on click and closes on Escape", () => {
  hover = true;
  vi.useFakeTimers();
  render(view());
  const trigger = screen.getByRole("button", { name: "目录" });
  fireEvent.pointerEnter(trigger, { pointerType: "mouse" });
  expect(screen.queryByRole("region", { name: "目录浮层" })).toBeNull();
  act(() => vi.advanceTimersByTime(150));
  const panel = screen.getByRole("region", { name: "目录浮层" });
  fireEvent.pointerLeave(trigger);
  fireEvent.pointerMove(screen.getByText("目录菜单"));
  act(() => vi.advanceTimersByTime(300));
  expect(panel).toBeVisible();
  fireEvent.click(trigger);
  fireEvent.pointerMove(screen.getByRole("button", { name: "背景编辑操作" }));
  act(() => vi.advanceTimersByTime(300));
  expect(panel).toBeVisible();
  expect(
    screen.getByRole("button", { name: "取消固定目录" })
  ).toBeInTheDocument();
  const menu = screen.getByText("目录菜单");
  menu.setAttribute("data-state", "open");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(panel).toBeVisible();
  menu.removeAttribute("data-state");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("region", { name: "目录浮层" })).toBeNull();
});
it("closes transient hover after leaving, but not while a directory operation dialog is active", () => {
  hover = true;
  vi.useFakeTimers();
  const result = render(view());
  fireEvent.pointerEnter(screen.getByRole("button", { name: "目录" }), {
    pointerType: "mouse"
  });
  act(() => vi.advanceTimersByTime(150));
  fireEvent.pointerMove(screen.getByRole("button", { name: "背景编辑操作" }));
  act(() => vi.advanceTimersByTime(250));
  expect(screen.queryByRole("region", { name: "目录浮层" })).toBeNull();
  fireEvent.pointerEnter(screen.getByRole("button", { name: "目录" }), {
    pointerType: "mouse"
  });
  act(() => vi.advanceTimersByTime(150));
  result.rerender(view(true));
  fireEvent.pointerMove(screen.getByRole("button", { name: "背景编辑操作" }));
  act(() => vi.advanceTimersByTime(300));
  expect(screen.getByRole("region", { name: "目录浮层" })).toBeVisible();
});

it("restores the directory scroll offset when a different layout clamps its scroll position", () => {
  vi.useFakeTimers();
  render(view());
  fireEvent.click(screen.getByRole("button", { name: "目录" }));
  act(() => vi.advanceTimersByTime(20));
  const area = screen.getByTestId("directory-scroll");
  fireEvent.wheel(area);
  area.scrollTop = 120;
  fireEvent.scroll(area);
  act(() => {
    area.scrollTop = 0;
    wide = true;
    listeners.forEach((cb) => cb());
  });
  expect(area.scrollTop).toBe(120);
  area.scrollTop = 0;
  fireEvent.scroll(area);
  act(() => {
    wide = false;
    listeners.forEach((cb) => cb());
  });
  expect(area.scrollTop).toBe(120);
});
