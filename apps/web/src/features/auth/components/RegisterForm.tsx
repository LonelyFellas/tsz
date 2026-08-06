"use client";

import { isPhone, isRegisterPassword } from "@tsz/shared";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { AuthBranding } from "./AuthBranding";
import {
  AUTH_INPUT_CLASS,
  navigateAfterAuth,
  persistSession,
  translateAuthError
} from "../shared";

const CODE_COUNTDOWN = 60;
const REGISTER_CODE_RE = /^\d{6}$/;

const REGISTER_ERRORS: Record<string, string> = {
  "invalid code": "验证码错误或已失效，请重新获取",
  "user already exists": "该手机号已注册，请直接登录",
  "too many requests": "验证码发送过于频繁，请稍后再试",
  "service unavailable": "验证码服务暂时不可用，请稍后再试"
};

export function RegisterForm() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const setUser = useUserStore((state) => state.setUser);
  const router = useRouter();

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const phoneValid = isPhone(phone);
  const codeValid = REGISTER_CODE_RE.test(code);
  const passwordValid = isRegisterPassword(password);
  const canSendCode = phoneValid && countdown === 0 && !sending;
  const canSubmit = phoneValid && codeValid && passwordValid && !loading;

  function translateError(value: unknown, fallback: string): string {
    const message = value instanceof Error ? value.message : "";
    return translateAuthError(message, REGISTER_ERRORS, fallback);
  }

  function handlePhoneChange(nextPhone: string) {
    if (nextPhone === phone) return;
    setPhone(nextPhone);
    // 验证码与发送冷却都绑定手机号；换号后不能沿用旧号码的状态。
    setCode("");
    setCountdown(0);
    setError("");
  }

  async function handleSendCode() {
    if (!canSendCode) return;
    setError("");
    setSending(true);
    try {
      await api.auth.sendCode(phone, "register");
      setCountdown(CODE_COUNTDOWN);
    } catch (cause: unknown) {
      setError(translateError(cause, "验证码发送失败，请稍后重试"));
    } finally {
      setSending(false);
    }
  }

  async function handleRegister(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setError("");
    setLoading(true);
    try {
      // 与现有密码登录保持一致：提交前统一转大写。
      const auth = await api.auth.register({
        phone,
        password: password.toUpperCase(),
        code
      });
      persistSession(auth);
      setUser(auth.user);
      await navigateAfterAuth((href) => router.push(href));
    } catch (cause: unknown) {
      setError(translateError(cause, "注册失败，请稍后重试"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <AuthBranding />

      <div className="flex flex-1 items-center justify-center bg-surface px-8 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center justify-between">
            <h1 className="text-3xl font-bold text-foreground">注册账号</h1>
            <button
              type="button"
              onClick={() => router.back()}
              className="text-sm text-foreground-subtle hover:text-foreground-muted"
            >
              ← 返回
            </button>
          </div>

          <div className="mb-8 flex gap-6 border-b border-border">
            <button
              type="button"
              className="border-b-2 border-primary pb-3 text-sm font-medium text-primary"
            >
              手机
            </button>
            <button
              type="button"
              disabled
              aria-label="邮箱（未开放）"
              className="flex cursor-not-allowed items-center gap-2 pb-3 text-sm font-medium text-foreground-subtle opacity-60"
            >
              邮箱
              <span className="rounded-full bg-border px-2 py-0.5 text-[10px] leading-none">
                未开放
              </span>
            </button>
          </div>

          <form className="space-y-4" onSubmit={handleRegister}>
            <div>
              <label className="mb-1 block text-sm text-foreground-muted">
                手机号码
              </label>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="请输入手机号"
                value={phone}
                disabled={sending || loading}
                onChange={(event) => handlePhoneChange(event.target.value)}
                className={AUTH_INPUT_CLASS}
              />
              {phone && !phoneValid && (
                <p className="mt-1 text-xs text-danger">手机号码错误</p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm text-foreground-muted">
                验证码
              </label>
              <div className="flex gap-3">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="请输入验证码"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  className={`${AUTH_INPUT_CLASS} min-w-0 flex-1`}
                />
                <button
                  type="button"
                  disabled={!canSendCode}
                  onClick={handleSendCode}
                  className="shrink-0 rounded-full border border-primary px-4 text-sm font-medium text-primary transition-opacity hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {sending
                    ? "发送中..."
                    : countdown > 0
                      ? `${countdown}s 后重发`
                      : "获取验证码"}
                </button>
              </div>
              {code && !codeValid && (
                <p className="mt-1 text-xs text-danger">
                  请输入 6 位数字验证码
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm text-foreground-muted">
                密码
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="请输入登录密码"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={`${AUTH_INPUT_CLASS} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-foreground-subtle hover:text-foreground-muted"
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                >
                  {showPassword ? "🙈" : "👁"}
                </button>
              </div>
              <p
                className={`mt-1 text-xs ${
                  password && !passwordValid
                    ? "text-danger"
                    : "text-foreground-subtle"
                }`}
              >
                11-20位,数字+字母,不区分大小写
              </p>
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full rounded-full bg-primary py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? "注册中..." : "立即注册"}
            </button>

            <p className="text-center text-sm">
              <button
                type="button"
                onClick={() => router.push("/login")}
                className="font-medium text-primary hover:underline"
              >
                已有账号,去登录
              </button>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
