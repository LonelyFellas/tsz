"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { PrivateImage } from "./PrivateImage";

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
  if (query.isPending) return <p>正在读取申请…</p>;
  if (query.isError)
    return (
      <div role="alert">
        <p>{query.error.message}</p>
        <button
          type="button"
          className="mt-3 text-primary"
          onClick={() => void query.refetch()}
        >
          重试
        </button>
      </div>
    );
  const { application, files } = query.data;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-medium">{statuses[application.status]}</p>
        <time
          dateTime={application.submitted_at}
          className="text-sm text-foreground-muted"
        >
          {new Date(application.submitted_at).toLocaleString()}
        </time>
      </div>
      <dl className="space-y-4">
        <div>
          <dt className="text-sm text-foreground-muted">真实姓名</dt>
          <dd>{application.real_name}</dd>
        </div>
        <div>
          <dt className="text-sm text-foreground-muted">联系方式</dt>
          <dd>{application.contact}</dd>
        </div>
        <div>
          <dt className="text-sm text-foreground-muted">认证说明</dt>
          <dd className="whitespace-pre-wrap break-words">
            {application.statement}
          </dd>
        </div>
        {application.review_reason && (
          <div>
            <dt className="text-sm text-foreground-muted">审核原因</dt>
            <dd className="whitespace-pre-wrap break-words">
              {application.review_reason}
            </dd>
          </div>
        )}
        {application.revoke_reason && (
          <div>
            <dt className="text-sm text-foreground-muted">撤销原因</dt>
            <dd className="whitespace-pre-wrap break-words">
              {application.revoke_reason}
            </dd>
          </div>
        )}
      </dl>
      <div className="grid gap-4 sm:grid-cols-2">
        {files.map((file) => (
          <PrivateImage key={file.id} id={file.id} label={kinds[file.kind]} />
        ))}
      </div>
      <Link href="/apply-teacher" className="inline-block text-sm text-primary">
        查看当前认证状态
      </Link>
    </div>
  );
}
