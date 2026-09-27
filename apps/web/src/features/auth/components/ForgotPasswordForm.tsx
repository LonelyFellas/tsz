"use client";

import { isEmail, isPhone, isRegisterPassword } from "@tsz/shared";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/request";
import { AuthBranding } from "./AuthBranding";
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
    <div className="flex min-h-screen">
      <AuthBranding />

      {/* Right panel */}
      <div className="flex flex-1 items-center justify-center px-8 py-16 bg-surface">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center justify-between">
            <h1 className="text-3xl font-bold text-foreground">找回密码</h1>
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="text-sm text-foreground-subtle hover:text-foreground-muted"
            >
              ← 返回登录
            </button>
          </div>

          <p className="mb-6 text-sm text-foreground-subtle">
            输入账号当前绑定的手机号或邮箱，获取验证码后设置新密码。
          </p>

          {/* Tabs：手机 / 邮箱二选一，与注册页一致 */}
          <div className="flex gap-6 mb-8 border-b border-border">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                disabled={busy}
                onClick={() => switchTab(id)}
                className={`pb-3 text-sm font-medium transition-colors ${
                  tab === id
                    ? "text-primary border-b-2 border-primary"
                    : "text-foreground-subtle hover:text-foreground-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <form noValidate className="space-y-4" onSubmit={handleReset}>
            {/* 账号 */}
            <div>
              <label className="block text-sm text-foreground-muted mb-1">
                {tab === "phone" ? "手机号码" : "邮箱"}
              </label>
              <input
                type={tab === "phone" ? "tel" : "email"}
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
              <label className="block text-sm text-foreground-muted mb-1">
                验证码
              </label>
              <div className="flex gap-3">
                <input
                  type="text"
                  inputMode="numeric"
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
                  className="shrink-0 rounded-full bg-primary-muted px-4 py-3 text-sm font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
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
              <label className="block text-sm text-foreground-muted mb-1">
                新密码
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="请输入新密码"
                  value={password}
                  disabled={busy}
                  autoComplete="new-password"
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${AUTH_INPUT_CLASS} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
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
              className="w-full rounded-full bg-primary py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? "重置中..." : "重置密码"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
