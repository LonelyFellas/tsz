import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CountUp } from "./CountUp";

const format = (value: number) => value.toLocaleString("zh-CN");

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function mockReducedMotion(reduce: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: reduce && query.includes("reduce"),
        media: query
      }) as MediaQueryList
  );
}

it("动画过程中屏幕阅读器始终读到最终值，结束后可见文本停在最终值", () => {
  vi.useFakeTimers({
    toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"]
  });
  mockReducedMotion(false);
  const { container } = render(<CountUp value={1234} format={format} />);
  const visible = container.querySelector('[aria-hidden="true"]');
  expect(container.querySelector(".sr-only")).toHaveTextContent("1,234");
  expect(visible).toHaveTextContent("0");
  act(() => vi.advanceTimersByTime(300));
  expect(visible).not.toHaveTextContent(/^(0|1,234)$/);
  act(() => vi.advanceTimersByTime(600));
  expect(visible).toHaveTextContent("1,234");
});

it("减少动态效果时直接显示最终值", () => {
  mockReducedMotion(true);
  const { container } = render(<CountUp value={88} format={format} />);
  expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent(
    "88"
  );
});

it("超出安全整数的金额不经过 Number，直接显示原始文本", () => {
  mockReducedMotion(false);
  render(
    <CountUp
      value={Number("12345678901234567890")}
      format={String}
      final="12,345,678,901,234,567,890"
    />
  );
  expect(screen.getAllByText("12,345,678,901,234,567,890")).toHaveLength(2);
});
