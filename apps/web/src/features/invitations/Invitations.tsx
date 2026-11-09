"use client";
import { localText } from "@/i18n/catalog";
import { useWebLocale, useWebText } from "@/i18n/client";

import { webInvitations } from "@/i18n/messages/invitations";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCoins } from "@tsz/shared";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { cn } from "@tsz/ui/lib/cn";
import { Copy, RefreshCw } from "lucide-react";
import {
  PageHeader,
  PageNotice,
  PageShell,
  Pager,
  buttonClass,
  primaryButtonClass
} from "@/features/shell/Page";

export function Invitations() {
  const id = useUserStore((s) => s.user?.id);
  return id ? <InvitationContent key={id} id={id} /> : null;
}
function InvitationContent({ id }: { id: string }) {
  const locale = useWebLocale();
  const uiText = useWebText(webInvitations);
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [copyStatus, setCopyStatus] =
    useState<import("@/i18n/catalog").WebNotice>("");
  const queryKey = ["invitations", "user", id];
  const overview = useQuery({
    queryKey: [...queryKey, "overview"],
    refetchOnMount: "always",
    queryFn: ({ signal }) => api.invitations.overview({ signal })
  });
  const records = useQuery({
    queryKey: [...queryKey, "records", page],
    refetchOnMount: "always",
    queryFn: ({ signal }) =>
      api.invitations.records({ page, page_size: 20 }, { signal })
  });
  const generate = useMutation({
    mutationFn: () => api.invitations.createCode(),
    onSuccess: () => client.invalidateQueries({ queryKey })
  });
  function refresh() {
    setPage(1);
    setCopyStatus("");
    void client.invalidateQueries({ queryKey });
  }
  async function copyLink() {
    if (!overview.data?.invite_code) return;
    try {
      const url = new URL("/register", window.location.origin);
      url.searchParams.set("invite", overview.data.invite_code);
      await navigator.clipboard.writeText(url.toString());
      setCopyStatus(
        localText(webInvitations, "webInvitations:invitation_link_copied")
      );
    } catch {
      setCopyStatus(
        localText(
          webInvitations,
          "webInvitations:could_not_copy_copy_your_invitation_code_and_ask_your_friend_to_enter_it"
        )
      );
    }
  }
  return (
    <PageShell>
      <PageHeader
        back={{
          href: "/account",
          label: uiText("webInvitations:back_to_account")
        }}
        eyebrow={uiText("webInvitations:account")}
        title={uiText("webInvitations:invite_friends")}
        actions={
          <button type="button" className={buttonClass} onClick={refresh}>
            <RefreshCw className="size-4" strokeWidth={1.8} aria-hidden />
            {uiText("webInvitations:refresh")}
          </button>
        }
      />
      <section
        aria-label={uiText("webInvitations:my_invitations")}
        className="glass rounded-3xl p-2"
      >
        <div className="rounded-[20px] bg-surface/70 p-6 sm:p-8">
          {overview.isError ? (
            <p role="alert" className="text-sm text-danger">
              {uiText(
                "webInvitations:could_not_load_invitations_or_the_feature_is_unavailable_reload_and_try"
              )}
            </p>
          ) : overview.isPending || overview.isFetching ? (
            <p className="text-sm text-foreground-muted">
              {uiText("webInvitations:loading_invitations")}
            </p>
          ) : (
            <>
              {overview.data.invite_code ? (
                <>
                  <p className="text-xs font-medium tracking-[0.2em] text-foreground-muted">
                    {uiText("webInvitations:my_invitation_code")}
                  </p>
                  <p
                    className="mt-3 break-all font-mono text-4xl font-bold tracking-wider text-foreground"
                    data-testid="invite-code"
                  >
                    {overview.data.invite_code}
                  </p>
                  <button
                    type="button"
                    className={cn(primaryButtonClass, "mt-6")}
                    onClick={copyLink}
                  >
                    <Copy className="size-4" strokeWidth={1.8} aria-hidden />
                    {uiText("webInvitations:copy_invitation_link")}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={primaryButtonClass}
                  disabled={generate.isPending}
                  onClick={() => generate.mutate()}
                >
                  {generate.isPending
                    ? uiText("webInvitations:generating")
                    : uiText("webInvitations:generate_my_invitation_code")}
                </button>
              )}
              {generate.isError && (
                <p role="alert" className="mt-3 text-sm text-danger">
                  {uiText(
                    "webInvitations:the_result_is_unconfirmed_try_again_repeated_requests_return_the_same_in"
                  )}
                </p>
              )}
              {copyStatus && (
                <p role="status" className="mt-3 text-sm">
                  {uiText(copyStatus)}
                </p>
              )}
              <p className="mt-6 border-t border-border/60 pt-6 text-sm leading-6">
                {overview.data.reward_amount === null ? (
                  uiText(
                    "webInvitations:invitation_rewards_are_disabled_friends_can_still_register_with_your_cod"
                  )
                ) : (
                  <>
                    {uiText(
                      "webInvitations:when_a_friend_registers_with_your_code_binds_a_phone_number_and_first_me_2",
                      { v0: formatCoins(overview.data.reward_amount) }
                    )}
                  </>
                )}
              </p>
              {!overview.data.can_receive_reward && (
                <p
                  role="status"
                  className="mt-4 rounded-2xl bg-muted/70 p-4 text-sm leading-6"
                >
                  {uiText(
                    "webInvitations:your_account_cannot_currently_receive_rewards_if_it_cannot_receive_rewar"
                  )}
                </p>
              )}
            </>
          )}
          <p className="mt-4 text-xs leading-5 text-foreground-muted">
            {uiText(
              "webInvitations:to_qualify_complete_daily_tasks_and_reach_the_daily_learning_reward_thre"
            )}
          </p>
        </div>
      </section>
      <section className="mt-10">
        <h2 className="mb-4 text-xl font-semibold tracking-tight">
          {uiText("webInvitations:invitation_history")}
        </h2>
        {records.isError ? (
          <PageNotice tone="error">
            {uiText(
              "webInvitations:could_not_load_invitation_history_reload_and_try_again"
            )}
          </PageNotice>
        ) : records.isPending ? (
          <PageNotice>
            {uiText("webInvitations:loading_invitation_history")}
          </PageNotice>
        ) : (
          <>
            {records.data.items.length === 0 ? (
              <PageNotice>
                {uiText("webInvitations:no_invitations_yet")}
              </PageNotice>
            ) : (
              <ul className="glass divide-y divide-border/60 rounded-3xl px-6">
                {records.data.items.map((record) => (
                  <li
                    key={record.invitee_user_id}
                    className="flex flex-wrap justify-between gap-3 py-5"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {record.invitee_name ??
                          uiText("webInvitations:deleted_user")}
                      </p>
                      <p className="mt-1 text-xs text-foreground-muted">
                        {new Date(record.created_at).toLocaleString(locale, {
                          timeZone:
                            Intl.DateTimeFormat().resolvedOptions().timeZone
                        })}
                      </p>
                    </div>
                    <p
                      className={cn(
                        "break-all text-sm",
                        record.reward_status === "awarded"
                          ? "font-medium text-success"
                          : "text-foreground-muted"
                      )}
                    >
                      {record.reward_status === "awarded"
                        ? uiText("webInvitations:issued_v0", {
                            v0: formatCoins(record.reward_amount)
                          })
                        : record.reward_status === "pending_qualification"
                          ? uiText(
                              "webInvitations:pending_your_friend_must_bind_a_phone_number_and_first_meet_the_learning"
                            )
                          : record.reward_status === "reward_disabled"
                            ? uiText(
                                "webInvitations:unpaid_rewards_are_disabled"
                              )
                            : uiText(
                                "webInvitations:unpaid_the_inviter_cannot_receive_rewards"
                              )}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <Pager
              page={page}
              total={records.data.pagination.total_pages}
              onChange={setPage}
            />
          </>
        )}
        <Link
          href="/account/coins"
          className="mt-6 inline-block text-sm text-primary underline-offset-4 hover:underline"
        >
          {uiText("webInvitations:view_balance_and_transactions")}
        </Link>
      </section>
    </PageShell>
  );
}
