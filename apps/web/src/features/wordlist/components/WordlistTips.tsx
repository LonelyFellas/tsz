"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Coins, Check } from "lucide-react";
import { Button } from "@tsz/ui/components";
import { HttpError } from "@tsz/api-client";
import { formatCoins } from "@tsz/shared";
import type { CreateWordlistTip, Wordlist } from "@tsz/types";
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
  const [message, setMessage] = useState(
    recovery.error ? "无法读取本机的投币重试记录，请先到投币记录核对结果。" : ""
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
      sessionStorage.removeItem(storageKey);
      setPending(null);
      setSuccess(receipt.amount);
      setMessage(`已投出 ${formatCoins(receipt.amount)}，作者已收到。`);
      await client.invalidateQueries({ queryKey: wordListKeys.all });
      await client.invalidateQueries({ queryKey: ["coins"] });
    } catch (error) {
      if (!current()) return;
      if (
        posting &&
        error instanceof HttpError &&
        error.status < 500 &&
        error.status !== 408 &&
        error.code !== "coin_idempotency_conflict" &&
        error.code !== "coin_source_conflict"
      ) {
        sessionStorage.removeItem(storageKey);
        setPending(null);
        const messages: Record<string, string> = {
          coin_insufficient_balance: "余额不足，请查看钱包。",
          coin_wallet_unavailable: "你或作者的账户当前暂停收支。",
          coin_account_unavailable: "你或作者的账户当前不可用。",
          coin_invalid_amount: "每次可投 1 枚或 2 枚，请重新选择。",
          word_list_tip_limit: "这份词表累计最多投 2 枚，请刷新投币状态。",
          word_list_conflict: "词条曾不可用，作者修复并重新审核后才能投币。",
          word_list_entry_unavailable: "词表含不可用词条，暂不能投币。",
          validation_failed: "词表含不可用词条，暂不能投币。",
          not_found: "词表已下架或不可访问。",
          forbidden: "不能给自己的词表投币。"
        };
        setMessage(
          messages[error.code ?? ""] ?? "投币被拒绝，请刷新词表并检查账户状态。"
        );
        onRetry();
      } else
        setMessage(
          "结果尚未确认，请使用原请求重试，或先查看投币记录；不要重复发起新投币。"
        );
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
      if (current()) setBusy(false);
    }
  }
  return (
    <LibraryDialog title="给作者投币" busy={busy} onClose={onClose}>
      <p className="break-words text-center text-sm leading-6 text-foreground-muted">
        给 {list.owner_name} 投出{" "}
        <strong className="text-2xl font-semibold tabular-nums text-primary">
          {amount}
        </strong>{" "}
        枚天生币
      </p>
      <p className="mt-2 text-center text-xs leading-5 text-foreground-muted">
        每份词表累计最多投 2 枚，全额进入作者钱包。
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
            <legend className="sr-only">投币数量</legend>
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
                  aria-label={`${value} 枚天生币`}
                />
                <span className="flex gap-1" aria-hidden>
                  {Array.from({ length: value }, (_, i) => (
                    <Coins key={i} className="size-9" strokeWidth={1.5} />
                  ))}
                </span>
                <span className="text-sm font-medium">{value} 枚天生币</span>
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
            同时点赞内容
          </label>
          {pending && (
            <p className="mt-2 text-sm leading-6 text-foreground-muted">
              有一笔 {pending.amount} 枚天生币的投币待确认，将先核对这次结果。
            </p>
          )}
          {!pending && !failed && remaining !== null && remaining < 2 && (
            <p className="mt-2 text-sm text-foreground-muted">
              {remaining === 0
                ? "这份词表已投满 2 枚。"
                : "已投 1 枚，还可投 1 枚。"}
            </p>
          )}
          {!pending && (failed || remaining === null) && (
            <p
              role={failed ? "alert" : "status"}
              className="mt-2 text-sm text-foreground-muted"
            >
              {failed ? "投币状态加载失败。" : "正在读取投币状态…"}
              {failed && (
                <button
                  type="button"
                  className={textButtonClass}
                  onClick={onRetry}
                >
                  重试
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
          {message}
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
            ? "正在确认…"
            : success
              ? "完成"
              : pending
                ? "重试这次投币"
                : "确认投出"}
        </Button>
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
        <Link className="text-primary hover:underline" href="/account/coins">
          查看钱包
        </Link>
        <Link
          className="text-primary hover:underline"
          href="/account/wordlist-tips"
        >
          查看我的投币记录 →
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
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: [...wordListKeys.mine(userId), "tips", page],
    refetchOnMount: "always",
    queryFn: ({ signal }) => api.wordList.tips({ page }, { signal })
  });
  return (
    <PageShell>
      <PageHeader
        back={{ href: "/account/coins", label: "我的天生币" }}
        eyebrow="天生币"
        title="词表投币记录"
        description="投出和收到的记录均来自实际转账。"
      />
      {query.isError ? (
        <PageNotice tone="error">
          记录读取失败，
          <button
            className={textButtonClass}
            onClick={() => void query.refetch()}
          >
            重试
          </button>
          。
        </PageNotice>
      ) : query.isPending ? (
        <PageNotice>正在加载…</PageNotice>
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
                        {sent ? "投出" : "收到"} {formatCoins(tip.amount)}
                      </p>
                      <p className="text-xs text-foreground-muted">
                        {new Date(tip.created_at).toLocaleString("zh-CN")}
                      </p>
                    </div>
                    <p className="mt-3 text-sm">
                      {sent ? "作者" : "投币人"}：
                      {tip.counterparty_name ?? "账号已注销"}
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
                        词表已删除或不可访问
                      </p>
                    )}
                    <p className="mt-3 break-all text-xs text-foreground-subtle">
                      事件 ID：{tip.event_id}
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <PageNotice>暂无投币记录</PageNotice>
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
