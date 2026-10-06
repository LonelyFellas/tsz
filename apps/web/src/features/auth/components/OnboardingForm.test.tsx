import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@tsz/api-client";
import type { LearningSettingsResponse, User } from "@tsz/types";
import { renderWithProviders } from "@/test/render";
import { OnboardingForm } from "./OnboardingForm";
import { useUserStore } from "@/stores/user";

const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace })
}));
vi.mock("@/lib/request", () => ({
  api: { auth: { updateLearningSettings: vi.fn(), me: vi.fn() } }
}));
import { api } from "@/lib/request";
const mockUpdate = vi.mocked(api.auth.updateLearningSettings);
const mockMe = vi.mocked(api.auth.me);
const USER: User = {
  id: "u1",
  display_name: "同学",
  avatar_url: "",
  roles: ["student"],
  active_role: "student"
};

beforeEach(() => {
  vi.resetAllMocks();
  useUserStore.setState({ user: USER, onboarded: false, hydrated: true });
  mockUpdate.mockImplementation(async (settings) => ({
    learning_settings: settings,
    onboarded: true
  }));
});

describe("OnboardingForm", () => {
  it("两项默认未选；只选难度仍不能进入确认", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OnboardingForm />);
    expect(screen.getByText("待选择")).toBeInTheDocument();
    for (const radio of screen.getAllByRole("radio"))
      expect(radio).not.toBeChecked();
    const submit = screen.getByRole("button", { name: "完成，开始学习" });
    expect(submit).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: /B1/ }));
    expect(submit).toBeDisabled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("选齐后先确认不可修改规则；确认保存才完成引导", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OnboardingForm returnTo="/student/practice" />);
    expect(screen.getByRole("link", { name: /1 分钟测一测/ })).toHaveAttribute(
      "href",
      "/placement?redirect=%2Fstudent%2Fpractice"
    );
    await user.click(screen.getByRole("radio", { name: /B1/ }));
    await user.click(screen.getByRole("radio", { name: /英式英语/ }));
    await user.click(screen.getByRole("button", { name: "完成，开始学习" }));
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(
      screen.getByText("难度确认后不可修改；英美偏好之后仍可调整。")
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "确认并开始学习" }));
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith("/student/practice")
    );
    expect(mockUpdate).toHaveBeenCalledExactlyOnceWith({
      cefr_level: "B1",
      english_variant: "BrE"
    });
    expect(useUserStore.getState().onboarded).toBe(true);
  });

  it("确认前可返回调整；保存的是最后一次明确选择", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OnboardingForm />);
    await user.click(screen.getByRole("radio", { name: /A1/ }));
    await user.click(screen.getByRole("radio", { name: /英式英语/ }));
    await user.click(screen.getByRole("button", { name: "完成，开始学习" }));
    await user.click(screen.getByRole("button", { name: "返回调整" }));
    await user.click(screen.getByRole("radio", { name: /B2/ }));
    await user.click(screen.getByRole("radio", { name: /美式英语/ }));
    expect(screen.getByText("美式")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "完成，开始学习" }));
    await user.click(screen.getByRole("button", { name: "确认并开始学习" }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
    expect(mockUpdate).toHaveBeenCalledExactlyOnceWith({
      cefr_level: "B2",
      english_variant: "AmE"
    });
  });

  it("测评等级只预选，不自动保存，也不默认选择口音", () => {
    renderWithProviders(<OnboardingForm initialLevel="B2" />);
    expect(screen.getByRole("radio", { name: /B2/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /英式英语/ })).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: "完成，开始学习" })
    ).toBeDisabled();
    expect(screen.getByRole("link", { name: /1 分钟测一测/ })).toHaveAttribute(
      "href",
      "/placement"
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("失败保留选择和未完成状态，允许重试", async () => {
    mockUpdate.mockRejectedValueOnce(
      new Error("learning settings require a student profile")
    );
    const user = userEvent.setup();
    renderWithProviders(<OnboardingForm />);
    await user.click(screen.getByRole("radio", { name: /C2/ }));
    await user.click(screen.getByRole("radio", { name: /美式英语/ }));
    await user.click(screen.getByRole("button", { name: "完成，开始学习" }));
    await user.click(screen.getByRole("button", { name: "确认并开始学习" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "当前账号没有学生身份，无法设置学习偏好"
    );
    expect(screen.getByRole("radio", { name: /C2/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /美式英语/ })).toBeChecked();
    expect(useUserStore.getState().onboarded).toBe(false);
    expect(mockReplace).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "确认并开始学习" }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
  });

  it("保存等待时禁止重入和重选", async () => {
    let finish!: (response: LearningSettingsResponse) => void;
    mockUpdate.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<OnboardingForm initialLevel="A2" />);
    await user.click(screen.getByRole("radio", { name: /英式英语/ }));
    await user.click(screen.getByRole("button", { name: "完成，开始学习" }));
    await user.click(screen.getByRole("button", { name: "确认并开始学习" }));
    const saving = screen.getByRole("button", { name: "保存中..." });
    expect(saving).toBeDisabled();
    expect(screen.getByRole("button", { name: "返回调整" })).toBeDisabled();
    for (const radio of screen.getAllByRole("radio"))
      expect(radio).toBeDisabled();
    await user.click(saving);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    await act(async () =>
      finish({
        learning_settings: { cefr_level: "A2", english_variant: "BrE" },
        onboarded: true
      })
    );
  });

  it("其他标签页已确认难度，重读真实配置而不覆盖", async () => {
    mockUpdate.mockRejectedValueOnce(
      new HttpError(409, "locked", [], "cefr_level_locked")
    );
    mockMe.mockResolvedValueOnce({
      user: USER,
      active_role: "student",
      learning_settings: { cefr_level: "B1", english_variant: "BrE" },
      onboarded: true
    });
    const user = userEvent.setup();
    renderWithProviders(<OnboardingForm initialLevel="C1" />);
    await user.click(screen.getByRole("radio", { name: /美式英语/ }));
    await user.click(screen.getByRole("button", { name: "完成，开始学习" }));
    await user.click(screen.getByRole("button", { name: "确认并开始学习" }));
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith("/account/profile")
    );
    expect(mockMe).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(useUserStore.getState().onboarded).toBe(true);
  });
});
