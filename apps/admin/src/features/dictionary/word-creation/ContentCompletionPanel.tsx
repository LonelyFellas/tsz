import {
  Alert,
  App,
  Button,
  Card,
  Space,
  Spin,
  Steps,
  Tag,
  Typography
} from "antd";
import type {
  AdminWordV2,
  ContentCompletionJob,
  ContentCompletionPartition,
  DraftMeaningsStepContent
} from "@tsz/types";
import { useEffect, useRef, useState } from "react";
import {
  useContentCompletionJob,
  useCreateContentCompletionJob,
  useRetryContentCompletionJob
} from "./api";
import { newWordNodeId } from "../word-model/primitives";
import { applyContentCompletion } from "./contentCompletion";

const sessionKey = (wordId: string) => `word-content-completion:${wordId}`;

interface CompletionSession {
  jobId: string;
  baseline: string;
}

function readCompletionSession(wordId: string): CompletionSession | undefined {
  try {
    const stored = window.sessionStorage.getItem(sessionKey(wordId));
    return stored ? (JSON.parse(stored) as CompletionSession) : undefined;
  } catch {
    return undefined;
  }
}

function writeCompletionSession(wordId: string, session: CompletionSession) {
  try {
    window.sessionStorage.setItem(sessionKey(wordId), JSON.stringify(session));
  } catch {
    // The completion remains usable in memory when browser storage is unavailable.
  }
}

interface Props {
  word: AdminWordV2;
  content: DraftMeaningsStepContent;
  readOnly?: boolean;
  onApply: (content: DraftMeaningsStepContent) => void;
}

const statusLabel = {
  pending: "等待生成",
  running: "正在生成",
  completed: "生成完成",
  partial: "部分完成",
  failed: "生成失败"
} as const;

