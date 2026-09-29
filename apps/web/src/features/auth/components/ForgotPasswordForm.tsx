"use client";

import { isEmail, isPhone, isRegisterPassword } from "@tsz/shared";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/request";
import { AuthBranding } from "./AuthBranding";
import { PasswordVisibilityIcon } from "./PasswordVisibilityIcon";
import { AUTH_INPUT_CLASS, securityErrorMessage } from "../shared";

type Tab = "phone" | "email";

const TABS: { id: Tab; label: string }[] = [
  { id: "phone", label: "手机" },
  { id: "email", label: "邮箱" }
];

const CODE_COUNTDOWN = 60;

export function ForgotPasswordForm() {
  const [tab, setTab] = useState<Tab>("phone");
  const [account, setAccount] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const router = useRouter();

  // 验证码倒计时（与注册一致）。
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const identifier =
    tab === "email" ? account.trim().toLowerCase() : account.trim();
  const accountValid =
    tab === "phone" ? isPhone(identifier) : isEmail(identifier);
  const codeValid = /^\d{6}$/.test(code);
  const passwordValid = isRegisterPassword(password);
  const busy = sending || loading;
  const canSendCode = accountValid && countdown === 0 && !busy;
  const canSubmit = accountValid && codeValid && passwordValid && !busy;

  function switchTab(next: Tab) {
    if (next === tab || busy) return;
    // 切换渠道即重置：验证码按发送目标绑定，旧码对新 identifier 无效。
    setTab(next);
    setAccount("");
    setCode("");
    setError("");
    setCountdown(0);
  }

  async function handleSendCode() {
    if (!canSendCode) return;
    setError("");
    setSending(true);
    try {
      await api.auth.forgotPassword(identifier);
      setCode("");
      setCountdown(CODE_COUNTDOWN);
    } catch (e: unknown) {
      setError(securityErrorMessage(e));
    } finally {
      setSending(false);
    }
  }

  async function handleReset(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setLoading(true);
    try {
      // 业务规则:密码不区分大小写,与注册/登录一致统一转大写。
      await api.auth.resetPassword(identifier, code, password.toUpperCase());
      // 重置成功后服务端已吊销所有会话，需用新密码重新登录。
      router.push("/login?reset=success");
    } catch (e: unknown) {
      setError(securityErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen">
      <AuthBranding />
      <div className="flex min-w-0 flex-1 items-center justify-center bg-surface px-6 py-20">
        <div className="w-full max-w-[400px]">
          <h1 className="mb-3 text-3xl font-semibold tracking-tight text-foreground">
            找回密码
          </h1>
          <p className="mb-8 text-sm leading-6 text-foreground-muted">
            使用账号绑定的手机号或邮箱验证身份。
          </p>

          <div
            className="mb-7 flex gap-6 border-b border-border"
            aria-label="验证方式"
          >
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                disabled={busy}
                onClick={() => switchTab(id)}
                aria-pressed={tab === id}
                className={`border-b-2 px-1 pb-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed ${
                  tab === id
                    ? "border-primary text-foreground"
                    : "border-transparent text-foreground-muted hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <form noValidate className="space-y-5" onSubmit={handleReset}>
            {/* 账号 */}
            <div>
              <label
                htmlFor="reset-account"
                className="mb-2 ml-4 block text-sm font-medium text-foreground"
              >
                {tab === "phone" ? "手机号码" : "邮箱"}
              </label>
              <input
                id="reset-account"
                type={tab === "phone" ? "tel" : "email"}
                autoComplete={tab === "phone" ? "tel" : "email"}
                placeholder={tab === "phone" ? "请输入手机号" : "请输入邮箱"}
                value={account}
                disabled={busy}
                onChange={(e) => {
                  const next = e.target.value;
                  const normalized =
                    tab === "email" ? next.trim().toLowerCase() : next.trim();
                  if (normalized !== identifier) setCountdown(0);
                  setAccount(next);
                  setCode("");
                  setError("");
                }}
                className={AUTH_INPUT_CLASS}
              />
              {account && !accountValid && (
                <p className="mt-1 text-xs text-danger">
                  {tab === "phone" ? "手机号码错误" : "邮箱格式错误"}
                </p>
              )}
            </div>

            {/* 验证码 */}
            <div>
              <label
                htmlFor="reset-code"
                className="mb-2 ml-4 block text-sm font-medium text-foreground"
              >
                验证码
              </label>
              <div className="flex gap-3">
                <input
                  id="reset-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="请输入验证码"
                  value={code}
                  maxLength={6}
                  disabled={busy}
                  onChange={(e) => setCode(e.target.value)}
                  className={`${AUTH_INPUT_CLASS} min-w-0`}
                />
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={!canSendCode}
                  className="shrink-0 rounded-full border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {countdown > 0
                    ? `${countdown}s 后重发`
                    : sending
                      ? "发送中..."
                      : "获取验证码"}
                </button>
              </div>
            </div>

            {/* 新密码 */}
            <div>
              <label
                htmlFor="reset-password"
                className="mb-2 ml-4 block text-sm font-medium text-foreground"
              >
                新密码
              </label>
              <div className="relative">
                <input
                  id="reset-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="请输入新密码"
                  value={password}
                  disabled={busy}
                  autoComplete="new-password"
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${AUTH_INPUT_CLASS} pr-14`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={busy}
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
              {loading ? "重置中..." : "重置密码"}
            </button>
          </form>
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="mt-7 w-full rounded-sm text-center text-sm text-foreground-muted hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            返回登录
          </button>
        </div>
      </div>
    </main>
  );
}
