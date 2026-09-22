import { act, render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AdminProfile } from "@tsz/api-client";
import { snapshotKey, writeSnapshot } from "@tsz/shared/recovery";
vi.mock("@/lib/auth", async () => {
  const { createAdminAuthStore } = await import("@tsz/shared/auth");
  return {
    useAuthStore: createAdminAuthStore(),
    tokens: {
      refreshTokens: vi
        .fn()
        .mockRejectedValue(new TypeError("network unavailable")),
      setAccessToken: vi.fn()
    },
    api: {
      profile: vi.fn(),
      auth: { logout: vi.fn().mockRejectedValue(new Error("offline")) }
    }
  };
});
import { useAuthStore } from "@/lib/auth";
import { useAdminSessionRestore } from "@/features/auth/hooks/useAdminSessionRestore";
import { useAdminLogout } from "@/features/auth/useAdminLogout";
import { RecoverySession } from "./RecoverySession";
const profile: AdminProfile = {
  id: "editor",
  phone: "13800138000",
  display_name: "编辑员",
  role: "admin",
  can_publish_lexicon: true,
  permissions: [],
  preferences: { dialect: "uk" }
};
const key = snapshotKey(profile.id, "word:1");
const originalLocation = window.location;
beforeEach(() => {
  sessionStorage.clear();
  writeSnapshot(key, 1, "未保存输入", sessionStorage);
  useAuthStore.setState({ profile: null, role: null, hydrated: false });
});
afterEach(() =>
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: originalLocation
  })
);
function RestoreSession() {
  useAdminSessionRestore();
  return <RecoverySession />;
}
it("retains drafts after a failed session restore and a subsequent login by the same account", async () => {
  render(<RestoreSession />);
  await waitFor(() => expect(useAuthStore.getState().hydrated).toBe(true));
  expect(sessionStorage.getItem(key)).toContain("未保存输入");
  act(() => useAuthStore.getState().setProfile(profile));
  expect(sessionStorage.getItem(key)).toContain("未保存输入");
  act(() =>
    useAuthStore.getState().setProfile({ ...profile, id: "different-editor" })
  );
  expect(sessionStorage.getItem(key)).toBeNull();
});
it("clears drafts on explicit logout even when revoking the server session fails", async () => {
  useAuthStore.setState({ profile, hydrated: true });
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { replace: vi.fn() }
  });
  const { result } = renderHook(useAdminLogout);
  await act(() => result.current());
  expect(sessionStorage.getItem(key)).toBeNull();
  expect(window.location.replace).toHaveBeenCalledWith("/login");
});
