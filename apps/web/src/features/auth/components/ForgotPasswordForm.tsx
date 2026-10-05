"use client";

import {
  isEmail,
  isPhone,
  isRegisterPassword,
  passwordLengthError
} from "@tsz/shared";
import {
  Button,
  FormField,
  Input,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent
} from "@tsz/ui/components";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/request";
import { AuthBranding } from "./AuthBranding";
import { PasswordVisibilityIcon } from "./PasswordVisibilityIcon";
import { AUTH_PASSWORD_HINT, securityErrorMessage } from "../shared";

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
  const accountError =
    account && !accountValid
      ? tab === "phone"
        ? "手机号码错误"
        : "邮箱格式错误"
      : undefined;
  const passwordError = password
    ? (passwordLengthError(password) ?? undefined)
    : undefined;
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
      await api.auth.resetPassword(identifier, code, password);
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

          <Tabs
            value={tab}
            onValueChange={(value) => switchTab(value as Tab)}
            activationMode="manual"
          >
            <TabsList className="mb-7" aria-label="验证方式">
              {TABS.map(({ id, label }) => (
                <TabsTrigger key={id} value={id} disabled={busy}>
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
            {/* 保留非激活面板，保证两个标签的 aria-controls 都有目标。 */}
            <TabsContent value={tab === "phone" ? "email" : "phone"} />
            <TabsContent value={tab}>
              <form noValidate className="space-y-5" onSubmit={handleReset}>
                {/* 账号 */}
                <FormField
                  htmlFor="reset-account"
                  label={tab === "phone" ? "手机号码" : "邮箱"}
                  error={accountError}
                >
                  <Input
                    id="reset-account"
                    type={tab === "phone" ? "tel" : "email"}
                    autoComplete={tab === "phone" ? "tel" : "email"}
                    placeholder={
                      tab === "phone" ? "请输入手机号" : "请输入邮箱"
                    }
                    value={account}
                    disabled={busy}
                    onChange={(e) => {
                      const next = e.target.value;
                      const normalized =
                        tab === "email"
                          ? next.trim().toLowerCase()
                          : next.trim();
                      if (normalized !== identifier) setCountdown(0);
                      setAccount(next);
                      setCode("");
                      setError("");
                    }}
                    aria-invalid={Boolean(accountError)}
                    aria-describedby={
                      accountError ? "reset-account-message" : undefined
                    }
                  />
                </FormField>

                {/* 验证码 */}
                <FormField htmlFor="reset-code" label="验证码">
                  <div className="flex gap-3">
                    <Input
                      id="reset-code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="请输入验证码"
                      value={code}
                      maxLength={6}
                      disabled={busy}
                      onChange={(e) => setCode(e.target.value)}
                      className="min-w-0 flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleSendCode}
                      disabled={!canSendCode}
                      className="shrink-0 px-4 font-medium"
                    >
                      {countdown > 0
                        ? `${countdown}s 后重发`
                        : sending
                          ? "发送中..."
                          : "获取验证码"}
                    </Button>
                  </div>
                </FormField>

                {/* 新密码 */}
                <FormField
                  htmlFor="reset-password"
                  label="新密码"
                  hint={AUTH_PASSWORD_HINT}
                  error={passwordError}
                >
                  <div className="relative">
                    <Input
                      id="reset-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="请输入新密码"
                      value={password}
                      disabled={busy}
                      autoComplete="new-password"
                      onChange={(e) => setPassword(e.target.value)}
                      className="pr-14"
                      aria-invalid={Boolean(passwordError)}
                      aria-describedby="reset-password-message"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowPassword((v) => !v)}
                      disabled={busy}
                      className="absolute right-1 top-1/2 -translate-y-1/2"
                      aria-label={showPassword ? "隐藏密码" : "显示密码"}
                    >
                      <PasswordVisibilityIcon visible={showPassword} />
                    </Button>
                  </div>
                </FormField>

                {error && (
                  <p
                    role="alert"
                    className="mx-4 text-sm leading-5 text-danger"
                  >
                    {error}
                  </p>
                )}

                <Button type="submit" disabled={!canSubmit} className="w-full">
                  {loading ? "重置中..." : "重置密码"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
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
