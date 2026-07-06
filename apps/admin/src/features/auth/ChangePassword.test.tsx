import { HttpError } from "@tsz/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App as AntApp } from "antd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();
let mockState: unknown = null;

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ state: mockState })
}));

vi.mock("@/lib/auth", async () => {
  const { createAdminAuthStore } = await import("@tsz/shared/auth");
  return {
    useAuthStore: createAdminAuthStore(),
    api: { auth: { changePassword: vi.fn() } }
  };
});

const mockLogout = vi.fn();
vi.mock("./useAdminLogout", () => ({ useAdminLogout: () => mockLogout }));

import { ChangePassword } from "./ChangePassword";
import { api, useAuthStore } from "@/lib/auth";

// 含 antd 表单校验 + 异步 mutation + message 门户，覆盖率插桩下偏慢，放宽超时。
vi.setConfig({ testTimeout: 15000 });

const mockChange = vi.mocked(api.auth.changePassword);

const PROFILE = {
  id: "a1",
  phone: "13800138000",
  display_name: "审核员小王",
  level: "admin" as const
};

// forced = profile 为空（登录/刷新两条强制路径）；自助改密时 profile 有值。
function renderForced() {
  render(
    <AntApp>
      <ChangePassword />
    </AntApp>
  );
}
function renderSelf() {
  useAuthStore.setState({ profile: PROFILE, level: PROFILE.level });
  renderForced();
}

function fillCurrent(v: string) {
  const el =
    screen.queryByPlaceholderText("管理员发给你的临时密码") ??
    screen.getByPlaceholderText("当前登录密码");
  fireEvent.change(el, { target: { value: v } });
}
function fillNew(v: string, confirm = v) {
  fireEvent.change(screen.getByPlaceholderText("至少 12 位，非纯数字"), {
    target: { value: v }
  });
  fireEvent.change(screen.getByPlaceholderText("再次输入新密码"), {
    target: { value: confirm }
  });
}
function submit() {
  fireEvent.click(screen.getByRole("button", { name: "确认修改" }));
}

let originalLocation: Location;
beforeEach(() => {
  vi.clearAllMocks();
  mockState = null;
  useAuthStore.setState({ profile: null, level: null });
  originalLocation = window.location;
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { href: "" }
  });
});
afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: originalLocation
  });
});

describe("ChangePassword · 本地校验", () => {
  it("新密码不足 12 位被拦截，不打后端", async () => {
    renderSelf();
    fillCurrent("current-real-pw-1");
    fillNew("short");
    submit();
    expect(await screen.findByText("密码至少 12 位")).toBeInTheDocument();
    expect(mockChange).not.toHaveBeenCalled();
  });

  it("纯数字新密码被拦截", async () => {
    renderSelf();
    fillCurrent("current-real-pw-1");
    fillNew("123456789012");
    submit();
    expect(await screen.findByText("密码不能是纯数字")).toBeInTheDocument();
    expect(mockChange).not.toHaveBeenCalled();
  });

  it("新密码与当前相同被拦截", async () => {
    renderSelf();
    fillCurrent("brand-new-pw-2026");
    fillNew("brand-new-pw-2026");
    submit();
    expect(
      await screen.findByText("新密码不能与当前密码相同")
    ).toBeInTheDocument();
    expect(mockChange).not.toHaveBeenCalled();
  });

  it("两次输入不一致被拦截", async () => {
    renderSelf();
    fillCurrent("current-real-pw-1");
    fillNew("brand-new-pw-2026", "brand-new-pw-XXXX");
    submit();
    expect(await screen.findByText("两次输入的密码不一致")).toBeInTheDocument();
    expect(mockChange).not.toHaveBeenCalled();
  });
});

describe("ChangePassword · 强制改密（forced）", () => {
  it("标题与临时密码字段：profile 为空判定为强制改密", () => {
    renderForced();
    expect(screen.getByText("请先修改初始密码")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("管理员发给你的临时密码")
    ).toBeInTheDocument();
  });

  it("登录带来的临时密码经路由 state 预填当前密码", () => {
    mockState = { currentPassword: "temp-pass-123456" };
    renderForced();
    expect(screen.getByPlaceholderText("管理员发给你的临时密码")).toHaveValue(
      "temp-pass-123456"
    );
  });

  it("成功：整页跳首页（让会话恢复在标记清除后重建 profile）", async () => {
    mockState = { currentPassword: "temp-pass-123456" };
    mockChange.mockResolvedValue(undefined);
    renderForced();
    fillNew("brand-new-pw-2026");
    submit();
    await waitFor(() =>
      expect(mockChange).toHaveBeenCalledWith(
        "temp-pass-123456",
        "brand-new-pw-2026"
      )
    );
    await waitFor(() => expect(window.location.href).toBe("/"));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("提供「退出登录」逃生口：点了调 logout", () => {
    renderForced();
    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it("临时密码错(401)：就地标红临时密码字段", async () => {
    mockChange.mockRejectedValue(
      new HttpError(401, "current password is incorrect")
    );
    renderForced();
    fillCurrent("wrong-temp-pw");
    fillNew("brand-new-pw-2026");
    submit();
    expect(await screen.findByText("临时密码不正确")).toBeInTheDocument();
    expect(window.location.href).toBe("");
  });
});

describe("ChangePassword · 自助改密", () => {
  it("标题为「修改密码」，当前密码字段常规文案，且无逃生口（顶栏已有登出）", () => {
    renderSelf();
    expect(screen.getByText("修改密码")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("当前登录密码")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "退出登录" })
    ).not.toBeInTheDocument();
  });

  it("成功：提示成功并 SPA 回首页（不整页刷新）", async () => {
    mockChange.mockResolvedValue(undefined);
    renderSelf();
    fillCurrent("current-real-pw-1");
    fillNew("brand-new-pw-2026");
    submit();
    await waitFor(() =>
      expect(mockChange).toHaveBeenCalledWith(
        "current-real-pw-1",
        "brand-new-pw-2026"
      )
    );
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true })
    );
    expect(window.location.href).toBe("");
  });

  it("当前密码错(401)：就地标红当前密码字段", async () => {
    mockChange.mockRejectedValue(
      new HttpError(401, "current password is incorrect")
    );
    renderSelf();
    fillCurrent("wrong-pass-123");
    fillNew("brand-new-pw-2026");
    submit();
    expect(await screen.findByText("当前密码不正确")).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("新密码不合规(400)：直接展示后端文案", async () => {
    mockChange.mockRejectedValue(new HttpError(400, "password is too common"));
    renderSelf();
    fillCurrent("current-real-pw-1");
    fillNew("password-common");
    submit();
    expect(
      await screen.findByText("password is too common")
    ).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
