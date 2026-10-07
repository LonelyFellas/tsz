"use client";

import { HttpError } from "@tsz/api-client";
import { passwordErrorMessage } from "@tsz/shared/auth";
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
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/request";
import { AuthBranding } from "./AuthBranding";
import { PasswordVisibilityIcon } from "./PasswordVisibilityIcon";
import {
  AUTH_PASSWORD_HINT,
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
  "password is too short": "密码须为 15–128 个字符，区分大小写，支持符号和空格",
  "password is too long": "密码须为 15–128 个字符，区分大小写，支持符号和空格",
  "password must contain letters and digits only":
    "密码须为 15–128 个字符，区分大小写，支持符号和空格",
  "otp unavailable": "验证码服务暂时不可用，请稍后再试",
  "too many requests": "验证码发送过于频繁，请稍后再试",
  "service unavailable": "验证码服务暂时不可用，请稍后再试"
};

export function RegisterForm({
  initialMethod = "phone",
  initialInviteCode = "",
  redirect
}: {
  initialMethod?: "phone" | "email";
  initialInviteCode?: string;
  redirect?: string;
}) {
  const [inviteCode, setInviteCode] = useState(initialInviteCode);
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
  const pendingRequest = useRef<AbortController | null>(null);
  useEffect(() => () => pendingRequest.current?.abort(), []);

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
  const contactError =
    contact && !contactValid
      ? method === "email"
        ? "邮箱格式错误"
        : "手机号码错误"
      : undefined;
  const codeError = code && !codeValid ? "请输入 6 位数字验证码" : undefined;
  const passwordError = password
    ? (passwordLengthError(password) ?? undefined)
    : undefined;
  const canSendCode =
    contactValid && countdown === 0 && !sending && !loading && !registered;
  const canSubmit =
    (registered || (contactValid && codeValid && passwordValid)) &&
    !loading &&
    !sending;

  function translateError(value: unknown, fallback: string): string {
    if (value instanceof HttpError) {
      if (value.code === "invalid_invitation_code")
        return "邀请码无效，请修改或清空后重试";
      const passwordMessage = passwordErrorMessage(value.code);
      if (passwordMessage) return passwordMessage;
    }
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
    const nextIdentifier =
      method === "email"
        ? nextContact.trim().toLowerCase()
        : nextContact.trim();
    setContact(nextContact);
    if (nextIdentifier !== identifier) {
      setCode("");
      setCountdown(0);
    }
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
    const controller = new AbortController();
    pendingRequest.current = controller;
    const { signal } = controller;
    setError("");
    setLoading(true);
    let accountCreated = registered;
    try {
      if (!accountCreated) {
        const auth = await api.auth.register(
          {
            ...(method === "email"
              ? { email: identifier }
              : { phone: identifier }),
            ...(inviteCode.trim() ? { invite_code: inviteCode.trim() } : {}),
            password: password,
            code
          },
          { signal }
        );
        if (signal.aborted) return;
        accountCreated = true;
        setRegistered(true);
        persistSession(auth);
      }
      await completeAuthentication(signal);
    } catch (cause: unknown) {
      if (signal.aborted) return;
      setError(
        accountCreated
          ? "注册成功，但加载账号信息失败，请重试"
          : translateError(cause, "注册失败，请稍后重试")
      );
    } finally {
      if (!signal.aborted) setLoading(false);
      if (pendingRequest.current === controller) pendingRequest.current = null;
    }
  }

  return (
    <main className="flex min-h-screen">
      <AuthBranding />
      <div className="flex min-w-0 flex-1 items-center justify-center bg-surface px-6 py-20">
        <div className="w-full max-w-[400px]">
          <button
            type="button"
            disabled={sending || loading}
            onClick={() => {
              if (!sending && !loading) router.back();
            }}
            className="mb-6 inline-flex items-center gap-2.5 rounded-sm text-sm text-foreground-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
          >
            <ArrowLeft aria-hidden="true" size={18} strokeWidth={1.5} />
            返回
          </button>
          <h1 className="mb-8 text-3xl font-semibold tracking-tight text-foreground">
            注册账号
          </h1>

          <Tabs
            value={method}
            onValueChange={(value) => switchMethod(value as typeof method)}
            activationMode="manual"
          >
            <TabsList className="mb-7" aria-label="注册方式">
              {(["phone", "email"] as const).map((value) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  disabled={sending || loading || registered}
                >
                  {value === "phone" ? "手机" : "邮箱"}
                </TabsTrigger>
              ))}
            </TabsList>
            {/* 保留非激活面板，保证两个标签的 aria-controls 都有目标。 */}
            <TabsContent value={method === "phone" ? "email" : "phone"} />
            <TabsContent value={method}>
              <form noValidate className="space-y-5" onSubmit={handleRegister}>
                <FormField
                  htmlFor="register-contact"
                  label={method === "email" ? "邮箱" : "手机号码"}
                  error={contactError}
                >
                  <Input
                    id="register-contact"
                    type={method === "email" ? "email" : "tel"}
                    inputMode={method === "email" ? "email" : "tel"}
                    autoComplete={method === "email" ? "email" : "tel"}
                    placeholder={
                      method === "email" ? "请输入邮箱" : "请输入手机号"
                    }
                    value={contact}
                    disabled={sending || loading || registered}
                    onChange={(event) =>
                      handleContactChange(event.target.value)
                    }
                    aria-invalid={Boolean(contactError)}
                    aria-describedby={
                      contactError ? "register-contact-message" : undefined
                    }
                  />
                </FormField>

                <FormField
                  htmlFor="register-code"
                  label="验证码"
                  error={codeError}
                >
                  <div className="flex gap-3">
                    <Input
                      id="register-code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="请输入验证码"
                      value={code}
                      disabled={loading || registered}
                      onChange={(event) => setCode(event.target.value)}
                      className="min-w-0 flex-1"
                      aria-invalid={Boolean(codeError)}
                      aria-describedby={
                        codeError ? "register-code-message" : undefined
                      }
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!canSendCode}
                      onClick={handleSendCode}
                      className="shrink-0 px-4 font-medium"
                    >
                      {sending
                        ? "发送中..."
                        : countdown > 0
                          ? `${countdown}s 后重发`
                          : "获取验证码"}
                    </Button>
                  </div>
                </FormField>

                <FormField
                  htmlFor="register-password"
                  label="密码"
                  hint={AUTH_PASSWORD_HINT}
                  error={passwordError}
                >
                  <div className="relative">
                    <Input
                      id="register-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="请输入登录密码"
                      value={password}
                      disabled={loading || registered}
                      onChange={(event) => setPassword(event.target.value)}
                      className="pr-14"
                      aria-invalid={Boolean(passwordError)}
                      aria-describedby="register-password-message"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowPassword((value) => !value)}
                      disabled={loading || registered}
                      className="absolute right-1 top-1/2 -translate-y-1/2"
                      aria-label={showPassword ? "隐藏密码" : "显示密码"}
                    >
                      <PasswordVisibilityIcon visible={showPassword} />
                    </Button>
                  </div>
                </FormField>

                <FormField htmlFor="register-invite" label="邀请码（选填）">
                  <Input
                    id="register-invite"
                    value={inviteCode}
                    placeholder="请输入邀请码"
                    autoComplete="off"
                    disabled={loading || registered}
                    onChange={(event) => setInviteCode(event.target.value)}
                  />
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
                  {loading
                    ? registered
                      ? "加载中..."
                      : "注册中..."
                    : registered
                      ? "重试加载"
                      : "立即注册"}
                </Button>

                <p className="pt-2 text-center text-sm text-foreground-muted">
                  已有账号？{" "}
                  <button
                    type="button"
                    disabled={sending || loading}
                    onClick={() => {
                      if (sending || loading) return;
                      const params = new URLSearchParams();
                      if (redirect) params.set("redirect", redirect);
                      if (inviteCode.trim())
                        params.set("invite", inviteCode.trim());
                      router.push(params.size ? `/login?${params}` : "/login");
                    }}
                    className="rounded-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
                    aria-label="已有账号,去登录"
                  >
                    登录
                  </button>
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </main>
  );
}
