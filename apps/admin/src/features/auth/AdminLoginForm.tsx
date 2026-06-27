"use client";

import { isValidAccount } from "@tsz/shared";
import { translateAuthError } from "@tsz/shared/auth";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, persistSession, tokens, useAuthStore } from "@/lib/auth";

const INPUT_CLASS =
  "w-full rounded-lg border border-gray-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500";

const LOGIN_ERRORS: Record<string, string> = {
  "invalid credentials": "账号或密码错误，请重新输入",
  "account disabled": "该账号已被禁用",
  "admin role required": "该账号无平台后台权限"
};

export function AdminLoginForm() {
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const setUser = useAuthStore((s) => s.setUser);
  const setActiveRole = useAuthStore((s) => s.setActiveRole);
  const user = useAuthStore((s) => s.user);
  const activeRole = useAuthStore((s) => s.activeRole);
  const router = useRouter();
  const searchParams = useSearchParams();

  // 已是登录的管理员访问登录页：直接进后台。
  useEffect(() => {
    if (user && activeRole === "admin") {
      router.replace(searchParams.get("redirect") ?? "/");
    }
  }, [user, activeRole, router, searchParams]);

  const canSubmit = isValidAccount(account) && password.length >= 6 && !loading;

  async function handleLogin() {
    if (!canSubmit) return;
    setError("");
    setLoading(true);
    try {
      // 业务规则：密码不区分大小写，与注册一致统一转大写。
      const auth = await api.auth.login(account, password.toUpperCase());

      // 后台门禁看「当前激活角色」：非 admin 不放行（独立 admin 账号登录后即为 admin）。
      if (auth.active_role !== "admin") {
        tokens.setAccessToken(null);
        setError("该账号无平台后台权限，请使用管理员账号登录");
        return;
      }

      persistSession(auth);
      setUser(auth.user);
      setActiveRole(auth.active_role);
      router.push(searchParams.get("redirect") ?? "/");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      setError(translateAuthError(msg, LOGIN_ERRORS, "登录失败，请稍后重试"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-2xl font-bold text-gray-900">平台后台</h1>
        <p className="mb-8 text-sm text-gray-400">请使用管理员账号登录</p>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-gray-700">
              手机号 / 邮箱
            </label>
            <input
              type="text"
              placeholder="请输入手机号或邮箱"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-700">密码</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="请输入登录密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                className={`${INPUT_CLASS} pr-12`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label={showPassword ? "隐藏密码" : "显示密码"}
              >
                {showPassword ? "🙈" : "👁"}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            onClick={handleLogin}
            disabled={!canSubmit}
            className="w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "登录中..." : "登录"}
          </button>
        </div>
      </div>
    </div>
  );
}
