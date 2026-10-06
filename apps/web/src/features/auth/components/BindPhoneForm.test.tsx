import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { BindPhoneForm } from "./BindPhoneForm";
import { useUserStore } from "@/stores/user";
import { api, clearSession } from "@/lib/request";
import { HttpError } from "@tsz/api-client";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams("redirect=%2Fstudent%2Fpractice")
}));
vi.mock("@/lib/request", () => ({
  clearSession: vi.fn(),
  api: {
    auth: {
      requestContactVerificationCode: vi.fn(),
      requestContactBindCode: vi.fn(),
      bindContact: vi.fn(),
      logout: vi.fn()
    }
  }
}));
const originalLocation = window.location;
const replace = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  useUserStore.setState({
    user: {
      id: "u1",
      email: "only@example.com",
      display_name: "同学",
      roles: ["student"],
      active_role: "student",
      avatar_url: ""
    },
    onboarded: false,
    hydrated: true
  });
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { replace }
  });
});
afterEach(() =>
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation
  })
);

it("补绑要求邮箱与手机号双码，无取消入口，成功清会话并整页回登录", async () => {
  render(<BindPhoneForm />);
  expect(
    screen.queryByRole("button", { name: "取消" })
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "退出登录" })).toBeEnabled();
  expect(screen.getByRole("link", { name: "注销账号" })).toHaveAttribute(
    "href",
    "/account/delete"
  );
  fireEvent.change(screen.getByLabelText("新手机号"), {
    target: { value: "13800138000" }
  });
  fireEvent.click(
    screen.getByRole("button", { name: "向已绑定邮箱发送验证码" })
  );
  await waitFor(() =>
    expect(api.auth.requestContactVerificationCode).toHaveBeenCalledWith({
      operation: "bind",
      contact: "13800138000",
      verification_channel: "email"
    })
  );
  await waitFor(() => expect(screen.getByLabelText("新手机号")).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "向新手机号发送验证码" }));
  await waitFor(() =>
    expect(api.auth.requestContactBindCode).toHaveBeenCalledWith("13800138000")
  );
  await waitFor(() => expect(screen.getByLabelText("新手机号")).toBeEnabled());
  fireEvent.change(screen.getByLabelText("邮箱验证码"), {
    target: { value: "123456" }
  });
  expect(screen.getByRole("button", { name: "确认绑定手机号" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("新手机号验证码"), {
    target: { value: "654321" }
  });
  fireEvent.click(screen.getByRole("button", { name: "确认绑定手机号" }));
  await waitFor(() =>
    expect(replace).toHaveBeenCalledWith(
      "/login?security=success&redirect=%2Fstudent%2Fpractice"
    )
  );
  expect(api.auth.bindContact).toHaveBeenCalledWith({
    contact: "13800138000",
    code: "654321",
    verification_channel: "email",
    verification_code: "123456"
  });
  expect(clearSession).toHaveBeenCalledTimes(1);
});

it("号码占用保留绑定页并清空已消费验证码，不错误退出", async () => {
  vi.mocked(api.auth.bindContact).mockRejectedValueOnce(
    new HttpError(409, "occupied", [], "user_already_exists")
  );
  render(<BindPhoneForm />);
  fireEvent.change(screen.getByLabelText("新手机号"), {
    target: { value: "13800138000" }
  });
  fireEvent.change(screen.getByLabelText("邮箱验证码"), {
    target: { value: "123456" }
  });
  fireEvent.change(screen.getByLabelText("新手机号验证码"), {
    target: { value: "654321" }
  });
  fireEvent.click(screen.getByRole("button", { name: "确认绑定手机号" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "该联系方式已被其他账号使用"
  );
  expect(screen.getByLabelText("邮箱验证码")).toHaveValue("");
  expect(screen.getByLabelText("新手机号验证码")).toHaveValue("");
  expect(clearSession).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
});

it("已绑定用户误入补绑页时继续原有引导", async () => {
  act(() =>
    useUserStore.setState({
      user: { ...useUserStore.getState().user!, phone: "13800138000" }
    })
  );
  render(<BindPhoneForm />);
  await waitFor(() =>
    expect(router.replace).toHaveBeenCalledWith(
      "/onboarding?redirect=%2Fstudent%2Fpractice"
    )
  );
  expect(
    screen.queryByRole("heading", { name: "绑定手机号" })
  ).not.toBeInTheDocument();
});

it("离开补绑页后的迟到响应不能清除后续会话或强制跳转", async () => {
  let done!: () => void;
  vi.mocked(api.auth.bindContact).mockReturnValueOnce(
    new Promise((resolve) => {
      done = resolve;
    })
  );
  const { unmount } = render(<BindPhoneForm />);
  fireEvent.change(screen.getByLabelText("新手机号"), {
    target: { value: "13800138000" }
  });
  fireEvent.change(screen.getByLabelText("邮箱验证码"), {
    target: { value: "123456" }
  });
  fireEvent.change(screen.getByLabelText("新手机号验证码"), {
    target: { value: "654321" }
  });
  fireEvent.click(screen.getByRole("button", { name: "确认绑定手机号" }));
  expect(api.auth.bindContact).toHaveBeenCalledTimes(1);
  unmount();
  await act(async () => done());
  expect(clearSession).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
});
