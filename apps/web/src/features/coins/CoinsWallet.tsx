"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCoins } from "@tsz/shared";
import { Button } from "@tsz/ui/components";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Coins,
  RefreshCw,
  Users
} from "lucide-react";
import { api } from "@/lib/request";
import { PageHeader, PageNotice, PageShell } from "@/features/shell/Page";
import { LoginRewardSummary } from "./LoginReward";
import { LearningRewardSummary } from "./LearningRewardSummary";
import { useUserStore } from "@/stores/user";

const SOURCES: Record<string, string> = {
  wordlist_tip: "词表投币",
  wordlist_custom_audio: "自定义词汇语音",
  wordlist_custom_audio_refund: "自定义词汇语音退款",
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
    void client
      .fetchQuery({
        queryKey: ["login-reward", id],
        queryFn: ({ signal }) => api.loginReward.claim({ signal }),
        staleTime: 0
      })
      .catch(() => {
        /* Query keeps the error for the reward summary. */
      });
    void client.invalidateQueries({ queryKey: ["coins", "user", id] });
    void client.invalidateQueries({ queryKey: ["learning-rewards", id] });
  }
  return (
    <PageShell>
      <PageHeader
        back={{ href: "/account", label: "返回个人中心" }}
        title="我的天生币"
        actions={
          <Button
            type="button"
            variant="ghost"
            size="compact"
            onClick={refresh}
          >
            <RefreshCw className="size-4" strokeWidth={1.8} aria-hidden />
            刷新
          </Button>
        }
      />
      <div className="glass rounded-3xl p-2">
        <section
          aria-label="钱包余额"
          className="rounded-[20px] bg-surface/70 p-5 sm:p-8"
        >
          <div className="grid items-center gap-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-8">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-muted text-primary"
                  aria-hidden
                >
                  <Coins className="size-5" strokeWidth={1.8} />
                </span>
                <h2 className="text-sm font-medium text-foreground-muted">
                  当前余额
                </h2>
              </div>
              <div className="mt-3 flex min-h-16 items-center">
                {wallet.isError ? (
                  <p role="alert" className="text-sm leading-6 text-danger">
                    余额加载失败，请重试。当前余额未知。
                  </p>
                ) : wallet.isPending ? (
                  <p role="status" className="text-sm text-foreground-muted">
                    正在读取余额…
                  </p>
                ) : (
                  <p
                    aria-label={formatCoins(wallet.data.balance)}
                    className="min-w-0 break-all text-5xl font-semibold tracking-tight text-foreground sm:text-[56px] sm:leading-tight"
                  >
                    {formatCoins(wallet.data.balance).replace(" 天生币", "")}
                    <span className="ml-2 inline-block text-sm font-normal tracking-normal text-foreground-muted">
                      {" 天生币"}
                    </span>
                  </p>
                )}
              </div>
              <p className="mt-3 text-xs leading-5 text-foreground-muted">
                学生与教师身份共用
              </p>
              <p
                role="status"
                className="text-xs leading-5 text-foreground-muted"
              >
                {wallet.isFetching && wallet.data && !wallet.isError
                  ? "正在更新余额…"
                  : null}
              </p>
            </div>
            <nav
              aria-label="天生币相关页面"
              className="grid gap-1 border-t border-border/60 pt-3 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0"
            >
              {[
                {
                  href: "/account/invitations",
                  label: "邀请好友",
                  icon: Users
                },
                {
                  href: "/account/wordlist-tips",
                  label: "词表投币记录",
                  icon: BookOpen
                }
              ].map(({ href, label, icon: Icon }) => (
                <Button
                  key={href}
                  asChild
                  variant="ghost"
                  size="compact"
                  className="justify-start"
                >
                  <Link href={href}>
                    <Icon
                      className="size-4 text-foreground-muted"
                      strokeWidth={1.8}
                      aria-hidden
                    />
                    {label}
                    <ChevronRight
                      className="ml-auto size-4 text-foreground-muted"
                      strokeWidth={1.8}
                      aria-hidden
                    />
                  </Link>
                </Button>
              ))}
            </nav>
          </div>
          {!wallet.isError && wallet.data?.status === "deletion_pending" && (
            <div
              role="status"
              className="mt-5 rounded-2xl bg-muted p-4 text-sm leading-6"
            >
              账号正在等待注销，钱包已暂停全部入账和支出。撤销后可恢复原余额。
              <Link
                className="ml-2 rounded-sm text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                href="/account/delete"
              >
                查看注销申请
              </Link>
            </div>
          )}
          {!wallet.isError && wallet.data?.status === "closed" && (
            <p className="mt-4 text-sm text-foreground-muted">钱包已关闭。</p>
          )}
        </section>
        <section
          aria-labelledby="wallet-rewards"
          className="px-5 py-5 sm:px-8 sm:py-6"
        >
          <h2
            id="wallet-rewards"
            className="text-sm font-semibold text-foreground"
          >
            今日奖励
          </h2>
          <div
            className={
              isStudent
                ? "mt-5 grid gap-5 divide-y divide-border/60 sm:grid-cols-2 sm:gap-6 sm:divide-x sm:divide-y-0"
                : "mt-5"
            }
          >
            <LoginRewardSummary
              onAward={() => {
                setPage(1);
                setSnapshot(undefined);
              }}
            />
            {isStudent && (
              <div className="min-w-0 pt-5 sm:pl-6 sm:pt-0">
                <LearningRewardSummary
                  key={id}
                  userId={id}
                  onAward={refresh}
                  embedded
                />
              </div>
            )}
          </div>
        </section>
      </div>
      <section aria-labelledby="wallet-entries" className="mt-9">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2
            id="wallet-entries"
            className="text-xl font-semibold tracking-tight text-foreground"
          >
            收支记录
          </h2>
          <span className="text-xs text-foreground-muted">按时间从新到旧</span>
        </div>
        {entries.isError ? (
          <PageNotice tone="error">
            <p>收支记录加载失败，请重试。</p>
            <Button
              type="button"
              variant="link"
              size="compact"
              onClick={() => void entries.refetch()}
            >
              重新加载
            </Button>
          </PageNotice>
        ) : entries.isPending ? (
          <PageNotice>正在读取收支记录…</PageNotice>
        ) : (
          <>
            {entries.data.items.length === 0 ? (
              <PageNotice>
                <p className="font-medium text-foreground">暂无收支记录</p>
                <p className="mt-1">
                  奖励到账或使用天生币后，会在这里留下记录。
                </p>
              </PageNotice>
            ) : (
              <ul className="divide-y divide-border/60 rounded-3xl border border-border/60 bg-surface/70 px-5 sm:px-8">
                {entries.data.items.map((entry) => {
                  const outgoing = entry.delta.startsWith("-");
                  const Icon = outgoing ? ArrowUpRight : ArrowDownLeft;
                  return (
                    <li
                      key={entry.id}
                      className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 py-5"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className="hidden size-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground-muted sm:flex"
                          aria-hidden
                        >
                          <Icon className="size-4" strokeWidth={1.8} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium leading-6 text-foreground">
                            {SOURCES[entry.source_type] ??
                              (entry.kind === "transfer"
                                ? "天生币转入 / 转出"
                                : "天生币收支")}
                          </p>
                          <time
                            dateTime={entry.created_at}
                            className="mt-1 block text-xs leading-5 text-foreground-muted"
                          >
                            {new Date(entry.created_at).toLocaleString(
                              "zh-CN",
                              {
                                year: "numeric",
                                month: "2-digit",
                                day: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: false
                              }
                            )}
                          </time>
                        </div>
                      </div>
                      <div className="min-w-0 text-right">
                        <p
                          className={`break-all text-sm font-semibold leading-6 tabular-nums ${
                            outgoing ? "text-foreground" : "text-success"
                          }`}
                        >
                          {outgoing ? "" : "+"}
                          {formatCoins(entry.delta)}
                        </p>
                        <p className="mt-1 break-all text-xs leading-5 tabular-nums text-foreground-muted">
                          余额 {formatCoins(entry.balance_after)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {(entries.data.pagination.total_pages > 1 || page > 1) && (
              <nav
                aria-label="收支记录分页"
                className="mt-5 flex items-center justify-center gap-3"
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="compact"
                  disabled={page === 1 || entries.isFetching}
                  onClick={() => setPage(page - 1)}
                >
                  上一页
                </Button>
                <span className="min-w-16 text-center text-sm tabular-nums text-foreground-muted">
                  第 {page} 页
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="compact"
                  disabled={
                    page >= entries.data.pagination.total_pages ||
                    entries.isFetching
                  }
                  onClick={() => {
                    setSnapshot(entries.data.snapshot);
                    setPage(page + 1);
                  }}
                >
                  下一页
                </Button>
              </nav>
            )}
          </>
        )}
      </section>
      <details className="group mt-7 border-t border-border/60 pt-2">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl text-sm text-foreground-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
          天生币用途与购买说明
          <ChevronDown
            className="size-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
            strokeWidth={1.8}
            aria-hidden
          />
        </summary>
        <div className="space-y-4 pb-3 pt-1 text-sm leading-6 text-foreground-muted">
          <p>
            可向他人已公开且全部词条可用的词表投币，数量由你确认，全额进入作者钱包。
          </p>
          <div>
            <h3 className="font-medium text-foreground">联系客服购买</h3>
            {contact ? (
              <p className="mt-1 break-words">{contact}</p>
            ) : (
              <p className="mt-1">客服联系方式暂未配置，请等待平台公告。</p>
            )}
            <p className="mt-2">
              购买由客服人工核验，不支持在线支付或提现。建议在首个消费场景开放后再购买。
            </p>
          </div>
        </div>
      </details>
    </PageShell>
  );
}
