"use client";

import { Button, Card } from "@tsz/ui";
import type {
  AccountDeletionChannel,
  AccountDeletionState,
  CreateAccountDeletionRequest
} from "@tsz/types";
import { HttpError } from "@tsz/api-client";
import { isCode } from "@tsz/shared";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, clearSession } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { AUTH_INPUT_CLASS } from "../shared";

const CODE_COUNTDOWN = 60;

const CHANNEL_LABEL: Record<AccountDeletionChannel, string> = {
  phone: "手机",
  email: "邮箱"
};

const ERROR_BY_CODE: Record<string, string> = {
  account_deletion_balance_changed: "余额已变化，请核对最新金额并重新签署",
  account_deletion_consent_outdated: "注销声明已更新，请重新阅读并签署",
  account_deletion_pending: "已有待生效的注销申请，请查看当前状态",
  account_deletion_expired: "已到注销生效时间，无法撤销",
  account_deletion_consent_required: "请主动确认注销规则及余额放弃声明",
  invalid_account_deletion_code: "验证码错误、已失效或已使用，请重新获取",
  account_deletion_channel_unavailable:
    "当前账号没有可用于验证的该渠道，请选择其他方式",
  otp_rate_limited: "验证码申请过于频繁，请稍后再试",
  otp_unavailable: "验证码服务暂时不可用，请稍后重试",
  invalid_json: "请求格式错误，请刷新页面后重试",
  invalid_request_body: "提交内容不完整，请检查后重试",
  internal_error: "服务暂时异常，请稍后重试"
};

function accountDeletionError(error: unknown): string {
  if (!(error instanceof HttpError)) return "网络异常，请检查连接后重试";
  if (error.status === 404) return "注销申请服务暂不可用，请稍后重试";
  const mapped = error.code ? ERROR_BY_CODE[error.code] : undefined;
  if (mapped) return mapped;
  if (error.status === 400 || error.status === 422) {
    return "提交内容有误，请检查后重试";
  }
  if (error.status === 500) return "服务暂时异常，请稍后重试";
  return "操作失败，请稍后重试";
}

export function DeleteAccountForm() {
  const user = useUserStore((state) => state.user);
  return <AccountDeletionForm key={user?.id ?? "anonymous"} />;
}

