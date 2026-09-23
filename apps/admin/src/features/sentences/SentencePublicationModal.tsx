import { useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Alert, Button, Input, List, Modal, Space, Typography } from "antd";
import { HttpError } from "@tsz/api-client";
import type { SharedSentence, SentencePublication } from "@tsz/types";
import { api } from "@/lib/auth";
import { V3EnglishTextPreview } from "../dictionary/word-creation-v3/components/V3EnglishTextPreview";

export type SentencePublicationAction =
  "publish" | "history" | "withdraw" | "restore";
const titles = {
  publish: "发布例句草稿",
  history: "例句发布历史",
  withdraw: "全局下架例句",
  restore: "恢复例句展示"
};

/** 打开时冻结双 revision；确定性失败要求重新加载，未知结果复用原幂等请求。 */
export function SentencePublicationModal({
  sentence,
  action,
  canPublish,
  onClose,
  onChanged
}: {
  sentence: SharedSentence;
  action: SentencePublicationAction;
  canPublish: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState<SentencePublication>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [blocked, setBlocked] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const key = useRef(crypto.randomUUID());
  const busy = useRef(false);
  const impact = useQuery({
    queryKey: [
      "sentence-withdrawal-impact",
      sentence.id,
      sentence.lifecycle_revision
    ],
    queryFn: () => api.sentences.withdrawalImpact(sentence.id),
    enabled: action === "withdraw",
    staleTime: Infinity,
    refetchOnWindowFocus: false
  });
  const history = useInfiniteQuery({
    queryKey: [
      "sentence-publications",
      sentence.id,
      sentence.lifecycle_revision
    ],
    queryFn: ({ pageParam }) =>
      api.sentences.publications(sentence.id, pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) =>
      last.length === 50 ? last.at(-1)?.publication_number : undefined,
    enabled: action === "history"
  });
  const input = {
    base_revision: sentence.revision,
    base_lifecycle_revision: sentence.lifecycle_revision
  };
  const submit = async () => {
    if (busy.current || blocked || !canPublish) return;
    if (action === "history" && !selected) return;
    if (action === "withdraw" && (!impact.data || !reason.trim())) return;
    busy.current = true;
    setPending(true);
    setError(undefined);
    try {
      if (action === "publish")
        await api.sentences.publish(sentence.id, key.current, input);
      else if (action === "restore")
        await api.sentences.restore(sentence.id, key.current, input);
      else if (action === "withdraw")
        await api.sentences.withdraw(sentence.id, key.current, {
          ...input,
          reason: reason.trim(),
          impact_fingerprint: impact.data!.fingerprint
        });
      else
        await api.sentences.rollback(
          sentence.id,
          selected!.id,
          key.current,
          input
        );
      onChanged();
      onClose();
    } catch (failure) {
      if (failure instanceof HttpError && failure.status < 500) {
        setBlocked(true);
        setError(`${failure.message}。请关闭窗口，刷新后重新确认。`);
      } else {
        setUncertain(true);
        setError(
          "操作结果暂时未知，请重试确认；重试复用原请求，不会重复创建发布版本。"
        );
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  return (
    <Modal
      open
      title={titles[action]}
      width={800}
      onCancel={onClose}
      closable={!pending}
      keyboard={!pending}
      mask={{ closable: false }}
      cancelButtonProps={{ disabled: pending }}
      okText={action === "history" ? "将所选历史发布为新版本" : "确认"}
      confirmLoading={pending}
      okButtonProps={{
        disabled:
          !canPublish ||
          blocked ||
          (action === "history" && !selected) ||
          (action === "withdraw" &&
            (!impact.data || impact.isError || !reason.trim()))
      }}
      onOk={() => void submit()}
    >
      <Space orientation="vertical" style={{ width: "100%" }}>
        <Alert
          type="info"
          title={
            action === "withdraw"
              ? "下架影响所有引用方，保留草稿、历史和关联"
              : action === "restore"
                ? "恢复前重新校验当前发布版本，草稿不会发布"
                : "发布与回退都不覆盖草稿，也不会自动恢复已下架例句"
          }
          description="需要词库发布权限；仅创建者或超管可操作，服务端会再次校验。"
        />
        {action === "publish" && (
          <V3EnglishTextPreview
            value={sentence.content.sentence.en_text}
            hideCommonDialect
          />
        )}
        {action === "withdraw" && (
          <>
            {impact.isPending && (
              <Typography.Text>正在核对下架影响…</Typography.Text>
            )}
            {impact.isError && (
              <Alert
                type="error"
                title="影响确认加载失败"
                action={
                  <Button onClick={() => void impact.refetch()}>重试</Button>
                }
              />
            )}
            {impact.data && (
              <>
                <Typography.Text>
                  当前发布涉及 {impact.data.targets.length} 个词义：
                </Typography.Text>
                <List
                  size="small"
                  dataSource={impact.data.targets}
                  renderItem={(target) => (
                    <List.Item>
                      {target.entry_id} / {target.sense_id}
                      {target.hidden ? "（宿主已隐藏）" : ""}
                    </List.Item>
                  )}
                />
              </>
            )}
            <Input.TextArea
              aria-label="下架原因"
              value={reason}
              maxLength={2000}
              disabled={pending || uncertain || blocked}
              onChange={(event) => setReason(event.target.value)}
              placeholder="填写下架原因"
            />
          </>
        )}
        {action === "history" && (
          <>
            {history.isError && (
              <Alert
                type="error"
                title="发布历史加载失败"
                action={
                  <Button onClick={() => void history.refetch()}>重试</Button>
                }
              />
            )}
            <List
              loading={history.isPending}
              dataSource={history.data?.pages.flat() ?? []}
              renderItem={(publication) => (
                <List.Item
                  actions={
                    canPublish
                      ? [
                          <Button
                            key="select"
                            disabled={pending || uncertain || blocked}
                            onClick={() => setSelected(publication)}
                          >
                            {selected?.id === publication.id
                              ? "已选择"
                              : "选择回退"}
                          </Button>
                        ]
                      : []
                  }
                >
                  <Space orientation="vertical">
                    <Typography.Text>
                      版本 {publication.publication_number} ·{" "}
                      {new Date(publication.published_at).toLocaleString(
                        "zh-CN"
                      )}
                    </Typography.Text>
                    <V3EnglishTextPreview
                      value={publication.snapshot.sentence.en_text}
                      hideCommonDialect
                    />
                  </Space>
                </List.Item>
              )}
            />
            {history.hasNextPage && (
              <Button
                loading={history.isFetchingNextPage}
                onClick={() => void history.fetchNextPage()}
              >
                加载更早历史
              </Button>
            )}
          </>
        )}
        {error && <Alert type="error" title={error} />}
      </Space>
    </Modal>
  );
}
