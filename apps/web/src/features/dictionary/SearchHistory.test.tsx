import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SearchHistory } from "./SearchHistory";

let resize: () => void;
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    }
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("仅在对应方向仍有内容时渐隐，滚动、尺寸及记录变化后更新", () => {
  const props = { onSearch: vi.fn(), onRemove: vi.fn() };
  const view = render(<SearchHistory terms={["apple", "pear"]} {...props} />);
  const history = screen.getByLabelText("搜索历史");
  // jsdom does not parse calc() gradient stops; inspect the emitted mask value.
  const mask = vi.spyOn(history.style, "maskImage", "set");
  let contentWidth = 600;
  Object.defineProperties(history, {
    clientWidth: { configurable: true, get: () => 300 },
    scrollWidth: { configurable: true, get: () => contentWidth }
  });
  act(() => resize());
  expect(mask).toHaveBeenLastCalledWith(
    "linear-gradient(to right, black, black 24px, black calc(100% - 24px), transparent)"
  );
  history.scrollLeft = 100;
  fireEvent.scroll(history);
  expect(mask).toHaveBeenLastCalledWith(
    "linear-gradient(to right, transparent, black 24px, black calc(100% - 24px), transparent)"
  );
  history.scrollLeft = 300;
  fireEvent.scroll(history);
  expect(mask).toHaveBeenLastCalledWith(
    "linear-gradient(to right, transparent, black 24px, black calc(100% - 24px), black)"
  );
  contentWidth = 300;
  history.scrollLeft = 0;
  act(() => resize());
  expect(mask).toHaveBeenLastCalledWith("");
  expect(
    screen.queryByRole("button", { name: "向右滚动搜索历史" })
  ).not.toBeInTheDocument();
  contentWidth = 400;
  view.rerender(
    <SearchHistory terms={["apple", "pear", "centre"]} {...props} />
  );
  expect(mask).toHaveBeenLastCalledWith(
    "linear-gradient(to right, black, black 24px, black calc(100% - 24px), transparent)"
  );
});

it.each([false, true])(
  "箭头按可滚动方向启用，并遵循减少动态效果偏好（%s）",
  (reducedMotion) => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: reducedMotion }))
    );
    const onSearch = vi.fn();
    const onRemove = vi.fn();
    render(
      <SearchHistory
        terms={["apple", "pear"]}
        onSearch={onSearch}
        onRemove={onRemove}
      />
    );
    const history = screen.getByLabelText("搜索历史");
    const scrollBy = vi.fn();
    Object.defineProperties(history, {
      clientWidth: { configurable: true, value: 300 },
      scrollWidth: { configurable: true, value: 600 },
      scrollBy: { configurable: true, value: scrollBy }
    });
    act(() => resize());
    const left = screen.getByRole("button", { name: "向左滚动搜索历史" });
    const right = screen.getByRole("button", { name: "向右滚动搜索历史" });
    expect(left).toHaveAttribute("aria-disabled", "true");
    expect(left).toHaveAttribute("tabindex", "-1");
    expect(right).toHaveAttribute("aria-disabled", "false");
    fireEvent.click(left);
    expect(scrollBy).not.toHaveBeenCalled();
    fireEvent.click(right);
    expect(scrollBy).toHaveBeenLastCalledWith({
      left: 225,
      behavior: reducedMotion ? "instant" : "smooth"
    });
    right.focus();
    history.scrollLeft = 300;
    fireEvent.scroll(history);
    expect(left).toHaveAttribute("aria-disabled", "false");
    expect(right).toHaveAttribute("aria-disabled", "true");
    expect(right).toHaveAttribute("tabindex", "-1");
    expect(right).toHaveFocus();
    fireEvent.click(left);
    expect(scrollBy).toHaveBeenLastCalledWith({
      left: -225,
      behavior: reducedMotion ? "instant" : "smooth"
    });
    expect(onSearch).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
  }
);
