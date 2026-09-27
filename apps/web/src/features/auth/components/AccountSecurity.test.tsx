import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@tsz/api-client";
import type { User } from "@tsz/types";
import { AccountSecurity } from "./AccountSecurity";

vi.mock("@/lib/request", () => ({
  clearSession: vi.fn(),
  api: {
    auth: {
      me: vi.fn(),
      requestContactVerificationCode: vi.fn(),
      requestContactBindCode: vi.fn(),
      bindContact: vi.fn(),
      unbindContact: vi.fn(),
      changePassword: vi.fn()
    }
  }
}));

import { api, clearSession } from "@/lib/request";
const auth = vi.mocked(api.auth);
const replace = vi.fn();
const originalLocation = window.location;
const PHONE = "13899997777";
const EMAIL = "alice@example.com";

function seed(overrides: Partial<User> = {}) {
  const user: User = {
    id: "u1",
    phone: PHONE,
    display_name: "Alice",
    avatar_url: "",
    roles: ["student"],
    active_role: "student",
    ...overrides
  };
  auth.me.mockResolvedValue({
    user,
    active_role: "student",
    onboarded: true,
    learning_settings: null
  });
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

async function open(name: string) {
  render(<AccountSecurity />);
  fireEvent.click(await screen.findByRole("button", { name }));
}

function fillBind(email = "new@example.com") {
  fill("新邮箱", email);
  fill("原联系方式验证码", "123456");
  fill("新联系方式验证码", "654321");
}

beforeEach(() => {
  vi.resetAllMocks();
  seed();
  auth.requestContactVerificationCode.mockResolvedValue(undefined);
  auth.requestContactBindCode.mockResolvedValue(undefined);
  auth.bindContact.mockResolvedValue(undefined);
  auth.unbindContact.mockResolvedValue(undefined);
  auth.changePassword.mockResolvedValue(undefined);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { replace }
  });
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation
  });
});

