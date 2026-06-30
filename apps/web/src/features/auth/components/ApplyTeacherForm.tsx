"use client";

import { Button, Card } from "@tsz/ui";
import { useState } from "react";
import { api } from "@/lib/request";

// 填写资料 → 提交审核。被拒后展示拒绝原因(从用户档案读取)。
export function ApplyTeacherForm({ rejectReason }: { rejectReason?: string }) {
  const [realName, setRealName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await api.auth.applyTeacher({ realName });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      {rejectReason && (
        <div className="mb-4 rounded bg-danger/10 p-3 text-sm text-danger">
          上次申请被拒:{rejectReason}
        </div>
      )}
      <label className="mb-1 block text-sm">真实姓名</label>
      <input
        className="mb-3 w-full rounded border px-3 py-2"
        value={realName}
        onChange={(e) => setRealName(e.target.value)}
      />
      <Button disabled={!realName || submitting} onClick={submit}>
        {submitting ? "提交中…" : "提交审核"}
      </Button>
    </Card>
  );
}
