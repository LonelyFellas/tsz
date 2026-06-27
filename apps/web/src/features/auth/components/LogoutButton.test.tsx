import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LogoutButton } from "./LogoutButton";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush })
}));

vi.mock("@/lib/request", () => ({
  setAccessToken: vi.fn(),
  api: { auth: { logout: vi.fn().mockResolvedValue(undefined) } }
}));

import { api, setAccessToken } from "@/lib/request";

beforeEach(() => {
  vi.clearAllMocks();
  mockPush.mockReset();
});

describe("LogoutButton", () => {
  it("点击 → 调后端登出、清 token、跳登录页", async () => {
    const user = userEvent.setup();
    render(<LogoutButton />);

    await user.click(screen.getByRole("button", { name: "退出登录" }));

    await waitFor(() => {
      expect(api.auth.logout).toHaveBeenCalled();
      expect(setAccessToken).toHaveBeenCalledWith(null);
      expect(mockPush).toHaveBeenCalledWith("/login");
    });
  });

  it("后端登出失败也清本地态并跳转", async () => {
    vi.mocked(api.auth.logout).mockRejectedValueOnce(new Error("network"));
    const user = userEvent.setup();
    render(<LogoutButton />);

    await user.click(screen.getByRole("button", { name: "退出登录" }));

    await waitFor(() => {
      expect(setAccessToken).toHaveBeenCalledWith(null);
      expect(mockPush).toHaveBeenCalledWith("/login");
    });
  });
});
