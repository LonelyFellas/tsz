import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLexiconEditorTranslation } from "@/features/dictionary/i18n/editor";
import { HttpError } from "@tsz/api-client";
import type {
  NextPublication,
  NextPublicationIssue,
  NextPublicationBase,
  NextPublicationPreview,
  NextPublicationState,
  NextPublishInput
} from "@tsz/types";
import { Alert, Button, PageHeader, Space, Tag } from "@tsz/ui/admin/display";
import type { LexiconNextRequests } from "@/pages/LexiconNext";

function publicationStateFromRefresh(
  value: unknown
): NextPublicationState | undefined {
  if (!value || typeof value !== "object" || !("data" in value))
    return undefined;
  const data = value.data;
  return data && typeof data === "object"
    ? (data as NextPublicationState)
    : undefined;
}

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
  onConflict,
  onLocateIssue,
  saveAction,
  viewingSnapshot = false
}: {
  saveAction?: ReactNode;
  viewingSnapshot?: boolean;
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
  onLocateIssue?: (issue: NextPublicationIssue) => void;
}) {
  const { t } = useLexiconEditorTranslation();
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
      if (failure instanceof HttpError && failure.status === 409 && command) {
        const refreshed = await onRefresh().catch(() => undefined);
        const refreshedState = publicationStateFromRefresh(refreshed);
        const confirmed =
          refreshedState &&
          refreshedState.status === "published" &&
          refreshedState.lifecycle_revision > input.base_lifecycle_revision &&
          !refreshedState.has_unpublished_changes &&
          refreshedState.current?.revision === input.base_revision;
        if (confirmed && refreshedState.current) {
          try {
            await onPublished(refreshedState.current);
            setCommand(undefined);
            setPreview(undefined);
            setError(undefined);
            return;
          } catch {
            // Keep the original command when reconciliation itself is uncertain.
          }
        }
      }
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
    <div className="lexicon-publication">
      <PageHeader
        title={t("review_title")}
        actions={
          !viewingSnapshot && (
            <>
              {!dirty && saveAction}
              <Button
                type={
                  dirty || preview?.can_publish || command
                    ? "default"
                    : "primary"
                }
                disabled={!ready || pending || !!command}
                loading={pending && !command}
                onClick={() => void check()}
              >
                检查发布
              </Button>
              {dirty && saveAction}
            </>
          )
        }
      >
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
      </PageHeader>
      {!viewingSnapshot && dirty && (
        <Alert type="warning" title="请先保存完整草稿，再检查发布。" />
      )}
      {!viewingSnapshot && !canPublish && (
        <Alert
          type="info"
          title="发布需要本人词条的发布权限，或超级管理员权限。"
        />
      )}
      {!viewingSnapshot && error && <Alert type="error" title={error} />}
      {!viewingSnapshot && (preview || command) && (
        <div role="region" aria-label="发布检查结果">
          {!!preview?.issues.length && (
            <Alert
              type="error"
              title="请补齐以下内容后重新检查"
              description={
                <ul>
                  {preview.issues.map((issue, index) => (
                    <li key={`${issue.node_id}:${issue.field}:${index}`}>
                      {onLocateIssue ? (
                        <Button
                          type="link"
                          onClick={() => onLocateIssue(issue)}
                        >
                          {issue.message}
                        </Button>
                      ) : (
                        issue.message
                      )}
                    </li>
                  ))}
                </ul>
              }
            />
          )}
          {!!preview?.warnings.length && (
            <Alert
              type="warning"
              title={
                preview.warnings.some(
                  (issue) =>
                    issue.field === "audio_assets" ||
                    issue.message.includes("音频")
                )
                  ? "音频未就绪，将按文本发布"
                  : "发布提醒"
              }
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
          {preview?.can_publish && (
            <Alert
              type="success"
              showIcon
              title={`检查通过，将发布已保存的草稿版本 ${preview.revision}。`}
            />
          )}
          {/* 确认操作放在检查结果之后，避免检查返回时承接同一位置的第二次点击。 */}
          {(preview?.can_publish || command) && (
            <Button
              className="lexicon-review-confirm"
              loading={pending && !!command}
              disabled={pending || (!command && (!ready || !canPublish))}
              onClick={() => void publish()}
            >
              {command ? "重试确认发布结果" : "确认发布"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
