"use client";

import { isPhone, isValidAccount } from "@tsz/shared";
import {
  Button,
  FormField,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@tsz/ui/components";
import { HttpError, type AuthResponse } from "@tsz/api-client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/request";
import { AuthBranding } from "./AuthBranding";
import { PasswordVisibilityIcon } from "./PasswordVisibilityIcon";
import {
  completeAuthentication,
  persistSession,
  securityErrorMessage,
  translateAuthError
} from "../shared";

// 后端对「账号不存在」与「密码错误」返回相同的 401，避免账号枚举。
const LOGIN_ERRORS: Record<string, string> = {
  "invalid credentials": "账号或密码错误，请重新输入",
  "identifier is invalid": "手机号或邮箱格式错误，请检查后重试",
  forbidden: "该账号已被禁用，请联系客服"
};

const CODE_COUNTDOWN = 60;
const cooldownKey = (phone: string) => `tsz:login-code-cooldown:${phone}`;

function savedCooldown(phone: string): number {
  try {
    const expiresAt = Number(sessionStorage.getItem(cooldownKey(phone)));
    return Number.isFinite(expiresAt)
      ? Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
      : 0;
  } catch {
    return 0;
  }
}

export function LoginForm() {
  const [method, setMethod] = useState<"password" | "code">("password");
  const [code, setCode] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const pending = useRef(false);
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState("");
  const pendingRequest = useRef<AbortController | null>(null);
  useEffect(() => () => pendingRequest.current?.abort(), []);

  const router = useRouter();
  const searchParams = useSearchParams();
  const identifier = account.includes("@")
    ? account.trim().toLowerCase()
    : account.trim();
  const codeLogin = method === "code";
  const canSubmit =
    (authenticated ||
      (codeLogin
        ? isPhone(identifier) && /^\d{6}$/.test(code)
        : isValidAccount(identifier) && password.length > 0)) &&
    !loading &&
    !sending;
  const canSend =
    codeLogin &&
    isPhone(identifier) &&
    countdown === 0 &&
    !loading &&
    !sending &&
    !authenticated;
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  async function sendCode() {
    if (!canSend || pending.current) return;
    pending.current = true;
    const controller = new AbortController();
    pendingRequest.current = controller;
    setSending(true);
    try {
      await api.auth.sendCode(identifier, "login");
      if (!controller.signal.aborted) {
        setError("");
        // 新码会替换旧码，避免误提交之前输入的验证码。
        setCode("");
        try {
          sessionStorage.setItem(
            cooldownKey(identifier),
            String(Date.now() + CODE_COUNTDOWN * 1000)
          );
        } catch {
          // 浏览器禁用存储时仍使用本页倒计时。
        }
        setCountdown(CODE_COUNTDOWN);
      }
    } catch (error) {
      if (!controller.signal.aborted) setError(securityErrorMessage(error));
    } finally {
      pending.current = false;
      if (!controller.signal.aborted) setSending(false);
      if (pendingRequest.current === controller) pendingRequest.current = null;
    }
  }

  const resetSuccess = searchParams.get("reset") === "success";
  const securitySuccess = searchParams.get("security") === "success";
  const deletedSuccess = searchParams.get("deleted") === "success";
  const registeredSuccess = searchParams.get("registered") === "success";

  function openRegistration() {
    if (loading || sending || authenticated) return;
    const params = new URLSearchParams();
    if (identifier.includes("@")) params.set("method", "email");
    const invite = searchParams.get("invite");
    if (invite) params.set("invite", invite);
    const redirect = searchParams.get("redirect");
    if (redirect) params.set("redirect", redirect);
    router.push(params.size ? `/register?${params}` : "/register");
  }

  // 登录成功后仅重试资料加载，不重复提交密码；由 GuestGuard 负责导航。
  async function loadProfile(signal: AbortSignal) {
    try {
      await completeAuthentication(signal);
    } catch {
      if (!signal.aborted) setError("登录成功，但加载账号信息失败，请重试");
    }
  }

  async function onAuthSuccess(auth: AuthResponse, signal: AbortSignal) {
    if (signal.aborted) return;
    persistSession(auth);
    setAuthenticated(true);
    await loadProfile(signal);
  }

  async function handleLogin() {
    if (!canSubmit || pending.current) return;
    pending.current = true;
    const controller = new AbortController();
    pendingRequest.current = controller;
    const { signal } = controller;
    setError("");
    setLoading(true);
    try {
      if (authenticated) {
        await loadProfile(signal);
      } else {
        const auth = codeLogin
          ? await api.auth.loginWithCode(identifier, code, { signal })
          : await api.auth.login(identifier, password, { signal });
        await onAuthSuccess(auth, signal);
      }
    } catch (e: unknown) {
      if (signal.aborted) return;
      if (codeLogin && e instanceof HttpError) {
        setError(
          e.code === "invalid_credentials"
            ? "手机号或验证码错误，请检查后重试"
            : securityErrorMessage(e)
        );
        setCode("");
      } else {
        const msg = e instanceof Error ? e.message : "";
        setError(translateAuthError(msg, LOGIN_ERRORS, "登录失败，请稍后重试"));
      }
    } finally {
      pending.current = false;
      if (!signal.aborted) setLoading(false);
      if (pendingRequest.current === controller) pendingRequest.current = null;
    }
  }

  return (
    <main className="flex min-h-screen">
      <AuthBranding />
      <div className="flex min-w-0 flex-1 items-center justify-center bg-surface px-6 py-20">
        <div className="w-full max-w-[400px]">
          <h1 className="mb-10 text-3xl font-semibold tracking-tight text-foreground">
            欢迎回来
          </h1>

          {securitySuccess && (
            <p
              role="status"
              className="mb-6 rounded-lg bg-success/10 px-4 py-3 text-sm text-success"
            >
              账号安全信息已更新，请使用当前绑定的手机号或邮箱重新登录。
            </p>
          )}
          {resetSuccess && (
            <p
              role="status"
              className="mb-6 rounded-lg bg-success/10 px-4 py-3 text-sm text-success"
            >
              密码重置成功，请用新密码登录。
            </p>
          )}
          {deletedSuccess && (
            <p
              role="status"
              className="mb-6 rounded-lg bg-success/10 px-4 py-3 text-sm text-success"
            >
              账号已注销成功。
            </p>
          )}
          {registeredSuccess && (
            <p
              role="status"
              className="mb-6 rounded-lg bg-success/10 px-4 py-3 text-sm text-success"
            >
              注册成功，请用刚设置的账号密码登录。
            </p>
          )}

          <Tabs
            value={method}
            activationMode="manual"
            onValueChange={(value) => {
              if (loading || sending || authenticated) return;
              setMethod(value as "password" | "code");
              setCode("");
              setPassword("");
              setError("");
            }}
          >
            <TabsList className="mb-7" aria-label="登录方式">
              <TabsTrigger
                value="password"
                disabled={loading || sending || authenticated}
                className={sending ? "disabled:opacity-100" : undefined}
              >
                密码登录
              </TabsTrigger>
              <TabsTrigger
                value="code"
                disabled={loading || sending || authenticated}
                className={sending ? "disabled:opacity-100" : undefined}
              >
                验证码登录
              </TabsTrigger>
            </TabsList>
            <TabsContent value={method === "password" ? "code" : "password"} />
            <TabsContent value={method}>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleLogin();
                }}
                className="space-y-5"
              >
                <FormField
                  htmlFor="login-account"
                  label={codeLogin ? "手机号" : "手机号或邮箱"}
                >
                  <Input
                    id="login-account"
                    type={codeLogin ? "tel" : "text"}
                    autoComplete="username"
                    placeholder={
                      codeLogin ? "请输入手机号" : "请输入手机号或邮箱"
                    }
                    value={account}
                    readOnly={sending}
                    disabled={loading || authenticated}
                    onChange={(e) => {
                      const next = e.target.value.trim();
                      if (next !== identifier) {
                        setCode("");
                        setCountdown(isPhone(next) ? savedCooldown(next) : 0);
                      }
                      setAccount(e.target.value);
                      setError("");
                    }}
                  />
                </FormField>
                {codeLogin ? (
                  <FormField htmlFor="login-code" label="验证码">
                    <div className="flex gap-2">
                      <Input
                        id="login-code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        placeholder="请输入 6 位验证码"
                        value={code}
                        readOnly={sending}
                        disabled={loading || authenticated}
                        onChange={(event) => {
                          setCode(event.target.value);
                          setError("");
                        }}
                        className="min-w-0 flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!canSend}
                        onClick={() => void sendCode()}
                      >
                        {sending
                          ? "发送中…"
                          : countdown
                            ? `${countdown}s 后重发`
                            : "获取验证码"}
                      </Button>
                    </div>
                  </FormField>
                ) : (
                  <FormField htmlFor="login-password" label="密码">
                    <div className="relative">
                      <Input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        placeholder="请输入登录密码"
                        value={password}
                        disabled={loading || sending || authenticated}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setError("");
                        }}
                        className="pr-14"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowPassword((v) => !v)}
                        disabled={loading || sending || authenticated}
                        className="absolute right-1 top-1/2 -translate-y-1/2"
                        aria-label={showPassword ? "隐藏密码" : "显示密码"}
                      >
                        <PasswordVisibilityIcon visible={showPassword} />
                      </Button>
                    </div>
                  </FormField>
                )}
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
                    ? "登录中..."
                    : authenticated
                      ? "重试加载"
                      : "立即登录"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="mt-7 flex items-center justify-between gap-4 text-sm">
            <div className="text-foreground-muted">
              没有账号？{" "}
              <button
                type="button"
                onClick={openRegistration}
                disabled={loading || sending || authenticated}
                aria-label="没有账号，立即注册"
                className="rounded-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
              >
                注册账号
              </button>
            </div>
            <button
              type="button"
              disabled={loading || sending || authenticated}
              onClick={() => {
                if (!loading && !sending && !authenticated)
                  router.push("/forgot-password");
              }}
              className="shrink-0 rounded-sm text-foreground-muted hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
            >
              忘记密码
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
