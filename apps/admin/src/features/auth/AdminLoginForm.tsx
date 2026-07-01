import { isValidAccount } from "@tsz/shared";
import { translateAuthError } from "@tsz/shared/auth";
import { Button, Card, Input, Label } from "@tsz/ui/components";
import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, persistSession, useAuthStore } from "@/lib/auth";

const LOGIN_ERRORS: Record<string, string> = {
  // 401：不区分是账号还是密码错，防枚举。
  "invalid credentials": "账号或密码错误，请重新输入",
  // 403：账号被禁用。
  "account disabled": "该账号已被禁用，请联系超级管理员"
};

// redirect 参数来自 URL、用户可控。只接受站内绝对路径（单个 "/" 开头），拒绝
// "//host"、"/\host"（浏览器会把 \ 规范化为 /，同样是协议相对 URL）、"https://host"
// 这类协议相对/绝对 URL，避免登录后被导去意外目标。回跳到登录页自身也无意义，归一到首页。
function safeRedirect(raw: string | null): string {
  if (
    raw &&
    raw.startsWith("/") &&
    !raw.startsWith("//") &&
    !raw.startsWith("/\\") &&
    raw !== "/login" &&
    !raw.startsWith("/login?")
  ) {
    return raw;
  }
  return "/";
}

export function AdminLoginForm() {
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const setProfile = useAuthStore((s) => s.setProfile);
  const profile = useAuthStore((s) => s.profile);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // 已登录的管理员访问登录页：直接进后台。
  useEffect(() => {
    if (profile) {
      navigate(safeRedirect(searchParams.get("redirect")), { replace: true });
    }
  }, [profile, navigate, searchParams]);

  // admin 密码后端规则为长度 8–72；此处提前拦下过短输入。
  const canSubmit = isValidAccount(account) && password.length >= 8 && !loading;

  async function handleLogin() {
    if (!canSubmit) return;
    setError("");
    setLoading(true);
    try {
      // 后台是独立账号体系：登录成功即为有效 admin，无需再判角色。
      const auth = await api.auth.login(account, password);

      persistSession(auth);
      setProfile({
        id: auth.admin.id,
        phone: auth.admin.phone,
        display_name: auth.admin.display_name,
        level: auth.level
      });
      // 用 replace：登录成功后不把 /login 留在历史，避免「后退」回到登录页。
      navigate(safeRedirect(searchParams.get("redirect")), { replace: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      setError(translateAuthError(msg, LOGIN_ERRORS, "登录失败，请稍后重试"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <Card className="w-full max-w-sm p-8">
        <h1 className="mb-1 text-2xl font-bold text-foreground">平台后台</h1>
        <p className="mb-8 text-sm text-muted-foreground">
          请使用管理员账号登录
        </p>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="account">手机号 / 邮箱</Label>
            <Input
              id="account"
              type="text"
              placeholder="请输入手机号或邮箱"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">密码</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="请输入登录密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? "隐藏密码" : "显示密码"}
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            onClick={handleLogin}
            disabled={!canSubmit}
            className="w-full"
          >
            {loading ? "登录中..." : "登录"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
