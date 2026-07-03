import { isValidAccount } from "@tsz/shared";
import { translateAuthError } from "@tsz/shared/auth";
import { Alert, Button, Card, Form, Input, Typography } from "antd";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FullscreenCenter } from "@/layouts/FullscreenCenter";
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

// antd Form 在此只做布局（label/间距），不接管字段状态：
// 1) 交互沿用「未达标只禁用按钮、不飘红」，用不上 rules 校验；
// 2) Form.useWatch 在 antd v6 + React 19 的 jsdom 测试环境下不触发重渲染，
//    受控 useState 是能被测试覆盖的可靠写法。
export function AdminLoginForm() {
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
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
    <FullscreenCenter>
      <Card style={{ width: "100%", maxWidth: 384 }}>
        <Typography.Title level={3} style={{ marginBottom: 4 }}>
          平台后台
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 24 }}>
          请使用管理员账号登录
        </Typography.Paragraph>

        <Form layout="vertical">
          <Form.Item label="手机号 / 邮箱">
            <Input
              placeholder="请输入手机号或邮箱"
              autoComplete="username"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            />
          </Form.Item>
          <Form.Item label="密码">
            <Input.Password
              placeholder="请输入登录密码"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onPressEnter={() => void handleLogin()}
            />
          </Form.Item>

          {error && (
            <Alert
              type="error"
              title={error}
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}

          <Button
            type="primary"
            block
            loading={loading}
            disabled={!canSubmit}
            onClick={() => void handleLogin()}
          >
            {loading ? "登录中..." : "登录"}
          </Button>
        </Form>
      </Card>
    </FullscreenCenter>
  );
}
