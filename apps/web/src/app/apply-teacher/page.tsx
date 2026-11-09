import { getServerWebText } from "@/i18n/server";
import { webApp } from "@/i18n/messages/app";
import type { Metadata } from "next";
import { ApplyTeacherForm } from "@/features/auth/components/ApplyTeacherForm";
import { RouteGuard } from "@/features/auth/components/RouteGuard";
import { AppTopbar } from "@/features/shell/AppTopbar";
import { AppPageHeader } from "@/i18n/AppText";
import { PageShell } from "@/features/shell/Page";

export async function generateMetadata(): Promise<Metadata> {
  const uiText = await getServerWebText(webApp);
  return {
    title: uiText("webApp:apply_to_teach"),
    description: uiText(
      "webApp:submit_teacher_certification_documents_on_and_check_the_review_result_in"
    ),
    alternates: { canonical: "/apply-teacher" },
    robots: { index: false, follow: false }
  };
}

// 申请成为老师:填写资料 → 提交审核 →(被拒)查看拒绝原因。
export default function ApplyTeacherPage() {
  return (
    <RouteGuard>
      <AppTopbar />
      <main className="mx-auto w-full max-w-5xl">
        <PageShell size="lg">
          <AppPageHeader
            back={{ href: "/account", label: "webApp:back_to_account" }}
            eyebrow="webApp:teacher_certification"
            title="webApp:apply_to_teach"
            description="webApp:submit_documents_for_teacher_certification_the_result_appears_in_notific"
          />
          <ApplyTeacherForm />
        </PageShell>
      </main>
    </RouteGuard>
  );
}