describe("AccountSecurity", () => {
  it("新目标和验证渠道各自重置倒计时，不重置未变化的收件人", async () => {
    seed({ email: EMAIL });
    await open("换绑邮箱");
    fill("新邮箱", "first@example.com");
    fireEvent.click(screen.getByRole("button", { name: "验证原渠道" }));
    await waitFor(() => expect(screen.getByLabelText("新邮箱")).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "验证新渠道" }));
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /后重发/ })).toHaveLength(2)
    );
    fill("新邮箱", "FIRST@example.com");
    expect(screen.getAllByRole("button", { name: /后重发/ })).toHaveLength(2);
    fill("新邮箱", "second@example.com");
    expect(screen.getByRole("button", { name: "验证新渠道" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /后重发/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "验证新渠道" }));
    await waitFor(() =>
      expect(auth.requestContactBindCode).toHaveBeenLastCalledWith(
        "second@example.com"
      )
    );
    await waitFor(() =>
      expect(screen.getByLabelText("身份验证渠道")).toBeEnabled()
    );
    fill("身份验证渠道", "email");
    expect(screen.getByRole("button", { name: "验证原渠道" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "验证原渠道" }));
    await waitFor(() =>
      expect(auth.requestContactVerificationCode).toHaveBeenLastCalledWith({
        operation: "bind",
        contact: "second@example.com",
        verification_channel: "email"
      })
    );
  });

  it.each([
    { contact: { phone: PHONE }, binding: "绑定邮箱", unlink: "解绑手机号" },
    {
      contact: { phone: undefined, email: EMAIL },
      binding: "绑定手机号",
      unlink: "解绑邮箱"
    }
  ])(
    "单渠道账号禁止解绑最后一种登录方式：$unlink",
    async ({ contact, binding, unlink }) => {
      seed(contact);
      render(<AccountSecurity />);
      expect(
        await screen.findByRole("button", { name: binding })
      ).toBeEnabled();
      expect(screen.getByRole("button", { name: unlink })).toBeDisabled();
      expect(screen.getByText(/至少保留一种登录方式/)).toBeInTheDocument();
      expect(auth.unbindContact).not.toHaveBeenCalled();
    }
  );

  it("双渠道账号分别提供换绑和解绑入口", async () => {
    seed({ email: EMAIL });
    render(<AccountSecurity />);
    for (const name of ["换绑手机号", "换绑邮箱", "解绑手机号", "解绑邮箱"]) {
      expect(await screen.findByRole("button", { name })).toBeEnabled();
    }
    fireEvent.click(screen.getByRole("button", { name: "换绑手机号" }));
    expect(screen.getByLabelText("新手机号")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    fireEvent.click(screen.getByRole("button", { name: "换绑邮箱" }));
    expect(screen.getByLabelText("新邮箱")).toBeInTheDocument();
  });

  it("绑定规范化新邮箱，原/新渠道使用不同发码请求", async () => {
    await open("绑定邮箱");
    fill("新邮箱", "New@EXAMPLE.com");
    fireEvent.click(screen.getByRole("button", { name: "验证原渠道" }));
    await waitFor(() =>
      expect(auth.requestContactVerificationCode).toHaveBeenCalledWith({
        operation: "bind",
        contact: "new@example.com",
        verification_channel: "phone"
      })
    );
    await waitFor(() => expect(screen.getByLabelText("新邮箱")).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "验证新渠道" }));
    await waitFor(() =>
      expect(auth.requestContactBindCode).toHaveBeenCalledWith(
        "new@example.com"
      )
    );
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /后重发/ })).toHaveLength(2)
    );
  });

  it("非法目标、只一组验证码或非六位码不能提交，直接submit也被拒绝", async () => {
    await open("绑定邮箱");
    fillBind("bad");
    const submit = screen.getByRole("button", { name: "确认绑定邮箱" });
    expect(submit).toBeDisabled();
    fill("新邮箱", "new@example.com");
    fill("原联系方式验证码", "123456");
    expect(submit).toBeDisabled();
    fill("新联系方式验证码", "12345");
    expect(submit).toBeDisabled();
    fireEvent.submit(submit.closest("form")!);
    expect(auth.bindContact).not.toHaveBeenCalled();
    fill("新联系方式验证码", "123456");
    expect(submit).toBeEnabled();
  });

  it("修改目标清两组码，修改验证渠道清旧码", async () => {
    seed({ email: EMAIL });
    await open("换绑邮箱");
    fillBind();
    fill("新邮箱", "other@example.com");
    expect(screen.getByLabelText("原联系方式验证码")).toHaveValue("");
    expect(screen.getByLabelText("新联系方式验证码")).toHaveValue("");
    fill("原联系方式验证码", "123456");
    fill("新联系方式验证码", "654321");
    fill("身份验证渠道", "email");
    expect(screen.getByLabelText("原联系方式验证码")).toHaveValue("");
    expect(screen.getByRole("button", { name: "确认换绑邮箱" })).toBeDisabled();
  });

  it("绑定成功带双码，清会话并整页跳登录", async () => {
    await open("绑定邮箱");
    fillBind("New@EXAMPLE.com");
    fireEvent.click(screen.getByRole("button", { name: "确认绑定邮箱" }));
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/login?security=success")
    );
    expect(auth.bindContact).toHaveBeenCalledWith({
      contact: "new@example.com",
      code: "654321",
      verification_channel: "phone",
      verification_code: "123456"
    });
    expect(clearSession).toHaveBeenCalledTimes(1);
  });

  it("解绑允许使用另一在档渠道，发码绑定被解绑的实际联系方式", async () => {
    seed({ email: EMAIL });
    await open("解绑手机号");
    fill("身份验证渠道", "email");
    fireEvent.click(screen.getByRole("button", { name: "验证原渠道" }));
    await waitFor(() =>
      expect(auth.requestContactVerificationCode).toHaveBeenCalledWith({
        operation: "unbind",
        contact: PHONE,
        verification_channel: "email"
      })
    );
    await waitFor(() =>
      expect(screen.getByLabelText("原联系方式验证码")).toBeEnabled()
    );
    fill("原联系方式验证码", "123456");
    expect(screen.queryByLabelText("新联系方式验证码")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认解绑手机号" }));
    await waitFor(() =>
      expect(auth.unbindContact).toHaveBeenCalledWith({
        channel: "phone",
        verification_channel: "email",
        verification_code: "123456"
      })
    );
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/login?security=success")
    );
  });

  it("提交在途禁止修改、取消与再次提交", async () => {
    let resolve!: () => void;
    auth.bindContact.mockReturnValueOnce(
      new Promise<void>((r) => {
        resolve = r;
      })
    );
    await open("绑定邮箱");
    fillBind();
    const submit = screen.getByRole("button", { name: "确认绑定邮箱" });
    fireEvent.click(submit);
    fireEvent.submit(submit.closest("form")!);
    expect(auth.bindContact).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("新邮箱")).toBeDisabled();
    expect(screen.getByLabelText("身份验证渠道")).toBeDisabled();
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
    await act(async () => {
      resolve();
    });
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("发码在途不能提交或切换目标", async () => {
    let resolve!: () => void;
    auth.requestContactBindCode.mockReturnValueOnce(
      new Promise<void>((r) => {
        resolve = r;
      })
    );
    await open("绑定邮箱");
    fillBind();
    fireEvent.click(screen.getByRole("button", { name: "验证新渠道" }));
    fireEvent.submit(
      screen.getByRole("button", { name: "确认绑定邮箱" }).closest("form")!
    );
    expect(auth.bindContact).not.toHaveBeenCalled();
    expect(screen.getByLabelText("新邮箱")).toBeDisabled();
    await act(async () => {
      resolve();
    });
    expect(screen.getByLabelText("新联系方式验证码")).toHaveValue("");
  });

  it("验证码错误清两组码并允许重试，但不清会话", async () => {
    auth.bindContact.mockRejectedValueOnce(
      new HttpError(401, "changed", [], "invalid_otp_code")
    );
    await open("绑定邮箱");
    fillBind();
    fireEvent.click(screen.getByRole("button", { name: "确认绑定邮箱" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "验证码错误或已失效"
    );
    expect(screen.getByLabelText("原联系方式验证码")).toHaveValue("");
    expect(screen.getByLabelText("新联系方式验证码")).toHaveValue("");
    expect(screen.getByLabelText("新邮箱")).toBeEnabled();
    expect(clearSession).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("会话失效与业务验证码错误区分处理", async () => {
    auth.bindContact.mockRejectedValueOnce(
      new HttpError(401, "expired", [], "invalid_token")
    );
    await open("绑定邮箱");
    fillBind();
    fireEvent.click(screen.getByRole("button", { name: "确认绑定邮箱" }));
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/login?session=expired")
    );
    expect(clearSession).toHaveBeenCalledTimes(1);
  });

  it("新密码需确认一致，当前密码原串提交，成功退出", async () => {
    await open("修改密码");
    fill("当前密码", "RawCase!234");
    fill("新密码", "NewPassword123");
    fill("确认新密码", "WrongPassword123");
    expect(screen.getByRole("button", { name: "确认修改密码" })).toBeDisabled();
    fill("确认新密码", "NewPassword123");
    fireEvent.click(screen.getByRole("button", { name: "确认修改密码" }));
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/login?security=success")
    );
    expect(auth.changePassword).toHaveBeenCalledWith({
      current_password: "RawCase!234",
      new_password: "NewPassword123"
    });
    expect(clearSession).toHaveBeenCalledTimes(1);
  });

  it("当前密码错误保留会话，允许再次修改", async () => {
    auth.changePassword.mockRejectedValueOnce(
      new HttpError(401, "changed", [], "invalid_credentials")
    );
    await open("修改密码");
    fill("当前密码", "wrong");
    fill("新密码", "NewPassword123");
    fill("确认新密码", "NewPassword123");
    fireEvent.click(screen.getByRole("button", { name: "确认修改密码" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("当前密码错误");
    expect(screen.getByLabelText("当前密码")).toBeEnabled();
    expect(clearSession).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("加载失败可重试，不用过期用户资料操作", async () => {
    auth.me.mockRejectedValueOnce(new Error("network"));
    render(<AccountSecurity />);
    expect(await screen.findByRole("alert")).toHaveTextContent("资料加载失败");
    expect(
      screen.queryByRole("button", { name: "修改密码" })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
    expect(
      await screen.findByRole("button", { name: "修改密码" })
    ).toBeEnabled();
    expect(auth.me).toHaveBeenCalledTimes(2);
  });
});
