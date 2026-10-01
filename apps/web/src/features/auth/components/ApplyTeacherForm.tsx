"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CertificationFile,
  CertificationFileKind,
  TeacherCertification
} from "@tsz/types";
import { Button } from "@tsz/ui";
import { useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { PrivateImage } from "@/features/teacher-certification/PrivateImage";

const groups: { kind: CertificationFileKind; label: string; limit: number }[] =
  [
    { kind: "id_front", label: "身份证人像面", limit: 1 },
    { kind: "id_back", label: "身份证国徽面", limit: 1 },
    { kind: "education", label: "学历证书", limit: 10 },
    { kind: "language", label: "语言成绩", limit: 10 }
  ];
const inputClass =
  "mt-2 w-full rounded-xl border border-border bg-background/50 px-4 py-3 text-sm font-normal text-foreground outline-none transition placeholder:text-foreground-subtle focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/15";

export function ApplyTeacherForm() {
  const userId = useUserStore((s) => s.user?.id);
  const query = useQuery({
    queryKey: ["teacher-certification", userId],
    queryFn: () => api.teacherCertification.mine(),
    enabled: !!userId,
    retry: false
  });
  if (query.isPending) return <p role="status">加载中…</p>;
  if (query.isError)
    return (
      <div role="alert" className="space-y-3">
        <p>认证信息加载失败，请重试。</p>
        <Button onClick={() => void query.refetch()}>重新加载</Button>
      </div>
    );
  const data = query.data;
  if (data.teacher_verified || data.application?.status === "pending") {
    return (
      <section className="space-y-6 rounded-3xl border border-border bg-surface p-6 shadow-sm sm:p-8">
        <h2 className="text-xl font-semibold">
          {data.teacher_verified ? "教师认证已通过" : "审核中"}
        </h2>
        <p className="text-foreground-muted">
          {data.teacher_verified
            ? "点击右上角头像，可切换到教师工作台，也可以继续用学生身份学习。"
            : "申请已提交。审核期间不能修改或再次提交，结果会发到站内通知。"}
        </p>
        {data.application && (
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="inline text-foreground-muted">姓名：</dt>
              <dd className="inline">{data.application.real_name}</dd>
            </div>
            <div>
              <dt className="inline text-foreground-muted">联系方式：</dt>
              <dd className="inline">{data.application.contact}</dd>
            </div>
          </dl>
        )}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {data.files.map((file) => (
            <PrivateImage
              key={file.id}
              id={file.id}
              label={
                groups.find((g) => g.kind === file.kind)?.label ?? "认证材料"
              }
            />
          ))}
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
  const [fileError, setFileError] = useState("");
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
      setFileError(`${group.label}最多上传${group.limit}张`);
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
          throw new Error("请选择 JPG、PNG 或 WebP 图片，每张不超过 10MB");
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
      setFileError(error instanceof Error ? error.message : "上传失败，请重试");
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
      setFileError(error instanceof Error ? error.message : "移除失败，请重试");
    } finally {
      setUploading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSubmit) mutation.mutate();
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-7 rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-8"
    >
      {reason && (
        <div
          role="status"
          className="rounded-xl border border-border bg-muted p-4"
        >
          <p className="font-medium">
            {initial.application?.status === "revoked"
              ? "教师资格已撤销"
              : "上次申请未通过"}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm">{reason}</p>
          <p className="mt-2 text-sm text-foreground-muted">
            修改后可重新提交申请。
          </p>
        </div>
      )}
      <div className="flex items-start gap-2 border-b border-border pb-6 text-sm leading-6 text-foreground-muted">
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
        <p>本页信息均需填写。上传的材料仅你和负责审核的管理员可见。</p>
      </div>
      <section
        aria-labelledby="cert-basic-heading"
        className="grid gap-5 md:grid-cols-[176px_minmax(0,1fr)] md:gap-8"
      >
        <h2 id="cert-basic-heading" className="text-base font-semibold">
          个人信息
        </h2>
        <fieldset
          disabled={mutation.isPending || uploading}
          className="grid min-w-0 gap-4 sm:grid-cols-2 sm:gap-5"
        >
          <label className="text-sm font-medium">
            真实姓名
            <input
              className={inputClass}
              required
              maxLength={50}
              value={realName}
              onChange={(event) => setRealName(event.target.value)}
              placeholder="填写身份证上的姓名"
              autoComplete="name"
            />
          </label>
          <label className="text-sm font-medium">
            联系方式
            <input
              className={inputClass}
              required
              maxLength={254}
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              placeholder="手机号或邮箱"
              autoComplete="off"
            />
          </label>
        </fieldset>
      </section>
      <section
        aria-labelledby="cert-material-heading"
        className="grid gap-5 border-t border-border pt-7 md:grid-cols-[176px_minmax(0,1fr)] md:gap-8"
      >
        <div>
          <h2 id="cert-material-heading" className="text-base font-semibold">
            认证材料
          </h2>
          <p className="mt-2 text-pretty text-sm leading-6 text-foreground-muted">
            拍全材料，文字要看得清。
          </p>
          <p className="mt-2 text-sm leading-6 text-foreground-muted">
            JPG、PNG、WebP
            <span className="block">单张不超过 10MB</span>
          </p>
        </div>
        <div className="grid min-w-0 gap-x-5 gap-y-6 sm:grid-cols-2">
          {groups.map((group) => {
            const groupFiles = files.filter((file) => file.kind === group.kind);
            const multiple = group.limit > 1;
            const picker = (
              <label
                title={
                  multiple
                    ? `添加${group.label}照片`
                    : groupFiles.length
                      ? `更换${group.label}`
                      : undefined
                }
                className={`shrink-0 items-center justify-center gap-2 border border-border text-sm transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15 ${multiple ? "flex h-32 w-32 flex-col rounded-xl border-dashed bg-background/50 p-3 text-foreground-muted" : groupFiles.length ? "inline-flex min-h-11 w-11 rounded-full bg-surface px-0 py-1.5 text-foreground-muted lg:w-auto lg:px-3" : "mt-3 flex min-h-20 rounded-xl border-dashed bg-background/50 px-3 py-4 text-primary"} ${uploading || mutation.isPending ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-primary/50 hover:bg-muted"}`}
              >
                <input
                  id={`cert-${group.kind}`}
                  aria-label={group.label}
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
                  className={`text-sm font-medium ${multiple ? "sr-only" : groupFiles.length ? "sr-only lg:not-sr-only" : ""}`}
                >
                  {groupFiles.length === 0
                    ? "选择照片"
                    : group.limit === 1
                      ? "更换照片"
                      : "添加照片"}
                </span>
                {multiple && (
                  <span id={`cert-${group.kind}-hint`} className="sr-only">
                    最多 {group.limit} 张
                  </span>
                )}
              </label>
            );
            return (
              <section
                key={group.kind}
                className={`min-w-0 ${multiple ? "sm:col-span-2 lg:col-span-1" : ""}`}
              >
                <div className="flex min-h-11 items-center justify-between gap-3">
                  <h3 className="text-sm font-medium">{group.label}</h3>
                  {!multiple && groupFiles.length > 0 && picker}
                  {multiple && (
                    <span className="text-sm text-foreground-muted">
                      {groupFiles.length > 0
                        ? `${groupFiles.length} 张 · 最多 ${group.limit} 张`
                        : `最多 ${group.limit} 张`}
                    </span>
                  )}
                </div>
                {(groupFiles.length > 0 || multiple) && (
                  <div className="mt-3 grid grid-cols-[repeat(auto-fill,8rem)] gap-3">
                    {groupFiles.map((file) => (
                      <div key={file.id} className="relative min-w-0">
                        <PrivateImage id={file.id} label={group.label} />
                        <button
                          type="button"
                          disabled={uploading || mutation.isPending}
                          onClick={() => void remove(file)}
                          className="group absolute right-0 top-0 z-10 flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
                          aria-label={`移除${group.label}`}
                          title={`移除${group.label}`}
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
      <section className="grid gap-5 border-t border-border pt-7 md:grid-cols-[176px_minmax(0,1fr)] md:gap-8">
        <div>
          <h2 className="text-base font-semibold">
            <label htmlFor="cert-statement">认证说明</label>
          </h2>
          <p
            id="cert-statement-hint"
            className="mt-2 text-pretty text-sm leading-6 text-foreground-muted"
          >
            填写专业、教学经历或英语成绩。
          </p>
        </div>
        <div className="min-w-0">
          <textarea
            id="cert-statement"
            aria-describedby="cert-statement-hint cert-statement-count"
            required
            maxLength={2000}
            rows={4}
            placeholder="例如：英语专业毕业，有两年初中英语教学经验。"
            className={`${inputClass} mt-0! resize-y`}
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
          className="space-y-2 rounded-xl border border-border p-4 text-sm"
        >
          <p>旧材料删除失败，新材料已上传，不影响提交申请。</p>
          {pendingCleanup.map((file) => (
            <button
              key={file.id}
              type="button"
              disabled={uploading || mutation.isPending}
              onClick={() => void remove(file)}
              className="block text-primary disabled:opacity-50"
            >
              重试删除{groups.find((group) => group.kind === file.kind)?.label}
            </button>
          ))}
        </div>
      )}
      {fileError && (
        <p role="alert" className="text-sm text-danger">
          {fileError}
        </p>
      )}
      {mutation.error && (
        <p role="alert" className="text-sm text-danger">
          {mutation.error.message || "提交失败，请重试"}
        </p>
      )}
      <div className="flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-6 text-foreground-muted">
          {uploading ? "材料处理中…" : "审核中不能修改，结果见站内通知。"}
        </p>
        <Button
          type="submit"
          disabled={!canSubmit}
          className="min-h-11 w-full shrink-0 whitespace-nowrap rounded-full! px-8! py-3! sm:w-auto"
        >
          {mutation.isPending ? "提交中…" : "提交申请"}
        </Button>
      </div>
    </form>
  );
}
