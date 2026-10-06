"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCoins } from "@tsz/shared";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";

const BUTTON =
  "rounded-full border border-border px-4 py-2 text-sm disabled:opacity-40";
export function Invitations() {
  const id = useUserStore((s) => s.user?.id);
  return id ? <InvitationContent key={id} id={id} /> : null;
}
function InvitationContent({ id }: { id: string }) {
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
    <div className="animate-in mx-auto max-w-3xl px-6 py-10 sm:py-14">
      <Link href="/account" className="text-sm text-foreground-muted">
        ← 返回个人中心
      </Link>
      <div className="mt-7 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">邀请好友</h1>
        <button className={BUTTON} onClick={refresh}>
          刷新
        </button>
      </div>
      <section
        aria-label="我的邀请"
        className="mt-6 rounded-3xl border border-border bg-surface p-6 sm:p-8"
      >
        {overview.isError ? (
          <p role="alert">邀请信息加载失败或功能暂不可用，请刷新重试。</p>
        ) : overview.isPending || overview.isFetching ? (
          <p>正在读取邀请信息…</p>
        ) : (
          <>
            {overview.data.invite_code ? (
              <>
                <p className="text-sm text-foreground-muted">我的邀请码</p>
                <p
                  className="mt-3 break-all font-mono text-2xl font-semibold"
                  data-testid="invite-code"
                >
                  {overview.data.invite_code}
                </p>
                <button className={`${BUTTON} mt-4`} onClick={copyLink}>
                  复制邀请链接
                </button>
              </>
            ) : (
              <button
                className={BUTTON}
                disabled={generate.isPending}
                onClick={() => generate.mutate()}
              >
                {generate.isPending ? "正在生成…" : "生成我的邀请码"}
              </button>
            )}
            {generate.isError && (
              <p role="alert" className="mt-3">
                邀请码生成结果未确认，请重试；重复操作会返回同一个邀请码。
              </p>
            )}
            {copyStatus && (
              <p role="status" className="mt-3 text-sm">
                {copyStatus}
              </p>
            )}
            <p className="mt-6 leading-7">
              {overview.data.reward_amount === null ? (
                "邀请奖励暂未开启。好友仍可使用邀请码注册，邀请关系会被记录，本次不发奖，之后不会自动补发。"
              ) : (
                <>
                  当前每位新用户通过你的邀请码成功注册，可获{" "}
                  {formatCoins(overview.data.reward_amount)}
                  ，以注册时规则和账户状态为准。
                </>
              )}
            </p>
            {!overview.data.can_receive_reward && (
              <p
                role="status"
                className="mt-4 rounded-2xl bg-muted p-4 text-sm"
              >
                你的账户当前不可接收奖励。好友仍可注册并保留邀请关系，本次不发奖，之后不会自动补发。
              </p>
            )}
          </>
        )}
        <p className="mt-4 text-sm leading-7 text-foreground-muted">
          好友可在注册前修改或清空邀请码；注册成功后不能补绑或改绑。已有账号登录不会产生邀请奖励。
        </p>
      </section>
      <section className="mt-8">
        <h2 className="text-xl font-semibold">邀请记录</h2>
        {records.isError ? (
          <p role="alert" className="mt-4">
            邀请记录加载失败，请刷新重试。
          </p>
        ) : records.isPending ? (
          <p className="mt-4">正在读取邀请记录…</p>
        ) : (
          <>
            {records.data.items.length === 0 ? (
              <p className="mt-4 text-foreground-muted">暂无邀请记录</p>
            ) : (
              <ul className="mt-4 divide-y divide-border rounded-3xl border border-border px-5">
                {records.data.items.map((record) => (
                  <li
                    key={record.invitee_user_id}
                    className="flex flex-wrap justify-between gap-3 py-5"
                  >
                    <div>
                      <p>{record.invitee_name ?? "已注销用户"}</p>
                      <p className="mt-1 text-xs text-foreground-muted">
                        {new Date(record.created_at).toLocaleString("zh-CN")}
                      </p>
                    </div>
                    <p className="break-all text-sm">
                      {record.reward_status === "awarded"
                        ? `已发放 ${formatCoins(record.reward_amount)}`
                        : record.reward_status === "reward_disabled"
                          ? "未发放：注册时奖励未开启"
                          : "未发放：注册时邀请人账户不可收奖"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                className={BUTTON}
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                上一页
              </button>
              <span className="text-sm">第 {page} 页</span>
              <button
                className={BUTTON}
                disabled={page >= records.data.pagination.total_pages}
                onClick={() => setPage(page + 1)}
              >
                下一页
              </button>
            </div>
          </>
        )}
        <Link
          href="/account/coins"
          className="mt-5 inline-block text-sm text-primary"
        >
          查看天生币余额与流水 →
        </Link>
      </section>
    </div>
  );
}
