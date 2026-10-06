import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { PhoneBindingGuard } from "./PhoneBindingGuard";
import { useUserStore } from "@/stores/user";

const replace = vi.fn();
let pathname = "/student/practice";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => pathname
}));
beforeEach(() => {
  replace.mockReset();
  pathname = "/student/practice";
  useUserStore.setState({ user: null, hydrated: false });
});
it("旧会话恢复后立即隐藏业务，绑定页可访问", async () => {
  const { rerender } = render(
    <PhoneBindingGuard>
      <p>业务页面</p>
    </PhoneBindingGuard>
  );
  act(() =>
    useUserStore.setState({
      user: {
        id: "u1",
        email: "only@example.com",
        display_name: "同学",
        roles: ["student"],
        active_role: "student",
        avatar_url: ""
      },
      hydrated: true,
      onboarded: true
    })
  );
  expect(screen.queryByText("业务页面")).not.toBeInTheDocument();
  await waitFor(() =>
    expect(replace).toHaveBeenCalledWith(
      "/bind-phone?redirect=%2Fstudent%2Fpractice"
    )
  );
  pathname = "/bind-phone";
  rerender(
    <PhoneBindingGuard>
      <p>补绑表单</p>
    </PhoneBindingGuard>
  );
  expect(screen.getByText("补绑表单")).toBeVisible();
});
it("游客公开页面仍可渲染", () => {
  useUserStore.setState({ user: null, hydrated: true });
  render(
    <PhoneBindingGuard>
      <p>公开页面</p>
    </PhoneBindingGuard>
  );
  expect(screen.getByText("公开页面")).toBeVisible();
  expect(replace).not.toHaveBeenCalled();
});
