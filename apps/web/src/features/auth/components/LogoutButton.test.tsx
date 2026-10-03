import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LogoutButton } from "./LogoutButton";

const mockAssign = vi.fn();

vi.mock("@/lib/request", () => ({
  clearSession: vi.fn(),
  api: { auth: { logout: vi.fn().mockResolvedValue(undefined) } }
}));

import { api, clearSession } from "@/lib/request";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "window",
    new Proxy(window, {
      get(target, key) {
        return key === "location"
          ? { ...target.location, assign: mockAssign }
          : Reflect.get(target, key, target);
      }
    })
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("LogoutButton", () => {
  it("点击 → 调后端登出、清 token、跳登录页", async () => {
    const user = userEvent.setup();
    render(<LogoutButton />);

    await user.click(screen.getByRole("button", { name: "退出登录" }));

    await waitFor(() => {
      expect(api.auth.logout).toHaveBeenCalled();
      expect(clearSession).toHaveBeenCalledTimes(1);
      expect(mockAssign).toHaveBeenCalledWith("/login");
    });
  });

  it("后端登出失败也清本地态并跳转", async () => {
    vi.mocked(api.auth.logout).mockRejectedValueOnce(new Error("network"));
    const user = userEvent.setup();
    render(<LogoutButton />);

    await user.click(screen.getByRole("button", { name: "退出登录" }));

    await waitFor(() => {
      expect(clearSession).toHaveBeenCalledTimes(1);
      expect(mockAssign).toHaveBeenCalledWith("/login");
    });
  });
});
