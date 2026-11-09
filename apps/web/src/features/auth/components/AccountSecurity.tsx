"use client";
import {
  passwordLengthError,
  WEB_PASSWORD_HINT as PASSWORD_HINT
} from "@/features/auth/shared";
import { localText, type WebNotice, type WebText } from "@/i18n/catalog";

import { useWebText } from "@/i18n/client";
import { webAuthSecurity as webAuth } from "@/i18n/messages/auth/security";

import { HttpError } from "@tsz/api-client";
import { isEmail, isPhone, isRegisterPassword } from "@tsz/shared";
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

import { cn } from "@tsz/ui/lib/cn";
import {
  PageHeader,
  PageNotice,
  PageShell,
  buttonClass,
  primaryButtonClass,
  textButtonClass
} from "@/features/shell/Page";

const LABELS = {
  phone: localText(webAuth, "webAuthSecurity:phone_number"),
  email: localText(webAuth, "webAuthSecurity:email")
};
const BUTTON = primaryButtonClass;
const CODE_BUTTON =
  "min-h-12 shrink-0 rounded-full border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50";
type ContactAction = { channel: ContactChannel; operation: "bind" | "unbind" };

function contactActionTitle(
  user: User,
  action: ContactAction,
  uiText: WebText<typeof webAuth>
) {
  return uiText(
    action.operation === "unbind"
      ? "webCommon:unbind_contact"
      : user[action.channel]
        ? "webCommon:change_contact"
        : "webCommon:bind_contact",
    { channel: uiText(LABELS[action.channel]).toLowerCase() }
  );
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
  const uiText = useWebText(webAuth);
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
      ? uiText("webAuthSecurity:change_password")
      : action && user
        ? contactActionTitle(user, action, uiText)
        : uiText("webAuthSecurity:account_security");

  return (
    <PageShell size="sm">
      <PageHeader
        back={
          action
            ? undefined
            : {
                href: "/account",
                label: uiText("webAuthSecurity:back_to_account")
              }
        }
        eyebrow={
          action
            ? uiText("webAuthSecurity:account_security_v0", { v0: title })
            : uiText("webAuthSecurity:account")
        }
        title={title}
        description={
          action
            ? uiText(
                "webAuthSecurity:you_will_need_to_sign_in_again_on_every_device_afterwards"
              )
            : uiText(
                "webAuthSecurity:manage_sign_in_methods_and_your_password_changes_require_signing_in_agai"
              )
        }
      />
      {loadError ? (
        <PageNotice tone="error">
          {uiText("webAuthSecurity:could_not_load_your_profile")}
          <button
            type="button"
            className={textButtonClass}
            onClick={() => {
              setLoadError(false);
              setAttempt((v) => v + 1);
            }}
          >
            {uiText("webAuthSecurity:reload")}
          </button>
        </PageNotice>
      ) : !user ? (
        <div role="status">
          <PageNotice>{uiText("webAuthSecurity:loading_2")}</PageNotice>
        </div>
      ) : (
        <div className="glass rounded-3xl p-2">
          <div className="rounded-[20px] bg-surface/70 p-6 sm:p-8">
            {action === "password" ? (
              <ChangePasswordForm onCancel={() => setAction(null)} />
            ) : action ? (
              <ContactForm
                user={user}
                action={action}
                onCancel={() => setAction(null)}
              />
            ) : (
              <div className="divide-y divide-border/60">
                {(["phone", "email"] as const).map((channel) => (
                  <section
                    key={channel}
                    className="flex flex-wrap items-center justify-between gap-4 py-6 first:pt-0"
                  >
                    <div className="min-w-0 flex-1 basis-32">
                      <h2 className="text-sm font-medium text-foreground">
                        {uiText(LABELS[channel])}
                      </h2>
                      <p className="mt-1 break-all text-sm text-foreground-muted">
                        {user[channel] || uiText("webAuthSecurity:not_bound")}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className={buttonClass}
                        aria-label={contactActionTitle(
                          user,
                          { channel, operation: "bind" },
                          uiText
                        )}
                        onClick={() =>
                          setAction({ channel, operation: "bind" })
                        }
                      >
                        {user[channel]
                          ? uiText("webAuthSecurity:change")
                          : uiText("webAuthSecurity:bind_v0", {
                              v0: uiText(LABELS[channel]).toLowerCase()
                            })}
                      </button>
                      {channel === "email" && user[channel] && (
                        <button
                          type="button"
                          disabled={!user.phone || !user.email}
                          className={cn(
                            buttonClass,
                            "text-danger hover:bg-danger/5"
                          )}
                          aria-label={uiText("webAuthSecurity:unbind_v0", {
                            v0: uiText(LABELS[channel]).toLowerCase()
                          })}
                          onClick={() =>
                            setAction({ channel, operation: "unbind" })
                          }
                        >
                          {uiText("webAuthSecurity:unbind")}
                        </button>
                      )}
                    </div>
                  </section>
                ))}
                <section className="flex flex-wrap items-center justify-between gap-4 pb-0 pt-6">
                  <div className="min-w-0 flex-1 basis-32">
                    <h2 className="text-sm font-medium text-foreground">
                      {uiText("webAuthSecurity:password")}
                    </h2>
                    <p className="mt-1 text-sm text-foreground-muted">
                      {uiText(
                        "webAuthSecurity:used_to_sign_in_with_your_account_and_password"
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={cn(buttonClass, "shrink-0")}
                    onClick={() => setAction("password")}
                  >
                    {uiText("webAuthSecurity:change_password")}
                  </button>
                </section>
              </div>
            )}
          </div>
        </div>
      )}
      {!action && (
        <section className="mt-6 flex flex-col gap-4 rounded-3xl border border-border/60 bg-muted/50 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-medium text-foreground">
              {uiText("webAuthSecurity:delete_account")}
            </h2>
            <p className="mt-1 text-sm text-foreground-muted">
              {uiText(
                "webAuthSecurity:takes_effect_72_hours_after_applying_you_can_cancel_before_then"
              )}
            </p>
          </div>
          <Link
            href="/account/delete"
            className={cn(
              buttonClass,
              "shrink-0 self-start text-danger hover:bg-danger/5 sm:self-auto"
            )}
          >
            {uiText("webAuthSecurity:request_account_deletion")}
          </Link>
        </section>
      )}
    </PageShell>
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
  const uiText = useWebText(webAuth);
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
  const [error, setError] = useState<WebNotice>("");
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
  const title = contactActionTitle(user, action, uiText);
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
          {uiText("webAuthSecurity:back_to_account_security")}
        </button>
      )}
      <p className="text-sm leading-6 text-foreground-muted">
        {unbind
          ? uiText(
              "webAuthSecurity:verify_a_bound_contact_method_first_once_unbound_it_cannot_be_used_to_si"
            )
          : uiText(
              "webAuthSecurity:verify_your_existing_contact_method_then_the_new_one_each_receives_a_sep"
            )}
      </p>
      <fieldset disabled={busy} className="space-y-5 disabled:opacity-60">
        {unbind ? (
          <p className="break-all text-sm text-foreground-muted">
            {uiText("webAuthSecurity:to_unbind_v0", { v0: target })}
          </p>
        ) : (
          <label className="block space-y-2 text-sm">
            <span className="ml-4 block font-medium text-foreground">
              {uiText("webCommon:new_contact", {
                channel: uiText(LABELS[action.channel]).toLowerCase()
              })}
            </span>
            <input
              className={AUTH_INPUT_CLASS}
              type={action.channel === "phone" ? "tel" : "email"}
              autoComplete={action.channel === "phone" ? "tel" : "email"}
              placeholder={
                action.channel === "phone"
                  ? uiText("webAuthSecurity:enter_your_new_phone_number")
                  : uiText("webAuthSecurity:enter_your_new_email")
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
                {uiText("webAuthSecurity:verify_your_current_account")}
              </p>
              <p
                className={cn(AUTH_INPUT_CLASS, "flex items-center break-all")}
              >
                {uiText(LABELS[verificationChannel])}：
                {user[verificationChannel]}
              </p>
            </>
          ) : (
            <>
              <label
                htmlFor="security-verification-channel"
                className="ml-4 block font-medium text-foreground"
              >
                {uiText("webAuthSecurity:verify_your_current_account")}
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
                      {uiText(LABELS[channel])}：{user[channel]}
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
            {uiText("webAuthSecurity:verification_code_for_v0", {
              v0: uiText(LABELS[verificationChannel])
            })}
          </label>
          <div className="flex gap-2">
            <input
              id="security-old-code"
              className={cn(AUTH_INPUT_CLASS, "min-w-0 flex-1")}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder={uiText("webAuthSecurity:enter_the_6_digit_code")}
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
                  : uiText("webAuthSecurity:send_a_code_to_your_bound_v0", {
                      v0: uiText(LABELS[verificationChannel])
                    })
              }
            >
              {oldCountdown
                ? uiText("webAuthSecurity:resend_in_v0_s", { v0: oldCountdown })
                : uiText("webAuthSecurity:verify")}
            </button>
          </div>
        </div>
        {!unbind && (
          <div className="space-y-2 text-sm">
            <label
              htmlFor="security-new-code"
              className="ml-4 block font-medium text-foreground"
            >
              {uiText("webAuthSecurity:verification_code_for_new_v0", {
                v0: uiText(LABELS[action.channel])
              })}
            </label>
            <div className="flex gap-2">
              <input
                id="security-new-code"
                className={cn(AUTH_INPUT_CLASS, "min-w-0 flex-1")}
                inputMode="numeric"
                maxLength={6}
                placeholder={uiText("webAuthSecurity:enter_the_6_digit_code")}
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
                    : uiText("webAuthSecurity:send_a_code_to_your_new_v0", {
                        v0: uiText(LABELS[action.channel])
                      })
                }
              >
                {newCountdown
                  ? uiText("webAuthSecurity:resend_in_v0_s", {
                      v0: newCountdown
                    })
                  : uiText("webAuthSecurity:verify")}
              </button>
            </div>
          </div>
        )}
        <p className="text-xs leading-5 text-foreground-muted">
          {uiText(
            "webAuthSecurity:each_code_can_be_used_once_self_service_changes_are_unavailable_if_you_c"
          )}
        </p>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {uiText(error)}
          </p>
        )}
        <div className="flex gap-3 border-t border-border pt-5">
          {onCancel && (
            <button
              type="button"
              className={cn(buttonClass, "min-h-12 px-5")}
              onClick={onCancel}
            >
              {uiText("webAuthSecurity:cancel")}
            </button>
          )}
          <button
            type="submit"
            className={cn(BUTTON, "flex-1")}
            disabled={!targetValid || !codesValid}
          >
            {uiText("webAuthSecurity:confirm_v0", { v0: title })}
          </button>
        </div>
      </fieldset>
      {busy && (
        <p role="status" className="text-sm text-foreground-subtle">
          {uiText("webAuthSecurity:processing_please_wait")}
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
  disabled,
  invalid = false,
  describedBy
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  placeholder: string;
  disabled: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const uiText = useWebText(webAuth);
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-2 text-sm">
      <label htmlFor={id} className="ml-4 block font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          className={cn(AUTH_INPUT_CLASS, "pr-14")}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => setVisible((shown) => !shown)}
          className="absolute right-3 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-foreground-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
          aria-label={uiText(
            visible ? "webCommon:hide_field" : "webCommon:show_field",
            {
              label
            }
          )}
        >
          <PasswordVisibilityIcon visible={visible} />
        </button>
      </div>
    </div>
  );
}

function ChangePasswordForm({ onCancel }: { onCancel: () => void }) {
  const uiText = useWebText(webAuth);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState<WebNotice>("");
  const newPasswordError = newPassword
    ? passwordLengthError(newPassword)
    : null;
  const confirmationError = !!confirmation && confirmation !== newPassword;
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
        {uiText("webAuthSecurity:back_to_account_security")}
      </button>
      <p className="text-sm leading-6 text-foreground-muted">
        {uiText(
          "webAuthSecurity:enter_your_current_password_then_set_a_new_one"
        )}
      </p>
      <fieldset disabled={busy} className="space-y-5 disabled:opacity-60">
        <SecurityPasswordField
          id="security-current-password"
          label={uiText("webAuthSecurity:current_password")}
          value={currentPassword}
          onChange={setCurrentPassword}
          autoComplete="current-password"
          placeholder={uiText("webAuthSecurity:enter_your_current_password")}
          disabled={busy}
        />
        <div className="border-t border-border pt-5">
          <SecurityPasswordField
            id="security-new-password"
            label={uiText("webAuthSecurity:new_password")}
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
            placeholder={uiText("webAuthSecurity:enter_a_new_password")}
            disabled={busy}
            invalid={!!newPasswordError}
            describedBy="security-new-password-message"
          />
          <p
            id="security-new-password-message"
            className={cn(
              "mt-3 ml-4 text-xs",
              newPasswordError ? "text-danger" : "text-foreground-muted"
            )}
          >
            {uiText(newPasswordError ?? PASSWORD_HINT)}
          </p>
        </div>
        <div>
          <SecurityPasswordField
            id="security-confirm-password"
            label={uiText("webAuthSecurity:confirm_new_password")}
            value={confirmation}
            onChange={setConfirmation}
            autoComplete="new-password"
            placeholder={uiText("webAuthSecurity:enter_the_new_password_again")}
            disabled={busy}
            invalid={confirmationError}
            describedBy={
              confirmationError
                ? "security-confirm-password-message"
                : undefined
            }
          />
          {confirmationError && (
            <p
              id="security-confirm-password-message"
              className="mt-3 ml-4 text-xs text-danger"
            >
              {uiText("webAuthSecurity:the_passwords_do_not_match")}
            </p>
          )}
        </div>
        <p className="text-xs leading-5 text-foreground-muted">
          {uiText(
            "webAuthSecurity:forgot_your_current_password_sign_out_and_use_forgot_password_on_the_sig"
          )}
        </p>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {uiText(error)}
          </p>
        )}
        <div className="flex gap-3 border-t border-border pt-5">
          <button
            type="button"
            className={cn(buttonClass, "min-h-12 px-5")}
            onClick={onCancel}
          >
            {uiText("webAuthSecurity:cancel")}
          </button>
          <button
            type="submit"
            className={cn(BUTTON, "flex-1")}
            disabled={!valid}
          >
            {busy
              ? uiText("webAuthSecurity:changing")
              : uiText("webAuthSecurity:change_password_2")}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
