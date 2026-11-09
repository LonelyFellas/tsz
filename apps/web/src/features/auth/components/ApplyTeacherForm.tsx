"use client";
import {
  webCommon,
  localText,
  LocalWebError,
  type WebNotice,
  webErrorText
} from "@/i18n/catalog";

import { useWebText } from "@/i18n/client";
import { webAuthCertification as webAuth } from "@/i18n/messages/auth/certification";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CertificationFile,
  CertificationFileKind,
  TeacherCertification
} from "@tsz/types";
import { Button } from "@tsz/ui/components";
import { cn } from "@tsz/ui/lib/cn";
import { PageNotice } from "@/features/shell/Page";
import { useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { PrivateImage } from "@/features/teacher-certification/PrivateImage";

const groups: {
  kind: CertificationFileKind;
  label: WebNotice;
  limit: number;
}[] = [
  {
    kind: "id_front",
    label: localText(webAuth, "webAuthCertification:identity_card_front"),
    limit: 1
  },
  {
    kind: "id_back",
    label: localText(webAuth, "webAuthCertification:identity_card_back"),
    limit: 1
  },
  {
    kind: "education",
    label: localText(webAuth, "webAuthCertification:education_certificate"),
    limit: 10
  },
  {
    kind: "language",
    label: localText(webAuth, "webAuthCertification:language_test_results"),
    limit: 10
  }
];
const inputClass =
  "mt-2 min-h-12 w-full rounded-full border border-border bg-surface px-5 py-3 text-sm font-normal text-foreground outline-hidden transition-shadow placeholder:text-foreground-subtle focus:border-primary/50 focus:ring-4 focus:ring-primary/15";

export function ApplyTeacherForm() {
  const uiText = useWebText(webAuth);
  const userId = useUserStore((s) => s.user?.id);
  const query = useQuery({
    queryKey: ["teacher-certification", userId],
    queryFn: () => api.teacherCertification.mine(),
    enabled: !!userId,
    retry: false
  });
  if (query.isPending)
    return (
      <div role="status">
        <PageNotice>{uiText("webAuthCertification:loading_2")}</PageNotice>
      </div>
    );
  if (query.isError)
    return (
      <PageNotice tone="error">
        <p>
          {uiText(
            "webAuthCertification:could_not_load_certification_details_try_again"
          )}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => void query.refetch()}
        >
          {uiText("webAuthCertification:reload")}
        </Button>
      </PageNotice>
    );
  const data = query.data;
  if (data.teacher_verified || data.application?.status === "pending") {
    return (
      <section className="glass rounded-3xl p-2">
        <div className="space-y-6 rounded-[20px] bg-surface/70 p-6 sm:p-8">
          <h2 className="text-xl font-semibold tracking-tight">
            {data.teacher_verified
              ? uiText("webAuthCertification:teacher_certification_approved")
              : uiText("webAuthCertification:under_review")}
          </h2>
          <p className="text-sm leading-6 text-foreground-muted">
            {data.teacher_verified
              ? uiText(
                  "webAuthCertification:use_the_avatar_menu_to_switch_to_the_teaching_workspace_or_continue_lear"
                )
              : uiText(
                  "webAuthCertification:application_submitted_you_cannot_change_or_resubmit_it_during_review_the"
                )}
          </p>
          {data.application && (
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="inline text-foreground-muted">
                  {uiText("webAuthCertification:name")}
                </dt>
                <dd className="inline">{data.application.real_name}</dd>
              </div>
              <div>
                <dt className="inline text-foreground-muted">
                  {uiText("webAuthCertification:contact")}
                </dt>
                <dd className="inline">{data.application.contact}</dd>
              </div>
            </dl>
          )}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {data.files.map((file) => (
              <PrivateImage
                key={file.id}
                id={file.id}
                label={uiText(
                  groups.find((g) => g.kind === file.kind)?.label ??
                    localText(
                      webAuth,
                      "webAuthCertification:certification_documents"
                    )
                )}
              />
            ))}
          </div>
        </div>
      </section>
    );
  }
  return (
    <ApplicationEditor
      key={`${userId}:${data.application?.id ?? "new"}`}
      userId={userId!}
      initial={data}
    />
  );
}

