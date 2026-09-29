"use client";

import { isEmail, isPhone, isRegisterPassword } from "@tsz/shared";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/request";
import { AuthBranding } from "./AuthBranding";
import { PasswordVisibilityIcon } from "./PasswordVisibilityIcon";
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
    <main className="flex min-h-screen">
      <AuthBranding />
      <div className="flex min-w-0 flex-1 items-center justify-center bg-surface px-6 py-20">
        <div className="w-full max-w-[400px]">
          <button
            type="button"
            onClick={() => router.back()}
            className="mb-6 rounded-sm text-sm text-foreground-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            ← 返回
          </button>
          <h1 className="mb-8 text-3xl font-semibold tracking-tight text-foreground">
            注册账号
          </h1>

          <div
            className="mb-7 flex gap-6 border-b border-border"
            aria-label="注册方式"
          >
            {(["phone", "email"] as const).map((value) => (
              <button
                key={value}
                type="button"
                disabled={sending || loading || registered}
                onClick={() => switchMethod(value)}
                aria-pressed={method === value}
                className={`border-b-2 px-1 pb-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed ${method === value ? "border-primary text-foreground" : "border-transparent text-foreground-muted hover:text-foreground"}`}
              >
                {value === "phone" ? "手机" : "邮箱"}
              </button>
            ))}
          </div>

          <form noValidate className="space-y-5" onSubmit={handleRegister}>
            <div>
              <label
                htmlFor="register-contact"
                className="mb-2 ml-4 block text-sm font-medium text-foreground"
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
              <label
                htmlFor="register-code"
                className="mb-2 ml-4 block text-sm font-medium text-foreground"
              >
                验证码
              </label>
              <div className="flex gap-3">
                <input
                  id="register-code"
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
                  className="shrink-0 rounded-full border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
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
              <label
                htmlFor="register-password"
                className="mb-2 ml-4 block text-sm font-medium text-foreground"
              >
                密码
              </label>
              <div className="relative">
                <input
                  id="register-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="请输入登录密码"
                  value={password}
                  disabled={loading || registered}
                  onChange={(event) => setPassword(event.target.value)}
                  className={`${AUTH_INPUT_CLASS} pr-14`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  disabled={loading || registered}
                  className="absolute right-3 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-foreground-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                >
                  <PasswordVisibilityIcon visible={showPassword} />
                </button>
              </div>
              <p
                className={`mt-3 ml-4 text-xs ${
                  password && !passwordValid
                    ? "text-danger"
                    : "text-foreground-muted"
                }`}
              >
                11-20位,数字+字母,不区分大小写
              </p>
            </div>

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="min-h-12 w-full rounded-full bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? registered
                  ? "加载中..."
                  : "注册中..."
                : registered
                  ? "重试加载"
                  : "立即注册"}
            </button>

            <p className="pt-2 text-center text-sm text-foreground-muted">
              已有账号？{" "}
              <button
                type="button"
                onClick={() =>
                  router.push(
                    redirect
                      ? `/login?${new URLSearchParams({ redirect })}`
                      : "/login"
                  )
                }
                className="rounded-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                aria-label="已有账号,去登录"
              >
                登录
              </button>
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}
