"use client";
import {
  lookupWebNotice,
  webErrorText,
  localText,
  type WebNotice
} from "@/i18n/catalog";
import { useWebLocale, useWebText } from "@/i18n/client";

import { webAuthSecurity as webAuth } from "@/i18n/messages/auth/security";

import { Button } from "@tsz/ui/components";
import type {
  AccountDeletionChannel,
  AccountDeletionState,
  CreateAccountDeletionRequest
} from "@tsz/types";
import { HttpError, RequestTimeoutError } from "@tsz/api-client";
import { isCode } from "@tsz/shared";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, clearSession } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { AUTH_INPUT_CLASS } from "../shared";
import { cn } from "@tsz/ui/lib/cn";
import { ArrowLeft } from "lucide-react";
import { PageHeader, PageShell } from "@/features/shell/Page";

const CODE_COUNTDOWN = 60;

const CHANNEL_LABEL: Record<AccountDeletionChannel, WebNotice> = {
  phone: localText(webAuth, "webAuthSecurity:phone"),
  email: localText(webAuth, "webAuthSecurity:email")
};

const ERROR_BY_CODE: Record<string, WebNotice> = {
  account_deletion_unsettled_audio: localText(
    webAuth,
    "webAuthSecurity:word_list_audio_is_still_being_generated_or_refunded_wait_until_processi"
  ),
  account_deletion_balance_changed: localText(
    webAuth,
    "webAuthSecurity:your_balance_has_changed_check_the_latest_amount_and_agree_again"
  ),
  account_deletion_consent_outdated: localText(
    webAuth,
    "webAuthSecurity:the_deletion_declaration_has_changed_read_and_agree_again"
  ),
  account_deletion_pending: localText(
    webAuth,
    "webAuthSecurity:you_already_have_a_pending_deletion_request_check_its_status"
  ),
  account_deletion_expired: localText(
    webAuth,
    "webAuthSecurity:deletion_has_taken_effect_and_can_no_longer_be_cancelled"
  ),
  account_deletion_consent_required: localText(
    webAuth,
    "webAuthSecurity:confirm_the_deletion_rules_and_balance_waiver"
  ),
  invalid_account_deletion_code: localText(
    webAuth,
    "webAuthSecurity:the_code_is_incorrect_expired_or_already_used_request_a_new_one"
  ),
  account_deletion_channel_unavailable: localText(
    webAuth,
    "webAuthSecurity:this_verification_method_is_not_bound_to_your_account_choose_another"
  ),
  otp_rate_limited: localText(
    webAuth,
    "webAuthSecurity:too_many_code_requests_try_again_later_2"
  ),
  otp_unavailable: localText(
    webAuth,
    "webAuthSecurity:verification_codes_are_unavailable_try_again_later_2"
  ),
  invalid_json: localText(
    webAuth,
    "webAuthSecurity:invalid_request_reload_and_try_again"
  ),
  invalid_request_body: localText(
    webAuth,
    "webAuthSecurity:some_information_is_missing_check_and_try_again"
  ),
  internal_error: localText(
    webAuth,
    "webAuthSecurity:the_service_is_unavailable_try_again_later"
  )
};

function accountDeletionError(error: unknown): WebNotice {
  if (error instanceof RequestTimeoutError) return webErrorText(error, "");
  if (!(error instanceof HttpError))
    return localText(
      webAuth,
      "webAuthSecurity:network_error_the_result_is_unconfirmed_reload_to_check_the_status_first"
    );
  if (error.status === 404)
    return localText(
      webAuth,
      "webAuthSecurity:account_deletion_requests_are_unavailable_try_again_later"
    );
  const mapped = lookupWebNotice(ERROR_BY_CODE, error.code);
  if (mapped) return mapped;
  if (error.status === 400 || error.status === 422) {
    return localText(
      webAuth,
      "webAuthSecurity:invalid_submission_check_and_try_again"
    );
  }
  if (error.status === 500)
    return localText(
      webAuth,
      "webAuthSecurity:the_service_is_unavailable_try_again_later"
    );
  return localText(
    webAuth,
    "webAuthSecurity:the_action_failed_try_again_later"
  );
}

export function DeleteAccountForm() {
  const user = useUserStore((state) => state.user);
  return <AccountDeletionForm key={user?.id ?? "anonymous"} />;
}

