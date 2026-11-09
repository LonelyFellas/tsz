"use client";
import { localText, type WebNotice } from "@/i18n/catalog";

import { useWebText } from "@/i18n/client";
import { webAuthAccess as webAuth } from "@/i18n/messages/auth/access";

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
import { AuthShell } from "./AuthShell";
import { PasswordVisibilityIcon } from "./PasswordVisibilityIcon";
import {
  completeAuthentication,
  persistSession,
  securityErrorMessage,
  translateAuthError
} from "../shared";

// 后端对「账号不存在」与「密码错误」返回相同的 401，避免账号枚举。
const LOGIN_ERRORS: Record<string, WebNotice> = {
  "invalid credentials": localText(
    webAuth,
    "webAuthAccess:incorrect_account_or_password_try_again"
  ),
  "identifier is invalid": localText(
    webAuth,
    "webAuthAccess:invalid_phone_number_or_email_check_and_try_again"
  ),
  forbidden: localText(
    webAuth,
    "webAuthAccess:this_account_is_disabled_contact_support"
  )
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
  const uiText = useWebText(webAuth);
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
  const [error, setError] = useState<WebNotice>("");
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
      if (!signal.aborted)
        setError(
          localText(
            webAuth,
            "webAuthAccess:signed_in_but_account_details_could_not_be_loaded_try_again"
          )
        );
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
            ? localText(
                webAuth,
                "webAuthAccess:incorrect_phone_number_or_verification_code_check_and_try_again"
              )
            : securityErrorMessage(e)
        );
        setCode("");
      } else if (
        e instanceof HttpError &&
        (e.code === "login_rate_limited" || e.code === "login_unavailable")
      ) {
        setError(securityErrorMessage(e));
      } else {
        const msg = e instanceof Error ? e.message : "";
        setError(
          translateAuthError(
            msg,
            LOGIN_ERRORS,
            localText(
              webAuth,
              "webAuthAccess:could_not_sign_in_try_again_later"
            )
          )
        );
      }
    } finally {
      pending.current = false;
      if (!signal.aborted) setLoading(false);
      if (pendingRequest.current === controller) pendingRequest.current = null;
    }
  }

  return (
    <AuthShell>
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-foreground">
        {uiText("webAuthAccess:sign_in")}
      </h1>

      {securitySuccess && (
        <p
          role="status"
          className="mb-6 rounded-lg bg-success/10 px-4 py-3 text-sm text-success"
        >
          {uiText(
            "webAuthAccess:account_security_details_updated_sign_in_again_with_your_currently_bound"
          )}
        </p>
      )}
      {resetSuccess && (
        <p
          role="status"
          className="mb-6 rounded-lg bg-success/10 px-4 py-3 text-sm text-success"
        >
          {uiText(
            "webAuthAccess:password_reset_sign_in_with_your_new_password"
          )}
        </p>
      )}
      {deletedSuccess && (
        <p
          role="status"
          className="mb-6 rounded-lg bg-success/10 px-4 py-3 text-sm text-success"
        >
          {uiText("webAuthAccess:account_deleted")}
        </p>
      )}
      {registeredSuccess && (
        <p
          role="status"
          className="mb-6 rounded-lg bg-success/10 px-4 py-3 text-sm text-success"
        >
          {uiText(
            "webAuthAccess:account_created_sign_in_with_the_password_you_just_set"
          )}
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
        <TabsList
          className="mb-7"
          aria-label={uiText("webAuthAccess:sign_in_method")}
        >
          <TabsTrigger
            value="password"
            disabled={loading || sending || authenticated}
            className={sending ? "disabled:opacity-100" : undefined}
          >
            {uiText("webAuthAccess:password_sign_in")}
          </TabsTrigger>
          <TabsTrigger
            value="code"
            disabled={loading || sending || authenticated}
            className={sending ? "disabled:opacity-100" : undefined}
          >
            {uiText("webAuthAccess:code_sign_in")}
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
              label={
                codeLogin
                  ? uiText("webAuthAccess:phone_number")
                  : uiText("webAuthAccess:phone_number_or_email")
              }
            >
              <Input
                id="login-account"
                type={codeLogin ? "tel" : "text"}
                autoComplete="username"
                placeholder={
                  codeLogin
                    ? uiText("webAuthAccess:enter_a_phone_number")
                    : uiText("webAuthAccess:enter_your_phone_number_or_email")
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
              <FormField
                htmlFor="login-code"
                label={uiText("webAuthAccess:verification_code")}
              >
                <div className="flex gap-2">
                  <Input
                    id="login-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder={uiText("webAuthAccess:enter_the_6_digit_code")}
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
                      ? uiText("webAuthAccess:sending_2")
                      : countdown
                        ? uiText("webAuthAccess:resend_in_v0_s", {
                            v0: countdown
                          })
                        : uiText("webAuthAccess:get_code")}
                  </Button>
                </div>
              </FormField>
            ) : (
              <FormField
                htmlFor="login-password"
                label={uiText("webAuthAccess:password_2")}
              >
                <div className="relative">
                  <Input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder={uiText(
                      "webAuthAccess:enter_your_sign_in_password"
                    )}
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
            )}
            {error && (
              <p role="alert" className="mx-4 text-sm leading-5 text-danger">
                {uiText(error)}
              </p>
            )}
            <Button type="submit" disabled={!canSubmit} className="w-full">
              {loading
                ? uiText("webAuthAccess:signing_in")
                : authenticated
                  ? uiText("webAuthAccess:retry_loading")
                  : uiText("webAuthAccess:sign_in_3")}
            </Button>
          </form>
        </TabsContent>
      </Tabs>

      <div className="mt-7 flex items-center justify-between gap-4 text-sm">
        <div className="text-foreground-muted">
          {uiText("webAuthAccess:no_account_yet")}{" "}
          <button
            type="button"
            onClick={openRegistration}
            disabled={loading || sending || authenticated}
            aria-label={uiText("webAuthAccess:no_account_create_one")}
            className="rounded-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
          >
            {uiText("webAuthAccess:create_account")}
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
          {uiText("webAuthAccess:forgot_password")}
        </button>
      </div>
    </AuthShell>
  );
}
