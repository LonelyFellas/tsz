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

it.each([
  "/account/coins",
  "/account/invitations",
  "/account/wordlists",
  "/wordlists/new",
  "/wordlists/public-id",
  "/account/wordlist-tips"
])(
  "unbound restored sessions do not mount business content at %s",
  async (path) => {
    pathname = path;
    useUserStore.setState({
      hydrated: true,
      onboarded: false,
      user: {
        id: "email-user",
        email: "only@example.com",
        display_name: "同学",
        avatar_url: "",
        roles: ["student"],
        active_role: "student"
      }
    });
    const mounted = vi.fn();
    function Business() {
      mounted();
      return <p>私有业务</p>;
    }
    render(
      <PhoneBindingGuard>
        <Business />
      </PhoneBindingGuard>
    );
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        `/bind-phone?redirect=${encodeURIComponent(path)}`
      )
    );
    expect(mounted).not.toHaveBeenCalled();
  }
);
it("unbound users retain the deletion recovery route", () => {
  pathname = "/account/delete";
  useUserStore.setState({
    hydrated: true,
    user: {
      id: "email-user",
      email: "only@example.com",
      display_name: "同学",
      avatar_url: "",
      roles: ["student"],
      active_role: "student"
    }
  });
  render(
    <PhoneBindingGuard>
      <p>注销申请及撤销</p>
    </PhoneBindingGuard>
  );
  expect(screen.getByText("注销申请及撤销")).toBeVisible();
  expect(replace).not.toHaveBeenCalled();
});
