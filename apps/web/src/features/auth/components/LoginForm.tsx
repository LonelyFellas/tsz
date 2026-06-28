"use client";

import { isCode, isEmail, isPhone, isValidAccount } from "@tsz/shared";
import type { AuthResponse } from "@tsz/api-client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { AuthBranding } from "./AuthBranding";
import {
  AUTH_INPUT_CLASS,
  navigateAfterAuth,
  persistSession,
  translateAuthError
} from "../shared";

type Tab = "password" | "phone" | "email";

const LOGIN_ERRORS: Record<string, string> = {
  "invalid credentials": "账号或密码错误，请重新输入",
  "user not found": "该账号不存在"
};

// 验证码登录的错误文案，对齐后端 /auth/{send-code,login/code}（见 api.md）。
const CODE_ERRORS: Record<string, string> = {
  "invalid credentials": "验证码错误或已失效，请重新获取",
  "too many code requests, try again later": "验证码发送过于频繁，请稍后再试"
};

const CODE_COUNTDOWN = 60;

const TABS: { id: Tab; label: string }[] = [
  { id: "password", label: "账号密码" },
  { id: "email", label: "邮箱验证" },
  { id: "phone", label: "手机验证" }
];

export function LoginForm() {
  const [tab, setTab] = useState<Tab>("password");
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const setUser = useUserStore((s) => s.setUser);
  const router = useRouter();
  const searchParams = useSearchParams();

  // 验证码倒计时（与注册/找回密码一致）。
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const accountValid = isValidAccount(account);
  const passwordValid = password.length >= 6;
  const canSubmit = accountValid && passwordValid && !loading;

  // 验证码 tab：手机号 tab 校验手机号，邮箱 tab 校验邮箱。
  const identifierValid = tab === "phone" ? isPhone(account) : isEmail(account);
  const canSendCode = identifierValid && countdown === 0 && !sending;
  const canCodeSubmit = identifierValid && isCode(code) && !loading;

  // 从找回密码流程跳回时展示成功提示，引导用户用新密码登录。
  const resetSuccess = searchParams.get("reset") === "success";
  // 从注销账号流程跳回时展示成功提示。
  const deletedSuccess = searchParams.get("deleted") === "success";

  function switchTab(id: Tab) {
    setTab(id);
    setError("");
    setCode("");
  }

  // 登录 / 验证码登录成功后的统一收尾：存会话 → 写用户态 → 按 onboarding 跳转。
  async function onAuthSuccess(auth: AuthResponse) {
    persistSession(auth);
    setUser(auth.user);
    // 拉取 /me 判断是否新用户：新用户先进引导页，老用户进目标页。
    const redirect = searchParams.get("redirect") ?? "/";
    await navigateAfterAuth((href) => router.push(href), redirect);
  }

  async function handleLogin() {
    if (!canSubmit) return;
    setError("");
    setLoading(true);
    try {
      const auth = await api.auth.login(
        account,
        // 业务规则:密码不区分大小写,与注册一致统一转大写。
        password.toUpperCase()
      );
      await onAuthSuccess(auth);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      setError(translateAuthError(msg, LOGIN_ERRORS, "登录失败，请稍后重试"));
    } finally {
      setLoading(false);
    }
  }

  async function handleSendCode() {
    if (!canSendCode) return;
    setError("");
    setSending(true);
    try {
      await api.auth.sendCode(account);
      setCountdown(CODE_COUNTDOWN);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      setError(
        translateAuthError(msg, CODE_ERRORS, "验证码发送失败，请稍后重试")
      );
    } finally {
      setSending(false);
    }
  }

  async function handleCodeLogin() {
    if (!canCodeSubmit) return;
    setError("");
    setLoading(true);
    try {
      const auth = await api.auth.loginWithCode(account, code);
      await onAuthSuccess(auth);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      setError(translateAuthError(msg, CODE_ERRORS, "登录失败，请稍后重试"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <AuthBranding />

      {/* Right panel */}
      <div className="flex flex-1 items-center justify-center px-8 py-16 bg-white">
        <div className="w-full max-w-sm">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">欢迎回来</h1>

          {resetSuccess && (
            <p className="mb-6 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-600">
              密码重置成功，请用新密码登录。
            </p>
          )}

          {deletedSuccess && (
            <p className="mb-6 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-600">
              账号已注销成功。
            </p>
          )}

          {/* Tabs */}
          <div className="flex gap-6 mb-8 border-b border-gray-100">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => switchTab(id)}
                className={`pb-3 text-sm font-medium transition-colors ${
                  tab === id
                    ? "text-blue-600 border-b-2 border-blue-600"
                    : "text-gray-400 hover:text-gray-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "password" ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  手机号/邮箱号码
                </label>
                <input
                  type="text"
                  placeholder="请输入手机号/邮箱号码"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  className={AUTH_INPUT_CLASS}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">密码</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="请输入登录密码"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    className={`${AUTH_INPUT_CLASS} pr-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  >
                    {showPassword ? "🙈" : "👁"}
                  </button>
                </div>
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <button
                onClick={handleLogin}
                disabled={!canSubmit}
                className="w-full rounded-full bg-blue-600 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? "登录中..." : "立即登录"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  {tab === "phone" ? "手机号码" : "邮箱"}
                </label>
                <div className="relative">
                  <input
                    type={tab === "email" ? "email" : "tel"}
                    placeholder={
                      tab === "phone" ? "请输入手机号" : "请输入邮箱"
                    }
                    value={account}
                    onChange={(e) => setAccount(e.target.value)}
                    className={AUTH_INPUT_CLASS}
                  />
                  {account && !identifierValid && (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-red-500">
                      {tab === "phone" ? "手机号码错误" : "邮箱格式错误"}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  验证码
                </label>
                <div className="flex gap-3">
                  <div className="relative min-w-0 flex-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="请输入验证码"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCodeLogin()}
                      className={`${AUTH_INPUT_CLASS} pr-20`}
                    />
                    {code && !isCode(code) && (
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-red-500">
                        验证码错误
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={!canSendCode}
                    className="shrink-0 rounded-full bg-blue-50 px-4 py-3 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {countdown > 0
                      ? `${countdown}s 后重发`
                      : sending
                        ? "发送中..."
                        : "获取验证码"}
                  </button>
                </div>
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <button
                onClick={handleCodeLogin}
                disabled={!canCodeSubmit}
                className="w-full rounded-full bg-blue-600 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? "登录中..." : "立即登录"}
              </button>
            </div>
          )}

          {/* 两种登录方式共用的页脚：注册入口 + 忘记密码（对齐设计稿）。 */}
          <div className="mt-4 space-y-4">
            <button
              onClick={() => router.push("/register")}
              className="w-full rounded-full border border-gray-200 py-3 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              没有账号，立即注册
            </button>

            <button
              type="button"
              onClick={() => router.push("/forgot-password")}
              className="w-full text-center text-sm text-blue-500 hover:underline"
            >
              忘记密码
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
