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
  "mt-2 w-full rounded-xl border border-border bg-surface px-4 py-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

export function ApplyTeacherForm() {
  const userId = useUserStore((s) => s.user?.id);
  const query = useQuery({
    queryKey: ["teacher-certification", userId],
    queryFn: () => api.teacherCertification.mine(),
    enabled: !!userId,
    retry: false
  });
  if (query.isPending) return <p role="status">正在读取认证状态…</p>;
  if (query.isError)
    return (
      <div role="alert" className="space-y-3">
        <p>认证状态读取失败，请重试。</p>
        <Button onClick={() => void query.refetch()}>重新加载</Button>
      </div>
    );
  const data = query.data;
  if (data.teacher_verified || data.application?.status === "pending") {
    return (
      <section className="space-y-6 rounded-3xl bg-surface p-6 sm:p-10">
        <h2 className="text-xl font-semibold">
          {data.teacher_verified ? "教师认证已通过" : "审核中"}
        </h2>
        <p className="text-foreground-muted">
          {data.teacher_verified
            ? "学生身份仍然保留，可在账号菜单中切换到教师工作台。"
            : "申请已提交，审核期间不能修改或重复提交。结果会通过站内通知告知你。"}
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
          throw new Error("请上传10MB以内的JPEG、PNG或WebP图片");
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
              await api.teacherCertification.removeFile(old.id);
              temporary.current.delete(old.id);
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
      className="space-y-8 rounded-3xl bg-surface p-6 shadow-sm sm:p-10"
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
            修改资料后可以重新申请。
          </p>
        </div>
      )}
      <p className="text-sm text-foreground-muted">
        以下信息均为必填。认证材料仅本人和有审核权限的超级管理员可查看。
      </p>
      <fieldset
        disabled={mutation.isPending || uploading}
        className="grid gap-6 sm:grid-cols-2"
      >
        <label className="text-sm font-medium">
          真实姓名
          <input
            className={inputClass}
            required
            maxLength={50}
            value={realName}
            onChange={(event) => setRealName(event.target.value)}
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
      <div className="grid gap-8 sm:grid-cols-2">
        {groups.map((group) => (
          <section
            key={group.kind}
            className={group.limit > 1 ? "sm:col-span-2" : ""}
          >
            <label
              htmlFor={`cert-${group.kind}`}
              className="text-sm font-semibold"
            >
              {group.label}
            </label>
            <p className="mb-3 mt-1 text-xs text-foreground-muted">
              {group.limit === 1
                ? "上传1张清晰图片"
                : `至少1张，最多${group.limit}张`}
              ，每张不超过10MB
            </p>
            <div
              className={`mb-3 grid gap-3 ${group.limit > 1 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1"}`}
            >
              {files
                .filter((file) => file.kind === group.kind)
                .map((file) => (
                  <div key={file.id} className="space-y-2">
                    <PrivateImage id={file.id} label={group.label} />
                    <button
                      type="button"
                      disabled={uploading || mutation.isPending}
                      onClick={() => void remove(file)}
                      className="text-xs text-danger disabled:opacity-50"
                      aria-label={`移除${group.label}`}
                    >
                      移除
                    </button>
                  </div>
                ))}
            </div>
            <input
              id={`cert-${group.kind}`}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple={group.limit > 1}
              disabled={uploading || mutation.isPending}
              className="block w-full text-sm text-foreground-muted file:mr-3 file:rounded-full file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-primary"
              onChange={(event) => {
                void upload(group.kind, event.target.files);
                event.target.value = "";
              }}
            />
          </section>
        ))}
      </div>
      <div>
        <label htmlFor="cert-statement" className="block text-sm font-medium">
          认证说明
        </label>
        <textarea
          id="cert-statement"
          aria-describedby="cert-statement-count"
          required
          maxLength={2000}
          rows={5}
          className={`${inputClass} resize-y`}
          value={statement}
          disabled={mutation.isPending}
          onChange={(event) => setStatement(event.target.value)}
        />
        <span
          id="cert-statement-count"
          className="mt-1 block text-right text-xs text-foreground-muted"
        >
          {statement.length}/2000
        </span>
      </div>
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
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-foreground-muted">
          {uploading
            ? "正在处理材料，请稍候…"
            : "提交后进入审核，审核期间不能修改。"}
        </p>
        <Button
          type="submit"
          disabled={!canSubmit}
          className="shrink-0 whitespace-nowrap rounded-full px-8 py-3"
        >
          {mutation.isPending ? "提交中…" : "提交审核"}
        </Button>
      </div>
    </form>
  );
}
