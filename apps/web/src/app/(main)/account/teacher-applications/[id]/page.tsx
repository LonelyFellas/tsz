import type { Metadata } from "next";
import Link from "next/link";
import { RouteGuard } from "@/features/auth";
import { ApplicationDetail } from "@/features/teacher-certification/ApplicationDetail";

export const metadata: Metadata = {
  title: "教师认证申请详情",
  robots: { index: false, follow: false }
};

export default async function TeacherApplicationPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <RouteGuard>
      <div className="mx-auto max-w-3xl">
        <Link
          href="/account/notifications"
          className="text-sm text-foreground-muted"
        >
          返回站内通知
        </Link>
        <h1 className="mb-8 mt-5 text-3xl font-semibold tracking-tight">
          教师认证申请详情
        </h1>
        <ApplicationDetail id={id} />
      </div>
    </RouteGuard>
  );
}
