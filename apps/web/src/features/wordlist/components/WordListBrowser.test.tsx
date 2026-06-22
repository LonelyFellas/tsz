import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { WordListBrowser } from "./WordListBrowser";

// 每个测试用全新 QueryClient,关掉重试以便断言。
function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  );
}

describe("WordListBrowser", () => {
  it("先显示加载态,再渲染词表数据", async () => {
    renderWithClient(<WordListBrowser />);

    // 标题与创建入口始终在。
    expect(screen.getByRole("heading", { name: "词表" })).toBeInTheDocument();
    expect(screen.getByText("加载中…")).toBeInTheDocument();

    // mock 数据返回后,默认词表出现。
    await waitFor(() =>
      expect(screen.getByText("小学一年级核心词")).toBeInTheDocument()
    );
  });
});
