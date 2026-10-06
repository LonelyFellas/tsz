"use client";

import { HttpError } from "@tsz/api-client";
import {
  isEmail,
  isPhone,
  isRegisterPassword,
  PASSWORD_HINT,
  passwordLengthError
} from "@tsz/shared";
import type { ContactChannel, User } from "@tsz/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@tsz/ui/components";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, clearSession } from "@/lib/request";
import { AUTH_INPUT_CLASS, securityErrorMessage } from "../shared";
import { PasswordVisibilityIcon } from "./PasswordVisibilityIcon";

const LABELS = { phone: "手机号", email: "邮箱" };
const BUTTON =
  "min-h-12 rounded-full bg-primary px-5 text-sm font-medium text-white transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40";
const CODE_BUTTON =
  "min-h-12 shrink-0 rounded-full border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50";
type ContactAction = { channel: ContactChannel; operation: "bind" | "unbind" };

function contactActionTitle(user: User, action: ContactAction) {
  return `${action.operation === "unbind" ? "解绑" : user[action.channel] ? "换绑" : "绑定"}${LABELS[action.channel]}`;
}

function finishSecurityChange() {
  clearSession();
  window.location.replace("/login?security=success");
}

function handleSecurityError(error: unknown) {
  if (error instanceof HttpError && error.code === "invalid_token") {
    clearSession();
    window.location.replace("/login?session=expired");
  }
  return securityErrorMessage(error);
}

