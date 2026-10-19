"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { PrivateImage } from "./PrivateImage";
import { cn } from "@tsz/ui/lib/cn";
import {
  PageNotice,
  buttonClass,
  textButtonClass
} from "@/features/shell/Page";

const statuses = {
  pending: "待审核",
  approved: "已通过",
  rejected: "已驳回",
  revoked: "已撤销"
};
const kinds = {
  id_front: "身份证人像面",
  id_back: "身份证国徽面",
  education: "学历证书",
  language: "语言成绩"
};

export function ApplicationDetail({ id }: { id: string }) {
  const userId = useUserStore((state) => state.user?.id);
  const query = useQuery({
    queryKey: ["teacher-certification", userId, "application", id],
    queryFn: () => api.teacherCertification.detail(id),
    enabled: !!userId
  });
  if (query.isPending) return <PageNotice>正在读取申请…</PageNotice>;
  if (query.isError)
    return (
      <PageNotice tone="error">
        <p>{query.error.message}</p>
        <button
          type="button"
          className={cn(textButtonClass, "mt-3")}
          onClick={() => void query.refetch()}
        >
          重试
        </button>
      </PageNotice>
    );
  const { application, files } = query.data;
  const fields: [string, string | null][] = [
    ["真实姓名", application.real_name],
    ["联系方式", application.contact],
    ["认证说明", application.statement],
    ["审核原因", application.review_reason],
    ["撤销原因", application.revoke_reason]
  ];
  return (
    <div className="space-y-6">
      <div className="glass rounded-3xl p-2">
        <div className="rounded-[20px] bg-surface/70 p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="rounded-full bg-primary-muted px-3 py-1 text-sm font-medium text-primary">
              {statuses[application.status]}
            </p>
            <time
              dateTime={application.submitted_at}
              className="text-sm text-foreground-muted"
            >
              {new Date(application.submitted_at).toLocaleString()}
            </time>
          </div>
          <dl className="mt-6 divide-y divide-border/60">
            {fields.map(
              ([label, value]) =>
                value && (
                  <div
                    key={label}
                    className="grid gap-1 py-4 first:pt-0 last:pb-0 sm:grid-cols-[96px_1fr] sm:gap-4"
                  >
                    <dt className="text-sm text-foreground-muted">{label}</dt>
                    <dd className="whitespace-pre-wrap break-words text-sm leading-6">
                      {value}
                    </dd>
                  </div>
                )
            )}
          </dl>
        </div>
      </div>
      {files.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {files.map((file) => (
            <PrivateImage key={file.id} id={file.id} label={kinds[file.kind]} />
          ))}
        </div>
      )}
      <Link href="/apply-teacher" className={buttonClass}>
        查看当前认证状态
      </Link>
    </div>
  );
}
