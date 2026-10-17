"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCoins } from "@tsz/shared";
import { Button } from "@tsz/ui/components";
import Link from "next/link";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "@/lib/request";
import { PageHeader, PageShell, panelClass } from "@/features/shell/Page";
import { LoginRewardSummary } from "./LoginReward";
import { LearningRewardSummary } from "./LearningRewardSummary";
import { useUserStore } from "@/stores/user";

const SOURCES: Record<string, string> = {
  wordlist_tip: "词表投币",
  invitation_reward: "邀请奖励",
  learning_reward: "每日学习奖励",
  daily_login_reward: "每日登录奖励",
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
    void client.invalidateQueries({ queryKey: ["login-reward", id] });
    void client.invalidateQueries({ queryKey: ["coins", "user", id] });
    void client.invalidateQueries({ queryKey: ["learning-rewards", id] });
  }
  return (
    <PageShell>
      <PageHeader
        back={{ href: "/account", label: "返回个人中心" }}
        eyebrow="我的账户"
        title="我的天生币"
        actions={
          <Button variant="outline" onClick={refresh}>
            <RefreshCw className="size-4" strokeWidth={1.8} aria-hidden />
            刷新
          </Button>
        }
      />
      <section aria-label="钱包余额" className="glass rounded-3xl p-2">
        <div className="relative overflow-hidden rounded-[20px] bg-surface/70 px-6 py-8 sm:px-10 sm:py-10">
          <p className="text-xs font-medium tracking-[0.2em] text-foreground-muted">
            当前余额 · 学生与教师身份共用
          </p>
          {wallet.isError ? (
            <p role="alert" className="mt-4 text-sm text-danger">
              余额加载失败，请重试。当前余额未知。
            </p>
          ) : wallet.isPending || wallet.isFetching ? (
            <p className="mt-4 text-sm text-foreground-muted">正在读取余额…</p>
          ) : (
            <p className="mt-4 break-all text-4xl font-bold tabular-nums tracking-tight text-foreground sm:text-5xl">
              {formatCoins(wallet.data.balance)}
            </p>
          )}
          <div className="mt-6 h-1 w-10 rounded-full bg-primary" aria-hidden />
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
              <p className="mt-4 text-sm text-foreground-muted">钱包已关闭。</p>
            )}
        </div>
      </section>
      <section className={`${panelClass} mt-6`}>
        <h2 className="text-lg font-bold tracking-tight text-foreground">
          收支记录
        </h2>
        {entries.isError ? (
          <p role="alert" className="mt-4 text-sm text-danger">
            流水加载失败，请重试。
          </p>
        ) : entries.isPending ? (
          <p className="mt-4 text-sm text-foreground-muted">正在读取流水…</p>
        ) : (
          <>
            {entries.data.items.length === 0 ? (
              <p className="mt-4 text-sm text-foreground-muted">暂无收支记录</p>
            ) : (
              <ul className="mt-2 divide-y divide-border/60">
                {entries.data.items.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-wrap justify-between gap-3 py-4"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
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
                      <p
                        className={`break-all font-bold tabular-nums ${
                          entry.delta.startsWith("-")
                            ? "text-foreground"
                            : "text-success"
                        }`}
                      >
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
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                上一页
              </Button>
              <span className="min-w-16 text-center text-sm tabular-nums text-foreground-muted">
                第 {page} 页
              </span>
              <Button
                variant="outline"
                size="sm"
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
      <div className="mt-6">
        <LoginRewardSummary
          onAward={() => {
            setPage(1);
            setSnapshot(undefined);
          }}
        />
      </div>
      {isStudent && (
        <div className="mt-6">
          <LearningRewardSummary key={id} userId={id} onAward={refresh} />
        </div>
      )}
      <section className={`${panelClass} mt-6`}>
        <h2 className="text-lg font-bold tracking-tight text-foreground">
          获取与使用
        </h2>
        <p className="mt-3 text-sm leading-6 text-foreground-muted">
          可向他人已公开且全部词条可用的词表投币，数量由你确认，全额进入作者钱包。
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {[
            { href: "/account/wordlist-tips", label: "投出与收到的词表投币" },
            { href: "/account/invitations", label: "邀请好友，查看奖励规则" }
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-muted/70 px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
            >
              {link.label}
              <span
                className="text-foreground-subtle transition-transform group-hover:translate-x-0.5"
                aria-hidden
              >
                →
              </span>
            </Link>
          ))}
        </div>
        <div className="mt-6 border-t border-border/60 pt-5">
          <h3 className="text-sm font-medium text-foreground">联系客服</h3>
          {contact ? (
            <p className="mt-2 break-words text-sm">{contact}</p>
          ) : (
            <p className="mt-2 text-sm text-foreground-muted">
              客服联系方式暂未配置，请等待平台公告。
            </p>
          )}
          <p className="mt-2 text-xs leading-5 text-foreground-muted">
            购买由客服人工核验，不支持在线支付或提现。建议在首个消费场景开放后再购买。
          </p>
        </div>
      </section>
    </PageShell>
  );
}
