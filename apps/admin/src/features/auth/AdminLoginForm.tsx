import { HttpError } from "@tsz/api-client";
import { isValidAccount } from "@tsz/shared";
import { translateAuthError } from "@tsz/shared/auth";
import { Alert, Button, Card, Form, Input, Typography } from "antd";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FullscreenCenter } from "@/layouts/FullscreenCenter";
import { api, persistSession, tokens, useAuthStore } from "@/lib/auth";

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

// antd Form 在此负责「原生提交」（htmlType=submit + onFinish）：让浏览器把这次交互识别为
// 一次登录，从而触发密码管理器的「保存密码」提示（纯 onClick + XHR 的 SPA 登录识别率很低）。
// 回车由表单隐式提交驱动，不再单挂 onPressEnter，避免与 submit 双触发后端请求。
// 但 Form 不接管字段状态：
// 1) 交互沿用「未达标只禁用按钮、不飘红」，用不上 rules 校验（onFinish 里由 canSubmit 兜底）；
// 2) Form.useWatch 在 antd v6 + React 19 的 jsdom 测试环境下不触发重渲染，
//    受控 useState 是能被测试覆盖的可靠写法。
export function AdminLoginForm() {
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // 账号被后端锁定(连续失败触发 423):置灰登录按钮,阻断徒劳的连点重试。
  // 以后端 423 为唯一事实来源,前端不本地计数;用户改动账号/密码(新尝试意图)时解除。
  const [locked, setLocked] = useState(false);

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

  // admin 密码后端规则为长度 8–72；此处提前拦下过短输入。锁定期间禁提交。
  const canSubmit =
    isValidAccount(account) && password.length >= 8 && !loading && !locked;

  // 输入变更即视为新一次尝试意图：清错误 + 解除锁定置灰（仍在锁定窗口内会再拿到 423）。
  function onAccountChange(value: string) {
    setAccount(value);
    if (error) setError("");
    if (locked) setLocked(false);
  }
  function onPasswordChange(value: string) {
    setPassword(value);
    if (error) setError("");
    if (locked) setLocked(false);
  }

  // 登录态落地：登录响应不含菜单权限（permissions），故拉一次 /profile 作为其唯一事实来源
  // （与会话恢复走同一探针），写入用户态 store 后跳转进后台。用 replace：不把 /login 留在历史，
  // 避免「后退」回登录页。
  async function enterConsole() {
    setProfile(await api.profile());
    navigate(safeRedirect(searchParams.get("redirect")), { replace: true });
  }

  async function handleLogin() {
    if (!canSubmit) return;
    setError("");
    setLoading(true);
    try {
      // 后台是独立账号体系：登录成功即为有效 admin，无需再判角色。
      const auth = await api.auth.login(account, password);
      // change-password 是 must_change 期间少数可达端点之一、需 Bearer——故先建立 access token。
      persistSession(auth);
      if (auth.must_change_password) {
        // 挂起登录态：不 setProfile（不放行进后台），跳独立改密页（profile 空 → 该页判定为强制改密）；
        // 刚输入的临时密码经路由 state 预填当前密码，省一次重输。
        navigate("/change-password", { state: { currentPassword: password } });
        return;
      }
      try {
        await enterConsole();
      } catch {
        // 登录本身已成功、persistSession 已建立 access token + 刷新定时器，但拉 /profile 失败。
        // 撤销刚建立的会话（setAccessToken(null) 连带 clearTimeout 清定时器），避免留下
        // 「token 活着自我续期、profile 恒 null」的挂起态；文案不与「凭证错误」混淆，提示重试。
        tokens.setAccessToken(null);
        setError("登录成功但加载账号信息失败，请重试");
      }
    } catch (e: unknown) {
      // 423 = 账号被临时锁定（连续失败触发）：区别于 401 凭证错，置灰按钮并提示 15 分钟后再试。
      if (e instanceof HttpError && e.status === 423) {
        setError("账号已被锁定，请约 15 分钟后再试");
        setLocked(true);
        return;
      }
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

        <Form layout="vertical" onFinish={() => void handleLogin()}>
          <Form.Item label="手机号 / 邮箱">
            <Input
              placeholder="请输入手机号或邮箱"
              autoComplete="username"
              value={account}
              onChange={(e) => onAccountChange(e.target.value)}
            />
          </Form.Item>
          <Form.Item label="密码">
            <Input.Password
              placeholder="请输入登录密码"
              autoComplete="current-password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
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
            htmlType="submit"
            block
            loading={loading}
            disabled={!canSubmit}
          >
            {loading ? "登录中..." : "登录"}
          </Button>
        </Form>
      </Card>
    </FullscreenCenter>
  );
}
