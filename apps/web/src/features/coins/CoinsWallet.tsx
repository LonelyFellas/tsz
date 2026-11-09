"use client";
import { type WebNotice, localText } from "@/i18n/catalog";

import { useWebLocale, useWebText } from "@/i18n/client";

import { webCoinsWallet as webCoins } from "@/i18n/messages/coins/wallet";

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

const SOURCES: Record<string, WebNotice> = {
  wordlist_tip: localText(webCoins, "webCoinsWallet:word_list_tip"),
  wordlist_custom_audio: localText(
    webCoins,
    "webCoinsWallet:custom_entry_audio"
  ),
  wordlist_custom_audio_refund: localText(
    webCoins,
    "webCoinsWallet:custom_entry_audio_refund"
  ),
  invitation_reward: localText(webCoins, "webCoinsWallet:invitation_reward"),
  learning_reward: localText(webCoins, "webCoinsWallet:daily_learning_reward"),
  daily_login_reward: localText(
    webCoins,
    "webCoinsWallet:daily_sign_in_reward"
  ),
  manual_purchase: localText(webCoins, "webCoinsWallet:purchase_credit"),
  manual_reward: localText(webCoins, "webCoinsWallet:manual_reward"),
  manual_reversal: localText(webCoins, "webCoinsWallet:reverse_manual_credits"),
  account_closure: localText(
    webCoins,
    "webCoinsWallet:balance_forfeited_on_account_closure"
  )
};
export function CoinsWallet() {
  const id = useUserStore((s) => s.user?.id);
  return id ? <Wallet key={id} id={id} /> : null;
}
function Wallet({ id }: { id: string }) {
  const locale = useWebLocale();
  const uiText = useWebText(webCoins);
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
        back={{
          href: "/account",
          label: uiText("webCoinsWallet:back_to_account")
        }}
        title={uiText("webCoinsWallet:my_coins")}
        actions={
          <Button
            type="button"
            variant="ghost"
            size="compact"
            onClick={refresh}
          >
            <RefreshCw className="size-4" strokeWidth={1.8} aria-hidden />
            {uiText("webCoinsWallet:refresh")}
          </Button>
        }
      />
      <div className="glass rounded-3xl p-2">
        <section
          aria-label={uiText("webCoinsWallet:wallet_balance")}
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
                  {uiText("webCoinsWallet:current_balance")}
                </h2>
              </div>
              <div className="mt-3 flex min-h-16 items-center">
                {wallet.isError ? (
                  <p role="alert" className="text-sm leading-6 text-danger">
                    {uiText(
                      "webCoinsWallet:could_not_load_your_balance_try_again_the_current_balance_is_unknown"
                    )}
                  </p>
                ) : wallet.isPending ? (
                  <p role="status" className="text-sm text-foreground-muted">
                    {uiText("webCoinsWallet:loading_balance")}
                  </p>
                ) : (
                  <p
                    aria-label={formatCoins(wallet.data.balance)}
                    className="min-w-0 break-all text-5xl font-semibold tracking-tight text-foreground sm:text-[56px] sm:leading-tight"
                  >
                    {formatCoins(wallet.data.balance).replace(" 天生币", "")}
                    <span className="ml-2 inline-block text-sm font-normal tracking-normal text-foreground-muted">
                      {uiText("webCoinsWallet:coins")}
                    </span>
                  </p>
                )}
              </div>
              <p className="mt-3 text-xs leading-5 text-foreground-muted">
                {uiText(
                  "webCoinsWallet:shared_by_your_student_and_teacher_roles"
                )}
              </p>
              <p
                role="status"
                className="text-xs leading-5 text-foreground-muted"
              >
                {wallet.isFetching && wallet.data && !wallet.isError
                  ? uiText("webCoinsWallet:updating_balance")
                  : null}
              </p>
            </div>
            <nav
              aria-label={uiText("webCoinsWallet:pages")}
              className="grid gap-1 border-t border-border/60 pt-3 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0"
            >
              {[
                {
                  href: "/account/invitations",
                  label: localText(webCoins, "webCoinsWallet:invite_friends"),
                  icon: Users
                },
                {
                  href: "/account/wordlist-tips",
                  label: localText(webCoins, "webCoinsWallet:word_list_tips"),
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
                    {uiText(label)}
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
              {uiText(
                "webCoinsWallet:your_account_is_awaiting_deletion_all_wallet_credits_and_spending_are_pa"
              )}
              <Link
                className="ml-2 rounded-sm text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                href="/account/delete"
              >
                {uiText("webCoinsWallet:view_deletion_request")}
              </Link>
            </div>
          )}
          {!wallet.isError && wallet.data?.status === "closed" && (
            <p className="mt-4 text-sm text-foreground-muted">
              {uiText("webCoinsWallet:your_wallet_is_closed")}
            </p>
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
            {uiText("webCoinsWallet:daily_rewards")}
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
            {uiText("webCoinsWallet:account_history")}
          </h2>
          <span className="text-xs text-foreground-muted">
            {uiText("webCoinsWallet:newest_first")}
          </span>
        </div>
        {entries.isError ? (
          <PageNotice tone="error">
            <p>
              {uiText("webCoinsWallet:could_not_load_transactions_try_again")}
            </p>
            <Button
              type="button"
              variant="link"
              size="compact"
              onClick={() => void entries.refetch()}
            >
              {uiText("webCoinsWallet:reload")}
            </Button>
          </PageNotice>
        ) : entries.isPending ? (
          <PageNotice>
            {uiText("webCoinsWallet:loading_transactions")}
          </PageNotice>
        ) : (
          <>
            {entries.data.items.length === 0 ? (
              <PageNotice>
                <p className="font-medium text-foreground">
                  {uiText("webCoinsWallet:no_transactions_yet")}
                </p>
                <p className="mt-1">
                  {uiText(
                    "webCoinsWallet:rewards_and_spending_will_appear_here"
                  )}
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
                            {uiText(SOURCES[entry.source_type]) ||
                              (entry.kind === "transfer"
                                ? uiText("webCoinsWallet:credit_debit")
                                : uiText("webCoinsWallet:coin_entry"))}
                          </p>
                          <time
                            dateTime={entry.created_at}
                            className="mt-1 block text-xs leading-5 text-foreground-muted"
                          >
                            {new Date(entry.created_at).toLocaleString(locale, {
                              year: "numeric",
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: false
                            })}
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
                          {uiText("webCoinsWallet:balance_v0", {
                            v0: formatCoins(entry.balance_after)
                          })}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {(entries.data.pagination.total_pages > 1 || page > 1) && (
              <nav
                aria-label={uiText("webCoinsWallet:transaction_pages")}
                className="mt-5 flex items-center justify-center gap-3"
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-11 sm:min-h-10"
                  disabled={page === 1 || entries.isFetching}
                  onClick={() => setPage(page - 1)}
                >
                  {uiText("webCoinsWallet:previous_page")}
                </Button>
                <span className="min-w-16 text-center text-sm tabular-nums text-foreground-muted">
                  {uiText("webCoinsWallet:page_v0", { v0: page })}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-11 sm:min-h-10"
                  disabled={
                    page >= entries.data.pagination.total_pages ||
                    entries.isFetching
                  }
                  onClick={() => {
                    setSnapshot(entries.data.snapshot);
                    setPage(page + 1);
                  }}
                >
                  {uiText("webCoinsWallet:next_page")}
                </Button>
              </nav>
            )}
          </>
        )}
      </section>
      <details className="group mt-7 border-t border-border/60 pt-2">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl text-sm text-foreground-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
          {uiText("webCoinsWallet:use_and_purchase_information")}
          <ChevronDown
            className="size-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
            strokeWidth={1.8}
            aria-hidden
          />
        </summary>
        <div className="space-y-4 pb-3 pt-1 text-sm leading-6 text-foreground-muted">
          <p>
            {uiText(
              "webCoinsWallet:tip_another_author_s_published_word_list_when_all_its_entries_are_availa"
            )}
          </p>
          <div>
            <h3 className="font-medium text-foreground">
              {uiText("webCoinsWallet:contact_support_to_purchase")}
            </h3>
            {contact ? (
              <p className="mt-1 break-words">{contact}</p>
            ) : (
              <p className="mt-1">
                {uiText(
                  "webCoinsWallet:support_contact_details_are_not_configured_check_platform_announcements"
                )}
              </p>
            )}
            <p className="mt-2">
              {uiText(
                "webCoinsWallet:purchases_are_verified_manually_by_support_online_payments_and_withdrawa"
              )}
            </p>
          </div>
        </div>
      </details>
    </PageShell>
  );
}
