import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { WordListCreator } from "./WordListCreator";

// jsdom 下 useRouter 必须 mock,否则 done 步的按钮渲染会报 app router 未挂载。
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() })
}));

describe("WordListCreator", () => {
  it("未选词时「下一步」禁用,选词后可进入命名步", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WordListCreator />);

    const next = screen.getByRole("button", { name: "下一步" });
    expect(next).toBeDisabled();

    await user.click(screen.getAllByRole("checkbox")[0]!);
    expect(next).toBeEnabled();

    await user.click(next);
    expect(
      screen.getByPlaceholderText("例如:小学一年级核心词")
    ).toBeInTheDocument();
  });

  it("命名为空时「下一步」禁用", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WordListCreator />);

    await user.click(screen.getAllByRole("checkbox")[0]!);
    await user.click(screen.getByRole("button", { name: "下一步" }));

    const next = screen.getByRole("button", { name: "下一步" });
    expect(next).toBeDisabled();

    await user.type(
      screen.getByPlaceholderText("例如:小学一年级核心词"),
      "我的词表"
    );
    expect(next).toBeEnabled();
  });

  it("公开 + 自定义词汇 → 出现审核提示,完成后进入成功页", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WordListCreator />);

    // 选词 + 添加一个自定义词。
    await user.click(screen.getAllByRole("checkbox")[0]!);
    await user.type(screen.getByPlaceholderText("输入一个词后点添加"), "彩虹");
    await user.click(screen.getByRole("button", { name: "添加" }));

    // 进入命名步并填名。
    await user.click(screen.getByRole("button", { name: "下一步" }));
    await user.type(
      screen.getByPlaceholderText("例如:小学一年级核心词"),
      "公开含自定义"
    );

    // 进入公开设置步,选公开 → 审核提示出现。
    await user.click(screen.getByRole("button", { name: "下一步" }));
    await user.click(screen.getByRole("radio", { name: /公开/ }));
    expect(screen.getByText(/提交后将进入敏感词审核/)).toBeInTheDocument();

    // 完成创建 → done 步显示成功文案与公开结果文案。
    await user.click(screen.getByRole("button", { name: "完成创建" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /创建成功/ })
      ).toBeInTheDocument()
    );
    expect(
      screen.getByText("已提交审核,通过后将对师生可见。")
    ).toBeInTheDocument();
  });

  it("私密词表完成后显示私密结果文案", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WordListCreator />);

    await user.click(screen.getAllByRole("checkbox")[0]!);
    await user.click(screen.getByRole("button", { name: "下一步" }));
    await user.type(
      screen.getByPlaceholderText("例如:小学一年级核心词"),
      "私密词表"
    );
    await user.click(screen.getByRole("button", { name: "下一步" }));
    // 默认就是私密,直接完成。
    await user.click(screen.getByRole("button", { name: "完成创建" }));

    await waitFor(() =>
      expect(screen.getByText("已保存为私密词表。")).toBeInTheDocument()
    );
  });
});
