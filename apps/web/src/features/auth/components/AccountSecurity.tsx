"use client";

import { HttpError } from "@tsz/api-client";
import { isEmail, isPhone, isRegisterPassword } from "@tsz/shared";
import type { ContactChannel, User } from "@tsz/types";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, clearSession } from "@/lib/request";
import { AUTH_INPUT_CLASS, securityErrorMessage } from "../shared";

const LABELS = { phone: "手机号", email: "邮箱" };
const BUTTON =
  "rounded-full bg-primary px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40";
type ContactAction = { channel: ContactChannel; operation: "bind" | "unbind" };

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

  return (
    <div className="animate-in mx-auto max-w-xl px-4 py-10 sm:px-6">
      <Link href="/account" className="text-sm text-primary hover:underline">
        ← 返回个人中心
      </Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground">
        账号安全
      </h1>
      <p className="mt-3 text-sm leading-6 text-foreground-subtle">
        管理登录方式与密码。安全信息修改成功后，所有设备都需要重新登录。
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
        <div className="mt-8 rounded-3xl border border-border bg-surface p-5 shadow-xl shadow-black/5 sm:p-8">
          {action === "password" ? (
            <ChangePasswordForm onCancel={() => setAction(null)} />
          ) : action ? (
            <ContactForm
              user={user}
              action={action}
              onCancel={() => setAction(null)}
            />
          ) : (
            <div className="space-y-7">
              {(["phone", "email"] as const).map((channel) => (
                <section key={channel}>
                  <h2 className="font-semibold text-foreground">
                    {LABELS[channel]}
                  </h2>
                  <p className="mt-2 break-all text-sm text-foreground-muted">
                    {user[channel] || "尚未绑定"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-4">
                    <button
                      type="button"
                      className="text-sm font-medium text-primary"
                      onClick={() => setAction({ channel, operation: "bind" })}
                    >
                      {user[channel] ? "换绑" : "绑定"}
                      {LABELS[channel]}
                    </button>
                    {user[channel] && (
                      <button
                        type="button"
                        disabled={!user.phone || !user.email}
                        className="text-sm text-danger disabled:cursor-not-allowed disabled:opacity-40"
                        onClick={() =>
                          setAction({ channel, operation: "unbind" })
                        }
                      >
                        解绑{LABELS[channel]}
                      </button>
                    )}
                  </div>
                </section>
              ))}
              {(!user.phone || !user.email) && (
                <p className="text-xs leading-5 text-foreground-subtle">
                  至少保留一种登录方式。绑定另一种联系方式后，才能解绑当前联系方式。
                </p>
              )}
              <div className="border-t border-border pt-5">
                <button
                  type="button"
                  className="text-sm font-medium text-primary"
                  onClick={() => setAction("password")}
                >
                  修改密码
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ContactForm({
  user,
  action,
  onCancel
}: {
  user: User;
  action: ContactAction;
  onCancel: () => void;
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
  const title = `${unbind ? "解绑" : user[action.channel] ? "换绑" : "绑定"}${LABELS[action.channel]}`;
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
        setVerificationCode("");
        setOldCountdown(60);
      } else {
        await api.auth.requestContactBindCode(target);
        setCode("");
        setNewCountdown(60);
      }
    } catch (e) {
      setError(handleSecurityError(e));
    } finally {
      pending.current = false;
      setBusy(false);
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
      finishSecurityChange();
    } catch (e) {
      setError(handleSecurityError(e));
      setVerificationCode("");
      setCode("");
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={submit} className="space-y-5">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <p className="text-sm leading-6 text-foreground-muted">
        先验证任一已绑定的联系方式。
        {unbind
          ? "解绑后，该联系方式将不能用于登录或找回密码。"
          : "还需验证新的联系方式，两组验证码不能混用。"}
      </p>
      <fieldset disabled={busy} className="space-y-5 disabled:opacity-60">
        {unbind ? (
          <p className="break-all text-sm text-foreground-muted">
            将解绑：{target}
          </p>
        ) : (
          <label className="block space-y-2 text-sm">
            <span>新{LABELS[action.channel]}</span>
            <input
              className={AUTH_INPUT_CLASS}
              type={action.channel === "phone" ? "tel" : "email"}
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
        <label className="block space-y-2 text-sm">
          <span>身份验证渠道</span>
          <select
            className={`${AUTH_INPUT_CLASS} w-full`}
            value={verificationChannel}
            onChange={(e) => {
              setVerificationChannel(e.target.value as ContactChannel);
              setOldCountdown(0);
              setVerificationCode("");
              setError("");
            }}
          >
            {(["phone", "email"] as const)
              .filter((c) => user[c])
              .map((c) => (
                <option key={c} value={c}>
                  {LABELS[c]}：{user[c]}
                </option>
              ))}
          </select>
        </label>
        <div className="space-y-2 text-sm">
          <label htmlFor="security-old-code">原联系方式验证码</label>
          <div className="flex gap-2">
            <input
              id="security-old-code"
              className={`${AUTH_INPUT_CLASS} min-w-0`}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
            />
            <button
              className={`${BUTTON} shrink-0`}
              type="button"
              disabled={!targetValid || oldCountdown > 0}
              onClick={() => sendCode("old")}
            >
              {oldCountdown ? `${oldCountdown}s 后重发` : "验证原渠道"}
            </button>
          </div>
        </div>
        {!unbind && (
          <div className="space-y-2 text-sm">
            <label htmlFor="security-new-code">新联系方式验证码</label>
            <div className="flex gap-2">
              <input
                id="security-new-code"
                className={`${AUTH_INPUT_CLASS} min-w-0`}
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <button
                className={`${BUTTON} shrink-0`}
                type="button"
                disabled={!targetValid || newCountdown > 0}
                onClick={() => sendCode("new")}
              >
                {newCountdown ? `${newCountdown}s 后重发` : "验证新渠道"}
              </button>
            </div>
          </div>
        )}
        <p className="text-xs leading-5 text-foreground-subtle">
          所有已绑定渠道都无法接收验证码时，暂不支持自助修改。每组验证码仅能使用一次。
        </p>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            className="rounded-full border border-border px-5 py-3 text-sm"
            onClick={onCancel}
          >
            取消
          </button>
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
      <h2 className="text-xl font-semibold text-foreground">修改密码</h2>
      <fieldset disabled={busy} className="space-y-5 disabled:opacity-60">
        <label className="block space-y-2 text-sm">
          <span>当前密码</span>
          <input
            className={AUTH_INPUT_CLASS}
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </label>
        <label className="block space-y-2 text-sm">
          <span>新密码</span>
          <input
            className={AUTH_INPUT_CLASS}
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </label>
        <p className="text-xs text-foreground-subtle">
          11–20位字母和数字的组合，不区分大小写。
        </p>
        <label className="block space-y-2 text-sm">
          <span>确认新密码</span>
          <input
            className={AUTH_INPUT_CLASS}
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
        </label>
        {confirmation && confirmation !== newPassword && (
          <p className="text-sm text-danger">两次输入的密码不一致</p>
        )}
        <p className="text-xs text-foreground-subtle">
          忘记当前密码时，请退出登录后使用登录页的“忘记密码”入口。
        </p>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            className="rounded-full border border-border px-5 py-3 text-sm"
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
