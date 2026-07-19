"use client";

import { isEmail, isPhone, isRegisterPassword } from "@tsz/shared";
import { useState, type FormEvent } from "react";
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

// 对齐 tsz-rust 真实错误文案:手机/邮箱占用统一返回 409 "user already exists"。
const REGISTER_ERRORS: Record<string, string> = {
  "user already exists": "该账号已注册，请直接登录"
};

const TABS: { id: Tab; label: string }[] = [
  { id: "phone", label: "手机" },
  { id: "email", label: "邮箱" }
];

export function RegisterForm() {
  const [tab, setTab] = useState<Tab>("phone");
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const setUser = useUserStore((s) => s.setUser);
  const router = useRouter();

  const accountValid = tab === "phone" ? isPhone(account) : isEmail(account);
  const passwordValid = isRegisterPassword(password);
  const canSubmit = accountValid && passwordValid && !loading;

  function switchTab(next: Tab) {
    setTab(next);
    setAccount("");
    setError("");
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setLoading(true);
    try {
      // 业务规则:密码不区分大小写,统一转大写后入库(登录侧同样转换)。
      const normalizedPassword = password.toUpperCase();
      // 注册不自动登录(后端 201 只返回 user_id):注册成功后链式用同一凭证登录换会话。
      // 昵称由后端生成(「同学XXXX」),角色恒 student,前端不再传。
      await api.auth.register({
        // 手机/邮箱二选一：未选中的那个不传（后端按字段是否存在判断）。
        phone: tab === "phone" ? account : undefined,
        email: tab === "email" ? account : undefined,
        password: normalizedPassword
      });
      // 两步不共用 catch:注册已成功(账号已建),链式登录若因网络抖动/瞬时 5xx
      // 失败,按「注册失败」报错会误导用户重试再撞 409。改为带成功提示去登录页。
      let auth;
      try {
        auth = await api.auth.login(account, normalizedPassword);
      } catch {
        router.push("/login?registered=success");
        return;
      }
      persistSession(auth);
      setUser(auth.user);
      // navigateAfterAuth 拉 /me 决定是否进 onboarding(后端未实现前恒跳过)。
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

            {/* 验证码栏暂撤:后端注册接口不校验 OTP(Purpose 枚举也无 register),
                挂一个不被校验的验证码框只会误导用户「已验证」。等后端注册纳入
                OTP 校验后,恢复 sendCode(account, "register") + code 提交。 */}

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
