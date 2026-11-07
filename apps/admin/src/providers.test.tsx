import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { AdminProfile } from "@tsz/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/lib/auth";
import { RootProviders } from "./providers";
import { ConsoleLayout } from "./layouts/ConsoleLayout";
import { WordCreatePage } from "./pages/WordCreate";
import { LoginPage } from "./pages/Login";
import { ADMIN_PERMISSION_UPGRADE_MESSAGE } from "@tsz/api-client";

const sessionRestore = vi.hoisted(() => ({ retry: vi.fn(), retrying: false }));

vi.mock("@/features/recovery/RecoverySession", () => ({
  RecoverySession: () => null
}));
vi.mock("@/features/auth/hooks/useAdminSessionRestore", () => ({
  useAdminSessionRestore: () => sessionRestore
}));
vi.mock("@/features/auth/AdminRouteGuard", () => ({
  AdminRouteGuard: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock("@/features/auth/AdminHeader", () => ({ AdminHeader: () => null }));
vi.mock("@/features/console/ConsoleSidebar", () => ({
  ConsoleSidebar: () => null
}));
vi.mock("@/features/dictionary/part-of-speech/FormTypeLabels", () => ({
  DictionaryFormTypeLabels: ({ children }: { children: React.ReactNode }) =>
    children,
  useFormTypeLabel: () => (value: string) => value
}));
vi.mock("@/features/dictionary/part-of-speech/PartOfSpeechLabels", () => ({
  DictionaryPartOfSpeechLabels: ({ children }: { children: React.ReactNode }) =>
    children
}));
vi.mock("@/features/dictionary/part-of-speech/api", async () => {
  const { partOfSpeechCatalogFixture } =
    await import("./features/dictionary/word-creation/partOfSpeech.test.helper");
  return {
    usePartOfSpeechCatalog: () => ({
      data: partOfSpeechCatalogFixture,
      isError: false,
      isPending: false
    })
  };
});

const profile: AdminProfile = {
  id: "word-owner",
  role: "admin",
  phone: "13800138000",
  display_name: "编辑",
  preferences: { dialect: "uk" },
  permission_version: 7,
  catalog_version: "v1",
  permissions: ["words.access", "words.create", "words.edit"]
};
const input = () => screen.getByPlaceholderText("例如 center 或 give up");
function show() {
  render(
    <MemoryRouter initialEntries={["/words/new"]}>
      <Routes>
        <Route element={<RootProviders />}>
          <Route element={<ConsoleLayout />}>
            <Route path="words/new" element={<WordCreatePage />} />
          </Route>
        </Route>
      </Routes>
    </MemoryRouter>
  );
}
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  sessionRestore.retrying = false;
  useAuthStore.setState({
    connectionError: false,
    refreshUnconfirmed: false,
    permissionModelIncompatible: false
  });
  useAuthStore.getState().setProfile(profile);
});

describe("授权变化与未保存词条表单", () => {
  it("不相关增权和撤权不重挂当前仍有权的真实词条表单，也不借保存备份恢复", () => {
    show();
    fireEvent.change(input(), { target: { value: "unsaved center" } });
    const original = input();
    act(() =>
      useAuthStore.getState().setProfile({
        ...profile,
        permission_version: 8,
        permissions: [...profile.permissions, "users.access"]
      })
    );
    expect(input()).toBe(original);
    expect(input()).toHaveValue("unsaved center");
    act(() =>
      useAuthStore.getState().setProfile({ ...profile, permission_version: 9 })
    );
    expect(input()).toBe(original);
    expect(input()).toHaveValue("unsaved center");
    expect(localStorage.length).toBe(0);
  });
  it("当前页失权卸载输入；换账号必须得到空的新表单，不沿用旧编辑内容", () => {
    show();
    fireEvent.change(input(), { target: { value: "private draft" } });
    act(() =>
      useAuthStore.getState().setProfile({
        ...profile,
        permission_version: 8,
        permissions: ["words.access"]
      })
    );
    expect(screen.queryByPlaceholderText("例如 center 或 give up")).toBeNull();
    expect(screen.getByText("没有访问权限")).toBeInTheDocument();
    act(() =>
      useAuthStore.getState().setProfile({ ...profile, id: "another-owner" })
    );
    expect(input()).toHaveValue("");
    expect(localStorage.length).toBe(0);
  });
});

function showLogin(path = "/login") {
  useAuthStore.setState({ profile: null, role: null, hydrated: false });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<RootProviders />}>
          <Route path="login" element={<LoginPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe("登录页连接提示", () => {
  it.each(["/login", "/login/", "/LOGIN"])(
    "%s 在登录区域内重试，恢复后移除提示且保留已填写内容",
    (path) => {
      useAuthStore.setState({ connectionError: true });
      showLogin(path);
      const login = within(screen.getByRole("region", { name: "管理员登录" }));
      const notice = login.getByRole("status");
      expect(within(notice).getByText("连接暂不可用")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).toBeNull();
      const phone = login.getByLabelText("手机号");
      fireEvent.change(phone, { target: { value: "13800138000" } });
      fireEvent.click(within(notice).getByRole("button", { name: "重试" }));
      expect(sessionRestore.retry).toHaveBeenCalledTimes(1);

      sessionRestore.retrying = true;
      act(() => useAuthStore.setState({ hydrated: true }));
      expect(within(notice).getByText("正在重试…")).toBeInTheDocument();

      sessionRestore.retrying = false;
      act(() => useAuthStore.setState({ connectionError: false }));
      expect(screen.queryByRole("status")).toBeNull();
      expect(login.getByLabelText("手机号")).toBe(phone);
      expect(phone).toHaveValue("13800138000");
    }
  );

  it("未确认会话保留重新登录入口，权限不兼容时只显示升级提示", () => {
    useAuthStore.setState({ refreshUnconfirmed: true });
    showLogin();
    const notice = screen.getByRole("status");
    expect(within(notice).getByText("登录状态待确认")).toBeInTheDocument();
    expect(
      within(notice).getByRole("button", { name: "重新登录" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重试" })).toBeNull();
    act(() => useAuthStore.setState({ permissionModelIncompatible: true }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(
      screen.getByText(ADMIN_PERMISSION_UPGRADE_MESSAGE)
    ).toBeInTheDocument();
  });

  it("后台其他页面保留全局连接提示与原重试入口", () => {
    useAuthStore.setState({ connectionError: true });
    show();
    const notice = screen.getByRole("alert");
    expect(
      within(notice).getByText("连接暂时中断，联网后将自动恢复；当前内容已保留")
    ).toBeInTheDocument();
    fireEvent.click(within(notice).getByRole("button", { name: "重试连接" }));
    expect(sessionRestore.retry).toHaveBeenCalledTimes(1);
  });
});
