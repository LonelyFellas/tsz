import {
  HttpError,
  InvalidAdminProfileResponseError,
  ADMIN_PERMISSION_UPGRADE_MESSAGE
} from "@tsz/api-client";
import { isCode, isPhone, readTestResourceRun } from "@tsz/shared";
import { translateAuthError } from "@tsz/shared/auth";
import {
  Alert,
  Button,
  Divider,
  InputAdornment,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { useForm } from "react-hook-form";
import { PasswordField } from "@/components/PasswordField";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, persistSession, tokens, useAuthStore } from "@/lib/auth";
import "./admin-login.css";

const LOGIN_ERRORS: Record<string, string> = {
  // 401：密码错 / 验证码错 / 查无此号逐字节一致（防枚举），前端统一文案不区分。
  "invalid credentials": "账号、密码或验证码错误，请重新输入",
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

// 保留原生表单提交，避免回车与点击重复触发登录。
export function AdminLoginForm() {
  const { watch, setValue, handleSubmit } = useForm({
    defaultValues: { account: "", password: "", code: "" }
  });
  const { account, password, code } = watch();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // 验证码倒计时（发码后 60s 内禁止重发）与在途发码态。
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  // 账号被后端锁定(连续失败触发 423):置灰登录按钮,阻断徒劳的连点重试。
  // 以后端 423 为唯一事实来源,前端不本地计数;用户改动账号/密码(新尝试意图)时解除。
  const [locked, setLocked] = useState(false);
  // 同步在途锁：setLoading 是异步的，两次原生提交若落在同一帧（快速连按 Enter），
  // 按钮 disabled 尚未重渲染、handleLogin 闭包里的 canSubmit 仍为旧值，会双发登录请求。
  // 用 ref 在进入时立即置真、finally 复位，堵住这个竞态。
  const inFlight = useRef(false);

  const setProfile = useAuthStore((s) => s.setProfile);
  const profile = useAuthStore((s) => s.profile);
  const permissionModelIncompatible = useAuthStore(
    (s) => s.permissionModelIncompatible
  );
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const redirect = safeRedirect(searchParams.get("redirect"));

  // 已登录的管理员访问登录页：直接进后台。
  useEffect(() => {
    // 登录和强制改密都可能在首次业务请求前跳转，先保留显式测试批次。
    readTestResourceRun();
    if (profile) {
      navigate(redirect, { replace: true });
    }
  }, [profile, navigate, redirect]);

  // 验证码倒计时（与 web 端一致：发码后 60→0 递减）。
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // 三要素 2FA：手机号 + 密码(必填，原样验证) + 验证码(4–8 位数字) 齐全才可提交；锁定期间禁提交。
  const canSubmit =
    isPhone(account) &&
    password.length > 0 &&
    isCode(code) &&
    !loading &&
    !locked;
  // 发码：仅手机号合法、不在倒计时、无在途发码时可点。
  const canSendCode = isPhone(account) && countdown === 0 && !sending;

  // 输入变更即视为新一次尝试意图：清错误 + 解除锁定置灰（仍在锁定窗口内会再拿到 423）。
  function onAccountChange(value: string) {
    setValue("account", value);
    if (error) setError("");
    if (locked) setLocked(false);
  }
  function onPasswordChange(value: string) {
    setValue("password", value);
    if (error) setError("");
    if (locked) setLocked(false);
  }
  function onCodeChange(value: string) {
    setValue("code", value);
    if (error) setError("");
    if (locked) setLocked(false);
  }

  // 登录态落地：登录响应不含菜单权限（permissions），故拉一次 /profile 作为其唯一事实来源
  // （与会话恢复走同一探针），写入用户态 store 后跳转进后台。用 replace：不把 /login 留在历史，
  // 避免「后退」回登录页。
  async function enterConsole() {
    setProfile(await api.profile());
    navigate(redirect, { replace: true });
  }

  // 2FA 第一步：发码。后端恒 202（查无此号/冷却也 202），前端只据成功与否起倒计时。
  async function handleSendCode() {
    if (!canSendCode) return;
    setError("");
    setSending(true);
    try {
      await api.auth.requestLoginCode(account);
      setCountdown(60);
    } catch {
      // 发码失败（手机格式 400 / 基础设施 503）：提示重试，不进入倒计时（按钮仍可点）。
      setError("验证码发送失败，请稍后重试");
    } finally {
      setSending(false);
    }
  }

  async function handleLogin() {
    if (inFlight.current || !canSubmit) return;
    inFlight.current = true;
    setError("");
    setLoading(true);
    try {
      // 后台是独立账号体系：登录成功即为有效 admin，无需再判角色。
      const auth = await api.auth.login(account, password, code);
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
      } catch (profileError) {
        // 登录本身已成功、persistSession 已建立 access token + 刷新定时器，但拉 /profile 失败。
        // 撤销刚建立的会话（setAccessToken(null) 连带 clearTimeout 清定时器），避免留下
        // 「token 活着自我续期、profile 恒 null」的挂起态；文案不与「凭证错误」混淆，提示重试。
        tokens.setAccessToken(null);
        setError(
          profileError instanceof InvalidAdminProfileResponseError
            ? profileError.message
            : "登录成功但加载账号信息失败，请重试"
        );
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
      inFlight.current = false;
    }
  }

  return (
    <div className="admin-login">
      {/* ── 品牌区 ── */}
      <header className="admin-login__plate">
        <div className="admin-login__masthead">
          <div className="admin-login__brandblock admin-login__a1">
            <div className="admin-login__mark" aria-hidden>
              天
            </div>
            <div>
              <h1 className="admin-login__brand">
                天生会背
                <span className="admin-login__postag">平台后台</span>
              </h1>
              <p className="admin-login__lede">请使用管理员账号登录</p>
            </div>
          </div>
        </div>
      </header>

      {/* ── 表单 ── */}
      <main className="admin-login__body">
        <section className="admin-login__col admin-login__a4">
          <div className="admin-login__col-head">
            <Typography
              component="h2"
              sx={{ fontSize: 26, lineHeight: 1.4, fontWeight: 600 }}
            >
              管理员登录
            </Typography>
            <Typography
              sx={{
                mt: 0.75,
                fontSize: 14,
                lineHeight: 1.7,
                color: "text.secondary"
              }}
            >
              使用管理员账号进入工作台
            </Typography>
          </div>

          {/* 三项凭据同宽对齐；发码操作位于验证码输入的上下文中。 */}
          <Stack
            component="form"
            spacing={2.5}
            onSubmit={handleSubmit(handleLogin)}
          >
            <TextField
              fullWidth
              size="medium"
              label="手机号"
              placeholder="请输入手机号"
              autoComplete="username"
              value={account}
              onChange={(event) => onAccountChange(event.target.value)}
              slotProps={{ htmlInput: { inputMode: "tel" } }}
            />
            <PasswordField
              fullWidth
              size="medium"
              label="登录密码"
              placeholder="请输入登录密码"
              autoComplete="current-password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
            />
            <TextField
              fullWidth
              size="medium"
              label="验证码"
              placeholder="请输入验证码"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => onCodeChange(event.target.value)}
              slotProps={{
                htmlInput: { inputMode: "numeric" },
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <Divider
                        orientation="vertical"
                        flexItem
                        sx={{ height: 24, alignSelf: "center", mr: 1 }}
                      />
                      <Button
                        size="small"
                        type="button"
                        onClick={() => void handleSendCode()}
                        disabled={!canSendCode}
                        sx={{
                          minWidth: 100,
                          px: 1,
                          whiteSpace: "nowrap",
                          fontSize: 13,
                          fontVariantNumeric: "tabular-nums"
                        }}
                      >
                        {countdown > 0
                          ? `${countdown}s 后重发`
                          : sending
                            ? "发送中..."
                            : "获取验证码"}
                      </Button>
                    </InputAdornment>
                  )
                }
              }}
            />

            {(error || permissionModelIncompatible) && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {permissionModelIncompatible
                  ? ADMIN_PERMISSION_UPGRADE_MESSAGE
                  : error}
              </Alert>
            )}

            <Button
              variant="contained"
              type="submit"
              fullWidth
              size="medium"
              loading={loading}
              sx={{ height: 48, fontSize: 15, fontWeight: 600 }}
              disabled={!canSubmit}
            >
              {loading ? "登录中..." : "登录"}
            </Button>
          </Stack>
        </section>
      </main>

      <footer className="admin-login__foot">
        <span>© {new Date().getFullYear()} 天生会背</span>
        <span>平台后台 · 词条编辑与发布</span>
      </footer>
    </div>
  );
}
