import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { OnboardingForm } from "./OnboardingForm";
import { useUserStore } from "@/stores/user";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush })
}));

vi.mock("@/lib/request", () => ({
  api: { auth: { updateLearningSettings: vi.fn() } }
}));

import { api } from "@/lib/request";
const mockUpdate = vi.mocked(api.auth.updateLearningSettings);

beforeEach(() => {
  vi.clearAllMocks();
  mockPush.mockReset();
  useUserStore.setState({ onboarded: null });
});

describe("OnboardingForm", () => {
  it("两项都未选 → 提交按钮禁用", () => {
    renderWithProviders(<OnboardingForm />);
    expect(
      screen.getByRole("button", { name: "完成，开始学习" })
    ).toBeDisabled();
  });

  it("只选了难度等级 → 按钮仍禁用", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OnboardingForm />);
    await user.click(screen.getByText("B1"));
    expect(
      screen.getByRole("button", { name: "完成，开始学习" })
    ).toBeDisabled();
  });

  it("选齐难度等级 + 英式 → 提交写入设置并跳首页", async () => {
    mockUpdate.mockResolvedValueOnce({
      learning_settings: { cefr_level: "B1", english_variant: "BrE" },
      onboarded: true
    });
    const user = userEvent.setup();
    renderWithProviders(<OnboardingForm />);

    await user.click(screen.getByText("B1"));
    await user.click(screen.getByText("英式英语"));
    await user.click(screen.getByRole("button", { name: "完成，开始学习" }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({
        cefr_level: "B1",
        english_variant: "BrE"
      });
      expect(mockPush).toHaveBeenCalledWith("/");
    });
    expect(useUserStore.getState().onboarded).toBe(true);
  });

  it("选择美式 → 顶部标签切换为「美式」", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OnboardingForm />);
    expect(screen.getByText("英式")).toBeInTheDocument();
    await user.click(screen.getByText("美式英语"));
    expect(screen.getByText("美式")).toBeInTheDocument();
  });

  it("提交失败 → 显示错误文案，不跳转", async () => {
    mockUpdate.mockRejectedValueOnce(
      new Error("learning settings require a student profile")
    );
    const user = userEvent.setup();
    renderWithProviders(<OnboardingForm />);

    await user.click(screen.getByText("C2"));
    await user.click(screen.getByText("美式英语"));
    await user.click(screen.getByRole("button", { name: "完成，开始学习" }));

    await waitFor(() => {
      expect(
        screen.getByText("当前账号没有学生身份，无法设置学习偏好")
      ).toBeInTheDocument();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });
});
