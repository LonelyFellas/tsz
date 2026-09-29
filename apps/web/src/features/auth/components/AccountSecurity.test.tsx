import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";
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
const originalScrollIntoView = Element.prototype.scrollIntoView;

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterAll(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView;
});

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
  fill("手机号验证码", "123456");
  fill("新邮箱验证码", "654321");
}

async function chooseVerificationEmail() {
  const trigger = screen.getByRole("combobox", { name: "当前账号的验证方式" });
  fireEvent.click(trigger);
  fireEvent.click(
    await screen.findByRole("option", { name: `邮箱：${EMAIL}` })
  );
  await waitFor(() => expect(trigger).toHaveTextContent(EMAIL));
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
  it("操作视图使用独立标题并能返回账号安全总览", async () => {
    render(<AccountSecurity />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "账号安全" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "绑定邮箱" }));
    expect(
      screen.getByRole("heading", { level: 1, name: "绑定邮箱" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "返回个人中心" })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "← 返回账号安全" }));
    expect(
      screen.getByRole("heading", { level: 1, name: "账号安全" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "修改密码" }));
    expect(
      screen.getByRole("heading", { level: 1, name: "修改密码" })
    ).toBeInTheDocument();
  });

  it("新目标和验证渠道各自重置倒计时，不重置未变化的收件人", async () => {
    seed({ email: EMAIL });
    await open("换绑邮箱");
    fill("新邮箱", "first@example.com");
    fireEvent.click(
      screen.getByRole("button", { name: "向已绑定手机号发送验证码" })
    );
    await waitFor(() => expect(screen.getByLabelText("新邮箱")).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "向新邮箱发送验证码" }));
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /后重发/ })).toHaveLength(2)
    );
    fill("新邮箱", "FIRST@example.com");
    expect(screen.getAllByRole("button", { name: /后重发/ })).toHaveLength(2);
    fill("新邮箱", "second@example.com");
    expect(
      screen.getByRole("button", { name: "向新邮箱发送验证码" })
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: /后重发/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "向新邮箱发送验证码" }));
    await waitFor(() =>
      expect(auth.requestContactBindCode).toHaveBeenLastCalledWith(
        "second@example.com"
      )
    );
    await waitFor(() =>
      expect(screen.getByLabelText("当前账号的验证方式")).toBeEnabled()
    );
    await chooseVerificationEmail();
    expect(screen.getByLabelText("邮箱验证码")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "向已绑定邮箱发送验证码" })
    ).toBeEnabled();
    fireEvent.click(
      screen.getByRole("button", { name: "向已绑定邮箱发送验证码" })
    );
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

  it("仅有一种已绑定方式时不显示下拉选择", async () => {
    await open("绑定邮箱");
    expect(
      screen.queryByRole("combobox", { name: "当前账号的验证方式" })
    ).not.toBeInTheDocument();
    expect(screen.getByText(`手机号：${PHONE}`)).toHaveClass(
      "rounded-full",
      "border-border",
      "bg-surface"
    );
  });

  it("双渠道账号分别提供换绑和解绑入口", async () => {
    seed({ email: EMAIL });
    render(<AccountSecurity />);
    for (const name of ["换绑手机号", "换绑邮箱", "解绑手机号", "解绑邮箱"]) {
      expect(await screen.findByRole("button", { name })).toBeEnabled();
    }
    expect(
      screen.getByRole("button", { name: "换绑手机号" })
    ).toHaveTextContent(/^换绑$/);
    expect(
      screen.getByRole("button", { name: "解绑手机号" })
    ).toHaveTextContent(/^解绑$/);
    fireEvent.click(screen.getByRole("button", { name: "换绑手机号" }));
    expect(screen.getByLabelText("新手机号")).toBeInTheDocument();
    expect(screen.getByLabelText("新手机号验证码")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    fireEvent.click(screen.getByRole("button", { name: "换绑邮箱" }));
    expect(screen.getByLabelText("新邮箱")).toBeInTheDocument();
    expect(screen.getByLabelText("新邮箱验证码")).toBeInTheDocument();
  });

  it("绑定规范化新邮箱，原/新渠道使用不同发码请求", async () => {
    await open("绑定邮箱");
    expect(screen.getAllByRole("button", { name: /发送验证码/ })).toHaveLength(
      2
    );
    expect(
      screen.getByRole("button", { name: "向已绑定手机号发送验证码" })
    ).toHaveTextContent(/^验证$/);
    expect(
      screen.getByRole("button", { name: "向新邮箱发送验证码" })
    ).toHaveTextContent(/^验证$/);
    fill("新邮箱", "New@EXAMPLE.com");
    fireEvent.click(
      screen.getByRole("button", { name: "向已绑定手机号发送验证码" })
    );
    await waitFor(() =>
      expect(auth.requestContactVerificationCode).toHaveBeenCalledWith({
        operation: "bind",
        contact: "new@example.com",
        verification_channel: "phone"
      })
    );
    await waitFor(() => expect(screen.getByLabelText("新邮箱")).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "向新邮箱发送验证码" }));
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
    fill("手机号验证码", "123456");
    expect(submit).toBeDisabled();
    fill("新邮箱验证码", "12345");
    expect(submit).toBeDisabled();
    fireEvent.submit(submit.closest("form")!);
    expect(auth.bindContact).not.toHaveBeenCalled();
    fill("新邮箱验证码", "123456");
    expect(submit).toBeEnabled();
  });

  it("修改目标清两组码，修改验证渠道清旧码", async () => {
    seed({ email: EMAIL });
    await open("换绑邮箱");
    fillBind();
    fill("新邮箱", "other@example.com");
    expect(screen.getByLabelText("手机号验证码")).toHaveValue("");
    expect(screen.getByLabelText("新邮箱验证码")).toHaveValue("");
    fill("手机号验证码", "123456");
    fill("新邮箱验证码", "654321");
    await chooseVerificationEmail();
    expect(screen.getByLabelText("邮箱验证码")).toHaveValue("");
    expect(screen.getByRole("button", { name: "确认换绑邮箱" })).toBeDisabled();
  });

  it.each(["绑定邮箱", "换绑邮箱"])(
    "%s成功带双码，清会话并整页跳登录",
    async (name) => {
      if (name === "换绑邮箱") seed({ email: EMAIL });
      await open(name);
      fillBind("New@EXAMPLE.com");
      fireEvent.click(screen.getByRole("button", { name: `确认${name}` }));
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
    }
  );

  it("解绑允许使用另一在档渠道，发码绑定被解绑的实际联系方式", async () => {
    seed({ email: EMAIL });
    await open("解绑手机号");
    await chooseVerificationEmail();
    fireEvent.click(
      screen.getByRole("button", { name: "向已绑定邮箱发送验证码" })
    );
    await waitFor(() =>
      expect(auth.requestContactVerificationCode).toHaveBeenCalledWith({
        operation: "unbind",
        contact: PHONE,
        verification_channel: "email"
      })
    );
    await waitFor(() =>
      expect(screen.getByLabelText("邮箱验证码")).toBeEnabled()
    );
    fill("邮箱验证码", "123456");
    expect(screen.queryByLabelText("新邮箱验证码")).not.toBeInTheDocument();
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
    seed({ email: EMAIL });
    await open("换绑邮箱");
    fillBind();
    const submit = screen.getByRole("button", { name: "确认换绑邮箱" });
    fireEvent.click(submit);
    fireEvent.submit(submit.closest("form")!);
    expect(auth.bindContact).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("新邮箱")).toBeDisabled();
    expect(
      screen.getByRole("combobox", { name: "当前账号的验证方式" })
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "← 返回账号安全" })
    ).toBeDisabled();
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
    fireEvent.click(screen.getByRole("button", { name: "向新邮箱发送验证码" }));
    fireEvent.submit(
      screen.getByRole("button", { name: "确认绑定邮箱" }).closest("form")!
    );
    expect(auth.bindContact).not.toHaveBeenCalled();
    expect(screen.getByLabelText("新邮箱")).toBeDisabled();
    await act(async () => {
      resolve();
    });
    expect(screen.getByLabelText("新邮箱验证码")).toHaveValue("");
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
    expect(screen.getByLabelText("手机号验证码")).toHaveValue("");
    expect(screen.getByLabelText("新邮箱验证码")).toHaveValue("");
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

  it("修改密码的三个字段可分别切换显隐", async () => {
    await open("修改密码");
    const current = screen.getByLabelText("当前密码");
    const next = screen.getByLabelText("新密码");
    const confirm = screen.getByLabelText("确认新密码");
    expect(current).toHaveAttribute("type", "password");
    expect(next).toHaveAttribute("type", "password");
    expect(confirm).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "显示当前密码" }));
    expect(current).toHaveAttribute("type", "text");
    expect(next).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "显示新密码" }));
    expect(next).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("button", { name: "显示确认新密码" }));
    expect(confirm).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("button", { name: "隐藏当前密码" }));
    expect(current).toHaveAttribute("type", "password");
    expect(confirm).toHaveAttribute("type", "text");
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

  it.each([
    ["向已绑定手机号发送验证码", "requestContactVerificationCode"],
    ["向新邮箱发送验证码", "requestContactBindCode"]
  ] as const)("%s 快速重复点击只发送一次请求", async (name, method) => {
    let resolve!: () => void;
    auth[method].mockReturnValueOnce(
      new Promise<void>((r) => {
        resolve = r;
      })
    );
    await open("绑定邮箱");
    fill("新邮箱", "new@example.com");
    const button = screen.getByRole("button", { name });
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(auth[method]).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    await act(async () => {
      resolve();
    });
    expect(auth[method]).toHaveBeenCalledTimes(1);
    expect(button).toHaveTextContent("60s 后重发");
    expect(button).toBeDisabled();
  });

  it("原渠道发码进行中时，新渠道按钮不可点击", async () => {
    let resolve!: () => void;
    auth.requestContactVerificationCode.mockReturnValueOnce(
      new Promise<void>((r) => {
        resolve = r;
      })
    );
    await open("绑定邮箱");
    fill("新邮箱", "new@example.com");
    fireEvent.click(
      screen.getByRole("button", { name: "向已绑定手机号发送验证码" })
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "向新邮箱发送验证码" })
      ).toBeDisabled()
    );
    fireEvent.click(screen.getByRole("button", { name: "向新邮箱发送验证码" }));
    expect(auth.requestContactBindCode).not.toHaveBeenCalled();
    await act(async () => {
      resolve();
    });
    expect(auth.requestContactBindCode).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "60s 后重发" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "向新邮箱发送验证码" })
    ).toBeEnabled();
  });

  it("新渠道发码进行中时，原渠道按钮不可点击", async () => {
    let resolve!: () => void;
    auth.requestContactBindCode.mockReturnValueOnce(
      new Promise<void>((r) => {
        resolve = r;
      })
    );
    await open("绑定邮箱");
    fill("新邮箱", "new@example.com");
    fireEvent.click(screen.getByRole("button", { name: "向新邮箱发送验证码" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "向已绑定手机号发送验证码" })
      ).toBeDisabled()
    );
    fireEvent.click(
      screen.getByRole("button", { name: "向已绑定手机号发送验证码" })
    );
    expect(auth.requestContactVerificationCode).not.toHaveBeenCalled();
    await act(async () => {
      resolve();
    });
    expect(auth.requestContactVerificationCode).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "60s 后重发" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "向已绑定手机号发送验证码" })
    ).toBeEnabled();
  });

  it.each([
    ["向已绑定手机号发送验证码", "requestContactVerificationCode"],
    ["向新邮箱发送验证码", "requestContactBindCode"]
  ] as const)("%s 请求失败后两个按钮恢复且可重试", async (name, method) => {
    let reject!: (error: Error) => void;
    auth[method].mockReturnValueOnce(
      new Promise<void>((_, r) => {
        reject = r;
      })
    );
    await open("绑定邮箱");
    fill("新邮箱", "new@example.com");
    fireEvent.click(screen.getByRole("button", { name }));
    expect(
      screen.getByRole("button", { name: "向已绑定手机号发送验证码" })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "向新邮箱发送验证码" })
    ).toBeDisabled();
    await act(async () => {
      reject(new HttpError(401, "changed", [], "invalid_otp_code"));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("验证码错误或已失效");
    expect(
      screen.getByRole("button", { name: "向已绑定手机号发送验证码" })
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "向新邮箱发送验证码" })
    ).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "60s 后重发" })).toBeDisabled()
    );
    expect(auth[method]).toHaveBeenCalledTimes(2);
  });
});
