"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";

const titles = {
  teacher_approved: "教师认证已通过",
  teacher_rejected: "教师申请已驳回",
  teacher_revoked: "教师资格已撤销"
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
        <p>正在读取通知…</p>
      ) : query.isError ? (
        <div role="alert">
          <p>{query.error.message}</p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="mt-3 text-primary"
          >
            重试
          </button>
        </div>
      ) : (
        <>
          <p className="text-sm text-foreground-muted">
            {query.data.unread_count
              ? `${query.data.unread_count} 条未读通知`
              : "暂无未读通知"}
          </p>
          {query.data.items.length === 0 ? (
            <p className="py-10 text-center text-foreground-muted">
              暂无站内通知，认证结果会显示在这里。
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {query.data.items.map((item) => (
                <li key={item.id} className="py-6 first:pt-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-semibold">{titles[item.kind]}</h2>
                    <span className="text-sm text-foreground-muted">
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
                    <p className="mt-3">
                      你已获得教师身份，可在账号菜单中切换工作台，原有学生身份保持不变。
                    </p>
                  )}
                  {item.reason && (
                    <p className="mt-3 whitespace-pre-wrap break-words">
                      {item.reason}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-5 text-sm">
                    {item.application_id && (
                      <Link
                        href={`/account/teacher-applications/${encodeURIComponent(item.application_id)}`}
                        className="text-primary"
                      >
                        查看对应申请
                      </Link>
                    )}
                    {!item.read_at && (
                      <button
                        type="button"
                        disabled={read.isPending}
                        onClick={() => read.mutate(item.id)}
                        className="text-primary disabled:opacity-50"
                      >
                        标为已读
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {query.data.total > 20 && (
            <nav
              aria-label="通知分页"
              className="flex items-center justify-between"
            >
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage((value) => value - 1)}
                className="disabled:opacity-40"
              >
                上一页
              </button>
              <span>第 {page} 页</span>
              <button
                type="button"
                disabled={page * 20 >= query.data.total}
                onClick={() => setPage((value) => value + 1)}
                className="disabled:opacity-40"
              >
                下一页
              </button>
            </nav>
          )}
        </>
      )}
      {read.error && (
        <p role="alert" className="text-red-600">
          {read.error.message}
        </p>
      )}
    </section>
  );
}
