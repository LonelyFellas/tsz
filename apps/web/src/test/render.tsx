import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderResult } from "@testing-library/react";
import { useState, type ReactElement, type ReactNode } from "react";

function makeClient() {
  // 关掉重试,断言更直接。
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

// 给 renderHook / render 复用的 wrapper:每次挂载一个全新的 QueryClient。
export function QueryWrapper({ children }: { children: ReactNode }) {
  const [client] = useState(makeClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

// 复用的测试工具:用 QueryWrapper 包裹被测组件后渲染。
// 该文件不是测试文件,被测试 import,故无需匹配 vitest 的 include。
export function renderWithProviders(ui: ReactElement): RenderResult {
  return render(ui, { wrapper: QueryWrapper });
}
