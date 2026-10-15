"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { formatCoins } from "@tsz/shared";
import { useState } from "react";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { cn } from "@tsz/ui/lib/cn";
import {
  PageNotice,
  Pager,
  buttonClass,
  panelClass,
  textButtonClass
} from "@/features/shell/Page";

const titles = {
  teacher_approved: "教师认证已通过",
  teacher_rejected: "教师申请已驳回",
  teacher_revoked: "教师资格已撤销",
  wordlist_liked: "词表收到点赞",
  wordlist_tipped: "词表收到投币"
};

export function Notifications() {
  const userId = useUserStore((state) => state.user?.id);
  const [page, setPage] = useState(1);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["notifications", userId, page],
    queryFn: () => api.teacherCertification.notifications(page),
    enabled: !!userId
  });
  const read = useMutation({
    mutationFn: (id: string) => api.teacherCertification.readNotification(id),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["notifications", userId] })
  });
  return (
    <section aria-label="站内通知" className="space-y-6">
      {query.isPending ? (
        <PageNotice>正在读取通知…</PageNotice>
      ) : query.isError ? (
        <PageNotice tone="error">
          <p>{query.error.message}</p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className={cn(textButtonClass, "mt-3")}
          >
            重试
          </button>
        </PageNotice>
      ) : (
        <>
          <p className="text-sm text-foreground-muted">
            {query.data.unread_count
              ? `${query.data.unread_count} 条未读通知`
              : "暂无未读通知"}
          </p>
          {query.data.items.length === 0 ? (
            <PageNotice>
              暂无站内通知，词表互动和认证结果会显示在这里。
            </PageNotice>
          ) : (
            <ul className="space-y-3">
              {query.data.items.map((item) => (
                <li key={item.id} className={panelClass}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
                      {!item.read_at && (
                        <span
                          aria-hidden
                          className="size-2 rounded-full bg-primary"
                        />
                      )}
                      {titles[item.kind]}
                    </h2>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs",
                        item.read_at
                          ? "bg-muted text-foreground-muted"
                          : "bg-primary-muted text-primary"
                      )}
                    >
                      {item.read_at ? "已读" : "未读"}
                    </span>
                  </div>
                  <time
                    dateTime={item.created_at}
                    className="mt-1 block text-xs text-foreground-muted"
                  >
                    {new Date(item.created_at).toLocaleString()}
                  </time>
                  {item.kind === "teacher_approved" && (
                    <p className="mt-3 text-sm leading-6">
                      你已获得教师身份，可在账号菜单中切换工作台，原有学生身份保持不变。
                    </p>
                  )}
                  {(item.kind === "wordlist_liked" ||
                    item.kind === "wordlist_tipped") && (
                    <p className="mt-3 text-sm leading-6">
                      {item.actor_name ?? "账号已注销"}
                      {item.kind === "wordlist_liked"
                        ? "赞了你的词表"
                        : "向你的词表"}
                      {item.wordlist_name
                        ? `「${item.wordlist_name}」`
                        : "（已删除）"}
                      {item.kind === "wordlist_tipped" && item.amount
                        ? `投了 ${formatCoins(item.amount)}`
                        : ""}
                      。
                    </p>
                  )}
                  {item.reason && (
                    <p className="mt-3 whitespace-pre-wrap break-words rounded-2xl bg-muted/70 px-4 py-3 text-sm leading-6">
                      {item.reason}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2 empty:hidden">
                    {item.wordlist_id && item.wordlist_name && (
                      <Link
                        href={`/account/wordlists/${encodeURIComponent(item.wordlist_id)}`}
                        className={buttonClass}
                      >
                        查看词表
                      </Link>
                    )}
                    {item.kind === "wordlist_tipped" && (
                      <Link
                        href="/account/wordlist-tips"
                        className={buttonClass}
                      >
                        查看收币记录
                      </Link>
                    )}
                    {item.application_id && (
                      <Link
                        href={`/account/teacher-applications/${encodeURIComponent(item.application_id)}`}
                        className={buttonClass}
                      >
                        查看对应申请
                      </Link>
                    )}
                    {!item.read_at && (
                      <button
                        type="button"
                        disabled={read.isPending}
                        onClick={() => read.mutate(item.id)}
                        className={buttonClass}
                      >
                        标为已读
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Pager
            page={page}
            total={Math.ceil(query.data.total / 20)}
            onChange={setPage}
          />
        </>
      )}
      {read.error && (
        <p role="alert" className="text-sm text-danger">
          {read.error.message}
        </p>
      )}
    </section>
  );
}
