import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthResponse, MeResponse } from "@tsz/api-client";
import { GuestGuard } from "./GuestGuard";
import { LoginForm } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";
import { useUserStore } from "@/stores/user";

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  params: new URLSearchParams()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
  useSearchParams: () => navigation.params
}));

vi.mock("@/lib/request", () => ({
  setAccessToken: vi.fn(),
  scheduleRefresh: vi.fn(),
  api: {
    auth: {
      login: vi.fn(),
      loginWithCode: vi.fn(),
      register: vi.fn(),
      me: vi.fn()
    }
  }
}));

import { api } from "@/lib/request";

const AUTH: AuthResponse = {
  user: {
    id: "u1",
    phone: "13800138000",
    display_name: "同学",
    roles: ["student"],
    active_role: "student",
    avatar_url: ""
  },
  access_token: "access-token",
  expires_in: 900,
  refresh_token_expires_at: 9_999_999_999
};

function me(onboarded = true): MeResponse {
  return {
    user: AUTH.user,
    active_role: "student",
    learning_settings: null,
    onboarded
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function submit(mode: "password" | "phone" | "register") {
  render(
    <GuestGuard>
      {mode === "register" ? <RegisterForm /> : <LoginForm />}
    </GuestGuard>
  );
  if (mode === "phone") fireEvent.click(screen.getByText("手机验证"));
  fireEvent.change(
    screen.getByPlaceholderText(
      mode === "password" ? "请输入手机号/邮箱号码" : "请输入手机号"
    ),
    { target: { value: "13800138000" } }
  );
  if (mode !== "phone") {
    fireEvent.change(screen.getByPlaceholderText("请输入登录密码"), {
      target: { value: "abc12345678" }
    });
  }
  if (mode !== "password") {
    fireEvent.change(screen.getByPlaceholderText("请输入验证码"), {
      target: { value: "123456" }
    });
  }
  fireEvent.click(
    screen.getByRole("button", {
      name: mode === "register" ? "立即注册" : "立即登录"
    })
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  navigation.params = new URLSearchParams();
  useUserStore.setState({
    user: null,
    activeRole: null,
    onboarded: null,
    hydrated: true
  });
  vi.mocked(api.auth.login).mockResolvedValue(AUTH);
  vi.mocked(api.auth.loginWithCode).mockResolvedValue(AUTH);
  vi.mocked(api.auth.register).mockResolvedValue(AUTH);
  vi.mocked(api.auth.me).mockResolvedValue(me());
});

describe("认证表单与访客守卫的导航装配", () => {
  it.each(["password", "phone", "register"] as const)(
    "%s：资料未返回不跳转，完成后只去一次目标页",
    async (mode) => {
      const pending = deferred<MeResponse>();
      vi.mocked(api.auth.me).mockReturnValue(pending.promise);
      const target =
        mode === "register" ? "/" : "/student/practice?unit=2#words";
      if (mode !== "register") navigation.params.set("redirect", target);
      submit(mode);

      await waitFor(() => expect(api.auth.me).toHaveBeenCalledTimes(1));
      expect(navigation.replace).not.toHaveBeenCalled();
      expect(navigation.push).not.toHaveBeenCalled();
      expect(useUserStore.getState().user).toBeNull();
      expect(
        screen.getByText(mode === "register" ? "加载中..." : "登录中...")
      ).toBeVisible();

      await act(async () => pending.resolve(me()));
      await waitFor(() =>
        expect(navigation.replace).toHaveBeenCalledWith(target)
      );
      expect(navigation.replace).toHaveBeenCalledTimes(1);
      expect(navigation.push).not.toHaveBeenCalled();
      expect(useUserStore.getState()).toMatchObject({
        user: AUTH.user,
        onboarded: true,
        hydrated: true
      });
    }
  );

  it.each(["password", "register"] as const)(
    "%s：新用户只进入引导页，不先跳首页",
    async (mode) => {
      navigation.params.set("redirect", "/student/practice");
      vi.mocked(api.auth.me).mockResolvedValue(me(false));
      submit(mode);
      await waitFor(() =>
        expect(navigation.replace).toHaveBeenCalledWith("/onboarding")
      );
      expect(navigation.replace).toHaveBeenCalledTimes(1);
      expect(navigation.push).not.toHaveBeenCalled();
    }
  );

  it.each(["password", "phone", "register"] as const)(
    "%s：认证成功后资料失败，只重试资料、不重复消费凭证或注册",
    async (mode) => {
      vi.mocked(api.auth.me)
        .mockRejectedValueOnce(new Error("unavailable"))
        .mockRejectedValueOnce(new Error("unavailable"));
      submit(mode);
      const message = `${mode === "register" ? "注册" : "登录"}成功，但加载账号信息失败，请重试`;
      expect(await screen.findByText(message)).toBeVisible();
      expect(navigation.replace).not.toHaveBeenCalled();
      expect(useUserStore.getState().user).toBeNull();
      expect(
        screen.getByPlaceholderText(
          mode === "password" ? "请输入手机号/邮箱号码" : "请输入手机号"
        )
      ).toBeDisabled();

      fireEvent.click(screen.getByRole("button", { name: "重试加载" }));
      await waitFor(() => expect(api.auth.me).toHaveBeenCalledTimes(2));
      expect(await screen.findByText(message)).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "重试加载" }));
      await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/"));
      expect(api.auth.me).toHaveBeenCalledTimes(3);
      expect(api.auth.register).toHaveBeenCalledTimes(
        mode === "register" ? 1 : 0
      );
      expect(api.auth.loginWithCode).toHaveBeenCalledTimes(
        mode === "phone" ? 1 : 0
      );
      expect(api.auth.login).toHaveBeenCalledTimes(mode === "password" ? 1 : 0);
      expect(navigation.replace).toHaveBeenCalledTimes(1);
      expect(navigation.push).not.toHaveBeenCalled();
    }
  );

  it.each([
    "https://outside.example/",
    "//outside.example/",
    "javascript:void(0)"
  ])("登录不把危险回跳 %s 传给路由", async (redirect) => {
    navigation.params.set("redirect", redirect);
    submit("password");
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/"));
    expect(navigation.replace).toHaveBeenCalledTimes(1);
    expect(navigation.push).not.toHaveBeenCalled();
  });
});
