"use client";
import { webErrorText } from "@/i18n/catalog";
import { useWebLocale } from "@/i18n/client";
import { useWebText } from "@/i18n/client";
import { webTeacherCertificationNotifications as webTeacherCertification } from "@/i18n/messages/teacher-certification/notifications";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { formatCoins } from "@tsz/shared";
import { useState } from "react";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { notificationQuery } from "./notification-query";
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
  wordlist_tipped: "词表收到投币",
  wordlist_deleted: "使用中的词表已删除"
};

export function Notifications() {
  const locale = useWebLocale();
  const uiText = useWebText(webTeacherCertification);
  const userId = useUserStore((state) => state.user?.id);
  const [page, setPage] = useState(1);
  const client = useQueryClient();
  const query = useQuery(notificationQuery(userId, page, locale));
  const read = useMutation({
    mutationFn: (id: string) => api.teacherCertification.readNotification(id),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["notifications", userId] })
  });
  return (
    <section aria-label={uiText("站内通知")} className="space-y-6">
      {query.isPending ? (
        <PageNotice>{uiText("正在读取通知…")}</PageNotice>
      ) : query.isError ? (
        <PageNotice tone="error">
          <p>
            {uiText(webErrorText(query.error, "数据暂不可用，请刷新后重试"))}
          </p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className={cn(textButtonClass, "mt-3")}
          >
            {uiText("重试")}
          </button>
        </PageNotice>
      ) : (
        <>
          <p className="text-sm text-foreground-muted">
            {query.data.unread_count
              ? uiText("{{v0}} 条未读通知", { v0: query.data.unread_count })
              : uiText("暂无未读通知")}
          </p>
          {query.data.items.length === 0 ? (
            <PageNotice>
              {uiText("暂无站内通知，词表互动和认证结果会显示在这里。")}
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
                      {item.localized?.locale === locale
                        ? item.localized.title
                        : uiText(titles[item.kind])}
                    </h2>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs",
                        item.read_at
                          ? "bg-muted text-foreground-muted"
                          : "bg-primary-muted text-primary"
                      )}
                    >
                      {item.read_at ? uiText("已读") : uiText("未读")}
                    </span>
                  </div>
                  <time
                    dateTime={item.created_at}
                    className="mt-1 block text-xs text-foreground-muted"
                  >
                    {new Date(item.created_at).toLocaleString(locale, {
                      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
                    })}
                  </time>
                  {item.localized?.locale === locale && item.localized.body ? (
                    <p className="mt-3 text-sm leading-6">
                      {item.localized.body}
                    </p>
                  ) : item.kind === "teacher_approved" ? (
                    <p className="mt-3 text-sm leading-6">
                      {uiText(
                        "你已获得教师身份，可在账号菜单中切换工作台，原有学生身份保持不变。"
                      )}
                    </p>
                  ) : null}
                  {(item.localized?.locale !== locale ||
                    !item.localized.body) &&
                    (item.kind === "wordlist_liked" ||
                      item.kind === "wordlist_tipped") && (
                      <p className="mt-3 text-sm leading-6">
                        {uiText(
                          item.kind === "wordlist_liked"
                            ? "{{actor}}赞了你的词表「{{wordlist}}」。"
                            : item.amount
                              ? "{{actor}}向你的词表「{{wordlist}}」投了 {{amount}}。"
                              : "{{actor}}向你的词表「{{wordlist}}」投币。",
                          {
                            actor: item.actor_name ?? uiText("账号已注销"),
                            wordlist:
                              item.wordlist_name ?? uiText("（已删除）"),
                            amount: item.amount ? formatCoins(item.amount) : ""
                          }
                        )}
                      </p>
                    )}
                  {item.reason &&
                    !(
                      item.kind === "wordlist_deleted" &&
                      item.localized?.locale === locale &&
                      item.localized.body
                    ) && (
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
                        {uiText("查看词表")}
                      </Link>
                    )}
                    {item.kind === "wordlist_tipped" && (
                      <Link
                        href="/account/wordlist-tips"
                        className={buttonClass}
                      >
                        {uiText("查看收币记录")}
                      </Link>
                    )}
                    {item.kind === "wordlist_deleted" && (
                      <Link href="/student/practice" className={buttonClass}>
                        {uiText("查看学习任务")}
                      </Link>
                    )}
                    {item.application_id && (
                      <Link
                        href={`/account/teacher-applications/${encodeURIComponent(item.application_id)}`}
                        className={buttonClass}
                      >
                        {uiText("查看对应申请")}
                      </Link>
                    )}
                    {!item.read_at && (
                      <button
                        type="button"
                        disabled={read.isPending}
                        onClick={() => read.mutate(item.id)}
                        className={buttonClass}
                      >
                        {uiText("标为已读")}
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
          {uiText(webErrorText(read.error, "数据暂不可用，请刷新后重试"))}
        </p>
      )}
    </section>
  );
}
