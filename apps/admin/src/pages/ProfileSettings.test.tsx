import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
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
  OpenCodeConnection: ({ adminId }: { adminId: string }) => (
    <div>OpenCode: {adminId}</div>
  )
}));

it("仅超级管理员在个人设置中看到 OpenCode，撤权后移除", () => {
  auth.profile = { id: "admin-1", role: "super_admin" };
  const view = render(<ProfileSettingsPage />);
  expect(screen.getByText("OpenCode: admin-1")).toBeInTheDocument();

  auth.profile = { id: "admin-1", role: "admin" };
  view.rerender(<ProfileSettingsPage />);
  expect(screen.queryByText("OpenCode: admin-1")).not.toBeInTheDocument();
  expect(screen.getByText("方言偏好")).toBeInTheDocument();
});
