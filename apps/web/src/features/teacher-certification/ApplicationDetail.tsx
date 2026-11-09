"use client";
import { webCommon, localText, webErrorText } from "@/i18n/catalog";

import { useWebLocale, useWebText } from "@/i18n/client";

import { webTeacherCertificationDocuments as webTeacherCertification } from "@/i18n/messages/teacher-certification/documents";

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
  pending: localText(
    webTeacherCertification,
    "webTeacherCertificationDocuments:pending_review"
  ),
  approved: localText(
    webTeacherCertification,
    "webTeacherCertificationDocuments:approved"
  ),
  rejected: localText(
    webTeacherCertification,
    "webTeacherCertificationDocuments:rejected"
  ),
  revoked: localText(
    webTeacherCertification,
    "webTeacherCertificationDocuments:reversed"
  )
};
const kinds = {
  id_front: localText(
    webTeacherCertification,
    "webTeacherCertificationDocuments:identity_card_front"
  ),
  id_back: localText(
    webTeacherCertification,
    "webTeacherCertificationDocuments:identity_card_back"
  ),
  education: localText(
    webTeacherCertification,
    "webTeacherCertificationDocuments:education_certificate"
  ),
  language: localText(
    webTeacherCertification,
    "webTeacherCertificationDocuments:language_test_results"
  )
};

export function ApplicationDetail({ id }: { id: string }) {
  const locale = useWebLocale();
  const uiText = useWebText(webTeacherCertification);
  const userId = useUserStore((state) => state.user?.id);
  const query = useQuery({
    queryKey: ["teacher-certification", userId, "application", id],
    queryFn: () => api.teacherCertification.detail(id),
    enabled: !!userId
  });
  if (query.isPending)
    return (
      <PageNotice>
        {uiText("webTeacherCertificationDocuments:loading_application")}
      </PageNotice>
    );
  if (query.isError)
    return (
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
          className={cn(textButtonClass, "mt-3")}
          onClick={() => void query.refetch()}
        >
          {uiText("webTeacherCertificationDocuments:retry")}
        </button>
      </PageNotice>
    );
  const { application, files } = query.data;
  const fields: [import("@/i18n/catalog").LocalText, string | null][] = [
    [
      localText(
        webTeacherCertification,
        "webTeacherCertificationDocuments:full_name"
      ),
      application.real_name
    ],
    [
      localText(
        webTeacherCertification,
        "webTeacherCertificationDocuments:contact_details"
      ),
      application.contact
    ],
    [
      localText(
        webTeacherCertification,
        "webTeacherCertificationDocuments:certification_statement"
      ),
      application.statement
    ],
    [
      localText(
        webTeacherCertification,
        "webTeacherCertificationDocuments:review_reason"
      ),
      application.review_reason
    ],
    [
      localText(
        webTeacherCertification,
        "webTeacherCertificationDocuments:reason_for_reversal"
      ),
      application.revoke_reason
    ]
  ];
  return (
    <div className="space-y-6">
      <div className="glass rounded-3xl p-2">
        <div className="rounded-[20px] bg-surface/70 p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="rounded-full bg-primary-muted px-3 py-1 text-sm font-medium text-primary">
              {uiText(statuses[application.status])}
            </p>
            <time
              dateTime={application.submitted_at}
              className="text-sm text-foreground-muted"
            >
              {new Date(application.submitted_at).toLocaleString(locale, {
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
              })}
            </time>
          </div>
          <dl className="mt-6 divide-y divide-border/60">
            {fields.map(
              ([label, value]) =>
                value && (
                  <div
                    key={label.key}
                    className="grid gap-1 py-4 first:pt-0 last:pb-0 sm:grid-cols-[96px_1fr] sm:gap-4"
                  >
                    <dt className="text-sm text-foreground-muted">
                      {uiText(label)}
                    </dt>
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
            <PrivateImage
              key={file.id}
              id={file.id}
              label={uiText(kinds[file.kind])}
            />
          ))}
        </div>
      )}
      <Link href="/apply-teacher" className={buttonClass}>
        {uiText(
          "webTeacherCertificationDocuments:view_current_certification_status"
        )}
      </Link>
    </div>
  );
}
