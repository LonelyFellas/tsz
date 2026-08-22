import type { AdminProfile } from "@tsz/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App as AntApp } from "antd";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateProfilePreferences = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", async () => {
  const { createAdminAuthStore } = await import("@tsz/shared/auth");
  return {
    useAuthStore: createAdminAuthStore(),
    api: { updateProfilePreferences }
  };
});

import { dialectPreferenceStorageKey } from "@tsz/shared";
import { useAuthStore } from "@/lib/auth";
import { DialectPreference } from "./DialectPreference";

/** 登录一个管理员；`dialect` 为 undefined 模拟尚未部署 P2 的后端（响应里没有偏好）。 */
function signIn(id: string, dialect?: "uk" | "us"): AdminProfile {
  const profile = {
    id,
    phone: "13800138000",
    display_name: "词库管理员",
    role: "admin",
    permissions: [],
    ...(dialect === undefined ? {} : { preferences: { dialect } })
  } as AdminProfile;
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
  updateProfilePreferences.mockReset();
  updateProfilePreferences.mockResolvedValue({
    preferences: { dialect: "us" }
  });
  localStorage.clear();
  useAuthStore.setState({ profile: null, role: null });
});

describe("DialectPreference", () => {
  it("显示值取服务端 profile 里的偏好", () => {
    signIn("admin-server-us", "us");
    renderSetting();

    expect(usRadio()).toBeChecked();
    expect(ukRadio()).not.toBeChecked();
  });

  it("切换到美式：调 PATCH、回填 profile、写离线缓存并给出成功反馈", async () => {
    signIn("admin-switch", "uk");
    renderSetting();

    fireEvent.click(usRadio());

    await waitFor(() => expect(usRadio()).toBeChecked());
    expect(updateProfilePreferences).toHaveBeenCalledWith({ dialect: "us" });
    expect(useAuthStore.getState().profile?.preferences).toEqual({
      dialect: "us"
    });
    expect(
      localStorage.getItem(dialectPreferenceStorageKey("admin-switch"))
    ).toBe("us");
    expect(
      await screen.findByText(/已保存英语方言偏好：美式（AmE）/)
    ).toBeInTheDocument();
  });

  it("回填的是服务端落库值而不是提交值——默认与取值都由后端说了算", async () => {
    signIn("admin-server-wins", "uk");
    updateProfilePreferences.mockResolvedValue({
      preferences: { dialect: "uk" }
    });
    renderSetting();

    fireEvent.click(usRadio());

    await waitFor(() => expect(updateProfilePreferences).toHaveBeenCalled());
    await waitFor(() => expect(ukRadio()).toBeChecked());
    expect(
      localStorage.getItem(dialectPreferenceStorageKey("admin-server-wins"))
    ).toBe("uk");
  });

  it("服务端没给偏好时用本地离线缓存兜底", () => {
    localStorage.setItem(dialectPreferenceStorageKey("admin-offline"), "us");
    signIn("admin-offline");
    renderSetting();

    expect(usRadio()).toBeChecked();
  });

  it("服务端与缓存都没有时用显示兜底值英式", () => {
    signIn("admin-empty");
    renderSetting();

    expect(ukRadio()).toBeChecked();
  });

  it("不串号：读不到别的管理员缓存下来的偏好", () => {
    localStorage.setItem(dialectPreferenceStorageKey("admin-other"), "us");
    signIn("admin-fresh");
    renderSetting();

    expect(ukRadio()).toBeChecked();
  });

  it("重复点击当前选项不发请求", () => {
    signIn("admin-idempotent", "uk");
    renderSetting();

    fireEvent.click(ukRadio());

    expect(updateProfilePreferences).not.toHaveBeenCalled();
  });

  it("服务端保存失败时提示原因，显示值停在原值且不写缓存", async () => {
    signIn("admin-server-error", "uk");
    updateProfilePreferences.mockRejectedValue(new Error("dialect 不合法"));
    renderSetting();

    fireEvent.click(usRadio());

    expect(
      await screen.findByText(/方言偏好未能保存：dialect 不合法/)
    ).toBeInTheDocument();
    expect(ukRadio()).toBeChecked();
    expect(
      localStorage.getItem(dialectPreferenceStorageKey("admin-server-error"))
    ).toBeNull();
  });

  it("保存被非 Error 拒绝时回退到通用文案（不拼出 undefined）", async () => {
    signIn("admin-weird-error", "uk");
    updateProfilePreferences.mockRejectedValue("boom");
    renderSetting();

    fireEvent.click(usRadio());

    expect(await screen.findByText("方言偏好未能保存")).toBeInTheDocument();
    expect(ukRadio()).toBeChecked();
  });

  it("缓存写不进去不影响保存成功——事实源已经在服务端了", async () => {
    signIn("admin-quota", "uk");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    renderSetting();

    fireEvent.click(usRadio());

    expect(
      await screen.findByText(/已保存英语方言偏好：美式（AmE）/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/QuotaExceededError/)).not.toBeInTheDocument();
    await waitFor(() => expect(usRadio()).toBeChecked());
  });

  it("会话中途失效时不发请求，并提示重新登录", async () => {
    renderSetting();

    fireEvent.click(usRadio());

    expect(
      await screen.findByText(/方言偏好未能保存：当前会话已失效/)
    ).toBeInTheDocument();
    expect(updateProfilePreferences).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });

  it("保存进行中禁用单选组，避免连点叠出两次 PATCH", async () => {
    signIn("admin-inflight", "uk");
    let resolvePatch: (value: unknown) => void = () => {};
    updateProfilePreferences.mockReturnValue(
      new Promise((resolve) => {
        resolvePatch = resolve;
      })
    );
    renderSetting();

    fireEvent.click(usRadio());
    await waitFor(() => expect(usRadio()).toBeDisabled());
    fireEvent.click(usRadio());
    expect(updateProfilePreferences).toHaveBeenCalledTimes(1);

    resolvePatch({ preferences: { dialect: "us" } });
    await waitFor(() => expect(usRadio()).toBeEnabled());
  });
});
