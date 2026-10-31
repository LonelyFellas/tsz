import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminDubbingAudioUpdate } from "@tsz/types";
import { Alert, Button, Flex, InputNumber, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { api, useAuthStore } from "@/lib/auth";
import { useUnsavedChanges } from "@tsz/shared/recovery";

const labels: Record<string, string> = {
  pending: "等待更新",
  running: "生成中",
  completed: "已完成",
  failed: "失败",
  partial: "部分成功",
  cancelled: "已撤销",
  superseded: "已由新配置替代"
};

export function DubbingAudioUpdateSettings({
  onDirtyChange
}: {
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const accountId = useAuthStore((state) => state.profile?.id);
  const client = useQueryClient();
  const key = ["admin-dubbing-update-settings", accountId];
  const settings = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => api.speech.audioUpdateSettings(signal),
    retry: false
  });
  const [draft, setDraft] = useState<{ wait_seconds: number }>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const value = draft ?? settings.data;
  useUnsavedChanges("dubbing-update-settings", !!draft || saving);
  useEffect(() => {
    onDirtyChange?.(!!draft || saving);
    return () => onDirtyChange?.(false);
  }, [draft, saving, onDirtyChange]);
  async function save() {
    if (!value || !settings.data) return;
    setSaving(true);
    setError(false);
    try {
      const result = await api.speech.saveAudioUpdateSettings({
        wait_seconds: value.wait_seconds,
        base_revision: settings.data.revision
      });
      if (useAuthStore.getState().profile?.id !== accountId) return;
      client.setQueryData(key, result);
      setDraft(undefined);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }
  if (settings.isError)
    return (
      <Alert
        type="warning"
        title="音频更新设置加载失败"
        action={<Button onClick={() => void settings.refetch()}>重试</Button>}
      />
    );
  if (!value) return null;
  return (
    <Flex vertical gap={8}>
      <Space wrap>
        <Typography.Text>分组完成后等待</Typography.Text>
        <InputNumber
          aria-label="音频更新等待秒数"
          min={0}
          max={3600}
          precision={0}
          value={value.wait_seconds}
          disabled={saving}
          onChange={(seconds) => {
            if (seconds !== null) setDraft({ ...value, wait_seconds: seconds });
          }}
          suffix="秒"
          style={{ width: 144 }}
        />
        <Button
          disabled={!draft || saving}
          loading={saving}
          onClick={() => void save()}
        >
          保存更新设置
        </Button>
        {draft && (
          <Button disabled={saving} onClick={() => setDraft(undefined)}>
            取消设置修改
          </Button>
        )}
      </Space>
      <Typography.Text type="secondary">
        仅用于之后提交的更新；共享板块的分组再次完成或调整优先级会重新计时，已提交任务可在分组内撤销。
      </Typography.Text>
      {error && (
        <Alert
          type="error"
          title="设置保存失败或版本已变化，当前输入已保留。"
          action={
            <Button onClick={() => void settings.refetch()}>重新载入</Button>
          }
        />
      )}
    </Flex>
  );
}

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
            update.state === "failed"
              ? "error"
              : update.state === "completed"
                ? "success"
                : "default"
          }
        >
          {update.state === "completed" &&
          update.completed === 0 &&
          !update.error_codes.length
            ? "配置已保存，无需更新音频"
            : (labels[update.state] ?? update.state)}
        </Tag>
        <Typography.Text type="secondary">
          {update.group_name} · 配置版本 {update.group_revision}
        </Typography.Text>
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
  groupId?: string;
  revision: number;
}) {
  const accountId = useAuthStore((state) => state.profile?.id);
  const updates = useQuery({
    queryKey: ["admin-dubbing-audio-updates", accountId, groupId, revision],
    queryFn: ({ signal }) =>
      groupId
        ? api.speech.audioUpdates(groupId, signal)
        : api.speech.allAudioUpdates(signal),
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.updates.some((update) =>
        ["pending", "running"].includes(update.state)
      )
        ? 3000
        : false
  });
  if (updates.isError)
    return (
      <Typography.Text type="secondary">
        音频任务加载失败{" "}
        <Button size="small" onClick={() => void updates.refetch()}>
          重试
        </Button>
      </Typography.Text>
    );
  return (
    <Flex vertical gap={8}>
      {updates.data?.updates.slice(0, groupId ? 3 : 20).map((update) => (
        <Update key={update.id} update={update} refresh={updates.refetch} />
      ))}
    </Flex>
  );
}
