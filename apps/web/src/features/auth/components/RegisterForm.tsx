"use client";

import { isEmail, isPhone, isRegisterPassword } from "@tsz/shared";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/request";
import { AuthBranding } from "./AuthBranding";
import {
  AUTH_INPUT_CLASS,
  completeAuthentication,
  persistSession,
  translateAuthError
} from "../shared";

const CODE_COUNTDOWN = 60;
const REGISTER_CODE_RE = /^\d{6}$/;

const REGISTER_ERRORS: Record<string, string> = {
  "invalid code": "验证码错误或已失效，请重新获取",
  "invalid email": "邮箱格式错误，请检查后重试",
  "invalid phone": "手机号码错误，请检查后重试",
  "password is too short": "密码须为 11–20 位字母和数字组合",
  "password is too long": "密码须为 11–20 位字母和数字组合",
  "password must contain letters and digits only":
    "密码须为 11–20 位字母和数字组合",
  "otp unavailable": "验证码服务暂时不可用，请稍后再试",
  "too many requests": "验证码发送过于频繁，请稍后再试",
  "service unavailable": "验证码服务暂时不可用，请稍后再试"
};

export function RegisterForm({
  initialMethod = "phone",
  redirect
}: {
  initialMethod?: "phone" | "email";
  redirect?: string;
}) {
  const [method, setMethod] = useState(initialMethod);
  const [contact, setContact] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [error, setError] = useState("");

  const router = useRouter();

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const identifier =
    method === "email" ? contact.trim().toLowerCase() : contact.trim();
  const contactValid =
    method === "email" ? isEmail(identifier) : isPhone(identifier);
  const codeValid = REGISTER_CODE_RE.test(code);
  const passwordValid = isRegisterPassword(password);
  const canSendCode =
    contactValid && countdown === 0 && !sending && !loading && !registered;
  const canSubmit =
    (registered || (contactValid && codeValid && passwordValid)) &&
    !loading &&
    !sending;

  function translateError(value: unknown, fallback: string): string {
    const message = value instanceof Error ? value.message : "";
    return translateAuthError(
      message,
      {
        ...REGISTER_ERRORS,
        "user already exists": `该${method === "email" ? "邮箱" : "手机号"}已注册，请直接登录`
      },
      fallback
    );
  }

  function handleContactChange(nextContact: string) {
    if (nextContact === contact) return;
    setContact(nextContact);
    setCode("");
    setCountdown(0);
    setError("");
  }

  function switchMethod(nextMethod: "phone" | "email") {
    if (method === nextMethod) return;
    setMethod(nextMethod);
    setContact("");
    setCode("");
    setCountdown(0);
    setError("");
  }

  async function handleSendCode() {
    if (!canSendCode) return;
    setError("");
    setSending(true);
    try {
      await api.auth.sendCode(identifier, "register");
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
    let accountCreated = registered;
    try {
      if (!accountCreated) {
        const auth = await api.auth.register({
          ...(method === "email"
            ? { email: identifier }
            : { phone: identifier }),
          password: password.toUpperCase(),
          code
        });
        accountCreated = true;
        setRegistered(true);
        persistSession(auth);
      }
      await completeAuthentication();
    } catch (cause: unknown) {
      setError(
        accountCreated
          ? "注册成功，但加载账号信息失败，请重试"
          : translateError(cause, "注册失败，请稍后重试")
      );
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
            {(["phone", "email"] as const).map((value) => (
              <button
                key={value}
                type="button"
                disabled={sending || loading || registered}
                onClick={() => switchMethod(value)}
                aria-pressed={method === value}
                className={`pb-3 text-sm font-medium disabled:cursor-not-allowed ${method === value ? "border-b-2 border-primary text-primary" : "text-foreground-subtle hover:text-foreground-muted"}`}
              >
                {value === "phone" ? "手机" : "邮箱"}
              </button>
            ))}
          </div>

          <form className="space-y-4" onSubmit={handleRegister}>
            <div>
              <label
                htmlFor="register-contact"
                className="mb-1 block text-sm text-foreground-muted"
              >
                {method === "email" ? "邮箱" : "手机号码"}
              </label>
              <input
                id="register-contact"
                type={method === "email" ? "email" : "tel"}
                inputMode={method === "email" ? "email" : "tel"}
                autoComplete={method === "email" ? "email" : "tel"}
                placeholder={method === "email" ? "请输入邮箱" : "请输入手机号"}
                value={contact}
                disabled={sending || loading || registered}
                onChange={(event) => handleContactChange(event.target.value)}
                className={AUTH_INPUT_CLASS}
              />
              {contact && !contactValid && (
                <p className="mt-1 text-xs text-danger">
                  {method === "email" ? "邮箱格式错误" : "手机号码错误"}
                </p>
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
                  disabled={loading || registered}
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
                  disabled={loading || registered}
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
              {loading
                ? registered
                  ? "加载中..."
                  : "注册中..."
                : registered
                  ? "重试加载"
                  : "立即注册"}
            </button>

            <p className="text-center text-sm">
              <button
                type="button"
                onClick={() =>
                  router.push(
                    redirect
                      ? `/login?${new URLSearchParams({ redirect })}`
                      : "/login"
                  )
                }
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