function AccountDeletionForm() {
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
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
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
      setMessage("注销申请已撤销，天生币余额保持不变。");
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
        `验证码申请已受理，将发送至当前账号的${CHANNEL_LABEL[channel]}`
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
        setMessage("注销申请已保存，当前会话保留。");
      } else {
        // A replay can return a historical request cancelled in another tab.
        intentRef.current = null;
        setCode("");
        setCodeRequested(false);
        setConsentChecked(false);
        setMessage(
          request.status === "cancelled"
            ? "这份注销申请已撤销。如需重新申请，请重新获取验证码并签署。"
            : "这份注销申请已结束，请重新读取账号状态。"
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
          setError("余额或注销声明已变化，请核对最新内容并重新签署");
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
      <main className="mx-auto max-w-lg px-4 py-12">
        <h1 className="text-xl font-bold">注销账号</h1>
        {loading ? (
          <p role="status">正在读取注销状态…</p>
        ) : (
          <>
            <p role="alert" className="mt-4 text-danger">
              {error}
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
              重新加载
            </Button>
          </>
        )}
      </main>
    );
  }
  if (deletionState.request?.status === "pending") {
    const request = deletionState.request;
    return (
      <main className="mx-auto max-w-lg px-4 py-12">
        <Card className="rounded-3xl p-6">
          <h1 className="text-xl font-bold">注销申请等待生效</h1>
          <p className="mt-4">
            申请成功后等待连续 72 小时，期间可继续登录并撤销申请。
          </p>
          <p className="mt-3">
            生效时间：
            <time dateTime={request.effective_at}>
              {new Date(request.effective_at).toLocaleString("zh-CN", {
                timeZoneName: "short"
              })}
            </time>
          </p>
          <p className="mt-3">
            已确认天生币余额：{request.confirmed_balance}
            。钱包全部收支已暂停，撤销后余额保持不变。
          </p>
          <p className="mt-3 text-sm text-foreground-muted">
            到期后账号不可再使用，剩余天生币作废，个人数据随后完成清理。是否仍可撤销以服务器判定为准。
          </p>
          {error && (
            <p role="alert" className="mt-3 text-danger">
              {error}
            </p>
          )}
          <Button className="mt-6" disabled={deleting} onClick={cancelDeletion}>
            {deleting ? "正在撤销…" : "撤销注销申请"}
          </Button>
          <Button
            className="mt-3"
            variant="secondary"
            onClick={() => router.back()}
          >
            返回
          </Button>
        </Card>
      </main>
    );
  }

  if (channels.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-foreground">无法注销账号</h1>
        <p className="mt-3 text-sm leading-6 text-foreground-subtle">
          当前账号没有已绑定的手机号或邮箱，请先联系客服处理。
        </p>
        <Button
          className="mt-6"
          variant="secondary"
          onClick={() => router.back()}
        >
          返回
        </Button>
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8 sm:py-12">
      <div
        data-testid="account-deletion-content"
        inert={confirmOpen}
        aria-hidden={confirmOpen || undefined}
      >
        <div className="mb-6 flex items-center gap-3">
          <Button
            variant="ghost"
            className="-ml-3 px-3"
            onClick={() => router.back()}
          >
            ← 返回
          </Button>
          <h1 className="flex-1 pr-14 text-center text-xl font-bold text-foreground">
            注销账号
          </h1>
        </div>

        <Card className="rounded-3xl border-danger/30 p-5 sm:p-8">
          <section
            aria-labelledby="deletion-warning-title"
            className="mb-7 rounded-2xl bg-danger/10 p-4 text-danger"
          >
            <h2 id="deletion-warning-title" className="font-semibold">
              注销申请等待 72 小时生效
            </h2>
            <p className="mt-2 text-sm leading-6">
              所有申请均等待连续 72
              小时，期间可撤销，钱包全部收支暂停。到期后账号不可再使用，剩余天生币作废，个人数据随后清理。
            </p>
          </section>

          <form className="space-y-6" onSubmit={continueDeletion}>
            <fieldset disabled={sending || deleting}>
              <legend className="mb-3 text-sm font-medium text-foreground">
                1. 选择验证方式
              </legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {channels.map((item) => (
                  <label
                    key={item}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 text-sm transition-colors ${
                      channel === item
                        ? "border-primary bg-primary-muted text-primary"
                        : "border-border text-foreground-muted hover:border-primary/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="deletion-channel"
                      value={item}
                      checked={channel === item}
                      onChange={() => switchChannel(item)}
                    />
                    <span className="min-w-0">
                      <span className="block font-medium">
                        {CHANNEL_LABEL[item]}验证
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
                className="mb-2 block text-sm font-medium"
              >
                2. 输入验证码
              </label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  id="account-deletion-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  placeholder="6 位数字验证码"
                  value={code}
                  aria-describedby="deletion-code-help"
                  disabled={sending || deleting}
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/g, ""))
                  }
                  className={`${AUTH_INPUT_CLASS} min-w-0 flex-1`}
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11 shrink-0 rounded-full"
                  onClick={requestCode}
                  disabled={!canSendCode}
                >
                  {sending
                    ? "申请中…"
                    : countdown > 0
                      ? `${countdown}s 后重试`
                      : codeRequested
                        ? "重新获取"
                        : "获取验证码"}
                </Button>
              </div>
              <p
                id="deletion-code-help"
                className="mt-2 text-xs leading-5 text-foreground-subtle"
              >
                开发测试提示：当前测试环境验证码为
                000000；正式验证码策略切换后无需更改此流程。
              </p>
            </div>

            {message && (
              <p role="status" className="text-sm text-success">
                {message}
              </p>
            )}
            {error && !confirmOpen && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}

            <Button
              id="continue-account-deletion"
              type="submit"
              className="min-h-12 w-full rounded-full bg-danger text-white hover:bg-danger/90"
              disabled={!canContinue}
            >
              继续注销
            </Button>
          </form>
        </Card>
      </div>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
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
            className="w-full max-w-md rounded-3xl bg-surface p-6 shadow-xl"
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
              className="text-lg font-bold text-foreground"
            >
              确认提交注销申请？
            </h2>
            <p
              id="confirm-deletion-description"
              className="mt-3 text-sm leading-6 text-foreground-muted"
            >
              {deletionState.consent_text}
            </p>
            <p className="mt-3 font-medium">
              本次确认余额：{deletionState.coin_balance} 天生币
            </p>
            <label className="mt-4 flex items-start gap-3 text-sm leading-6">
              <input
                type="checkbox"
                className="mt-1"
                checked={consentChecked}
                disabled={deleting}
                onChange={(event) => setConsentChecked(event.target.checked)}
              />
              <span>
                我已阅读并同意以上注销规则
                {deletionState.coin_balance !== "0"
                  ? `，主动放弃本次确认的 ${deletionState.coin_balance} 天生币`
                  : "，确认零余额也等待连续 72 小时"}
                。
              </span>
            </label>
            {error && (
              <p role="alert" className="mt-3 text-sm text-danger">
                {error}
              </p>
            )}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                className="min-h-11 rounded-full"
                disabled={deleting}
                onClick={() => setConfirmOpen(false)}
              >
                取消
              </Button>
              <Button
                type="button"
                className="min-h-11 rounded-full bg-danger text-white hover:bg-danger/90"
                disabled={deleting || !consentChecked}
                onClick={confirmDeletion}
              >
                {deleting ? "正在提交…" : "提交注销申请"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
