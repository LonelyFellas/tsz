"use client";
import { useWebLocale } from "@/i18n/client";
import { useWebText } from "@/i18n/client";
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
  const [copyStatus, setCopyStatus] = useState("");
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
      setCopyStatus("邀请链接已复制");
    } catch {
      setCopyStatus("复制失败，请复制邀请码并让好友在注册时填写。");
    }
  }
  return (
    <PageShell>
      <PageHeader
        back={{ href: "/account", label: uiText("返回个人中心") }}
        eyebrow={uiText("个人中心")}
        title={uiText("邀请好友")}
        actions={
          <button type="button" className={buttonClass} onClick={refresh}>
            <RefreshCw className="size-4" strokeWidth={1.8} aria-hidden />
            {uiText("刷新")}
          </button>
        }
      />
      <section
        aria-label={uiText("我的邀请")}
        className="glass rounded-3xl p-2"
      >
        <div className="rounded-[20px] bg-surface/70 p-6 sm:p-8">
          {overview.isError ? (
            <p role="alert" className="text-sm text-danger">
              {uiText("邀请信息加载失败或功能暂不可用，请刷新重试。")}
            </p>
          ) : overview.isPending || overview.isFetching ? (
            <p className="text-sm text-foreground-muted">
              {uiText("正在读取邀请信息…")}
            </p>
          ) : (
            <>
              {overview.data.invite_code ? (
                <>
                  <p className="text-xs font-medium tracking-[0.2em] text-foreground-muted">
                    {uiText("我的邀请码")}
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
                    {uiText("复制邀请链接")}
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
                    ? uiText("正在生成…")
                    : uiText("生成我的邀请码")}
                </button>
              )}
              {generate.isError && (
                <p role="alert" className="mt-3 text-sm text-danger">
                  {uiText(
                    "邀请码生成结果未确认，请重试；重复操作会返回同一个邀请码。"
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
                    "邀请奖励暂未开启。好友仍可使用邀请码注册，邀请关系会被记录，本次不发奖，之后不会自动补发。"
                  )
                ) : (
                  <>
                    {uiText(
                      "好友通过你的邀请码注册，绑定手机号并首次学习达标后，你可获得 {{v0}}。每位受邀者仅奖励一次；受邀者没有额外邀请奖励，仍可正常获得每日登录与学习奖励。",
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
                    "你的账户当前不可接收奖励。注册或达标结算时账户不可收奖，会记录为未发放，之后不会自动补发。"
                  )}
                </p>
              )}
            </>
          )}
          <p className="mt-4 text-xs leading-5 text-foreground-muted">
            {uiText(
              "学习达标指完成每日任务，累计达到当日学习奖励门槛（当前为 10 道不同题目）。好友可在注册前修改或清空邀请码；注册成功后不能补绑或改绑。已有账号登录不会产生邀请奖励。"
            )}
          </p>
        </div>
      </section>
      <section className="mt-10">
        <h2 className="mb-4 text-xl font-semibold tracking-tight">
          {uiText("邀请记录")}
        </h2>
        {records.isError ? (
          <PageNotice tone="error">
            {uiText("邀请记录加载失败，请刷新重试。")}
          </PageNotice>
        ) : records.isPending ? (
          <PageNotice>{uiText("正在读取邀请记录…")}</PageNotice>
        ) : (
          <>
            {records.data.items.length === 0 ? (
              <PageNotice>{uiText("暂无邀请记录")}</PageNotice>
            ) : (
              <ul className="glass divide-y divide-border/60 rounded-3xl px-6">
                {records.data.items.map((record) => (
                  <li
                    key={record.invitee_user_id}
                    className="flex flex-wrap justify-between gap-3 py-5"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {record.invitee_name ?? uiText("已注销用户")}
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
                        ? uiText("已发放 {{v0}}", {
                            v0: formatCoins(record.reward_amount)
                          })
                        : record.reward_status === "pending_qualification"
                          ? uiText("待达标：好友需绑定手机号并首次学习达标")
                          : record.reward_status === "reward_disabled"
                            ? uiText("未发放：奖励未开启")
                            : uiText("未发放：邀请人账户不可收奖")}
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
          {uiText("查看天生币余额与流水 →")}
        </Link>
      </section>
    </PageShell>
  );
}
