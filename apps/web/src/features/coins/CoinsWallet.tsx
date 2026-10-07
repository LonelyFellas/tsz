"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCoins } from "@tsz/shared";
import { Button } from "@tsz/ui/components";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/request";
import { LearningRewardSummary } from "./LearningRewardSummary";
import { useUserStore } from "@/stores/user";

const SOURCES: Record<string, string> = {
  wordlist_tip: "词表投币",
  invitation_reward: "邀请奖励",
  learning_reward: "每日学习奖励",
  manual_purchase: "购买入账",
  manual_reward: "人工奖励",
  manual_reversal: "人工入账冲正",
  account_closure: "注销余额作废"
};
export function CoinsWallet() {
  const id = useUserStore((s) => s.user?.id);
  return id ? <Wallet key={id} id={id} /> : null;
}
function Wallet({ id }: { id: string }) {
  const client = useQueryClient();
  const isStudent = useUserStore((s) => s.user?.roles.includes("student"));
  const [page, setPage] = useState(1);
  const [snapshot, setSnapshot] = useState<string>();
  const wallet = useQuery({
    queryKey: ["coins", "user", id, "wallet"],
    refetchOnMount: "always",
    queryFn: ({ signal }) => api.coins.wallet({ signal })
  });
  const entries = useQuery({
    queryKey: ["coins", "user", id, "entries", page, snapshot],
    queryFn: ({ signal }) =>
      api.coins.entries({ page, page_size: 20, snapshot }, { signal })
  });
  const contact = process.env.NEXT_PUBLIC_COINS_SUPPORT_CONTACT?.trim();
  function refresh() {
    setPage(1);
    setSnapshot(undefined);
    void client.invalidateQueries({ queryKey: ["coins", "user", id] });
    void client.invalidateQueries({ queryKey: ["learning-rewards", id] });
  }
  return (
    <div className="animate-in mx-auto max-w-3xl px-6 py-10 sm:py-14">
      <Link href="/account" className="text-sm text-foreground-muted">
        ← 返回个人中心
      </Link>
      <div className="mt-7 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">我的天生币</h1>
        <Button variant="outline" onClick={refresh}>
          刷新
        </Button>
      </div>
      <section
        aria-label="钱包余额"
        className="mt-6 rounded-3xl border border-border bg-surface p-6 sm:p-8"
      >
        <p className="text-sm text-foreground-muted">
          当前余额 · 学生与教师身份共用
        </p>
        {wallet.isError ? (
          <p role="alert" className="mt-3">
            余额加载失败，请重试。当前余额未知。
          </p>
        ) : wallet.isPending || wallet.isFetching ? (
          <p className="mt-3">正在读取余额…</p>
        ) : (
          <p className="mt-3 break-all text-3xl font-semibold">
            {formatCoins(wallet.data.balance)}
          </p>
        )}
        {!wallet.isError &&
          !wallet.isFetching &&
          wallet.data?.status === "deletion_pending" && (
            <div
              role="status"
              className="mt-5 rounded-2xl bg-muted p-4 text-sm"
            >
              账号正在等待注销，钱包已暂停全部入账和支出。撤销后可恢复原余额。
              <Link className="ml-2 text-primary" href="/account/delete">
                查看注销申请
              </Link>
            </div>
          )}
        {!wallet.isError &&
          !wallet.isFetching &&
          wallet.data?.status === "closed" && (
            <p className="mt-4">钱包已关闭。</p>
          )}
      </section>
      <section className="mt-8">
        <h2 className="text-xl font-semibold">收支记录</h2>
        {entries.isError ? (
          <p role="alert" className="mt-4">
            流水加载失败，请重试。
          </p>
        ) : entries.isPending ? (
          <p className="mt-4">正在读取流水…</p>
        ) : (
          <>
            {entries.data.items.length === 0 ? (
              <p className="mt-4 text-foreground-muted">暂无收支记录</p>
            ) : (
              <ul className="mt-4 divide-y divide-border rounded-3xl border border-border px-5">
                {entries.data.items.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-wrap justify-between gap-3 py-5"
                  >
                    <div>
                      <p>
                        {SOURCES[entry.source_type] ??
                          (entry.kind === "transfer"
                            ? "天生币转入 / 转出"
                            : "天生币收支")}
                      </p>
                      <p className="mt-1 text-xs text-foreground-muted">
                        {new Date(entry.created_at).toLocaleString("zh-CN")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="break-all font-medium">
                        {entry.delta.startsWith("-") ? "" : "+"}
                        {formatCoins(entry.delta)}
                      </p>
                      <p className="mt-1 text-xs text-foreground-muted">
                        余额 {formatCoins(entry.balance_after)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex items-center justify-end gap-3">
              <Button
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                上一页
              </Button>
              <span className="text-sm">第 {page} 页</span>
              <Button
                variant="outline"
                disabled={page >= entries.data.pagination.total_pages}
                onClick={() => {
                  setSnapshot(entries.data.snapshot);
                  setPage(page + 1);
                }}
              >
                下一页
              </Button>
            </div>
          </>
        )}
      </section>
      <section className="mt-8 rounded-3xl bg-muted p-6">
        <h2 className="text-xl font-semibold">获取与使用</h2>
        <p className="mt-3 text-sm leading-7 text-foreground-muted">
          可向他人已公开且全部词条可用的词表投币，数量由你确认，全额进入作者钱包。
        </p>
        <Link
          href="/account/wordlist-tips"
          className="mt-4 mr-5 inline-block text-sm text-primary"
        >
          投出与收到的词表投币 →
        </Link>
        <Link
          href="/account/invitations"
          className="mt-4 inline-block text-sm text-primary"
        >
          邀请好友，查看奖励规则 →
        </Link>
        {isStudent && (
          <div className="mt-5">
            <LearningRewardSummary key={id} userId={id} onAward={refresh} />
          </div>
        )}
        <h3 className="mt-5 font-medium">联系客服</h3>
        {contact ? (
          <p className="mt-2 break-words text-sm">{contact}</p>
        ) : (
          <p className="mt-2 text-sm text-foreground-muted">
            客服联系方式暂未配置，请等待平台公告。
          </p>
        )}
        <p className="mt-3 text-sm text-foreground-muted">
          购买由客服人工核验，不支持在线支付或提现。建议在首个消费场景开放后再购买。
        </p>
      </section>
    </div>
  );
}
