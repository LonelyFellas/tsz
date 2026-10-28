import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Select,
  Space,
  Table,
  Tag,
  Typography
} from "antd";
import type {
  AdminProfile,
  CreateQuestionBatch,
  QuestionBatch,
  QuestionBatchPreview,
  QuestionGeneration
} from "@tsz/types";
import { hasAdminPermission } from "@tsz/shared/auth";
import { HttpError } from "@tsz/api-client";
import { api } from "@/lib/auth";
import { canEditQuestion, generationLabels, generationReason } from "./model";

const batchLabels = {
  running: "进行中",
  completed: "已结束",
  cancelled: "已取消"
};
export function BatchPanel({
  profile,
  showQuestion,
  active
}: {
  profile: AdminProfile;
  active: boolean;
  showQuestion: (id: string) => void;
}) {
  const { modal } = App.useApp();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const selected = params.get("batch_id") ?? undefined;
  const [levels, setLevels] = useState(["B1"]);
  const [profiles, setProfiles] = useState(["BrE"]);
  const [preview, setPreview] = useState<QuestionBatchPreview>();
  const [page, setPage] = useState(1);
  const [itemPage, setItemPage] = useState(1);
  const [itemState, setItemState] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [error, setError] = useState("");
  const intent = useRef<CreateQuestionBatch | null>(null);
  const inFlight = useRef(false);
  const canGenerate = hasAdminPermission(profile, "words.edit");
  const key = ["question-bank", profile.id, "batches"];
  const batches = useQuery({
    queryKey: [...key, page],
    enabled: active,
    queryFn: ({ signal }) =>
      api.questionBank.batches({ page, page_size: 20 }, { signal }),
    retry: false,
    refetchInterval: (q) =>
      q.state.data?.items.some((b) => b.state === "running") ? 3000 : false
  });
  const detail = useQuery({
    queryKey: [...key, "detail", selected],
    queryFn: ({ signal }) => api.questionBank.batch(selected!, { signal }),
    enabled: active && !!selected,
    retry: false,
    refetchInterval: (q) => (q.state.data?.state === "running" ? 3000 : false)
  });
  const items = useQuery({
    queryKey: [
      ...key,
      "items",
      selected,
      itemPage,
      itemState,
      detail.data?.state
    ],
    queryFn: ({ signal }) =>
      api.questionBank.batchItems(
        selected!,
        { page: itemPage, page_size: 20, state: itemState },
        { signal }
      ),
    enabled: active && !!selected,
    retry: false,
    refetchInterval: detail.data?.state === "running" ? 3000 : false
  });
  function selectBatch(id: string) {
    const next = new URLSearchParams(params);
    next.set("batch_id", id);
    setParams(next);
    setItemPage(1);
    setItemState(undefined);
  }
  async function loadPreview() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setPreview(undefined);
    try {
      setPreview(
        await api.questionBank.batchPreview({
          question_levels: levels,
          answer_profiles: profiles
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "预览失败。");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function create() {
    if (inFlight.current || (!preview && !intent.current)) return;
    intent.current ??= {
      idempotency_key: crypto.randomUUID(),
      selection: preview!.selection,
      preview_token: preview!.preview_token
    };
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const batch = await api.questionBank.createBatch(intent.current);
      intent.current = null;
      setUnknown(false);
      setPreview(undefined);
      selectBatch(batch.id);
      await client.invalidateQueries({ queryKey: key });
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建批次失败。");
      const definite =
        e instanceof HttpError && e.status < 500 && e.status !== 408;
      setUnknown(!definite);
      if (definite) {
        intent.current = null;
        setPreview(undefined);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function cancel(batch: QuestionBatch) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await api.questionBank.cancelBatch(batch.id);
      await client.invalidateQueries({ queryKey: key });
    } catch (e) {
      setError(e instanceof Error ? e.message : "取消失败，请刷新状态后重试。");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <Space orientation="vertical" size="large" style={{ width: "100%" }}>
      <Card title="全库覆盖预览">
        <Typography.Paragraph type="secondary">
          按每个已发布教学词义、学习等级和英美档位分别补齐一题。自动跳过未发布、归档、非教学及无编辑权限的词条；有效待审核草稿或已通过题目计入覆盖，正在生成的任务也会跳过。失败、候选不足、已退回或停用的题目可再次补齐。
        </Typography.Paragraph>
        <Form layout="inline">
          <Form.Item label="学习等级">
            <Select
              aria-label="批量学习等级"
              mode="multiple"
              value={levels}
              disabled={busy || unknown}
              style={{ minWidth: 240 }}
              options={["A1", "A2", "B1", "B2", "C1", "C2"].map((value) => ({
                value
              }))}
              onChange={(v) => {
                setLevels(v);
                setPreview(undefined);
              }}
            />
          </Form.Item>
          <Form.Item label="英美档位">
            <Select
              aria-label="批量英美档位"
              mode="multiple"
              value={profiles}
              disabled={busy || unknown}
              style={{ minWidth: 180 }}
              options={[
                { value: "BrE", label: "英式 BrE" },
                { value: "AmE", label: "美式 AmE" }
              ]}
              onChange={(v) => {
                setProfiles(v);
                setPreview(undefined);
              }}
            />
          </Form.Item>
          <Form.Item>
            <Button
              disabled={
                !canGenerate || !levels.length || !profiles.length || unknown
              }
              loading={busy}
              onClick={() => void loadPreview()}
            >
              预览全库缺题
            </Button>
          </Form.Item>
        </Form>
        {preview && (
          <>
            <Table
              rowKey={(r) => `${r.question_level}-${r.answer_profile}`}
              dataSource={preview.coverage}
              pagination={false}
              columns={[
                { title: "等级", dataIndex: "question_level" },
                { title: "档位", dataIndex: "answer_profile" },
                { title: "可命题", dataIndex: "eligible" },
                { title: "已有覆盖", dataIndex: "covered" },
                { title: "生成中", dataIndex: "generating" },
                { title: "缺题", dataIndex: "missing" }
              ]}
            />
            <Typography.Paragraph>
              本次实际需生成 {preview.missing} 道待审核草稿。
            </Typography.Paragraph>
          </>
        )}
        <Button
          type="primary"
          aria-label={unknown ? "重试原批次请求" : "开始补齐缺题"}
          loading={busy}
          disabled={!canGenerate || (!unknown && !preview?.missing)}
          onClick={() => {
            if (unknown) {
              void create();
              return;
            }
            modal.confirm({
              title: `创建批次并生成 ${preview!.missing} 道草稿？`,
              content:
                "生成会调用命题服务并可能产生模型费用。仅补齐当前缺题，所有结果仍须人工审核。词库或覆盖情况变化时将要求重新预览。",
              okText: "开始批量命题",
              cancelText: "返回预览",
              onOk: () => create()
            });
          }}
        >
          {unknown ? "重试原批次请求" : "开始补齐缺题"}
        </Button>
        {unknown && (
          <Alert
            type="warning"
            title="批次请求结果尚未确认，选择已锁定；请重试原请求，幂等键会避免重复创建。"
          />
        )}
        {!canGenerate && (
          <Typography.Paragraph type="secondary">
            需要词条编辑权限才能预览和创建批次。
          </Typography.Paragraph>
        )}
      </Card>
      {error && <Alert type="error" showIcon title={error} />}
      <Card
        title="批次记录"
        extra={
          <Button
            onClick={() => void client.invalidateQueries({ queryKey: key })}
          >
            刷新批次
          </Button>
        }
      >
        {batches.isError ? (
          <Alert type="error" title={batches.error.message} />
        ) : (
          <Table<QuestionBatch>
            rowKey="id"
            dataSource={batches.data?.items ?? []}
            loading={batches.isFetching}
            scroll={{ x: 800 }}
            pagination={{
              current: page,
              pageSize: 20,
              total: batches.data?.pagination.total ?? 0,
              showSizeChanger: false,
              onChange: setPage
            }}
            columns={[
              {
                title: "创建时间",
                render: (_, b) => new Date(b.created_at).toLocaleString("zh-CN")
              },
              {
                title: "等级 / 档位",
                render: (_, b) =>
                  `${b.preview.selection.question_levels.join("、")} / ${b.preview.selection.answer_profiles.join("、")}`
              },
              {
                title: "进度",
                render: (_, b) =>
                  `${b.total - b.queued - b.running} / ${b.total}（草稿 ${b.succeeded}）`
              },
              {
                title: "状态",
                render: (_, b) => <Tag>{batchLabels[b.state]}</Tag>
              },
              {
                title: "操作",
                render: (_, b) => (
                  <Button onClick={() => selectBatch(b.id)}>查看批次</Button>
                )
              }
            ]}
          />
        )}
      </Card>
      {selected && (
        <Card title="批次详情">
          {detail.isError ? (
            <Alert type="error" title={detail.error.message} />
          ) : (
            detail.data && (
              <Space orientation="vertical">
                <Typography.Text>
                  批次 {detail.data.id} · {batchLabels[detail.data.state]}
                </Typography.Text>
                <Typography.Paragraph>
                  总计 {detail.data.total}；排队 {detail.data.queued}；执行中{" "}
                  {detail.data.running}；已生成草稿 {detail.data.succeeded}
                  ；失败 {detail.data.failed}；候选不足{" "}
                  {detail.data.insufficient_candidates}；取消{" "}
                  {detail.data.cancelled}。
                </Typography.Paragraph>
                {detail.data.state === "running" && (
                  <Button
                    danger
                    disabled={
                      busy ||
                      unknown ||
                      !canEditQuestion(profile, detail.data.created_by)
                    }
                    onClick={() =>
                      modal.confirm({
                        title: "取消批次中尚未完成的任务？",
                        content: "已经生成的草稿会保留，仍可人工审核。",
                        okText: "取消批次",
                        cancelText: "继续生成",
                        onOk: () => cancel(detail.data!)
                      })
                    }
                  >
                    取消批次
                  </Button>
                )}
              </Space>
            )
          )}
          <Select
            aria-label="批次任务状态"
            allowClear
            placeholder="全部任务状态"
            value={itemState}
            style={{ width: 180, marginBottom: 16 }}
            options={Object.entries(generationLabels).map(([value, label]) => ({
              value,
              label
            }))}
            onChange={(value) => {
              setItemState(value);
              setItemPage(1);
            }}
          />
          {items.isError ? (
            <Alert type="error" title={items.error.message} />
          ) : (
            <Table<QuestionGeneration>
              rowKey="id"
              dataSource={items.data?.items ?? []}
              loading={items.isFetching}
              scroll={{ x: 750 }}
              pagination={{
                current: itemPage,
                pageSize: 20,
                total: items.data?.pagination.total ?? 0,
                showSizeChanger: false,
                onChange: setItemPage
              }}
              columns={[
                {
                  title: "目标词义",
                  render: (_, g) =>
                    `${g.target.spelling} · ${g.target.definition}`
                },
                {
                  title: "等级 / 档位",
                  render: (_, g) => `${g.question_level} / ${g.answer_profile}`
                },
                {
                  title: "状态与原因",
                  render: (_, g) => (
                    <Space orientation="vertical">
                      <Tag>{generationLabels[g.state]}</Tag>
                      {generationReason(g)}
                    </Space>
                  )
                },
                {
                  title: "操作",
                  render: (_, g) =>
                    g.question_id && (
                      <Button
                        type="link"
                        onClick={() => showQuestion(g.question_id!)}
                      >
                        预览审核
                      </Button>
                    )
                }
              ]}
            />
          )}
        </Card>
      )}
    </Space>
  );
}
