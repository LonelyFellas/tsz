"use client";

import { isValidAccount } from "@tsz/shared";
import { Button, FormField, Input } from "@tsz/ui/components";
import type { AuthResponse } from "@tsz/api-client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/request";
import { AuthBranding } from "./AuthBranding";
import { PasswordVisibilityIcon } from "./PasswordVisibilityIcon";
import {
  completeAuthentication,
  persistSession,
  translateAuthError
} from "../shared";

// 后端对「账号不存在」与「密码错误」返回相同的 401，避免账号枚举。
const LOGIN_ERRORS: Record<string, string> = {
  "invalid credentials": "账号或密码错误，请重新输入",
  "identifier is invalid": "手机号或邮箱格式错误，请检查后重试",
  forbidden: "该账号已被禁用，请联系客服"
};

export function LoginForm() {
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
  const canSubmit =
    (authenticated || (isValidAccount(identifier) && password.length > 0)) &&
    !loading;

  const resetSuccess = searchParams.get("reset") === "success";
  const securitySuccess = searchParams.get("security") === "success";
  const deletedSuccess = searchParams.get("deleted") === "success";
  const registeredSuccess = searchParams.get("registered") === "success";

  function openRegistration() {
    if (loading || authenticated) return;
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
    if (!canSubmit) return;
    const controller = new AbortController();
    pendingRequest.current = controller;
    const { signal } = controller;
    setError("");
    setLoading(true);
    try {
      if (authenticated) {
        await loadProfile(signal);
      } else {
        const auth = await api.auth.login(identifier, password, { signal });
        await onAuthSuccess(auth, signal);
      }
    } catch (e: unknown) {
      if (signal.aborted) return;
      const msg = e instanceof Error ? e.message : "";
      setError(translateAuthError(msg, LOGIN_ERRORS, "登录失败，请稍后重试"));
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

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleLogin();
            }}
            className="space-y-5"
          >
            <FormField htmlFor="login-account" label="手机号或邮箱">
              <Input
                id="login-account"
                type="text"
                autoComplete="username"
                placeholder="请输入手机号或邮箱"
                value={account}
                disabled={loading || authenticated}
                onChange={(e) => {
                  setAccount(e.target.value);
                  setError("");
                }}
              />
            </FormField>
            <FormField htmlFor="login-password" label="密码">
              <div className="relative">
                <Input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="请输入登录密码"
                  value={password}
                  disabled={loading || authenticated}
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
                  disabled={loading || authenticated}
                  className="absolute right-1 top-1/2 -translate-y-1/2"
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                >
                  <PasswordVisibilityIcon visible={showPassword} />
                </Button>
              </div>
            </FormField>
            {error && (
              <p role="alert" className="mx-4 text-sm leading-5 text-danger">
                {error}
              </p>
            )}
            <Button type="submit" disabled={!canSubmit} className="w-full">
              {loading ? "登录中..." : authenticated ? "重试加载" : "立即登录"}
            </Button>
          </form>

          <div className="mt-7 flex items-center justify-between gap-4 text-sm">
            <div className="text-foreground-muted">
              没有账号？{" "}
              <button
                type="button"
                onClick={openRegistration}
                disabled={loading || authenticated}
                aria-label="没有账号，立即注册"
                className="rounded-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
              >
                注册账号
              </button>
            </div>
            <button
              type="button"
              disabled={loading || authenticated}
              onClick={() => {
                if (!loading && !authenticated) router.push("/forgot-password");
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
