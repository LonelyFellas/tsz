import type { AdminProfile } from "@tsz/api-client";
import { fireEvent, render, screen } from "@testing-library/react";
import { App as AntApp } from "antd";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", async () => {
  const { createAdminAuthStore } = await import("@tsz/shared/auth");
  return { useAuthStore: createAdminAuthStore() };
});

import { dialectPreferenceStorageKey } from "@tsz/shared";
import { useAuthStore } from "@/lib/auth";
import { DialectPreference } from "./DialectPreference";

// 偏好快照按管理员身份缓存在模块作用域（跨屏共享同一个值），因此每个用例用**不同**的
// 管理员 ID：既贴近真实的「换账号」场景，也让缓存自然失效，无需测试专用的重置入口。
function signIn(id: string): AdminProfile {
  const profile: AdminProfile = {
    id,
    phone: "13800138000",
    display_name: "词库管理员",
    role: "admin",
    permissions: []
  };
  useAuthStore.setState({ profile, role: profile.role });
  return profile;
}

function renderSetting() {
  return render(
    <AntApp>
      <DialectPreference />
    </AntApp>
  );
}

const ukRadio = () => screen.getByRole("radio", { name: "英式（BrE）" });
const usRadio = () => screen.getByRole("radio", { name: "美式（AmE）" });

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  useAuthStore.setState({ profile: null, role: null });
});

describe("DialectPreference", () => {
  it("未设置过的管理员默认选中英式", () => {
    signIn("admin-default");
    renderSetting();

    expect(ukRadio()).toBeChecked();
    expect(usRadio()).not.toBeChecked();
  });

  it("切换到美式后写入本地存储并给出成功反馈", async () => {
    signIn("admin-switch");
    renderSetting();

    fireEvent.click(usRadio());

    expect(usRadio()).toBeChecked();
    expect(
      localStorage.getItem(dialectPreferenceStorageKey("admin-switch"))
    ).toBe("us");
    // 只承诺「已保存」——消费该偏好的向导与预览要到阶段 2–5 才改造完成。
    expect(
      await screen.findByText(/已保存英语方言偏好：美式（AmE）/)
    ).toBeInTheDocument();
  });

  it("已保存过偏好的管理员进入时选中已保存的一侧", () => {
    signIn("admin-restored");
    localStorage.setItem(dialectPreferenceStorageKey("admin-restored"), "us");
    renderSetting();

    expect(usRadio()).toBeChecked();
  });

  it("不串号：另一个管理员看到的是自己的默认英式", () => {
    localStorage.setItem(dialectPreferenceStorageKey("admin-other"), "us");
    signIn("admin-fresh");
    renderSetting();

    expect(ukRadio()).toBeChecked();
  });

  it("重复点击当前选项不重复写入", () => {
    signIn("admin-idempotent");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    renderSetting();

    fireEvent.click(ukRadio());

    expect(setItem).not.toHaveBeenCalled();
  });

  it("本地存储不可写时提示失败，且显示值停在原值", async () => {
    signIn("admin-quota");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    renderSetting();

    fireEvent.click(usRadio());

    // 原始的 QuotaExceededError 不该直接甩给管理员。
    expect(await screen.findByText(/浏览器本地存储不可写/)).toBeInTheDocument();
    expect(screen.queryByText("QuotaExceededError")).not.toBeInTheDocument();
    expect(ukRadio()).toBeChecked();
    expect(usRadio()).not.toBeChecked();
  });

  it("会话中途失效时不写入无主的键，并提示重新登录", async () => {
    renderSetting();

    fireEvent.click(usRadio());

    expect(await screen.findByText(/当前会话已失效/)).toBeInTheDocument();
    expect(ukRadio()).toBeChecked();
    expect(localStorage.length).toBe(0);
  });
});
