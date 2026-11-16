import { useEffect, useRef, useState } from "react";
import { HttpError } from "@tsz/api-client";
import type {
  NextPublication,
  NextPublicationBase,
  NextPublicationPreview,
  NextPublicationState,
  NextPublishInput
} from "@tsz/types";
import { Alert, Button, Card, Space, Tag } from "@tsz/ui/admin/display";
import type { LexiconNextRequests } from "@/pages/LexiconNext";

export function PublicationPanel({
  entryId,
  revision,
  state,
  loading,
  stateError,
  dirty,
  disabled,
  canPublish,
  requests,
  onBusyChange,
  onRefresh,
  onPublished,
  onConflict
}: {
  entryId: string;
  revision: number;
  state?: NextPublicationState;
  loading: boolean;
  stateError: unknown;
  dirty: boolean;
  disabled: boolean;
  canPublish: boolean;
  requests: Pick<LexiconNextRequests, "publicationPreview" | "publish">;
  onBusyChange: (busy: boolean) => void;
  onRefresh: () => Promise<unknown>;
  onPublished: (result: NextPublication) => Promise<void>;
  onConflict: () => void;
}) {
  const [preview, setPreview] = useState<NextPublicationPreview>();
  const [command, setCommand] = useState<NextPublishInput>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const lock = useRef(false);
  const base: NextPublicationBase | undefined = state && {
    base_revision: revision,
    base_lifecycle_revision: state.lifecycle_revision
  };
  useEffect(() => {
    setPreview(undefined);
  }, [dirty, revision, state?.lifecycle_revision]);
  useEffect(() => {
    onBusyChange(pending || !!command);
  }, [pending, command, onBusyChange]);
  const ready =
    canPublish && !disabled && !dirty && !loading && !stateError && !!base;

  async function check() {
    if (lock.current || !ready || !base) return;
    lock.current = true;
    setPending(true);
    setError(undefined);
    setPreview(undefined);
    try {
      setPreview(await requests.publicationPreview(entryId, base));
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "发布检查失败，请重试。"
      );
      if (failure instanceof HttpError && failure.status === 409) onConflict();
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  async function publish() {
    if (lock.current || (!canPublish && !command)) return;
    if (!command && (!ready || !preview?.can_publish || !base)) return;
    const input = command ?? {
      ...base!,
      request_id: crypto.randomUUID(),
      preview_token: preview!.preview_token
    };
    lock.current = true;
    setPending(true);
    setCommand(input);
    setError(undefined);
    try {
      const result = await requests.publish(entryId, input);
      await onPublished(result);
      setCommand(undefined);
      setPreview(undefined);
    } catch (failure) {
      const definitive = failure instanceof HttpError && failure.status < 500;
      if (definitive) {
        setCommand(undefined);
        setPreview(undefined);
        if (failure.status === 409) onConflict();
      }
      setError(
        definitive
          ? failure.message
          : "发布结果尚未确认。请重试确认结果，期间保留当前内容。"
      );
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <Card title={<h2>发布</h2>}>
      {stateError ? (
        <Alert
          type="error"
          title="无法读取发布状态"
          description={
            stateError instanceof Error ? stateError.message : "请求失败"
          }
          action={<Button onClick={() => void onRefresh()}>重试</Button>}
        />
      ) : loading ? (
        <p role="status">正在读取发布状态</p>
      ) : (
        <Space wrap>
          <Tag color={state?.status === "published" ? "success" : "default"}>
            {state?.status === "published"
              ? "已发布"
              : state?.status === "archived"
                ? "已归档"
                : "未发布"}
          </Tag>
          {state?.current && (
            <span>已发布草稿版本 {state.current.revision}</span>
          )}
          {state?.current && state.has_unpublished_changes && (
            <Tag color="warning">有未发布修改</Tag>
          )}
        </Space>
      )}
      {dirty && <Alert type="warning" title="请先保存完整草稿，再检查发布。" />}
      {!canPublish && (
        <Alert
          type="info"
          title="发布需要本人词条的发布权限，或超级管理员权限。"
        />
      )}
      {error && <Alert type="error" title={error} />}
      {preview && (
        <div role="region" aria-label="发布检查结果">
          {preview.issues.length > 0 && (
            <Alert
              type="error"
              title="请补齐以下内容后重新检查"
              description={
                <ul>
                  {preview.issues.map((issue, index) => (
                    <li key={`${issue.node_id}:${issue.field}:${index}`}>
                      {issue.message}
                    </li>
                  ))}
                </ul>
              }
            />
          )}
          {preview.warnings.length > 0 && (
            <Alert
              type="warning"
              title="发布提醒"
              description={
                <ul>
                  {[
                    ...new Set(preview.warnings.map((issue) => issue.message))
                  ].map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              }
            />
          )}
          {preview.can_publish && (
            <p>将发布已保存的草稿版本 {preview.revision}。</p>
          )}
        </div>
      )}
      <Space wrap>
        <Button
          disabled={!ready || pending || !!command}
          loading={pending && !command}
          onClick={() => void check()}
        >
          检查发布
        </Button>
        {(preview?.can_publish || command) && (
          <Button
            type="primary"
            loading={pending && !!command}
            disabled={pending || (!command && (!ready || !canPublish))}
            onClick={() => void publish()}
          >
            {pending ? "正在发布" : command ? "重试确认发布结果" : "确认发布"}
          </Button>
        )}
      </Space>
    </Card>
  );
}
