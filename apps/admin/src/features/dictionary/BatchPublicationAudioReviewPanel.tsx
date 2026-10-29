import { Alert, Button, Card, List, Space, Typography } from "antd";
import { useEffect, useRef, useState } from "react";
import { HttpError } from "@tsz/api-client";
import type { PublicationAudioReview } from "@tsz/types";
import { api } from "@/lib/auth";
import { publicationAudioIssueLabels } from "./PublicationAudioReviewPanel";
import {
  usePublicationAudioPlayback,
  type PublicationAudioResolver
} from "./usePublicationAudioPlayback";

export interface PublicationAudioTarget {
  owner: "entry" | "sentence";
  id: string;
  revision: number;
  lifecycleRevision: number;
  label: string;
}
export function publicationAudioScope(
  targets: readonly PublicationAudioTarget[]
) {
  return JSON.stringify(
    targets.map(({ owner, id, revision, lifecycleRevision }) => [
      owner,
      id,
      revision,
      lifecycleRevision
    ])
  );
}
type Requests = typeof api.words.publicationAudio;
interface Props {
  targets: PublicationAudioTarget[];
  allowed: boolean;
  locked: boolean;
  onStart: () => void;
  onReady: (ready: boolean) => void;
  requestsFor?: (target: PublicationAudioTarget) => Requests;
  resolveAudio?: PublicationAudioResolver;
}
interface Row {
  target: PublicationAudioTarget;
  review?: PublicationAudioReview;
  error?: string;
  retry?: "check" | "confirm";
  legacyService?: boolean;
}
const endpoints = (target: PublicationAudioTarget) =>
  target.owner === "entry"
    ? api.words.publicationAudio
    : api.sentences.publicationAudio;
const complete = (row: Row) =>
  !row.error &&
  (row.legacyService ||
    (row.review?.manifest.ready &&
      (row.review.confirmed || row.review.manifest.items.length === 0)));
function matches(
  target: PublicationAudioTarget,
  review: PublicationAudioReview
) {
  return (
    review.manifest.revision === target.revision &&
    (target.owner === "entry"
      ? "entry" in review.manifest.owner &&
        review.manifest.owner.entry === target.id
      : "sentence" in review.manifest.owner &&
        review.manifest.owner.sentence === target.id)
  );
}

export function BatchPublicationAudioReviewPanel(props: Props) {
  return <BatchReview key={publicationAudioScope(props.targets)} {...props} />;
}

