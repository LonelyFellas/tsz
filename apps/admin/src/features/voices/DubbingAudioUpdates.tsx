import { useVoiceTranslation, voiceLabel } from "./i18n";
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
  const { t } = useVoiceTranslation();
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
          {voiceLabel(labels[update.state] ?? update.state, t)}
        </Tag>
        {update.state === "pending" && (
          <Typography.Text>
            {seconds > 0
              ? t("audio_update_due", { count: seconds })
              : t("scheduled_time_reached_awaiting_automatic_update")}
          </Typography.Text>
        )}
        {update.total > 0 && (
          <Typography.Text>
            {t("audio_update_progress", {
              completed: update.completed,
              total: update.total,
              failed:
                update.failed > 0
                  ? t("audio_update_failed", { count: update.failed })
                  : "",
              skipped:
                update.skipped > 0
                  ? t("audio_update_skipped", { count: update.skipped })
                  : ""
            })}
          </Typography.Text>
        )}
        {update.state === "pending" && (
          <Button
            size="small"
            loading={pending}
            onClick={() => void change(false)}
          >
            {t("cancel_pending_update")}
          </Button>
        )}
        {["failed", "partial"].includes(update.state) && (
          <Button
            size="small"
            loading={pending}
            onClick={() => void change(true)}
          >
            {t("retry_failed_items")}
          </Button>
        )}
      </Space>
      {update.error_codes.includes("forbidden") && (
        <Typography.Text type="danger">
          {t(
            "the_submitting_account_lacks_generation_or_target_editing_permiss"
          )}
        </Typography.Text>
      )}
      {update.error_codes.some((code) => code !== "forbidden") && (
        <Typography.Text type="secondary">
          {t("some_targets_were_not_updated_original_audio_has_been_kept")}{" "}
          {update.error_codes.includes("revision_conflict")
            ? t(
                "the_text_or_recommendation_has_changed_submit_again_using_the_cur"
              )
            : t("check_the_reading_voice_or_service_status_and_try_again")}
        </Typography.Text>
      )}
      {error && (
        <Typography.Text type="danger">
          {t(
            "the_operation_failed_or_the_task_state_changed_refresh_and_try_ag"
          )}
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
  const { t } = useVoiceTranslation();
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
        {t("audio_update_status_is_unavailable")}{" "}
        <Button size="small" onClick={() => void updates.refetch()}>
          {t("try_again")}
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
