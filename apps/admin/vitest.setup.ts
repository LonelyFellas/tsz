import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// 未开启 globals，需手动在每个用例后清理 DOM。
afterEach(() => cleanup());

// jsdom 缺失的浏览器 API 垫片：antd 的响应式表格/日期选择器等依赖
// matchMedia 与 ResizeObserver，jsdom 未实现，测试渲染时会抛错。这里以最小
// 空实现补齐，仅为让组件在测试环境挂载通过（不模拟真实布局测量）。
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }) as unknown as MediaQueryList;
}

if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