export function AccountSecurity() {
  const [user, setUser] = useState<User | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [action, setAction] = useState<ContactAction | "password" | null>(null);

  useEffect(() => {
    let alive = true;
    api.auth
      .me()
      .then(({ user }) => {
        if (alive) setUser(user);
      })
      .catch(() => {
        if (alive) setLoadError(true);
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  const title =
    action === "password"
      ? "修改密码"
      : action && user
        ? contactActionTitle(user, action)
        : "账号安全";

  return (
    <div className="animate-in mx-auto max-w-2xl px-6 py-10 sm:py-14">
      {action ? (
        <p className="text-sm text-foreground-muted">账号安全 / {title}</p>
      ) : (
        <Link
          href="/account"
          className="rounded-sm text-sm text-foreground-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          ← 返回个人中心
        </Link>
      )}
      <h1 className="mt-7 text-3xl font-semibold tracking-tight text-foreground">
        {title}
      </h1>
      <p className="mt-3 text-sm leading-6 text-foreground-muted">
        {action
          ? "完成后，所有设备需重新登录。"
          : "管理登录方式与密码。修改后，所有设备需重新登录。"}
      </p>
      {loadError ? (
        <div className="mt-8" role="alert">
          资料加载失败。
          <button
            type="button"
            className="text-primary"
            onClick={() => {
              setLoadError(false);
              setAttempt((v) => v + 1);
            }}
          >
            重新加载
          </button>
        </div>
      ) : !user ? (
        <p className="mt-8" role="status">
          加载中…
        </p>
      ) : (
        <div className="mt-8 rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-8">
          {action === "password" ? (
            <ChangePasswordForm onCancel={() => setAction(null)} />
          ) : action ? (
            <ContactForm
              user={user}
              action={action}
              onCancel={() => setAction(null)}
            />
          ) : (
            <div className="divide-y divide-border">
              {(["phone", "email"] as const).map((channel) => (
                <section
                  key={channel}
                  className="flex flex-col gap-4 py-6 first:pt-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-foreground">
                      {LABELS[channel]}
                    </h2>
                    <p className="mt-1 break-all text-sm text-foreground-muted">
                      {user[channel] || "尚未绑定"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-5">
                    <button
                      type="button"
                      className="rounded-sm text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      aria-label={`${user[channel] ? "换绑" : "绑定"}${LABELS[channel]}`}
                      onClick={() => setAction({ channel, operation: "bind" })}
                    >
                      {user[channel] ? "换绑" : `绑定${LABELS[channel]}`}
                    </button>
                    {channel === "email" && user[channel] && (
                      <button
                        type="button"
                        disabled={!user.phone || !user.email}
                        className="rounded-sm text-sm text-danger hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
                        aria-label={`解绑${LABELS[channel]}`}
                        onClick={() =>
                          setAction({ channel, operation: "unbind" })
                        }
                      >
                        解绑
                      </button>
                    )}
                  </div>
                </section>
              ))}
              <section className="flex items-center justify-between gap-4 py-6">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    登录密码
                  </h2>
                  <p className="mt-1 text-sm text-foreground-muted">
                    用于账号密码登录
                  </p>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-sm text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  onClick={() => setAction("password")}
                >
                  修改密码
                </button>
              </section>
              <p className="pt-5 text-xs leading-5 text-foreground-muted">
                手机号必须保留，可验证后换绑；邮箱可按需绑定或解绑。
              </p>
            </div>
          )}
        </div>
      )}
      {!action && (
        <section className="mt-8 flex flex-col gap-4 rounded-3xl border border-border p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">注销账号</h2>
            <p className="mt-1 text-sm text-foreground-muted">
              申请注销账号，继续前请仔细阅读注销说明。
            </p>
          </div>
          <Link
            href="/account/delete"
            className="shrink-0 rounded-sm text-sm text-danger hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
          >
            了解注销流程
          </Link>
        </section>
      )}
    </div>
  );
}

export function ContactForm({
  user,
  action,
  onCancel,
  onSuccess = finishSecurityChange
}: {
  user: User;
  action: ContactAction;
  onCancel?: () => void;
  onSuccess?: () => void;
}) {
  const [contact, setContact] = useState("");
  const [verificationChannel, setVerificationChannel] =
    useState<ContactChannel>(user.phone ? "phone" : "email");
  const [verificationCode, setVerificationCode] = useState("");
  const [code, setCode] = useState("");
  const [oldCountdown, setOldCountdown] = useState(0);
  const [newCountdown, setNewCountdown] = useState(0);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [error, setError] = useState("");
  const unbind = action.operation === "unbind";
  const target = unbind
    ? user[action.channel]!
    : action.channel === "email"
      ? contact.trim().toLowerCase()
      : contact.trim();
  const targetValid =
    unbind ||
    ((action.channel === "email" ? isEmail(target) : isPhone(target)) &&
      target !== user[action.channel]);
  const title = contactActionTitle(user, action);
  const availableChannels = (["phone", "email"] as const).filter(
    (channel) => user[channel]
  );
  const codesValid =
    /^\d{6}$/.test(verificationCode) && (unbind || /^\d{6}$/.test(code));

  useEffect(() => {
    if (oldCountdown <= 0 && newCountdown <= 0) return;
    const timer = setTimeout(() => {
      setOldCountdown((v) => Math.max(0, v - 1));
      setNewCountdown((v) => Math.max(0, v - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }, [oldCountdown, newCountdown]);

  async function sendCode(kind: "old" | "new") {
    if (
      pending.current ||
      !targetValid ||
      (kind === "old" ? oldCountdown : newCountdown) > 0
    )
      return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      if (kind === "old") {
        await api.auth.requestContactVerificationCode({
          operation: action.operation,
          contact: target,
          verification_channel: verificationChannel
        });
        if (!mounted.current) return;
        setVerificationCode("");
        setOldCountdown(60);
      } else {
        await api.auth.requestContactBindCode(target);
        if (!mounted.current) return;
        setCode("");
        setNewCountdown(60);
      }
    } catch (e) {
      if (!mounted.current) return;
      setError(handleSecurityError(e));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current || !targetValid || !codesValid) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const verification = {
        verification_channel: verificationChannel,
        verification_code: verificationCode
      };
      if (unbind)
        await api.auth.unbindContact({
          channel: action.channel,
          ...verification
        });
      else
        await api.auth.bindContact({ contact: target, code, ...verification });
      if (mounted.current) onSuccess();
    } catch (e) {
      if (!mounted.current) return;
      setError(handleSecurityError(e));
      setVerificationCode("");
      setCode("");
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={submit} className="space-y-5">
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-sm text-sm text-foreground-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          ← 返回账号安全
        </button>
      )}
      <p className="text-sm leading-6 text-foreground-muted">
        {unbind
          ? "先验证已绑定的联系方式。解绑后，该联系方式将不能用于登录或找回密码。"
          : "先验证已绑定的联系方式，再验证新联系方式。两组验证码分别发送。"}
      </p>
      <fieldset disabled={busy} className="space-y-5 disabled:opacity-60">
        {unbind ? (
          <p className="break-all text-sm text-foreground-muted">
            将解绑：{target}
          </p>
        ) : (
          <label className="block space-y-2 text-sm">
            <span className="ml-4 block font-medium text-foreground">
              新{LABELS[action.channel]}
            </span>
            <input
              className={AUTH_INPUT_CLASS}
              type={action.channel === "phone" ? "tel" : "email"}
              autoComplete={action.channel === "phone" ? "tel" : "email"}
              placeholder={
                action.channel === "phone" ? "请输入新手机号" : "请输入新邮箱"
              }
              value={contact}
              onChange={(e) => {
                const next = e.target.value;
                const normalized =
                  action.channel === "email"
                    ? next.trim().toLowerCase()
                    : next.trim();
                if (normalized !== target) setNewCountdown(0);
                setContact(next);
                setCode("");
                setVerificationCode("");
                setError("");
              }}
              required
            />
          </label>
        )}
        <div className="space-y-2 border-t border-border pt-5 text-sm">
          {availableChannels.length === 1 ? (
            <>
              <p className="ml-4 font-medium text-foreground">
                当前账号的验证方式
              </p>
              <p
                className={`${AUTH_INPUT_CLASS} flex min-h-12 items-center break-all`}
              >
                {LABELS[verificationChannel]}：{user[verificationChannel]}
              </p>
            </>
          ) : (
            <>
              <label
                htmlFor="security-verification-channel"
                className="ml-4 block font-medium text-foreground"
              >
                当前账号的验证方式
              </label>
              <Select
                value={verificationChannel}
                onValueChange={(value: ContactChannel) => {
                  setVerificationChannel(value);
                  setOldCountdown(0);
                  setVerificationCode("");
                  setError("");
                }}
                disabled={busy}
              >
                <SelectTrigger id="security-verification-channel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableChannels.map((channel) => (
                    <SelectItem key={channel} value={channel}>
                      {LABELS[channel]}：{user[channel]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </div>
        <div className="space-y-2 text-sm">
          <label
            htmlFor="security-old-code"
            className="ml-4 block font-medium text-foreground"
          >
            {LABELS[verificationChannel]}验证码
          </label>
          <div className="flex gap-2">
            <input
              id="security-old-code"
              className={`${AUTH_INPUT_CLASS} min-w-0 flex-1`}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="请输入 6 位验证码"
              maxLength={6}
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
            />
            <button
              className={CODE_BUTTON}
              type="button"
              disabled={busy || !targetValid || oldCountdown > 0}
              onClick={() => sendCode("old")}
              aria-label={
                oldCountdown
                  ? undefined
                  : `向已绑定${LABELS[verificationChannel]}发送验证码`
              }
            >
              {oldCountdown ? `${oldCountdown}s 后重发` : "验证"}
            </button>
          </div>
        </div>
        {!unbind && (
          <div className="space-y-2 text-sm">
            <label
              htmlFor="security-new-code"
              className="ml-4 block font-medium text-foreground"
            >
              新{LABELS[action.channel]}验证码
            </label>
            <div className="flex gap-2">
              <input
                id="security-new-code"
                className={`${AUTH_INPUT_CLASS} min-w-0 flex-1`}
                inputMode="numeric"
                maxLength={6}
                placeholder="请输入 6 位验证码"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <button
                className={CODE_BUTTON}
                type="button"
                disabled={busy || !targetValid || newCountdown > 0}
                onClick={() => sendCode("new")}
                aria-label={
                  newCountdown
                    ? undefined
                    : `向新${LABELS[action.channel]}发送验证码`
                }
              >
                {newCountdown ? `${newCountdown}s 后重发` : "验证"}
              </button>
            </div>
          </div>
        )}
        <p className="text-xs leading-5 text-foreground-muted">
          验证码仅可使用一次。若所有已绑定联系方式都无法接收验证码，暂不能自助操作。
        </p>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex gap-3 border-t border-border pt-5">
          {onCancel && (
            <button
              type="button"
              className="min-h-12 rounded-full border border-border px-5 text-sm text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              onClick={onCancel}
            >
              取消
            </button>
          )}
          <button
            type="submit"
            className={`${BUTTON} flex-1`}
            disabled={!targetValid || !codesValid}
          >
            确认{title}
          </button>
        </div>
      </fieldset>
      {busy && (
        <p role="status" className="text-sm text-foreground-subtle">
          处理中，请稍候…
        </p>
      )}
    </form>
  );
}

function SecurityPasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  disabled
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  placeholder: string;
  disabled: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-2 text-sm">
      <label htmlFor={id} className="ml-4 block font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          className={`${AUTH_INPUT_CLASS} pr-14`}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => setVisible((shown) => !shown)}
          className="absolute right-3 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-foreground-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
          aria-label={`${visible ? "隐藏" : "显示"}${label}`}
        >
          <PasswordVisibilityIcon visible={visible} />
        </button>
      </div>
    </div>
  );
}

function ChangePasswordForm({ onCancel }: { onCancel: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  const valid =
    currentPassword.length > 0 &&
    isRegisterPassword(newPassword) &&
    newPassword === confirmation;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await api.auth.changePassword({
        current_password: currentPassword,
        new_password: newPassword
      });
      finishSecurityChange();
    } catch (e) {
      setError(handleSecurityError(e));
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={submit}>
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="rounded-sm text-sm text-foreground-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        ← 返回账号安全
      </button>
      <p className="text-sm leading-6 text-foreground-muted">
        填写当前密码，再设置新的登录密码。
      </p>
      <fieldset disabled={busy} className="space-y-5 disabled:opacity-60">
        <SecurityPasswordField
          id="security-current-password"
          label="当前密码"
          value={currentPassword}
          onChange={setCurrentPassword}
          autoComplete="current-password"
          placeholder="请输入当前密码"
          disabled={busy}
        />
        <div className="border-t border-border pt-5">
          <SecurityPasswordField
            id="security-new-password"
            label="新密码"
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
            placeholder="请输入新密码"
            disabled={busy}
          />
          <p
            className={`mt-3 ml-4 text-xs ${newPassword && !isRegisterPassword(newPassword) ? "text-danger" : "text-foreground-muted"}`}
          >
            {newPassword
              ? (passwordLengthError(newPassword) ?? PASSWORD_HINT)
              : PASSWORD_HINT}
          </p>
        </div>
        <div>
          <SecurityPasswordField
            id="security-confirm-password"
            label="确认新密码"
            value={confirmation}
            onChange={setConfirmation}
            autoComplete="new-password"
            placeholder="请再次输入新密码"
            disabled={busy}
          />
          {confirmation && confirmation !== newPassword && (
            <p className="mt-3 ml-4 text-xs text-danger">
              两次输入的密码不一致
            </p>
          )}
        </div>
        <p className="text-xs leading-5 text-foreground-muted">
          忘记当前密码？退出登录后，可通过登录页的「忘记密码」重置。
        </p>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex gap-3 border-t border-border pt-5">
          <button
            type="button"
            className="min-h-12 rounded-full border border-border px-5 text-sm text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type="submit"
            className={`${BUTTON} flex-1`}
            disabled={!valid}
          >
            {busy ? "修改中…" : "确认修改密码"}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