export function ContentCompletionPanel({
  word,
  content,
  readOnly,
  onApply
}: Props) {
  const { message } = App.useApp();
  const initialSession = useRef(readCompletionSession(word.id));
  const [jobId, setJobId] = useState<string | undefined>(
    initialSession.current?.jobId
  );
  const [applySummary, setApplySummary] = useState<string>();
  const baselineRef = useRef<string | undefined>(
    initialSession.current?.baseline
  );
  const startInFlightRef = useRef(false);
  const createJob = useCreateContentCompletionJob(word.id);
  const jobQuery = useContentCompletionJob(word.id, jobId);
  const retryJob = useRetryContentCompletionJob(word.id, jobId);
  const job = jobQuery.data?.job;

  const start = async () => {
    if (startInFlightRef.current) return;
    startInFlightRef.current = true;
    const baseline = JSON.stringify(content);
    baselineRef.current = baseline;
    setApplySummary(undefined);
    try {
      const response = await createJob.mutateAsync({
        idempotency_key: newWordNodeId(),
        base_revision: word.revision,
        scope: ["grammar_structures", "meanings", "examples"],
        fill_policy: "missing_only"
      });
      setJobId(response.job.id);
      writeCompletionSession(word.id, { jobId: response.job.id, baseline });
    } catch (error) {
      message.error(error instanceof Error ? error.message : "自动生成失败");
    } finally {
      startInFlightRef.current = false;
    }
  };

  const apply = () => {
    if (!job) return;
    const result = applyContentCompletion(
      word,
      content,
      job,
      baselineRef.current !== JSON.stringify(content)
    );
    if (!result.ok) {
      message.warning(
        result.reason === "revision_changed"
          ? "词条版本已变化，请基于最新内容重新生成"
          : "生成后表单又有修改，为避免覆盖请重新生成"
      );
      return;
    }
    const applied = result.report.filter(
      (item) => item.outcome === "applied"
    ).length;
    const skipped = result.report.filter(
      (item) => item.outcome === "skipped_existing"
    ).length;
    const failed = result.report.filter(
      (item) => item.outcome === "failed"
    ).length;
    if (applied > 0) onApply(result.content);
    setApplySummary(
      `已回填 ${applied} 个词性，跳过已有内容 ${skipped} 个，拒绝非法结果 ${failed} 个。内容尚未保存。`
    );
  };

  const retry = async () => {
    if (!job) return;
    const posIds = job.partitions
      .filter(
        (partition) =>
          partition.status === "failed" || partition.status === "missing"
      )
      .map((partition) => partition.pos_id);
    if (posIds.length === 0) return;
    baselineRef.current = JSON.stringify(content);
    try {
      await retryJob.mutateAsync({
        idempotency_key: newWordNodeId(),
        pos_ids: posIds
      });
    } catch (error) {
      message.error(error instanceof Error ? error.message : "重试失败");
    }
  };

  if (readOnly) return null;
  const retryable =
    job?.partitions.some(
      (partition) =>
        partition.status === "failed" || partition.status === "missing"
    ) ?? false;
  const applicable =
    job?.result && (job.status === "completed" || job.status === "partial");
  return (
    <Card
      size="small"
      title="自动生成语法、词义与例句"
      style={{ marginBottom: 16 }}
      extra={job ? <Tag>{statusLabel[job.status]}</Tag> : <Tag>按需触发</Tag>}
    >
      <Space orientation="vertical" size={12} style={{ width: "100%" }}>
        <Typography.Text type="secondary">
          生成请求不会自动发起、保存或发布。回填仅补齐空缺节点，已有人工内容会被保留。
        </Typography.Text>
        {!job && (
          <Button
            type="primary"
            loading={createJob.isPending}
            onClick={() => void start()}
          >
            自动生成
          </Button>
        )}
        {job && (
          <>
            <Space wrap>
              {job.partitions.map((partition) => (
                <PartitionTag key={partition.pos_id} partition={partition} />
              ))}
            </Space>
            {(job.status === "pending" || job.status === "running") && (
              <GenerationProgress job={job} />
            )}
            {job.partitions
              .filter((partition) => partition.provenance)
              .slice(0, 1)
              .map((partition) => (
                <Space key={partition.pos_id} orientation="vertical" size={2}>
                  <Typography.Text type="secondary">
                    来源：{partition.provenance!.dictionary.provider} /{" "}
                    {partition.provenance!.dictionary.dataset_version}；生成：
                    {partition.provenance!.generation.provider} /{" "}
                    {partition.provenance!.generation.model} /{" "}
                    {partition.provenance!.generation.prompt_version}
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    来源记录：
                    {partition.provenance!.dictionary.source_record_keys.join(
                      ", "
                    )}
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    内容属性：词义基于词典并由模型翻译；语法结构与 CEFR
                    为模型推断；例句为模型生成。
                  </Typography.Text>
                </Space>
              ))}
            {job.status === "partial" && (
              <Alert
                type="warning"
                showIcon
                title="部分词性生成失败；成功内容仍可安全回填"
              />
            )}
            {job.status === "failed" && (
              <Alert type="error" showIcon title="本次没有可回填的生成结果" />
            )}
            <Space wrap>
              {applicable && (
                <Button type="primary" onClick={apply}>
                  回填空缺内容
                </Button>
              )}
              {retryable && (
                <Button
                  loading={retryJob.isPending}
                  onClick={() => void retry()}
                >
                  重试失败词性
                </Button>
              )}
              {job.status !== "pending" && job.status !== "running" && (
                <Button
                  loading={createJob.isPending}
                  onClick={() => void start()}
                >
                  重新生成
                </Button>
              )}
            </Space>
          </>
        )}
        {jobQuery.isError && (
          <Alert
            type="error"
            showIcon
            title="生成任务状态读取失败"
            action={
              <Button onClick={() => void jobQuery.refetch()}>重试</Button>
            }
          />
        )}
        {applySummary && <Alert type="success" showIcon title={applySummary} />}
      </Space>
    </Card>
  );
}

function GenerationProgress({ job }: { job: ContentCompletionJob }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const startedAt = Date.parse(job.created_at);
  const elapsedSeconds = Math.max(0, Math.floor((now - startedAt) / 1_000));
  const running = job.status === "running";

  return (
    <Alert
      type="info"
      showIcon
      icon={<Spin size="small" />}
      title={running ? "模型正在生成内容" : "任务已提交，等待处理"}
      description={
        <Space orientation="vertical" size={8} style={{ width: "100%" }}>
          <Typography.Text type="secondary">
            已等待 {elapsedSeconds} 秒，通常约 10–30
            秒。本页会自动更新，完成后仍由你确认是否回填。
          </Typography.Text>
          <Steps
            size="small"
            current={running ? 1 : 0}
            items={[
              { title: "读取词典依据" },
              { title: "生成结构化内容" },
              { title: "人工确认回填" }
            ]}
          />
        </Space>
      }
    />
  );
}

function PartitionTag({
  partition
}: {
  partition: ContentCompletionPartition;
}) {
  const color =
    partition.status === "completed"
      ? "success"
      : partition.status === "failed" || partition.status === "missing"
        ? "error"
        : "processing";
  return (
    <Tag color={color} title={partition.error_detail}>
      {partition.pos} · {partition.status}
    </Tag>
  );
}
