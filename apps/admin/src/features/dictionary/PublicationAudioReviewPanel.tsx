import { Alert, Button, Card, List, Space, Tag, Typography } from "antd";
import { SoundOutlined } from "@ant-design/icons";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PublicationAudioIssue,
  PublicationAudioRequirement,
  PublicationAudioReview
} from "@tsz/types";
import { api } from "@/lib/auth";
import { HttpError } from "@tsz/api-client";
import {
  usePublicationAudioPlayback,
  type PublicationAudioResolver
} from "./usePublicationAudioPlayback";

type Requests = typeof api.words.publicationAudio;
interface Props {
  owner: "entry" | "sentence";
  id: string;
  revision: number;
  canConfirm: boolean;
  content?: unknown;
  onReady: (ready: boolean) => void;
  requests?: Requests;
  resolveAudio?: PublicationAudioResolver;
}

export const publicationAudioIssueLabels: Record<
  PublicationAudioIssue,
  string
> = {
  missing_configuration: "尚未选择发音配置",
  missing_asset: "已选音色尚未生成正式音频",
  invalid_source: "读法或声音配置已失效",
  asset_unavailable: "音频不可用或尚未保存到当前内容",
  effect_mismatch: "音频与当前读法或声音配置不一致",
  object_unavailable: "音频文件暂时无法读取"
};
const accentLabels = { uk: "英式", us: "美式", other: "其他" };

export function PublicationAudioReviewPanel(props: Props) {
  return (
    <ReviewPanel
      key={`${props.owner}:${props.id}:${props.revision}`}
      {...props}
    />
  );
}

