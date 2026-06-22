import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { WordListBrowser } from "./WordListBrowser";

describe("WordListBrowser", () => {
  it("先显示加载态,再渲染词表数据", async () => {
    renderWithProviders(<WordListBrowser />);

    // 标题与创建入口始终在。
    expect(screen.getByRole("heading", { name: "词表" })).toBeInTheDocument();
    expect(screen.getByText("加载中…")).toBeInTheDocument();

    // mock 数据返回后,默认词表出现。
    await waitFor(() =>
      expect(screen.getByText("小学一年级核心词")).toBeInTheDocument()
    );
  });
});
