"use client";
import { webCommon, localText, webErrorText } from "@/i18n/catalog";

import { useWebLocale, useWebText } from "@/i18n/client";

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
  teacher_approved: localText(
    webTeacherCertification,
    "webTeacherCertificationNotifications:teacher_certification_approved"
  ),
  teacher_rejected: localText(
    webTeacherCertification,
    "webTeacherCertificationNotifications:teacher_application_rejected"
  ),
  teacher_revoked: localText(
    webTeacherCertification,
    "webTeacherCertificationNotifications:teacher_qualification_revoked"
  ),
  wordlist_liked: localText(
    webTeacherCertification,
    "webTeacherCertificationNotifications:word_list_liked"
  ),
  wordlist_tipped: localText(
    webTeacherCertification,
    "webTeacherCertificationNotifications:word_list_tipped"
  ),
  wordlist_deleted: localText(
    webTeacherCertification,
    "webTeacherCertificationNotifications:a_word_list_you_use_was_deleted"
  )
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
    <section
      aria-label={uiText("webTeacherCertificationNotifications:notifications")}
      className="space-y-6"
    >
      {query.isPending ? (
        <PageNotice>
          {uiText("webTeacherCertificationNotifications:loading_notifications")}
        </PageNotice>
      ) : query.isError ? (
        <PageNotice tone="error">
          <p>
            {uiText(
              webErrorText(
                query.error,
                localText(webCommon, "webCommon:response_unavailable")
              )
            )}
          </p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className={cn(textButtonClass, "mt-3")}
          >
            {uiText("webTeacherCertificationNotifications:retry")}
          </button>
        </PageNotice>
      ) : (
        <>
          <p className="text-sm text-foreground-muted">
            {query.data.unread_count
              ? uiText(
                  "webTeacherCertificationNotifications:v0_unread_notifications",
                  { v0: query.data.unread_count }
                )
              : uiText(
                  "webTeacherCertificationNotifications:no_unread_notifications"
                )}
          </p>
          {query.data.items.length === 0 ? (
            <PageNotice>
              {uiText(
                "webTeacherCertificationNotifications:no_notifications_yet_word_list_interactions_and_certification_results_ap"
              )}
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
                      {item.read_at
                        ? uiText("webTeacherCertificationNotifications:read")
                        : uiText("webTeacherCertificationNotifications:unread")}
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
                        "webTeacherCertificationNotifications:you_now_have_a_teacher_role_switch_workspaces_in_the_account_menu_your_s"
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
                            ? "webTeacherCertificationNotifications:wordlist_liked_body"
                            : item.amount
                              ? "webTeacherCertificationNotifications:wordlist_tipped_body"
                              : "webTeacherCertificationNotifications:wordlist_tipped_without_amount",
                          {
                            actor:
                              item.actor_name ??
                              uiText(
                                "webTeacherCertificationNotifications:deleted_account"
                              ),
                            wordlist:
                              item.wordlist_name ??
                              uiText(
                                "webTeacherCertificationNotifications:deleted"
                              ),
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
                        {uiText(
                          "webTeacherCertificationNotifications:view_word_list"
                        )}
                      </Link>
                    )}
                    {item.kind === "wordlist_tipped" && (
                      <Link
                        href="/account/wordlist-tips"
                        className={buttonClass}
                      >
                        {uiText(
                          "webTeacherCertificationNotifications:view_received_tips"
                        )}
                      </Link>
                    )}
                    {item.kind === "wordlist_deleted" && (
                      <Link href="/student/practice" className={buttonClass}>
                        {uiText(
                          "webTeacherCertificationNotifications:view_learning_task"
                        )}
                      </Link>
                    )}
                    {item.application_id && (
                      <Link
                        href={`/account/teacher-applications/${encodeURIComponent(item.application_id)}`}
                        className={buttonClass}
                      >
                        {uiText(
                          "webTeacherCertificationNotifications:view_application"
                        )}
                      </Link>
                    )}
                    {!item.read_at && (
                      <button
                        type="button"
                        disabled={read.isPending}
                        onClick={() => read.mutate(item.id)}
                        className={buttonClass}
                      >
                        {uiText(
                          "webTeacherCertificationNotifications:mark_as_read"
                        )}
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
          {uiText(
            webErrorText(
              read.error,
              localText(webCommon, "webCommon:response_unavailable")
            )
          )}
        </p>
      )}
    </section>
  );
}
