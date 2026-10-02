import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { AdminProfile } from "@tsz/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/lib/auth";
import { RootProviders } from "./providers";
import { ConsoleLayout } from "./layouts/ConsoleLayout";
import { WordCreatePage } from "./pages/WordCreate";

vi.mock("@/features/recovery/RecoverySession", () => ({
  RecoverySession: () => null
}));
vi.mock("@/features/auth/hooks/useAdminSessionRestore", () => ({
  useAdminSessionRestore: () => ({ retry: vi.fn(), retrying: false })
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
