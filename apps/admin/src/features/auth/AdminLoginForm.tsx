import { HttpError, InvalidAdminProfileResponseError } from "@tsz/api-client";
import { isCode, isPhone, readTestResourceRun } from "@tsz/shared";
import { useAdminTranslation } from "@/i18n";
import { adminAuthError } from "@/i18n/auth";
import type { AdminShellKey } from "@/i18n/resources";
import { InterfaceLanguage } from "@/features/settings/InterfaceLanguage";
import { ArrowRightIcon } from "lucide-react";
import { Alert, Button } from "@tsz/ui/admin/display";
import { Form, Input } from "@tsz/ui/admin/forms";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, persistSession, tokens, useAuthStore } from "@/lib/auth";
import "./admin-login.css";

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
export function AdminLoginForm({
  connectionNotice
}: { connectionNotice?: ReactNode } = {}) {
  const { t } = useAdminTranslation();
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AdminShellKey | { cause: unknown } | "">(
    ""
  );
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

  // 已登录的管理员访问登录页：直接进后台。
  useEffect(() => {
    // 登录和强制改密都可能在首次业务请求前跳转，先保留显式测试批次。
    readTestResourceRun();
    if (profile) {
      navigate(safeRedirect(searchParams.get("redirect")), { replace: true });
    }
  }, [profile, navigate, searchParams]);

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
    setAccount(value);
    if (error) setError("");
    if (locked) setLocked(false);
  }
  function onPasswordChange(value: string) {
    setPassword(value);
    if (error) setError("");
    if (locked) setLocked(false);
  }
  function onCodeChange(value: string) {
    setCode(value);
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
      setError("auth_code_failed");
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
            ? "auth_upgrade"
            : "auth_profile_failed"
        );
      }
    } catch (e: unknown) {
      // 423 = 账号被临时锁定（连续失败触发）：区别于 401 凭证错，置灰按钮并提示 15 分钟后再试。
      if (e instanceof HttpError && e.status === 423) {
        setError("auth_locked");
        setLocked(true);
        return;
      }
      setError({ cause: e });
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }

  return (
    <main className="admin-login">
      <div className="admin-login__layout">
        <section className="admin-login__brand-panel" aria-label="天生会背">
          <div className="admin-login__brand">
            <span className="admin-login__mark" aria-hidden>
              天
            </span>
            <span>天生会背</span>
          </div>
          <div className="admin-login__artwork" aria-hidden>
            <div className="admin-login__paper admin-login__paper--back" />
            <div className="admin-login__paper admin-login__paper--middle" />
            <div className="admin-login__paper admin-login__paper--front">
              <div className="admin-login__letterform">
                Aa
                <span className="admin-login__letter-dot" />
              </div>
              <div className="admin-login__paper-word">
                possibility<span>/ˌpɒsəˈbɪləti/</span>
              </div>
              <div className="admin-login__paper-definition">
                <span>n.</span> 可能性；可能发生的事
              </div>
              <div className="admin-login__bookmark" />
            </div>
          </div>
        </section>

        <section
          className="admin-login__panel"
          aria-labelledby="admin-login-heading"
        >
          <header className="admin-login__header">
            <span className="admin-login__mobile-brand">
              <span className="admin-login__mark" aria-hidden>
                天
              </span>
              天生会背
            </span>
            <span className="admin-login__platform">{t("login_platform")}</span>
          </header>

          <div className="admin-login__card">
            <h1 id="admin-login-heading">{t("login_title")}</h1>
            {connectionNotice}
            <Form
              className="admin-login__form"
              layout="vertical"
              requiredMark={false}
              onFinish={() => void handleLogin()}
            >
              <Form.Item label={t("login_phone")} htmlFor="admin-login-phone">
                <Input
                  id="admin-login-phone"
                  size="large"
                  placeholder={t("login_phone_placeholder")}
                  autoComplete="username"
                  inputMode="tel"
                  value={account}
                  onChange={(e) => onAccountChange(e.target.value)}
                />
              </Form.Item>

              <Form.Item
                label={t("login_password")}
                htmlFor="admin-login-password"
              >
                <Input.Password
                  id="admin-login-password"
                  size="large"
                  placeholder={t("login_password_placeholder")}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => onPasswordChange(e.target.value)}
                />
              </Form.Item>

              <Form.Item
                className="admin-login__code-item"
                label={t("login_code")}
                htmlFor="admin-login-code"
              >
                <div className="admin-login__code-control">
                  <Input
                    id="admin-login-code"
                    size="large"
                    placeholder={t("login_code_placeholder")}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => onCodeChange(e.target.value)}
                  />
                  <Button
                    className="admin-login__send-code"
                    type="text"
                    htmlType="button"
                    onClick={() => void handleSendCode()}
                    disabled={!canSendCode}
                  >
                    {countdown > 0
                      ? t("login_countdown", { seconds: countdown })
                      : sending
                        ? t("login_sending")
                        : t("login_send_code")}
                  </Button>
                </div>
              </Form.Item>

              {(error || permissionModelIncompatible) && (
                <Alert
                  className="admin-login__alert"
                  type="error"
                  title={
                    permissionModelIncompatible
                      ? t("auth_upgrade")
                      : typeof error === "string"
                        ? error
                          ? t(error)
                          : ""
                        : adminAuthError(error.cause, t, "auth_login_failed")
                  }
                  showIcon
                />
              )}

              <Button
                className={
                  loading
                    ? "admin-login__submit admin-login__submit--busy"
                    : "admin-login__submit"
                }
                type="primary"
                htmlType="submit"
                block
                size="large"
                loading={loading}
                disabled={!canSubmit}
              >
                {loading ? (
                  t("login_submitting")
                ) : (
                  <>
                    {t("login_submit")}
                    <ArrowRightIcon aria-hidden />
                  </>
                )}
              </Button>
            </Form>
          </div>

          <footer className="admin-login__footer">
            <InterfaceLanguage compact />
            <span>© {new Date().getFullYear()} 天生会背</span>
          </footer>
        </section>
      </div>
    </main>
  );
}