function BatchReview({
  targets,
  allowed,
  locked,
  onStart,
  onReady,
  requestsFor = endpoints,
  resolveAudio
}: Props) {
  const [rows, setRows] = useState<Row[]>(() =>
    targets.map((target) => ({ target }))
  );
  const [busy, setBusy] = useState<"check" | "confirm">();
  const [playError, setPlayError] = useState<string>();
  const request = useRef<AbortController | null>(null);
  const readyCallback = useRef(onReady);
  readyCallback.current = onReady;
  const seenAssets = new Set<string>();
  const pendingAudio = rows
    .flatMap((row) =>
      row.review?.manifest.ready &&
      !row.review.confirmed &&
      row.retry !== "check"
        ? row.review.manifest.items.map((item) => ({
            item,
            target: row.target
          }))
        : []
    )
    .filter(({ item }) => {
      if (item.issue || !item.asset_id) return true;
      if (seenAssets.has(item.asset_id)) return false;
      seenAssets.add(item.asset_id);
      return true;
    });
  const playback = usePublicationAudioPlayback(
    pendingAudio.map(({ item }) => item),
    (message) => {
      setPlayError(message);
      readyCallback.current(false);
    },
    resolveAudio
  );
  const { stop } = playback;
  useEffect(() => {
    readyCallback.current(false);
    return () => {
      request.current?.abort();
      stop();
    };
  }, [stop]);
  useEffect(() => {
    if (locked) stop();
  }, [locked, stop]);
  const validScope = targets.length > 0 && targets.length <= 50;
  const canConfirm =
    validScope &&
    rows.every((row) => row.review?.manifest.ready && row.retry !== "check") &&
    rows.some((row) => !complete(row));

  async function run(mode: "check" | "confirm") {
    if (
      !allowed ||
      locked ||
      busy ||
      request.current ||
      !validScope ||
      (mode === "confirm" && (!canConfirm || playError))
    )
      return;
    const controller = new AbortController();
    request.current = controller;
    onStart();
    readyCallback.current(false);
    stop();
    setPlayError(undefined);
    setBusy(mode);
    const next = rows.map((row) => ({ ...row }));
    try {
      // The frozen selection is bounded at 50. Serial calls avoid a burst of
      // database/object probes and retain successful receipts on partial failure.
      for (let index = 0; index < next.length; index++) {
        const row = next[index]!;
        if (complete(row) && !(mode === "check" && row.legacyService)) continue;
        try {
          const endpoint = requestsFor(row.target);
          const result =
            mode === "check"
              ? await endpoint.check(
                  row.target.id,
                  { base_revision: row.target.revision },
                  controller.signal
                )
              : await endpoint.confirm(
                  row.target.id,
                  {
                    base_revision: row.target.revision,
                    manifest_hash: row.review!.manifest.manifest_hash
                  },
                  controller.signal
                );
          if (controller.signal.aborted) return;
          if (
            !matches(row.target, result) ||
            (mode === "confirm" &&
              (!result.manifest.ready ||
                !result.confirmed ||
                !result.receipt_id ||
                result.manifest.manifest_hash !==
                  row.review!.manifest.manifest_hash))
          )
            throw new Error("返回的音频清单与所选版本不一致，请重新检查");
          next[index] = { target: row.target, review: result };
        } catch (failure) {
          if (controller.signal.aborted) return;
          if (
            mode === "check" &&
            failure instanceof HttpError &&
            failure.status === 404
          ) {
            next[index] = { target: row.target, legacyService: true };
            continue;
          }
          next[index] = {
            ...row,
            error:
              failure instanceof Error
                ? failure.message
                : "音频操作失败，请重试",
            retry:
              mode === "check" ||
              (failure instanceof HttpError && failure.status < 500)
                ? "check"
                : "confirm"
          };
        }
        setRows([...next]);
      }
      readyCallback.current(next.every(complete));
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setBusy(undefined);
    }
  }

  return (
    <Card size="small" title="所选内容的发布音频">
      <Space orientation="vertical" style={{ width: "100%" }}>
        <Typography.Text type="secondary">
          按冻结的版本检查音频。已确认项目直接复用；其余项目集中审听后，一次确认。确认部分成功时会保留结果，正式发布仍须全部通过。
        </Typography.Text>
        <Typography.Text>
          已就绪 {rows.filter(complete).length} / {rows.length} 项
        </Typography.Text>
        {playError && <Alert type="error" showIcon title={playError} />}
        <List
          size="small"
          dataSource={rows}
          renderItem={(row) => (
            <List.Item key={`${row.target.owner}:${row.target.id}`}>
              <Space orientation="vertical" size={0}>
                <Typography.Text strong>{row.target.label}</Typography.Text>
                <Typography.Text
                  type={
                    row.error || (row.review && !row.review.manifest.ready)
                      ? "warning"
                      : "secondary"
                  }
                >
                  {row.legacyService
                    ? "当前服务未提供音频确认，正式发布仍由服务端检查"
                    : (row.error ??
                      (complete(row)
                        ? "音频已就绪"
                        : !row.review
                          ? "尚未检查"
                          : !row.review.manifest.ready
                            ? [
                                ...new Set(
                                  row.review.manifest.items.flatMap((item) =>
                                    item.issue
                                      ? [
                                          publicationAudioIssueLabels[
                                            item.issue
                                          ]
                                        ]
                                      : []
                                  )
                                )
                              ].join("；")
                            : "待集中审听确认"))}
                </Typography.Text>
              </Space>
            </List.Item>
          )}
        />
        <List
          size="small"
          dataSource={pendingAudio}
          renderItem={({ item, target }, index) => (
            <List.Item
              key={`${target.owner}:${target.id}:${item.target_id}:${item.source_path}:${item.setting?.version_id ?? item.setting?.voice_id ?? item.asset_id}`}
              actions={[
                <Button
                  key="play"
                  disabled={locked || !!busy || !!item.issue || !item.asset_id}
                  loading={playback.playing === index}
                  onClick={() => {
                    setPlayError(undefined);
                    void playback.audition([index]);
                  }}
                >
                  试听
                </Button>
              ]}
            >
              <Typography.Text style={{ wordBreak: "break-word" }}>
                {target.label} ·{" "}
                {item.source?.content.text ??
                  item.setting?.version_name ??
                  `音频 ${index + 1}`}
              </Typography.Text>
            </List.Item>
          )}
        />
        <Space wrap>
          <Button
            aria-label="检查所选音频"
            disabled={!allowed || locked || !!busy || !validScope}
            loading={busy === "check"}
            onClick={() => void run("check")}
          >
            检查所选音频
          </Button>
          <Button
            disabled={locked || !!busy || pendingAudio.length === 0}
            onClick={() => {
              setPlayError(undefined);
              void playback.audition(pendingAudio.map((_, index) => index));
            }}
          >
            连续试听待确认音频
          </Button>
          {playback.playing !== undefined && (
            <Button onClick={stop}>停止试听</Button>
          )}
          <Button
            type="primary"
            aria-label="确认所选音频"
            disabled={
              !allowed || locked || !!busy || !canConfirm || !!playError
            }
            loading={busy === "confirm"}
            onClick={() => void run("confirm")}
          >
            确认所选音频
          </Button>
        </Space>
      </Space>
    </Card>
  );
}