function ApplicationEditor({
  userId,
  initial
}: {
  userId: string;
  initial: TeacherCertification;
}) {
  const uiText = useWebText(webAuth);
  const client = useQueryClient();
  const [realName, setRealName] = useState(
    initial.application?.real_name ?? ""
  );
  const [contact, setContact] = useState(initial.application?.contact ?? "");
  const [statement, setStatement] = useState(
    initial.application?.statement ?? ""
  );
  const [files, setFiles] = useState(initial.files);
  const [pendingCleanup, setPendingCleanup] = useState<CertificationFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState<WebNotice>("");
  const temporary = useRef(new Set<string>());
  const reason =
    initial.application?.revoke_reason ?? initial.application?.review_reason;
  const mutation = useMutation({
    mutationFn: () =>
      api.teacherCertification.submit({
        real_name: realName.trim(),
        contact: contact.trim(),
        statement: statement.trim(),
        id_front: files.find((file) => file.kind === "id_front")!.id,
        id_back: files.find((file) => file.kind === "id_back")!.id,
        education_files: files
          .filter((file) => file.kind === "education")
          .map((file) => file.id),
        language_files: files
          .filter((file) => file.kind === "language")
          .map((file) => file.id)
      }),
    onSuccess: (application) => {
      client.setQueryData(["teacher-certification", userId], {
        teacher_verified: false,
        application,
        files
      });
      void client.invalidateQueries({
        queryKey: ["teacher-certification", userId]
      });
    }
  });
  const canSubmit =
    !!realName.trim() &&
    !!contact.trim() &&
    !!statement.trim() &&
    groups.every((group) => files.some((file) => file.kind === group.kind)) &&
    !uploading &&
    !mutation.isPending;

  async function upload(
    kind: CertificationFileKind,
    selected: FileList | null
  ) {
    if (!selected?.length) return;
    const group = groups.find((value) => value.kind === kind)!;
    const previous = files.filter((file) => file.kind === kind);
    if (group.limit > 1 && previous.length + selected.length > group.limit) {
      setFileError(
        localText(
          webAuth,
          "webAuthCertification:upload_up_to_v1_images_for_v0",
          {
            v0: group.label,
            v1: group.limit
          }
        )
      );
      return;
    }
    setUploading(true);
    setFileError("");
    try {
      for (const file of Array.from(selected)) {
        if (
          !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          file.size > 10 * 1024 * 1024 ||
          file.size === 0
        )
          throw new LocalWebError(
            localText(
              webAuth,
              "webAuthCertification:choose_jpg_png_or_webp_images_up_to_10_mb_each"
            )
          );
        const uploaded = await api.teacherCertification.upload(kind, file);
        temporary.current.add(uploaded.id);
        setFiles((current) => [
          ...(group.limit === 1
            ? current.filter((item) => item.kind !== kind)
            : current),
          uploaded
        ]);
        if (group.limit === 1) {
          for (const old of previous)
            if (temporary.current.has(old.id)) {
              try {
                await api.teacherCertification.removeFile(old.id);
                temporary.current.delete(old.id);
              } catch {
                setPendingCleanup((current) => [...current, old]);
              }
            }
        }
      }
    } catch (error) {
      setFileError(
        webErrorText(
          error,
          localText(webAuth, "webAuthCertification:upload_failed_try_again_2")
        )
      );
    } finally {
      setUploading(false);
    }
  }

  async function remove(file: CertificationFile) {
    setFileError("");
    setUploading(true);
    try {
      if (temporary.current.has(file.id)) {
        await api.teacherCertification.removeFile(file.id);
        temporary.current.delete(file.id);
      }
      setFiles((current) => current.filter((item) => item.id !== file.id));
      setPendingCleanup((current) =>
        current.filter((item) => item.id !== file.id)
      );
    } catch (error) {
      setFileError(
        webErrorText(
          error,
          localText(webAuth, "webAuthCertification:could_not_remove_try_again")
        )
      );
    } finally {
      setUploading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSubmit) mutation.mutate();
  }

  return (
    <div className="glass rounded-3xl p-2">
      <form
        onSubmit={submit}
        className="space-y-7 rounded-[20px] bg-surface/70 p-5 sm:p-8"
      >
        {reason && (
          <div
            role="status"
            className="rounded-2xl border border-border/60 bg-muted/70 p-4"
          >
            <p className="font-medium">
              {initial.application?.status === "revoked"
                ? uiText("webAuthCertification:teacher_qualification_revoked")
                : uiText("webAuthCertification:previous_application_rejected")}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm">{reason}</p>
            <p className="mt-2 text-sm text-foreground-muted">
              {uiText(
                "webAuthCertification:you_can_update_and_resubmit_your_application"
              )}
            </p>
          </div>
        )}
        <div className="flex items-start gap-2 border-b border-border/60 pb-6 text-sm leading-6 text-foreground-muted">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mt-1 h-4 w-4 shrink-0"
            aria-hidden
          >
            <rect x="5" y="10" width="14" height="11" rx="3" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            <path d="M12 14v3" />
          </svg>
          <p>
            {uiText(
              "webAuthCertification:complete_every_field_uploaded_documents_are_visible_only_to_you_and_the"
            )}
          </p>
        </div>
        <section
          aria-labelledby="cert-basic-heading"
          className="grid gap-5 md:grid-cols-[176px_minmax(0,1fr)] md:gap-8"
        >
          <h2 id="cert-basic-heading" className="text-base font-semibold">
            {uiText("webAuthCertification:personal_details")}
          </h2>
          <fieldset
            disabled={mutation.isPending || uploading}
            className="grid min-w-0 gap-4 sm:grid-cols-2 sm:gap-5"
          >
            <label className="text-sm font-medium">
              {uiText("webAuthCertification:full_name")}
              <input
                className={inputClass}
                required
                maxLength={50}
                value={realName}
                onChange={(event) => setRealName(event.target.value)}
                placeholder={uiText(
                  "webAuthCertification:enter_the_name_on_your_identity_document"
                )}
                autoComplete="name"
              />
            </label>
            <label className="text-sm font-medium">
              {uiText("webAuthCertification:contact_details")}
              <input
                className={inputClass}
                required
                maxLength={254}
                value={contact}
                onChange={(event) => setContact(event.target.value)}
                placeholder={uiText(
                  "webAuthCertification:phone_number_or_email"
                )}
                autoComplete="off"
              />
            </label>
          </fieldset>
        </section>
        <section
          aria-labelledby="cert-material-heading"
          className="grid gap-5 border-t border-border/60 pt-7 md:grid-cols-[176px_minmax(0,1fr)] md:gap-8"
        >
          <div>
            <h2 id="cert-material-heading" className="text-base font-semibold">
              {uiText("webAuthCertification:certification_documents")}
            </h2>
            <p className="mt-2 text-pretty text-sm leading-6 text-foreground-muted">
              {uiText(
                "webAuthCertification:include_the_entire_document_and_keep_the_text_legible"
              )}
            </p>
            <p className="mt-2 text-sm leading-6 text-foreground-muted">
              JPG、PNG、WebP
              <span className="block">
                {uiText("webAuthCertification:up_to_10_mb_per_image")}
              </span>
            </p>
          </div>
          <div className="grid min-w-0 gap-x-5 gap-y-6 sm:grid-cols-2">
            {groups.map((group) => {
              const groupFiles = files.filter(
                (file) => file.kind === group.kind
              );
              const multiple = group.limit > 1;
              const picker = (
                <label
                  title={
                    multiple
                      ? uiText("webAuthCertification:add_a_photo_of_v0", {
                          v0: uiText(group.label)
                        })
                      : groupFiles.length
                        ? uiText("webAuthCertification:replace_v0", {
                            v0: uiText(group.label)
                          })
                        : undefined
                  }
                  className={cn(
                    "shrink-0 items-center justify-center gap-2 border border-border text-sm transition focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/15",
                    multiple
                      ? "flex h-32 w-32 flex-col rounded-2xl border-dashed bg-muted/50 p-3 text-foreground-muted"
                      : groupFiles.length
                        ? "inline-flex min-h-11 w-11 rounded-full bg-surface px-0 py-1.5 text-foreground-muted lg:w-auto lg:px-3"
                        : "mt-3 flex min-h-20 rounded-2xl border-dashed bg-muted/50 px-3 py-4 text-primary",
                    uploading || mutation.isPending
                      ? "cursor-not-allowed opacity-50"
                      : "cursor-pointer hover:border-primary/50 hover:bg-muted"
                  )}
                >
                  <input
                    id={`cert-${group.kind}`}
                    aria-label={uiText(group.label)}
                    aria-describedby={
                      group.limit > 1 ? `cert-${group.kind}-hint` : undefined
                    }
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple={group.limit > 1}
                    disabled={uploading || mutation.isPending}
                    className="sr-only"
                    onChange={(event) => {
                      void upload(group.kind, event.target.files);
                      event.target.value = "";
                    }}
                  />
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={multiple ? "h-7 w-7" : "h-4 w-4"}
                    aria-hidden
                  >
                    <path
                      d={
                        multiple
                          ? "M12 5v14M5 12h14"
                          : "M12 16V3m-4 4 4-4 4 4M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"
                      }
                    />
                  </svg>
                  <span
                    className={cn(
                      "text-sm font-medium",
                      multiple
                        ? "sr-only"
                        : groupFiles.length && "sr-only lg:not-sr-only"
                    )}
                  >
                    {groupFiles.length === 0
                      ? uiText("webAuthCertification:choose_photo")
                      : group.limit === 1
                        ? uiText("webAuthCertification:replace_photo")
                        : uiText("webAuthCertification:add_photo")}
                  </span>
                  {multiple && (
                    <span id={`cert-${group.kind}-hint`} className="sr-only">
                      {uiText("webAuthCertification:up_to_v0_images", {
                        v0: group.limit
                      })}
                    </span>
                  )}
                </label>
              );
              return (
                <section
                  key={group.kind}
                  className={cn(
                    "min-w-0",
                    multiple && "sm:col-span-2 lg:col-span-1"
                  )}
                >
                  <div className="flex min-h-11 items-center justify-between gap-3">
                    <h3 className="text-sm font-medium">
                      {uiText(group.label)}
                    </h3>
                    {!multiple && groupFiles.length > 0 && picker}
                    {multiple && (
                      <span className="text-sm text-foreground-muted">
                        {groupFiles.length > 0
                          ? uiText("webAuthCertification:v0_images_up_to_v1", {
                              v0: groupFiles.length,
                              v1: group.limit
                            })
                          : uiText("webAuthCertification:up_to_v0_images", {
                              v0: group.limit
                            })}
                      </span>
                    )}
                  </div>
                  {(groupFiles.length > 0 || multiple) && (
                    <div className="mt-3 grid grid-cols-[repeat(auto-fill,8rem)] gap-3">
                      {groupFiles.map((file) => (
                        <div key={file.id} className="relative min-w-0">
                          <PrivateImage
                            id={file.id}
                            label={uiText(group.label)}
                          />
                          <button
                            type="button"
                            disabled={uploading || mutation.isPending}
                            onClick={() => void remove(file)}
                            className="group absolute right-0 top-0 z-10 flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
                            aria-label={uiText(
                              "webAuthCertification:remove_v0",
                              {
                                v0: uiText(group.label)
                              }
                            )}
                            title={uiText("webAuthCertification:remove_v0", {
                              v0: uiText(group.label)
                            })}
                          >
                            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface/95 text-foreground-muted transition group-hover:bg-surface group-hover:text-danger">
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                className="h-4 w-4"
                                aria-hidden
                              >
                                <path d="M6 12h12" />
                              </svg>
                            </span>
                          </button>
                        </div>
                      ))}
                      {multiple && picker}
                    </div>
                  )}
                  {!multiple && groupFiles.length === 0 && picker}
                </section>
              );
            })}
          </div>
        </section>
        <section className="grid gap-5 border-t border-border/60 pt-7 md:grid-cols-[176px_minmax(0,1fr)] md:gap-8">
          <div>
            <h2 className="text-base font-semibold">
              <label htmlFor="cert-statement">
                {uiText("webAuthCertification:certification_statement")}
              </label>
            </h2>
            <p
              id="cert-statement-hint"
              className="mt-2 text-pretty text-sm leading-6 text-foreground-muted"
            >
              {uiText(
                "webAuthCertification:enter_your_subject_teaching_experience_or_english_test_results"
              )}
            </p>
          </div>
          <div className="min-w-0">
            <textarea
              id="cert-statement"
              aria-describedby="cert-statement-hint cert-statement-count"
              required
              maxLength={2000}
              rows={4}
              placeholder={uiText(
                "webAuthCertification:for_example_english_graduate_with_two_years_of_lower_secondary_english_t"
              )}
              className={cn(inputClass, "mt-0 min-h-36 resize-y rounded-2xl")}
              value={statement}
              disabled={mutation.isPending}
              onChange={(event) => setStatement(event.target.value)}
            />
            <span
              id="cert-statement-count"
              className="mt-2 block text-right text-xs tabular-nums text-foreground-muted"
            >
              {statement.length} / 2000
            </span>
          </div>
        </section>
        {pendingCleanup.length > 0 && (
          <div
            role="status"
            className="space-y-2 rounded-2xl border border-border/60 bg-muted/70 p-4 text-sm"
          >
            <p>
              {uiText(
                "webAuthCertification:the_new_document_was_uploaded_but_the_old_one_could_not_be_deleted_you_c"
              )}
            </p>
            {pendingCleanup.map((file) => (
              <button
                key={file.id}
                type="button"
                disabled={uploading || mutation.isPending}
                onClick={() => void remove(file)}
                className="block text-primary disabled:opacity-50"
              >
                {uiText("webAuthCertification:retry_deleting_v0", {
                  v0: uiText(
                    groups.find((group) => group.kind === file.kind)?.label
                  )
                })}
              </button>
            ))}
          </div>
        )}
        {fileError && (
          <p role="alert" className="text-sm text-danger">
            {uiText(fileError)}
          </p>
        )}
        {mutation.error && (
          <p role="alert" className="text-sm text-danger">
            {uiText(
              webErrorText(
                mutation.error,
                localText(webCommon, "webCommon:response_unavailable")
              )
            ) || uiText("webAuthCertification:could_not_submit_try_again")}
          </p>
        )}
        <div className="flex flex-col gap-4 border-t border-border/60 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-foreground-muted">
            {uploading
              ? uiText("webAuthCertification:processing_documents")
              : uiText(
                  "webAuthCertification:changes_are_unavailable_during_review_see_notifications_for_the_result"
                )}
          </p>
          <Button
            type="submit"
            disabled={!canSubmit}
            className="w-full shrink-0 whitespace-nowrap px-8 sm:w-auto"
          >
            {mutation.isPending
              ? uiText("webAuthCertification:submitting")
              : uiText("webAuthCertification:submit_application")}
          </Button>
        </div>
      </form>
    </div>
  );
}
