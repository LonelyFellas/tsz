"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HttpError } from "@tsz/api-client";
import { formatCoins } from "@tsz/shared";
import type { CreateWordlistTip, Wordlist } from "@tsz/types";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { wordListKeys } from "../hooks/useWordLists";
import { buttonClass } from "../reading";
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
    typeof value.amount !== "string"
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
    amount: value.amount
  };
}
export function TipPanel({ list }: { list: Wordlist }) {
  const userId = useUserStore((s) => s.user?.id);
  if (!userId)
    return (
      <Link
        className={buttonClass}
        href={`/login?redirect=${encodeURIComponent(`/wordlists/${list.id}`)}`}
      >
        登录后投币
      </Link>
    );
  if (userId === list.owner_user_id)
    return (
      <button className={buttonClass} disabled>
        不能给自己的词表投币
      </button>
    );
  return <TipForm key={`${userId}:${list.id}`} userId={userId} list={list} />;
}
function TipForm({ userId, list }: { userId: string; list: Wordlist }) {
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
  const [amount, setAmount] = useState(recovery.pending?.amount ?? "");
  const [confirming, setConfirming] = useState(!!recovery.pending);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    recovery.error ? "无法读取本机的投币重试记录，请先到投币记录核对结果。" : ""
  );
  const [success, setSuccess] = useState(false);
  const mounted = useRef(false);
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      activeRequest.current?.abort();
    };
  }, []);
  function confirm() {
    if (
      !/^[1-9][0-9]{0,18}$/.test(amount) ||
      BigInt(amount) > 9223372036854775807n
    ) {
      setMessage("请输入有效的正整数数量");
      return;
    }
    setMessage("");
    setConfirming(true);
  }
  async function send() {
    if (
      activeRequest.current ||
      !mounted.current ||
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
      amount
    };
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
      receipt ??= await api.wordList.tip(list.id, input, {
        signal: controller.signal
      });
      if (!current()) return;
      if (
        receipt.wordlist_id !== list.id ||
        receipt.payer_user_id !== userId ||
        receipt.amount !== input.amount
      )
        throw new Error("receipt mismatch");
      sessionStorage.removeItem(storageKey);
      setPending(null);
      setConfirming(false);
      setAmount("");
      setSuccess(true);
      setMessage(`已投出 ${formatCoins(receipt.amount)}，作者已收到。`);
      await client.invalidateQueries({ queryKey: ["coins"] });
      if (!current()) return;
      await client.invalidateQueries({
        queryKey: [...wordListKeys.mine(userId), "tips"]
      });
    } catch (error) {
      if (!current()) return;
      if (error instanceof HttpError && error.status < 500 && !pending) {
        sessionStorage.removeItem(storageKey);
        setPending(null);
        setConfirming(false);
        const messages: Record<string, string> = {
          coin_insufficient_balance: "余额不足，请查看钱包。",
          coin_wallet_unavailable: "你或作者的账户当前暂停收支。",
          word_list_conflict: "词条曾不可用，作者修复并重新审核后才能投币。",
          validation_failed: "词表含不可用词条，暂不能投币。",
          not_found: "词表已下架或不可访问。",
          forbidden: "不能给自己的词表投币。",
          coin_idempotency_conflict: "请求信息不一致，请到投币记录核对。",
          coin_source_conflict: "这次投币已处理，请到投币记录核对。"
        };
        setMessage(
          messages[error.code ?? ""] ?? "投币被拒绝，请刷新词表并检查账户状态。"
        );
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
    <section
      aria-label="词表投币"
      className="mt-5 w-full rounded-2xl border border-border p-4"
    >
      <p className="text-sm">
        投币将全额进入作者钱包。词条不可用或任一方暂停收支时无法投币。
      </p>
      {confirming ? (
        <>
          <p className="my-3">
            向作者 <strong>{list.owner_name}</strong> 投出{" "}
            <strong>{formatCoins(amount)}</strong>
          </p>
          <p className="mb-3 break-all text-xs text-foreground-muted">
            作者 ID：{list.owner_user_id}
          </p>
          <button
            className={buttonClass}
            disabled={busy || recovery.error}
            onClick={() => void send()}
          >
            {busy ? "正在确认…" : pending ? "重试这次投币" : "确认投出"}
          </button>
          {!pending && (
            <button
              className={`${buttonClass} ml-3`}
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              取消
            </button>
          )}
        </>
      ) : (
        <div className="mt-3 flex flex-wrap gap-3">
          <input
            aria-label="投币数量"
            inputMode="numeric"
            maxLength={19}
            className="min-w-0 rounded-full border border-border bg-background px-4 py-2"
            placeholder="输入正整数数量"
            value={amount}
            disabled={recovery.error}
            onChange={(e) => {
              setAmount(e.target.value);
              setSuccess(false);
            }}
          />
          <button
            className={buttonClass}
            disabled={recovery.error}
            onClick={confirm}
          >
            投币
          </button>
        </div>
      )}
      {message && (
        <p role={success ? "status" : "alert"} className="mt-3">
          {message}
        </p>
      )}
      <Link
        className="mt-3 inline-block text-sm text-primary"
        href="/account/wordlist-tips"
      >
        查看我的投币记录 →
      </Link>
    </section>
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
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/account/coins" className="text-sm text-primary">
        ← 我的天生币
      </Link>
      <h1 className="mt-6 text-3xl font-semibold">词表投币记录</h1>
      <p className="my-4 text-sm text-foreground-muted">
        投出和收到的记录均来自实际转账。
      </p>
      {query.isError ? (
        <p role="alert">
          记录读取失败，
          <button onClick={() => void query.refetch()}>重试</button>。
        </p>
      ) : query.isPending ? (
        <p>正在加载…</p>
      ) : (
        <>
          <div className="space-y-4">
            {query.data.items.map((tip) => {
              const sent = tip.payer_user_id === userId;
              return (
                <section
                  key={tip.event_id}
                  className="rounded-3xl border border-border bg-surface p-5"
                >
                  <p className="font-semibold">
                    {sent ? "投出" : "收到"} {formatCoins(tip.amount)}
                  </p>
                  <p className="mt-2">
                    {sent ? "作者" : "投币人"}：
                    {tip.counterparty_name ?? "账号已注销"}
                  </p>
                  {tip.wordlist_accessible ? (
                    <Link
                      className="mt-2 block text-primary"
                      href={`${sent ? "" : "/account"}/wordlists/${tip.wordlist_id}`}
                    >
                      {tip.wordlist_name}
                    </Link>
                  ) : (
                    <p className="mt-2">词表已删除或不可访问</p>
                  )}
                  <p className="mt-2 text-xs text-foreground-muted">
                    {new Date(tip.created_at).toLocaleString("zh-CN")}
                  </p>
                  <p className="mt-2 break-all text-xs text-foreground-muted">
                    事件 ID：{tip.event_id}
                  </p>
                </section>
              );
            })}
          </div>
          {!query.data.items.length && <p>暂无投币记录</p>}
          <div className="mt-6 flex items-center gap-4">
            <button
              className={buttonClass}
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              上一页
            </button>
            <span>第 {page} 页</span>
            <button
              className={buttonClass}
              disabled={page >= query.data.pagination.total_pages}
              onClick={() => setPage(page + 1)}
            >
              下一页
            </button>
          </div>
        </>
      )}
    </div>
  );
}
