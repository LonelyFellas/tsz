import { expect, it, vi } from "vitest";
vi.mock("@/i18n/server", () => ({ getServerWebText: vi.fn() }));
vi.mock("@/features/auth/components/RegisterForm", () => ({
  RegisterForm: () => null
}));
import RegisterPage from "./page";
it("normalizes repeated invite query parameters to one visible editable value", async () => {
  const result = await RegisterPage({
    searchParams: Promise.resolve({
      invite: ["0123456789ABCDEF", "FEDCBA9876543210"]
    })
  });
  expect(result.props.initialInviteCode).toBe("0123456789ABCDEF");
});
