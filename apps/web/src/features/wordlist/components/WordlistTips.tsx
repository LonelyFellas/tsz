"use client";
import { useWebLocale, useWebText } from "@/i18n/client";
import { localText, type WebNotice } from "@/i18n/catalog";

import { webWordlistInteractions as webWordlist } from "@/i18n/messages/wordlist/interactions";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Coins, Check } from "lucide-react";
import { Button } from "@tsz/ui/components";
import { HttpError } from "@tsz/api-client";
import { formatCoins } from "@tsz/shared";
import type {
  CreateWordlistTip,
  Wordlist,
  WordlistTipStates
} from "@tsz/types";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { wordListKeys } from "../hooks/useWordLists";
import { cn } from "@tsz/ui/lib/cn";
import { textButtonClass } from "../reading";
import { LibraryDialog } from "./LibraryDialog";
import {
  PageHeader,
  PageNotice,
  PageShell,
  Pager,
  panelClass
} from "@/features/shell/Page";
function restore(key: string): CreateWordlistTip | null {
  const text = sessionStorage.getItem(key);
  if (!text) return null;
  const value: unknown = JSON.parse(text);
  if (
    !value ||
    typeof value !== "object" ||
    !("event_id" in value) ||
    !("idempotency_key" in value) ||
    !("amount" in value) ||
    typeof value.event_id !== "string" ||
    typeof value.idempotency_key !== "string" ||
    typeof value.amount !== "string" ||
    ("like" in value && typeof value.like !== "boolean")
  )
    throw new Error("invalid saved tip");
  if (
    !/^[1-9][0-9]{0,18}$/.test(value.amount) ||
    BigInt(value.amount) > 9223372036854775807n
  )
    throw new Error("invalid saved amount");
  return {
    event_id: value.event_id,
    idempotency_key: value.idempotency_key,
    amount: value.amount,
    ...("like" in value ? { like: value.like as boolean } : {})
  };
}
export function TipPanel({
  list,
  tipped,
  failed,
  onRetry,
  onClose
}: {
  list: Wordlist;
  tipped?: string;
  failed: boolean;
  onRetry: () => void;
  onClose: () => void;
}) {
  const userId = useUserStore((s) => s.user?.id);
  if (!userId || userId === list.owner_user_id || !list.owner_user_id)
    return null;
  return (
    <TipForm
      key={`${userId}:${list.id}`}
      userId={userId}
      list={list}
      tipped={tipped}
      failed={failed}
      onRetry={onRetry}
      onClose={onClose}
    />
  );
}
function TipForm({
  userId,
  list,
  tipped,
  failed,
  onRetry,
  onClose
}: {
  userId: string;
  list: Wordlist;
  tipped?: string;
  failed: boolean;
  onRetry: () => void;
  onClose: () => void;
}) {
  const uiText = useWebText(webWordlist);
  const client = useQueryClient();
  const storageKey = `wordlist-tip:${userId}:${list.id}`;
  const [recovery] = useState(() => {
    try {
      return { pending: restore(storageKey), error: false };
    } catch {
      return { pending: null, error: true };
    }
  });
  const [pending, setPending] = useState(recovery.pending);
  const [selected, setSelected] = useState<string | null>(null);
  const [like, setLike] = useState(recovery.pending?.like ?? !recovery.pending);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<WebNotice>(
    recovery.error
      ? localText(
          webWordlist,
          "webWordlistInteractions:cannot_read_this_device_s_pending_tip_record_check_your_tip_history_firs"
        )
      : ""
  );
  const [success, setSuccess] = useState<string | null>(null);
  const mounted = useRef(false);
  const activeRequest = useRef<AbortController | null>(null);
  const remaining =
    tipped === undefined ? null : BigInt(tipped) >= 2n ? 0 : 2 - Number(tipped);
  const amount =
    pending?.amount ?? success ?? (remaining === 1 ? "1" : (selected ?? "2"));
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      activeRequest.current?.abort();
    };
  }, []);
  async function send() {
    if (
      activeRequest.current ||
      !mounted.current ||
      recovery.error ||
      success ||
      (!pending &&
        (failed || remaining === null || Number(amount) > remaining)) ||
      useUserStore.getState().user?.id !== userId
    )
      return;
    const controller = new AbortController();
    activeRequest.current = controller;
    const current = () =>
      mounted.current &&
      !controller.signal.aborted &&
      useUserStore.getState().user?.id === userId;
    const input = pending ?? {
      event_id: crypto.randomUUID(),
      idempotency_key: crypto.randomUUID(),
      amount,
      like
    };
    let posting = false;
    setBusy(true);
    setMessage("");
    try {
      // Persist the exact intent before any charge, so refresh can safely retry it.
      sessionStorage.setItem(storageKey, JSON.stringify(input));
      setPending(input);
      let receipt;
      if (pending) {
        try {
          receipt = await api.wordList.tipReceipt(input.event_id, {
            signal: controller.signal
          });
          if (!current()) return;
        } catch (error) {
          if (!current()) return;
          if (!(error instanceof HttpError && error.status === 404))
            throw error;
        }
      }
      if (!current()) return;
      if (!receipt) {
        posting = true;
        receipt = await api.wordList.tip(list.id, input, {
          signal: controller.signal
        });
      }
      if (!current()) return;
      if (
        receipt.event_id !== input.event_id ||
        receipt.wordlist_id !== list.id ||
        receipt.payer_user_id !== userId ||
        receipt.amount !== input.amount
      )
        throw new Error("receipt mismatch");
      const tipQueries = {
        queryKey: [...wordListKeys.mine(userId), "tip-states"]
      };
      void client.cancelQueries(tipQueries);
      const confirmedTotal = pending
        ? null
        : BigInt(tipped!) + BigInt(receipt.amount);
      client.setQueriesData<WordlistTipStates>(tipQueries, (data) =>
        data
          ? {
              ...data,
              // A recovered receipt may already be included in the cached total.
              items: pending
                ? data.items.filter((item) => item.wordlist_id !== list.id)
                : data.items.map((item) =>
                    item.wordlist_id === list.id
                      ? {
                          ...item,
                          tip_amount: String(
                            BigInt(item.tip_amount) > confirmedTotal!
                              ? BigInt(item.tip_amount)
                              : confirmedTotal
                          )
                        }
                      : item
                  )
            }
          : data
      );
      sessionStorage.removeItem(storageKey);
      setPending(null);
      setSuccess(receipt.amount);
      setMessage(
        localText(
          webWordlist,
          "webWordlistInteractions:tipped_v0_the_author_has_received_it",
          {
            v0: formatCoins(receipt.amount)
          }
        )
      );
      void client
        .invalidateQueries({ queryKey: wordListKeys.all })
        .catch(() => {});
      void client.invalidateQueries({ queryKey: ["coins"] }).catch(() => {});
    } catch (error) {
      if (!current()) return;
      if (
        posting &&
        error instanceof HttpError &&
        error.status < 500 &&
        error.status !== 408 &&
        (!pending || error.code === "coin_invalid_amount") &&
        error.code !== "coin_idempotency_conflict" &&
        error.code !== "coin_source_conflict"
      ) {
        sessionStorage.removeItem(storageKey);
        setPending(null);
        const messages: Record<string, WebNotice> = {
          coin_insufficient_balance: localText(
            webWordlist,
            "webWordlistInteractions:insufficient_balance_check_your_wallet"
          ),
          coin_wallet_unavailable: localText(
            webWordlist,
            "webWordlistInteractions:your_account_or_the_author_s_account_has_transactions_paused"
          ),
          coin_account_unavailable: localText(
            webWordlist,
            "webWordlistInteractions:your_account_or_the_author_s_account_is_unavailable"
          ),
          coin_invalid_amount: localText(
            webWordlist,
            "webWordlistInteractions:you_can_tip_1_or_2_coins_at_a_time_choose_again"
          ),
          word_list_tip_limit: localText(
            webWordlist,
            "webWordlistInteractions:this_list_can_receive_at_most_2_coins_from_you_refresh_the_tip_status"
          ),
          word_list_conflict: localText(
            webWordlist,
            "webWordlistInteractions:some_entries_were_unavailable_the_author_must_fix_the_list_and_have_it_r"
          ),
          word_list_entry_unavailable: localText(
            webWordlist,
            "webWordlistInteractions:this_list_contains_unavailable_entries_and_cannot_receive_tips_yet"
          ),
          validation_failed: localText(
            webWordlist,
            "webWordlistInteractions:this_list_contains_unavailable_entries_and_cannot_receive_tips_yet"
          ),
          not_found: localText(
            webWordlist,
            "webWordlistInteractions:the_list_was_withdrawn_or_is_inaccessible"
          ),
          forbidden: localText(
            webWordlist,
            "webWordlistInteractions:you_cannot_tip_your_own_word_list"
          )
        };
        setMessage(
          messages[error.code ?? ""] ??
            localText(
              webWordlist,
              "webWordlistInteractions:tip_rejected_refresh_the_word_list_and_check_your_account_status"
            )
        );
        onRetry();
      } else
        setMessage(
          localText(
            webWordlist,
            "webWordlistInteractions:the_result_is_unconfirmed_retry_the_original_request_or_check_your_tip_h"
          )
        );
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
      if (current()) setBusy(false);
    }
  }
  return (
    <LibraryDialog
      title={uiText("webWordlistInteractions:tip_the_author")}
      busy={busy}
      onClose={onClose}
    >
      <p className="break-words text-center text-sm leading-6 text-foreground-muted">
        {uiText("webWordlistInteractions:tip_v0", { v0: list.owner_name })}
        <strong className="text-2xl font-semibold tabular-nums text-primary">
          {amount}
        </strong>{" "}
        {uiText("webWordlistInteractions:brand")}
      </p>
      <p className="mt-2 text-center text-xs leading-5 text-foreground-muted">
        {uiText(
          "webWordlistInteractions:you_can_tip_at_most_2_coins_per_list_in_total_the_author_receives_the_fu"
        )}
      </p>
      {!success && (
        <>
          <fieldset
            className="mt-6 grid grid-cols-2 gap-4"
            disabled={
              busy ||
              !!pending ||
              recovery.error ||
              failed ||
              remaining === null
            }
          >
            <legend className="sr-only">
              {uiText("webWordlistInteractions:tip_amount")}
            </legend>
            {[1, 2].map((value) => (
              <label
                key={value}
                className={cn(
                  "relative flex min-h-40 flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-muted/40 p-4 transition-colors has-checked:border-primary has-checked:bg-primary-muted has-checked:text-primary has-focus-visible:outline-2 has-focus-visible:outline-offset-4 has-focus-visible:outline-primary",
                  remaining !== null && value > remaining
                    ? "cursor-not-allowed opacity-40"
                    : "cursor-pointer hover:border-primary/50"
                )}
              >
                <input
                  className="sr-only"
                  type="radio"
                  name="tip-amount"
                  value={value}
                  checked={amount === String(value)}
                  disabled={remaining !== null && value > remaining}
                  onChange={() => setSelected(String(value))}
                  aria-label={uiText("webWordlistInteractions:v0", {
                    v0: value
                  })}
                />
                <span className="flex gap-1" aria-hidden>
                  {Array.from({ length: value }, (_, i) => (
                    <Coins key={i} className="size-9" strokeWidth={1.5} />
                  ))}
                </span>
                <span className="text-sm font-medium">
                  {uiText("webWordlistInteractions:v0", { v0: value })}
                </span>
                {amount === String(value) && (
                  <Check
                    className="absolute right-3 top-3 size-4"
                    aria-hidden
                  />
                )}
              </label>
            ))}
          </fieldset>
          <label className="mt-5 flex min-h-10 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={like}
              disabled={busy || !!pending || recovery.error}
              onChange={(e) => setLike(e.target.checked)}
            />
            {uiText("webWordlistInteractions:also_like_this_content")}
          </label>
          {pending && (
            <p className="mt-2 text-sm leading-6 text-foreground-muted">
              {uiText(
                "webWordlistInteractions:a_tip_of_v0_is_pending_its_result_will_be_checked_first",
                {
                  v0: pending.amount
                }
              )}
            </p>
          )}
          {!pending && !failed && remaining !== null && remaining < 2 && (
            <p className="mt-2 text-sm text-foreground-muted">
              {remaining === 0
                ? uiText(
                    "webWordlistInteractions:you_have_tipped_the_maximum_2_coins_for_this_list"
                  )
                : uiText(
                    "webWordlistInteractions:you_have_tipped_1_coin_and_can_tip_1_more"
                  )}
            </p>
          )}
          {!pending && (failed || remaining === null) && (
            <p
              role={failed ? "alert" : "status"}
              className="mt-2 text-sm text-foreground-muted"
            >
              {failed
                ? uiText("webWordlistInteractions:could_not_load_tip_status")
                : uiText("webWordlistInteractions:loading_tip_status")}
              {failed && (
                <button
                  type="button"
                  className={textButtonClass}
                  onClick={onRetry}
                >
                  {uiText("webWordlistInteractions:retry")}
                </button>
              )}
            </p>
          )}
        </>
      )}
      {message && (
        <p
          role={success ? "status" : "alert"}
          className={cn(
            "mt-4 text-sm leading-6",
            success ? "text-success" : "text-danger"
          )}
        >
          {uiText(message)}
        </p>
      )}
      <div className="mt-6 flex justify-center">
        <Button
          type="button"
          className="min-w-36"
          disabled={
            busy ||
            recovery.error ||
            (!success &&
              !pending &&
              (failed || remaining === null || remaining === 0))
          }
          onClick={success ? onClose : () => void send()}
        >
          {busy
            ? uiText("webWordlistInteractions:confirming")
            : success
              ? uiText("webWordlistInteractions:done")
              : pending
                ? uiText("webWordlistInteractions:retry_this_tip")
                : uiText("webWordlistInteractions:confirm_tip")}
        </Button>
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
        <Link className="text-primary hover:underline" href="/account/coins">
          {uiText("webWordlistInteractions:view_wallet")}
        </Link>
        <Link
          className="text-primary hover:underline"
          href="/account/wordlist-tips"
        >
          {uiText("webWordlistInteractions:view_my_tip_history")}
        </Link>
      </div>
    </LibraryDialog>
  );
}
export function WordlistTips() {
  const id = useUserStore((s) => s.user?.id);
  return id ? <TipHistory key={id} userId={id} /> : null;
}
function TipHistory({ userId }: { userId: string }) {
  const locale = useWebLocale();
  const uiText = useWebText(webWordlist);
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: [...wordListKeys.mine(userId), "tips", page],
    refetchOnMount: "always",
    queryFn: ({ signal }) => api.wordList.tips({ page }, { signal })
  });
  return (
    <PageShell>
      <PageHeader
        back={{
          href: "/account/coins",
          label: uiText("webWordlistInteractions:my_coins")
        }}
        eyebrow={uiText("webWordlistInteractions:coins")}
        title={uiText("webWordlistInteractions:word_list_tips")}
        description={uiText(
          "webWordlistInteractions:sent_and_received_records_reflect_actual_transfers"
        )}
      />
      {query.isError ? (
        <PageNotice tone="error">
          {uiText("webWordlistInteractions:could_not_load_records")}
          <button
            className={textButtonClass}
            onClick={() => void query.refetch()}
          >
            {uiText("webWordlistInteractions:retry")}
          </button>
          。
        </PageNotice>
      ) : query.isPending ? (
        <PageNotice>{uiText("webWordlistInteractions:loading")}</PageNotice>
      ) : (
        <>
          {query.data.items.length ? (
            <ul className="space-y-3">
              {query.data.items.map((tip) => {
                const sent = tip.payer_user_id === userId;
                return (
                  <li key={tip.event_id} className={panelClass}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <p className="text-lg font-bold tabular-nums tracking-tight">
                        {sent
                          ? uiText("webWordlistInteractions:tip")
                          : uiText("webWordlistInteractions:received")}{" "}
                        {formatCoins(tip.amount)}
                      </p>
                      <p className="text-xs text-foreground-muted">
                        {new Date(tip.created_at).toLocaleString(locale, {
                          timeZone:
                            Intl.DateTimeFormat().resolvedOptions().timeZone
                        })}
                      </p>
                    </div>
                    <p className="mt-3 text-sm">
                      {sent
                        ? uiText("webWordlistInteractions:author")
                        : uiText("webWordlistInteractions:tipper")}
                      ：
                      {tip.counterparty_name ??
                        uiText("webWordlistInteractions:deleted_account")}
                    </p>
                    {tip.wordlist_accessible ? (
                      <Link
                        className="mt-1 inline-block break-words text-sm text-primary underline-offset-4 hover:underline"
                        href={`${sent ? "" : "/account"}/wordlists/${tip.wordlist_id}`}
                      >
                        {tip.wordlist_name}
                      </Link>
                    ) : (
                      <p className="mt-1 text-sm text-foreground-muted">
                        {uiText(
                          "webWordlistInteractions:word_list_deleted_or_inaccessible"
                        )}
                      </p>
                    )}
                    <p className="mt-3 break-all text-xs text-foreground-subtle">
                      {uiText("webWordlistInteractions:event_id_v0", {
                        v0: tip.event_id
                      })}
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <PageNotice>
              {uiText("webWordlistInteractions:no_tip_records_yet")}
            </PageNotice>
          )}
          <Pager
            page={page}
            total={query.data.pagination.total_pages}
            onChange={setPage}
          />
        </>
      )}
    </PageShell>
  );
}