function ReviewPanel({
  owner,
  id,
  revision,
  canConfirm,
  content,
  onReady,
  requests,
  resolveAudio
}: Props) {
  const endpoint =
    requests ??
    (owner === "entry"
      ? api.words.publicationAudio
      : api.sentences.publicationAudio);
  const [review, setReview] = useState<PublicationAudioReview>();
  const [busy, setBusy] = useState(false);
  const [legacyService, setLegacyService] = useState(false);
  const [error, setError] = useState<string>();
  const request = useRef<AbortController | null>(null);
  const readyCallback = useRef(onReady);
  readyCallback.current = onReady;

  const seenAssets = new Set<string>();
  const items = (review?.manifest.items ?? []).filter((item) => {
    if (item.issue || !item.asset_id) return true;
    if (seenAssets.has(item.asset_id)) return false;
    seenAssets.add(item.asset_id);
    return true;
  });
  const playback = usePublicationAudioPlayback(
    items,
    (message) => {
      readyCallback.current(false);
      setError(message);
    },
    resolveAudio
  );
  const { stop, playing } = playback;

  const load = useCallback(async () => {
    request.current?.abort();
    stop();
    const controller = new AbortController();
    request.current = controller;
    readyCallback.current(false);
    setBusy(true);
    setLegacyService(false);
    setReview(undefined);
    setError(undefined);
    try {
      const result = await endpoint.check(
        id,
        { base_revision: revision },
        controller.signal
      );
      if (controller.signal.aborted) return;
      if (
        result.manifest.revision !== revision ||
        (owner === "entry"
          ? !("entry" in result.manifest.owner) ||
            result.manifest.owner.entry !== id
          : !("sentence" in result.manifest.owner) ||
            result.manifest.owner.sentence !== id)
      ) {
        throw new Error("音频清单与当前内容不一致，请重新检查");
      }
      setReview(result);
      readyCallback.current(
        result.manifest.ready &&
          (result.confirmed || result.manifest.items.length === 0)
      );
    } catch (failure) {
      // Frontend-first rollout: an older API has no review endpoint. Its final
      // publication endpoint remains authoritative; a new API always enforces receipts.
      if (
        !controller.signal.aborted &&
        failure instanceof HttpError &&
        failure.status === 404
      ) {
        setLegacyService(true);
        readyCallback.current(true);
        return;
      }
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error ? failure.message : "音频检查失败，请重试"
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }, [endpoint, id, revision, owner, stop]);

  useEffect(() => {
    void load();
    return () => {
      request.current?.abort();
      stop();
    };
  }, [load, stop]);

  async function confirm() {
    if (!canConfirm || busy || !review?.manifest.ready) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    readyCallback.current(false);
    setBusy(true);
    setError(undefined);
    try {
      const result = await endpoint.confirm(
        id,
        {
          base_revision: revision,
          manifest_hash: review.manifest.manifest_hash
        },
        controller.signal
      );
      if (controller.signal.aborted) return;
      if (
        result.manifest.revision !== revision ||
        result.manifest.manifest_hash !== review.manifest.manifest_hash ||
        !result.confirmed ||
        !result.manifest.ready ||
        !result.receipt_id ||
        (owner === "entry"
          ? !("entry" in result.manifest.owner) ||
            result.manifest.owner.entry !== id
          : !("sentence" in result.manifest.owner) ||
            result.manifest.owner.sentence !== id)
      ) {
        throw new Error("音频清单已变化，请重新检查并审听");
      }
      setReview(result);
      readyCallback.current(true);
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error ? failure.message : "音频确认失败，请重试"
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const audition = (indices: number[]) => {
    setError(undefined);
    return playback.audition(indices);
  };

  const ready =
    review?.manifest.ready && (review.confirmed || items.length === 0);
  return (
    <Card size="small" title="发布音频">
      <Space orientation="vertical" style={{ width: "100%" }}>
        <Typography.Text type="secondary">
          集中审听当前正式音频后，一次确认本批。修改内容或声音后需重新检查。
        </Typography.Text>
        {error && <Alert type="error" showIcon title={error} />}
        {legacyService && (
          <Alert
            type="info"
            showIcon
            title="当前服务版本尚未提供音频确认"
            description="此过渡版本继续由服务端执行发布检查。服务升级后，请重新检查并确认音频。"
          />
        )}
        {review && !review.manifest.ready && (
          <Alert
            type="warning"
            showIcon
            title="仍有音频待完成"
            description="请返回对应内容选择读法和音色，生成并保存正式音频后重新检查。"
          />
        )}
        {ready && (
          <Tag color="success">
            {items.length ? "本批音频已确认" : "没有需要确认的配音版本"}
          </Tag>
        )}
        <List
          size="small"
          dataSource={items}
          renderItem={(item, index) => (
            <List.Item
              key={`${item.target_id}:${item.source_path}:${item.setting ? `voice:${item.setting.version_id ?? item.setting.voice_id}` : (item.asset_id ?? `default:${item.default_for.join(",")}`)}`}
              actions={[
                <Button
                  key="play"
                  icon={<SoundOutlined />}
                  aria-label={`试听第 ${index + 1} 条正式音频`}
                  disabled={busy || !!item.issue || !item.asset_id}
                  loading={playing === index}
                  onClick={() => void audition([index])}
                >
                  试听
                </Button>
              ]}
            >
              <Space
                orientation="vertical"
                size={0}
                style={{ minWidth: 0, flex: 1, wordBreak: "break-word" }}
              >
                <Typography.Text>
                  {publicationAudioText(content, item) || `音频 ${index + 1}`}{" "}
                  {item.setting?.version_name ?? item.setting?.voice_id ?? ""}
                </Typography.Text>
                <Typography.Text type={item.issue ? "warning" : "secondary"}>
                  {item.default_for.map((a) => accentLabels[a]).join(" / ") ||
                    (item.setting?.locale === "en-GB"
                      ? "英式"
                      : item.setting?.locale === "en-US"
                        ? "美式"
                        : "已选正式音频")}
                  {item.issue
                    ? ` · ${publicationAudioIssueLabels[item.issue]}`
                    : ""}
                </Typography.Text>
              </Space>
            </List.Item>
          )}
        />
        <Space wrap>
          <Button
            aria-label="重新检查音频"
            loading={busy}
            onClick={() => void load()}
          >
            重新检查音频
          </Button>
          <Button
            disabled={
              busy || !items.some((item) => item.asset_id && !item.issue)
            }
            onClick={() => void audition(items.map((_, index) => index))}
          >
            连续试听
          </Button>
          {playing !== undefined && <Button onClick={stop}>停止试听</Button>}
          {canConfirm && !ready && (
            <Button
              type="primary"
              disabled={busy || !!error || !review?.manifest.ready}
              onClick={() => void confirm()}
            >
              确认本批音频
            </Button>
          )}
        </Space>
      </Space>
    </Card>
  );
}

// Match business IDs so shared bindings and reordered arrays keep the same label.
export function publicationAudioText(
  content: unknown,
  item: PublicationAudioRequirement
): string | undefined {
  if (item.source?.content.text) return item.source.content.text;
  function find(value: unknown, spelling?: string): string | undefined {
    if (!value || typeof value !== "object") return undefined;
    if (Array.isArray(value)) {
      for (const child of value) {
        const found = find(child, spelling);
        if (found) return found;
      }
      return undefined;
    }
    const row = value as Record<string, unknown>;
    const text = typeof row.spelling === "string" ? row.spelling : spelling;
    if (row.id === item.target_id && text) return text;
    for (const [key, child] of Object.entries(row)) {
      if (key === "regional_bindings" || key === "pronunciation_slots")
        continue;
      const found = find(child, text);
      if (found) return found;
    }
    return undefined;
  }
  return find(content);
}
