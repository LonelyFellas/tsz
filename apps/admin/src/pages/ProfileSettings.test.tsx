import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { ProfileSettingsPage } from "./ProfileSettings";

const auth = vi.hoisted(() => ({
  profile: { id: "admin-1", role: "super_admin" }
}));
vi.mock("@/lib/auth", () => ({
  useAuthStore: (selector: (state: typeof auth) => unknown) => selector(auth)
}));
vi.mock("@/features/settings/DialectPreference", () => ({
  DialectPreference: () => <div>方言偏好</div>
}));
vi.mock("@/features/ai-ledger/OpenCodeConnection", () => ({
  OpenCodeConnection: () => <div>OpenCode 连接</div>
}));
vi.mock("@/features/ai-ledger/ChatGPTConnection", () => ({
  ChatGPTConnection: () => <div>ChatGPT 连接</div>
}));
vi.mock("@/features/ai-ledger/OpenCodeModels", () => ({
  OpenCodeModels: () => <div>模型选择</div>
}));
function Location() {
  const location = useLocation();
  return (
    <output aria-label="页面地址">
      {location.pathname}
      {location.search}
    </output>
  );
}
function page() {
  return (
    <>
      <ProfileSettingsPage />
      <Location />
    </>
  );
}
function mount(entry = "/settings/profile") {
  return render(<MemoryRouter initialEntries={[entry]}>{page()}</MemoryRouter>);
}
beforeEach(() => {
  auth.profile = { id: "admin-1", role: "super_admin" };
});

it("默认只加载偏好，账号和模型分组按需打开，地址保留当前分组", async () => {
  mount();
  expect(screen.getByText("方言偏好")).toBeVisible();
  expect(screen.queryByText("OpenCode 连接")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "模型账号" }));
  expect(await screen.findByText("ChatGPT 连接")).toBeVisible();
  expect(screen.getByText("OpenCode 连接")).toBeVisible();
  expect(screen.getByLabelText("页面地址")).toHaveTextContent(
    "?section=accounts"
  );
  fireEvent.click(screen.getByRole("tab", { name: "出题模型" }));
  expect(await screen.findByText("模型选择")).toBeVisible();
});

it("地址可直接打开模型组，普通管理员不能通过地址挂载模型管理", () => {
  const view = mount("/settings/profile?section=models");
  expect(screen.getByText("模型选择")).toBeVisible();
  auth.profile = { id: "admin-1", role: "admin" };
  view.rerender(
    <MemoryRouter initialEntries={["/settings/profile?section=models"]}>
      {page()}
    </MemoryRouter>
  );
  expect(screen.queryByText("模型选择")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("tab", { name: "模型账号" })
  ).not.toBeInTheDocument();
  expect(screen.getByText("方言偏好")).toBeVisible();
});

it("模型账号分组打开后撤权会移除账号管理", async () => {
  const view = mount("/settings/profile?section=accounts");
  expect(await screen.findByText("OpenCode 连接")).toBeVisible();
  auth.profile = { id: "admin-1", role: "admin" };
  view.rerender(<MemoryRouter>{page()}</MemoryRouter>);
  expect(screen.queryByText("OpenCode 连接")).not.toBeInTheDocument();
  expect(screen.queryByText("ChatGPT 连接")).not.toBeInTheDocument();
});

it("修改密码使用现有页面，未知分组回到偏好", () => {
  mount("/settings/profile?section=unknown");
  expect(screen.getByText("方言偏好")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "修改密码" }));
  expect(screen.getByLabelText("页面地址")).toHaveTextContent(
    "/change-password"
  );
});
