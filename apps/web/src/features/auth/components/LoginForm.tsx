"use client";

import { isValidAccount } from "@tsz/shared";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { TOKEN_COOKIE } from "@/lib/constants";

type Tab = "password" | "phone" | "email";

const ERROR_MAP: Record<string, string> = {
  "invalid credentials": "账号或密码错误，请重新输入",
  "user not found": "该账号不存在",
  "session expired": "登录已过期，请重新登录",
  "invalid refresh token": "登录已过期，请重新登录"
};

function toChineseError(msg: string): string {
  const key = msg.toLowerCase().trim();
  return ERROR_MAP[key] ?? (msg || "登录失败，请稍后重试");
}

const TABS: { id: Tab; label: string }[] = [
  { id: "password", label: "账号密码" },
  { id: "phone", label: "手机验证码" },
  { id: "email", label: "邮箱验证码" }
];

export function LoginForm() {
  const [tab, setTab] = useState<Tab>("password");
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const setUser = useUserStore((s) => s.setUser);
  const router = useRouter();
  const searchParams = useSearchParams();

  const accountValid = isValidAccount(account);
  const passwordValid = password.length >= 6;
  const canSubmit = accountValid && passwordValid && !loading;

  async function handleLogin() {
    if (!canSubmit) return;
    setError("");
    setLoading(true);
    try {
      const { user, access_token, refresh_token } = await api.auth.login(
        account,
        password
      );
      document.cookie = `${TOKEN_COOKIE}=${access_token}; path=/; max-age=900`;
      document.cookie = `tsz_refresh_token=${refresh_token}; path=/; max-age=${60 * 60 * 24 * 30}`;
      setUser(user);
      const redirect = searchParams.get("redirect") ?? "/";
      router.push(redirect);
    } catch (e: unknown) {
      setError(toChineseError(e instanceof Error ? e.message : ""));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center px-16 bg-blue-600 text-white">
        <div className="flex items-center gap-3 mb-6">
          <span className="text-2xl">📖</span>
          <span className="text-3xl font-bold">天生会背</span>
        </div>
        <p className="text-lg mb-2">智能英语单词学习平台</p>
        <p className="text-sm opacity-80 mb-12">
          科学记忆算法 · 个性化学习路径 · 高效词汇掌握
        </p>
        <ul className="space-y-5 text-sm">
          {["实时学习进度跟踪", "智能记忆算法优化", "名校教材同步词库"].map(
            (item) => (
              <li key={item} className="flex items-center gap-3 opacity-90">
                <span className="w-6 h-6 rounded-full border border-white/50 flex items-center justify-center text-xs">
                  ✓
                </span>
                {item}
              </li>
            )
          )}
        </ul>
      </div>

      {/* Right panel */}
      <div className="flex flex-1 items-center justify-center px-8 py-16 bg-white">
        <div className="w-full max-w-sm">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">欢迎回来</h1>

          {/* Tabs */}
          <div className="flex gap-6 mb-8 border-b border-gray-100">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => {
                  setTab(id);
                  setError("");
                }}
                className={`pb-3 text-sm font-medium transition-colors ${
                  tab === id
                    ? "text-blue-600 border-b-2 border-blue-600"
                    : "text-gray-400 hover:text-gray-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "password" ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  手机号/邮箱号码
                </label>
                <input
                  type="text"
                  placeholder="请输入手机号/邮箱号码"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  className="w-full rounded-full border border-gray-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">密码</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="请输入登录密码"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    className="w-full rounded-full border border-gray-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 pr-12"
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
                className="w-full rounded-full bg-blue-600 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? "登录中..." : "立即登录"}
              </button>

              <button
                onClick={() => router.push("/register")}
                className="w-full rounded-full border border-gray-200 py-3 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                没有账号，立即注册
              </button>

              <p className="text-center text-sm text-blue-500 cursor-pointer hover:underline">
                忘记密码
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  {tab === "phone" ? "手机号" : "邮箱"}
                </label>
                <input
                  type={tab === "email" ? "email" : "tel"}
                  placeholder={tab === "phone" ? "请输入手机号" : "请输入邮箱"}
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  className="w-full rounded-full border border-gray-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <p className="text-sm text-gray-400 text-center py-4">
                验证码登录暂未开放
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
