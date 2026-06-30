"use client";

import { isCode, isEmail, isPhone, isRegisterPassword } from "@tsz/shared";
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

type Tab = "phone" | "email";

const REGISTER_ERRORS: Record<string, string> = {
  "phone already registered": "该手机号已注册，请直接登录",
  "email already registered": "该邮箱已注册，请直接登录",
  "invalid credentials": "验证码错误或已失效，请重新获取"
};

const TABS: { id: Tab; label: string }[] = [
  { id: "phone", label: "手机" },
  { id: "email", label: "邮箱" }
];

const CODE_COUNTDOWN = 60;

export function RegisterForm() {
  const [tab, setTab] = useState<Tab>("phone");
  const [account, setAccount] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const setUser = useUserStore((s) => s.setUser);
  const router = useRouter();

  // 验证码倒计时。
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const accountValid = tab === "phone" ? isPhone(account) : isEmail(account);
  const codeValid = isCode(code);
  const passwordValid = isRegisterPassword(password);
  const canSendCode = accountValid && countdown === 0 && !sending;
  const canSubmit = accountValid && codeValid && passwordValid && !loading;

  function switchTab(next: Tab) {
    setTab(next);
    setAccount("");
    setError("");
  }

  async function handleSendCode() {
    if (!canSendCode) return;
    setError("");
    setSending(true);
    try {
      await api.auth.sendCode(account);
      setCountdown(CODE_COUNTDOWN);
    } catch (e: unknown) {
      setError(translateError(e));
    } finally {
      setSending(false);
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setLoading(true);
    try {
      const auth = await api.auth.register({
        // 手机/邮箱二选一：未选中的那个不传（后端按字段是否存在判断）。
        phone: tab === "phone" ? account : undefined,
        email: tab === "email" ? account : undefined,
        // 业务规则:密码不区分大小写,统一转大写后入库。
        password: password.toUpperCase(),
        // 原型未单独采集昵称,默认用账号占位(后端要求 1-50 字符)。
        display_name: account,
        role: "student",
        code
      });
      persistSession(auth);
      setUser(auth.user);
      // 新注册用户必为新用户，navigateAfterAuth 会据 /me 引导至 onboarding。
      await navigateAfterAuth((href) => router.push(href));
    } catch (e: unknown) {
      setError(translateError(e));
    } finally {
      setLoading(false);
    }
  }

  function translateError(e: unknown): string {
    const msg = e instanceof Error ? e.message : "";
    return translateAuthError(msg, REGISTER_ERRORS, "注册失败，请稍后重试");
  }

  return (
    <div className="flex min-h-screen">
      <AuthBranding />

      {/* Right panel */}
      <div className="flex flex-1 items-center justify-center px-8 py-16 bg-surface">
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

          {/* Tabs */}
          <div className="flex gap-6 mb-8 border-b border-border">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
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

          <form className="space-y-4" onSubmit={handleRegister}>
            {/* 账号 */}
            <div>
              <label className="block text-sm text-foreground-muted mb-1">
                {tab === "phone" ? "手机号码" : "邮箱"}
              </label>
              <input
                type={tab === "phone" ? "tel" : "email"}
                placeholder={tab === "phone" ? "请输入手机号" : "请输入邮箱"}
                value={account}
                onChange={(e) => setAccount(e.target.value)}
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
                  onChange={(e) => setCode(e.target.value)}
                  className={`${AUTH_INPUT_CLASS} min-w-0`}
                />
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={!canSendCode}
                  className="shrink-0 rounded-full bg-primary-muted px-4 py-3 text-sm font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {countdown > 0 ? `${countdown}s 后重发` : "获取验证码"}
                </button>
              </div>
            </div>

            {/* 密码 */}
            <div>
              <label className="block text-sm text-foreground-muted mb-1">
                密码
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="请输入登录密码"
                  value={password}
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
