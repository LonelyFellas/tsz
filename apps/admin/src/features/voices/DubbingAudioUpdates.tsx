import { useQuery } from "@tanstack/react-query";
import type { AdminDubbingAudioUpdate } from "@tsz/types";
import { Button, Flex, Space, Tag, Typography } from "@tsz/ui/admin/display";
import { useEffect, useState } from "react";
import { api, useAuthStore } from "@/lib/auth";

const labels: Record<string, string> = {
  pending: "等待更新",
  running: "生成中",
  failed: "失败",
  partial: "部分成功"
};

function Update({
  update,
  refresh
}: {
  update: AdminDubbingAudioUpdate;
  refresh: () => Promise<unknown>;
}) {
  const [now, setNow] = useState(Date.now());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (update.state !== "pending") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [update.state, update.due_at]);
  async function change(retry: boolean) {
    setPending(true);
    setError(false);
    try {
      await (retry
        ? api.speech.retryAudioUpdate(update.id)
        : api.speech.cancelAudioUpdate(update.id));
      await refresh();
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }
  const seconds = Math.max(
    0,
    Math.ceil((Date.parse(update.due_at) - now) / 1000)
  );
  return (
    <Flex vertical gap={4}>
      <Space wrap>
        <Tag
          color={
            update.state === "failed" || update.state === "partial"
              ? "error"
              : "default"
          }
        >
          {labels[update.state] ?? update.state}
        </Tag>
        {update.state === "pending" && (
          <Typography.Text>
            {seconds > 0
              ? `配置已保存，${seconds} 秒后自动更新相关草稿音频`
              : "已到执行时间，等待自动更新"}
          </Typography.Text>
        )}
        {update.total > 0 && (
          <Typography.Text>
            完成 {update.completed}／{update.total}
            {update.failed > 0 ? `，失败 ${update.failed}` : ""}
            {update.skipped > 0 ? `，跳过 ${update.skipped}` : ""}
          </Typography.Text>
        )}
        {update.state === "pending" && (
          <Button
            size="small"
            loading={pending}
            onClick={() => void change(false)}
          >
            撤销待更新
          </Button>
        )}
        {["failed", "partial"].includes(update.state) && (
          <Button
            size="small"
            loading={pending}
            onClick={() => void change(true)}
          >
            重试失败项
          </Button>
        )}
      </Space>
      {update.error_codes.includes("forbidden") && (
        <Typography.Text type="danger">
          提交账号缺少生成或目标内容编辑权限，未替换原音频。
        </Typography.Text>
      )}
      {update.error_codes.some((code) => code !== "forbidden") && (
        <Typography.Text type="secondary">
          部分目标未更新，原音频保留。
          {update.error_codes.includes("revision_conflict")
            ? "正文或推荐已变化，请按当前配置重新提交。"
            : "请检查读法、音色或服务状态后重试。"}
        </Typography.Text>
      )}
      {error && (
        <Typography.Text type="danger">
          操作失败或任务状态已变化，请刷新后重试。
        </Typography.Text>
      )}
    </Flex>
  );
}

export function DubbingAudioUpdates({
  groupId,
  revision
}: {
  groupId: string;
  revision: number;
}) {
  const accountId = useAuthStore((state) => state.profile?.id);
  const updates = useQuery({
    queryKey: ["admin-dubbing-audio-updates", accountId, groupId, revision],
    queryFn: ({ signal }) => api.speech.audioUpdates(groupId, signal),
    retry: false,
    refetchInterval: (query) =>
      ["pending", "running"].includes(query.state.data?.updates[0]?.state ?? "")
        ? 3000
        : false
  });
  if (updates.isError)
    return (
      <Typography.Text type="secondary">
        音频更新状态暂不可用{" "}
        <Button size="small" onClick={() => void updates.refetch()}>
          重试
        </Button>
      </Typography.Text>
    );
  const current = updates.data?.updates[0];
  if (
    !current ||
    !["pending", "running", "failed", "partial"].includes(current.state)
  )
    return null;
  return <Update key={current.id} update={current} refresh={updates.refetch} />;
}
