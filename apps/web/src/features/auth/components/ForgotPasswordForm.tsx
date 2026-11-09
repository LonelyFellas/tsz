"use client";
import { passwordLengthError } from "@/features/auth/shared";
import { localText, type WebNotice } from "@/i18n/catalog";

import { useWebText } from "@/i18n/client";
import { webAuthAccess as webAuth } from "@/i18n/messages/auth/access";

import { isEmail, isPhone, isRegisterPassword } from "@tsz/shared";
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
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/request";
import { AuthShell } from "./AuthShell";
import { PasswordVisibilityIcon } from "./PasswordVisibilityIcon";
import { AUTH_PASSWORD_HINT, securityErrorMessage } from "../shared";

type Tab = "phone" | "email";

const TABS: { id: Tab; label: WebNotice }[] = [
  { id: "phone", label: localText(webAuth, "webAuthAccess:phone") },
  { id: "email", label: localText(webAuth, "webAuthAccess:email") }
];

const CODE_COUNTDOWN = 60;

export function ForgotPasswordForm() {
  const uiText = useWebText(webAuth);
  const [tab, setTab] = useState<Tab>("phone");
  const [account, setAccount] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<WebNotice>("");

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
        ? localText(webAuth, "webAuthAccess:invalid_phone_number")
        : localText(webAuth, "webAuthAccess:invalid_email_address")
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
    <AuthShell>
      <button
        type="button"
        disabled={busy}
        onClick={() => router.push("/login")}
        className="mb-6 inline-flex items-center gap-2.5 rounded-sm text-sm text-foreground-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
      >
        <ArrowLeft aria-hidden="true" size={18} strokeWidth={1.5} />
        {uiText("webAuthAccess:back_to_sign_in")}
      </button>
      <h1 className="mb-3 text-2xl font-bold tracking-tight text-foreground">
        {uiText("webAuthAccess:reset_password")}
      </h1>
      <p className="mb-8 text-sm leading-6 text-foreground-muted">
        {uiText(
          "webAuthAccess:verify_your_identity_using_the_phone_number_or_email_bound_to_your_accou"
        )}
      </p>

      <Tabs
        value={tab}
        onValueChange={(value) => switchTab(value as Tab)}
        activationMode="manual"
      >
        <TabsList
          className="mb-7"
          aria-label={uiText("webAuthAccess:verification_method")}
        >
          {TABS.map(({ id, label }) => (
            <TabsTrigger key={id} value={id} disabled={busy}>
              {uiText(label)}
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
              label={
                tab === "phone"
                  ? uiText("webAuthAccess:phone_number_2")
                  : uiText("webAuthAccess:email")
              }
              error={uiText(accountError)}
            >
              <Input
                id="reset-account"
                type={tab === "phone" ? "tel" : "email"}
                autoComplete={tab === "phone" ? "tel" : "email"}
                placeholder={
                  tab === "phone"
                    ? uiText("webAuthAccess:enter_a_phone_number")
                    : uiText("webAuthAccess:enter_your_email")
                }
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
                aria-invalid={Boolean(accountError)}
                aria-describedby={
                  accountError ? "reset-account-message" : undefined
                }
              />
            </FormField>

            {/* 验证码 */}
            <FormField
              htmlFor="reset-code"
              label={uiText("webAuthAccess:verification_code")}
            >
              <div className="flex gap-3">
                <Input
                  id="reset-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder={uiText(
                    "webAuthAccess:enter_the_verification_code"
                  )}
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
                    ? uiText("webAuthAccess:resend_in_v0_s", { v0: countdown })
                    : sending
                      ? uiText("webAuthAccess:sending")
                      : uiText("webAuthAccess:get_code")}
                </Button>
              </div>
            </FormField>

            {/* 新密码 */}
            <FormField
              htmlFor="reset-password"
              label={uiText("webAuthAccess:new_password")}
              hint={uiText(AUTH_PASSWORD_HINT)}
              error={uiText(passwordError)}
            >
              <div className="relative">
                <Input
                  id="reset-password"
                  type={showPassword ? "text" : "password"}
                  placeholder={uiText("webAuthAccess:enter_a_new_password")}
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
                  aria-label={
                    showPassword
                      ? uiText("webAuthAccess:hide_password")
                      : uiText("webAuthAccess:show_password")
                  }
                >
                  <PasswordVisibilityIcon visible={showPassword} />
                </Button>
              </div>
            </FormField>

            {error && (
              <p role="alert" className="mx-4 text-sm leading-5 text-danger">
                {uiText(error)}
              </p>
            )}

            <Button type="submit" disabled={!canSubmit} className="w-full">
              {loading
                ? uiText("webAuthAccess:resetting")
                : uiText("webAuthAccess:reset_password_2")}
            </Button>
          </form>
        </TabsContent>
      </Tabs>
    </AuthShell>
  );
}