function AccountDeletionForm() {
  const locale = useWebLocale();
  const uiText = useWebText(webAuth);
  const user = useUserStore((state) => state.user);
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const dialogWasOpen = useRef(false);

  const channels = useMemo<AccountDeletionChannel[]>(() => {
    const available: AccountDeletionChannel[] = [];
    if (user?.phone) available.push("phone");
    if (user?.email) available.push("email");
    return available;
  }, [user?.phone, user?.email]);

  const [selectedChannel, setSelectedChannel] =
    useState<AccountDeletionChannel>("phone");
  const [code, setCode] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [codeRequested, setCodeRequested] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState<WebNotice>("");
  const [error, setError] = useState<WebNotice>("");
  const [deletionState, setDeletionState] =
    useState<AccountDeletionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [consentChecked, setConsentChecked] = useState(false);
  const intentRef = useRef<{ value: string; key: string } | null>(null);
  useEffect(() => {
    let active = true;
    api.auth
      .accountDeletion()
      .then((value) => {
        if (active) {
          setDeletionState(value);
          setLoading(false);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(accountDeletionError(cause));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [user?.id]);

  async function reloadState() {
    const value = await api.auth.accountDeletion();
    setDeletionState(value);
    return value;
  }
  async function cancelDeletion() {
    if (!deletionState?.request || deleting) return;
    setDeleting(true);
    setError("");
    try {
      const request = await api.auth.cancelAccountDeletion(
        deletionState.request.id
      );
      setDeletionState({ ...deletionState, request });
      intentRef.current = null;
      setCode("");
      setCodeRequested(false);
      setConsentChecked(false);
      setMessage(
        localText(
          webAuth,
          "webAuthSecurity:deletion_request_cancelled_your_balance_is_unchanged"
        )
      );
    } catch (cause: unknown) {
      handleRequestError(cause);
    } finally {
      setDeleting(false);
    }
  }

  const channel: AccountDeletionChannel = channels.includes(selectedChannel)
    ? selectedChannel
    : (channels[0] ?? "phone");
  const canSendCode = countdown === 0 && !sending && !deleting;
  const canContinue = codeRequested && isCode(code) && !sending && !deleting;

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setTimeout(
      () => setCountdown((current) => current - 1),
      1000
    );
    return () => window.clearTimeout(timer);
  }, [countdown]);

  useEffect(() => {
    if (confirmOpen) {
      dialogRef.current?.focus();
    } else if (dialogWasOpen.current) {
      document.getElementById("continue-account-deletion")?.focus();
    }
    dialogWasOpen.current = confirmOpen;
  }, [confirmOpen]);

  function expireSession() {
    clearSession();
    window.location.replace("/login?session=expired");
  }

  function handleRequestError(cause: unknown) {
    if (cause instanceof HttpError && cause.code === "invalid_token") {
      expireSession();
      return;
    }
    setError(accountDeletionError(cause));
  }

  function switchChannel(next: AccountDeletionChannel) {
    if (next === channel || sending || deleting) return;
    setSelectedChannel(next);
    setCode("");
    setCountdown(0);
    setCodeRequested(false);
    setMessage("");
    setError("");
  }

  async function requestCode() {
    if (!canSendCode) return;
    setSending(true);
    setMessage("");
    setError("");
    try {
      await api.auth.requestDeletionCode({ channel });
      setCodeRequested(true);
      setCountdown(CODE_COUNTDOWN);
      setMessage(
        localText(
          webAuth,
          "webAuthSecurity:a_code_was_sent_to_your_bound_v0_check_for_it",
          {
            v0: CHANNEL_LABEL[channel]
          }
        )
      );
    } catch (cause: unknown) {
      handleRequestError(cause);
    } finally {
      setSending(false);
    }
  }

  function continueDeletion(event: FormEvent) {
    event.preventDefault();
    if (!canContinue) return;
    setError("");
    setConsentChecked(false);
    setConfirmOpen(true);
  }

  async function confirmDeletion() {
    if (deleting || !canContinue || !deletionState || !consentChecked) return;
    setDeleting(true);
    setError("");
    const intent = {
      channel,
      expected_coin_balance: deletionState.coin_balance,
      waive_balance: deletionState.coin_balance !== "0",
      confirm_deletion: true,
      consent_version: deletionState.consent_version
    };
    const value = JSON.stringify(intent);
    if (intentRef.current?.value !== value)
      intentRef.current = { value, key: crypto.randomUUID() };
    const input: CreateAccountDeletionRequest = {
      ...intent,
      code,
      idempotency_key: intentRef.current.key
    };
    try {
      const request = await api.auth.requestAccountDeletion(input);
      setDeletionState({ ...deletionState, request });
      setConfirmOpen(false);
      if (request.status === "pending") {
        setMessage(
          localText(
            webAuth,
            "webAuthSecurity:deletion_request_saved_your_current_session_remains_active"
          )
        );
      } else {
        // A replay can return a historical request cancelled in another tab.
        intentRef.current = null;
        setCode("");
        setCodeRequested(false);
        setConsentChecked(false);
        setMessage(
          request.status === "cancelled"
            ? localText(
                webAuth,
                "webAuthSecurity:this_deletion_request_was_cancelled_request_a_new_code_and_agree_again_t"
              )
            : localText(
                webAuth,
                "webAuthSecurity:this_deletion_request_has_ended_reload_your_account_status"
              )
        );
      }
    } catch (cause: unknown) {
      if (cause instanceof HttpError && cause.code === "invalid_token") {
        expireSession();
        return;
      }
      setError(accountDeletionError(cause));
      // Recover an uncertain response from persisted state, never from a guessed success.
      try {
        const restored = await reloadState();
        // A cancelled GET result may belong to an older intent. Only replaying
        // this exact key can establish that our own uncertain request ended.
        if (restored.request?.status === "pending") {
          setConfirmOpen(false);
        }
        const consentChanged =
          restored.coin_balance !== deletionState.coin_balance ||
          restored.consent_version !== deletionState.consent_version ||
          restored.consent_text !== deletionState.consent_text;
        if (
          consentChanged ||
          (cause instanceof HttpError &&
            [
              "account_deletion_balance_changed",
              "account_deletion_consent_outdated"
            ].includes(cause.code ?? ""))
        ) {
          setError(
            localText(
              webAuth,
              "webAuthSecurity:your_balance_or_deletion_declaration_has_changed_check_the_latest_detail"
            )
          );
          setConsentChecked(false);
          intentRef.current = null;
          setConfirmOpen(false);
        }
      } catch {
        /* Keep the error and the same intent key for a safe retry. */
      }
    } finally {
      setDeleting(false);
    }
  }

  if (loading || !deletionState) {
    return (
      <PageShell size="sm">
        <PageHeader
          eyebrow={uiText("webAuthSecurity:account_security")}
          title={uiText("webAuthSecurity:delete_account")}
        />
        {loading ? (
          <p role="status" className="text-sm text-foreground-muted">
            {uiText("webAuthSecurity:loading_deletion_status")}
          </p>
        ) : (
          <>
            <p role="alert" className="text-sm text-danger">
              {uiText(error)}
            </p>
            <Button
              className="mt-4"
              onClick={() => {
                setLoading(true);
                reloadState()
                  .catch((cause: unknown) =>
                    setError(accountDeletionError(cause))
                  )
                  .finally(() => setLoading(false));
              }}
            >
              {uiText("webAuthSecurity:reload")}
            </Button>
          </>
        )}
      </PageShell>
    );
  }
  if (deletionState.request?.status === "pending") {
    const request = deletionState.request;
    return (
      <PageShell size="sm">
        <PageHeader
          eyebrow={uiText("webAuthSecurity:account_security")}
          title={uiText("webAuthSecurity:account_deletion_pending")}
        />
        <div className="glass rounded-3xl p-2">
          <div className="rounded-[20px] bg-surface/70 p-6 text-sm leading-6 sm:p-8">
            <p>
              {uiText(
                "webAuthSecurity:deletion_takes_effect_after_72_consecutive_hours_you_can_still_sign_in_a"
              )}
            </p>
            <p className="mt-3">
              {uiText("webAuthSecurity:takes_effect")}
              <time dateTime={request.effective_at}>
                {new Date(request.effective_at).toLocaleString(locale, {
                  timeZoneName: "short"
                })}
              </time>
            </p>
            <p className="mt-3">
              {uiText(
                "webAuthSecurity:confirmed_balance_v0_all_wallet_transactions_are_paused_cancelling_keeps",
                { v0: request.confirmed_balance }
              )}
            </p>
            <p className="mt-4 rounded-2xl bg-muted/70 px-4 py-3 text-foreground-muted">
              {uiText(
                "webAuthSecurity:once_deletion_takes_effect_the_account_cannot_be_used_remaining_expire_a"
              )}
            </p>
            {error && (
              <p role="alert" className="mt-3 text-danger">
                {uiText(error)}
              </p>
            )}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button disabled={deleting} onClick={cancelDeletion}>
                {deleting
                  ? uiText("webAuthSecurity:cancelling")
                  : uiText("webAuthSecurity:cancel_deletion_request")}
              </Button>
              <Button variant="outline" onClick={() => router.back()}>
                {uiText("webAuthSecurity:back")}
              </Button>
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  if (channels.length === 0) {
    return (
      <PageShell size="sm">
        <PageHeader
          eyebrow={uiText("webAuthSecurity:account_security")}
          title={uiText("webAuthSecurity:cannot_delete_account")}
          description={uiText(
            "webAuthSecurity:no_phone_number_or_email_is_bound_to_this_account_contact_support_first"
          )}
        />
        <Button variant="outline" onClick={() => router.back()}>
          {uiText("webAuthSecurity:back")}
        </Button>
      </PageShell>
    );
  }

  return (
    <>
      <PageShell size="sm">
        <div
          data-testid="account-deletion-content"
          inert={confirmOpen}
          aria-hidden={confirmOpen || undefined}
        >
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 mb-5 gap-1.5 px-3 font-normal text-foreground-muted"
            onClick={() => router.back()}
          >
            <ArrowLeft className="size-4" strokeWidth={1.8} aria-hidden />
            {uiText("webAuthSecurity:back")}
          </Button>
          <p className="mb-3 text-xs font-medium tracking-[0.2em] text-foreground-muted">
            {uiText("webAuthSecurity:account_security")}
          </p>
          <h1 className="mb-8 text-3xl font-bold tracking-tight text-foreground sm:text-[34px]">
            {uiText("webAuthSecurity:delete_account")}
          </h1>

          <div className="glass rounded-3xl p-2">
            <div className="rounded-[20px] bg-surface/70 p-6 sm:p-8">
              <section
                aria-labelledby="deletion-warning-title"
                className="mb-7 rounded-2xl border border-danger/20 bg-danger/5 p-4 text-danger"
              >
                <h2 id="deletion-warning-title" className="font-semibold">
                  {uiText("webAuthSecurity:before_deleting_your_account")}
                </h2>
                <p className="mt-2 text-sm leading-6">
                  {uiText(
                    "webAuthSecurity:deletion_takes_effect_after_72_hours_and_can_be_cancelled_before_then_tr"
                  )}
                </p>
              </section>

              <form className="space-y-6" onSubmit={continueDeletion}>
                <fieldset disabled={sending || deleting}>
                  <legend className="mb-3 text-sm font-medium text-foreground">
                    {uiText("webAuthSecurity:1_choose_a_verification_method")}
                  </legend>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {channels.map((item) => (
                      <label
                        key={item}
                        className={cn(
                          "flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border bg-surface p-4 text-sm transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary",
                          channel === item
                            ? "border-primary/40 bg-primary-muted text-primary"
                            : "border-border text-foreground-muted hover:border-primary/40"
                        )}
                      >
                        <input
                          type="radio"
                          name="deletion-channel"
                          value={item}
                          checked={channel === item}
                          onChange={() => switchChannel(item)}
                          className="size-4 accent-primary"
                        />
                        <span className="min-w-0">
                          <span className="block font-medium">
                            {uiText("webAuthSecurity:verify_by_v0", {
                              v0: uiText(CHANNEL_LABEL[item])
                            })}
                          </span>
                          <span className="block truncate text-xs text-foreground-subtle">
                            {item === "phone" ? user?.phone : user?.email}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div>
                  <label
                    htmlFor="account-deletion-code"
                    className="mb-2 block text-sm font-medium text-foreground"
                  >
                    {uiText("webAuthSecurity:2_enter_the_verification_code")}
                  </label>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input
                      id="account-deletion-code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      pattern="[0-9]{6}"
                      placeholder={uiText(
                        "webAuthSecurity:6_digit_verification_code"
                      )}
                      value={code}
                      aria-describedby="deletion-code-help"
                      disabled={sending || deleting}
                      onChange={(event) =>
                        setCode(event.target.value.replace(/\D/g, ""))
                      }
                      className={cn(AUTH_INPUT_CLASS, "min-w-0 flex-1")}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0"
                      onClick={requestCode}
                      disabled={!canSendCode}
                    >
                      {sending
                        ? uiText("webAuthSecurity:sending_2")
                        : countdown > 0
                          ? uiText("webAuthSecurity:resend_in_v0_seconds", {
                              v0: countdown
                            })
                          : codeRequested
                            ? uiText("webAuthSecurity:resend")
                            : uiText("webAuthSecurity:get_code")}
                    </Button>
                  </div>
                  <p
                    id="deletion-code-help"
                    className="mt-2 px-5 text-xs leading-5 text-foreground-muted"
                  >
                    {uiText(
                      "webAuthSecurity:request_a_code_first_then_enter_the_6_digits_you_receive"
                    )}
                  </p>
                </div>

                {message && (
                  <p role="status" className="text-sm text-success">
                    {uiText(message)}
                  </p>
                )}
                {error && !confirmOpen && (
                  <p role="alert" className="text-sm text-danger">
                    {uiText(error)}
                  </p>
                )}

                <Button
                  id="continue-account-deletion"
                  type="submit"
                  className="w-full"
                  disabled={!canContinue}
                >
                  {uiText("webAuthSecurity:next")}
                </Button>
              </form>
            </div>
          </div>
        </div>
      </PageShell>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 p-4 backdrop-blur-sm sm:items-center"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deleting)
              setConfirmOpen(false);
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            tabIndex={-1}
            aria-modal="true"
            aria-labelledby="confirm-deletion-title"
            aria-describedby="confirm-deletion-description"
            className="w-full max-w-md rounded-3xl border border-border/60 bg-surface p-6 shadow-float outline-hidden sm:p-8"
            onKeyDown={(event) => {
              if (event.key === "Escape" && !deleting) {
                setConfirmOpen(false);
                return;
              }
              if (event.key !== "Tab") return;
              const buttons = Array.from(
                event.currentTarget.querySelectorAll<HTMLElement>(
                  "button:not(:disabled), input:not(:disabled)"
                )
              );
              const first = buttons[0];
              const last = buttons.at(-1);
              if (!first || !last) return;
              if (
                event.shiftKey &&
                (document.activeElement === first ||
                  document.activeElement === event.currentTarget)
              ) {
                event.preventDefault();
                last.focus();
              } else if (
                !event.shiftKey &&
                (document.activeElement === last ||
                  document.activeElement === event.currentTarget)
              ) {
                event.preventDefault();
                first.focus();
              }
            }}
          >
            <h2
              id="confirm-deletion-title"
              className="text-xl font-bold tracking-tight text-foreground"
            >
              {uiText("webAuthSecurity:submit_account_deletion_request")}
            </h2>
            <p
              id="confirm-deletion-description"
              className="mt-3 text-sm leading-6 text-foreground-muted"
            >
              {deletionState.consent_text}
            </p>
            <p className="mt-4 rounded-2xl bg-muted/70 px-4 py-3 text-sm font-medium">
              {uiText("webAuthSecurity:confirmed_balance_v0", {
                v0: deletionState.coin_balance
              })}
            </p>
            <label className="mt-4 flex items-start gap-3 text-sm leading-6">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-primary"
                checked={consentChecked}
                disabled={deleting}
                onChange={(event) => setConsentChecked(event.target.checked)}
              />
              <span>
                {uiText(
                  "webAuthSecurity:i_have_read_and_agree_to_the_account_deletion_rules_above"
                )}
                {deletionState.coin_balance !== "0"
                  ? uiText("webAuthSecurity:and_give_up_the_confirmed_v0", {
                      v0: deletionState.coin_balance
                    })
                  : uiText(
                      "webAuthSecurity:and_confirm_that_a_zero_balance_also_requires_72_consecutive_hours"
                    )}
                。
              </span>
            </label>
            {error && (
              <p role="alert" className="mt-3 text-sm text-danger">
                {uiText(error)}
              </p>
            )}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={deleting}
                onClick={() => setConfirmOpen(false)}
              >
                {uiText("webAuthSecurity:cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deleting || !consentChecked}
                onClick={confirmDeletion}
              >
                {deleting
                  ? uiText("webAuthSecurity:submitting_2")
                  : uiText("webAuthSecurity:submit_deletion_request")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
