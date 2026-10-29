import {
  AdminTable as Table,
  AdminTableToolbar
} from "@/components/AdminTable";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  Alert,
  App,
  Button,
  Card,
  Empty,
  Flex,
  Form,
  Input,
  Select,
  Space,
  Tabs,
  Tag,
  Typography
} from "antd";
import type {
  AdminProfile,
  CreateQuestionGeneration,
  QuestionCandidate,
  QuestionGeneration
} from "@tsz/types";
import { hasAdminPermission } from "@tsz/shared/auth";
import { HttpError } from "@tsz/api-client";
import { api } from "@/lib/auth";
import {
  candidateReference,
  canEditQuestion,
  generationLabels,
  generationReason
} from "./model";
import { BatchPanel } from "./BatchPanel";

export function GenerationTools({
  profile,
  active,
  initialTab,
  showQuestion,
  showQuestions
}: {
  profile: AdminProfile;
  active: boolean;
  initialTab: "generate" | "batches" | "generations";
  showQuestion: (id: string) => void;
  showQuestions?: (items: QuestionGeneration[]) => void;
}) {
  const { modal, message } = App.useApp();
  const [params, setParams] = useSearchParams();
  const client = useQueryClient();
  const [tab, setTab] = useState<string>(
    params.has("batch_id") ? "batches" : initialTab
  );
  const [level, setLevel] = useState(params.get("question_level") ?? "B1");
  const [answerProfile, setAnswerProfile] = useState(
    params.get("answer_profile") ?? "BrE"
  );
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<QuestionCandidate | null>(null);
  const [candidatePage, setCandidatePage] = useState(1);
  const [generationPage, setGenerationPage] = useState(1);
  const [activeGeneration, setActiveGeneration] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [error, setError] = useState("");
  const intent = useRef<CreateQuestionGeneration | null>(null);
  const inFlight = useRef(false);
  const canGenerate = hasAdminPermission(profile, "words.edit");
  const locked = busy || unknown;
  const contextKey = JSON.stringify([
    params.get("entry_id"),
    params.get("question_level"),
    params.get("answer_profile")
  ]);
  const [sourceContext, setSourceContext] = useState(contextKey);
  const entryId =
    locked && intent.current
      ? intent.current.target.source.entry_id
      : (params.get("entry_id") ?? undefined);
  useEffect(() => {
    if (!locked && contextKey !== sourceContext) {
      const [, nextLevel, nextProfile] = JSON.parse(contextKey) as (
        string | null
      )[];
      setTarget(null);
      setCandidatePage(1);
      setSourceContext(contextKey);
      if (nextLevel) setLevel(nextLevel);
      if (nextProfile) setAnswerProfile(nextProfile);
    }
  }, [contextKey, sourceContext, locked]);
  useEffect(() => {
    if (active) setTab(initialTab);
  }, [active, initialTab]);
  const candidates = useQuery({
    queryKey: [
      "question-bank",
      profile.id,
      "candidates",
      entryId,
      search,
      level,
      answerProfile,
      candidatePage
    ],
    enabled:
      active &&
      canGenerate &&
      tab === "generate" &&
      (locked || sourceContext === contextKey),
    queryFn: ({ signal }) =>
      api.questionBank.searchCandidates(
        {
          editable_only: true,
          page: candidatePage,
          page_size: 20,
          entry_id: entryId,
          query: search,
          question_level: level,
          answer_profile: answerProfile
        },
        { signal }
      ),
    retry: false
  });
  const generations = useQuery({
    queryKey: ["question-bank", profile.id, "generations", generationPage],
    queryFn: ({ signal }) =>
      api.questionBank.generations(
        { page: generationPage, page_size: 20 },
        { signal }
      ),
    enabled: active && tab === "generations",
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.items.some(
        (g) => active && ["queued", "running"].includes(g.state)
      )
        ? 3000
        : false
  });
  const generation = useQuery({
    queryKey: ["question-bank", profile.id, "generation", activeGeneration],
    queryFn: ({ signal }) =>
      api.questionBank.generation(activeGeneration!, { signal }),
    enabled: active && !!activeGeneration,
    retry: false,
    refetchInterval: (query) =>
      active &&
      query.state.data &&
      ["queued", "running"].includes(query.state.data.state)
        ? 2000
        : false
  });
  function changeContext(update: () => void) {
    setTarget(null);
    setCandidatePage(1);
    update();
  }
  async function generate() {
    if (!canGenerate || inFlight.current || (!intent.current && !target))
      return;
    intent.current ??= {
      idempotency_key: crypto.randomUUID(),
      target: candidateReference(target!),
      question_level: level,
      answer_profile: answerProfile
    };
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api.questionBank.generate(intent.current);
      setActiveGeneration(result.id);
      client.setQueryData(
        ["question-bank", profile.id, "generation", result.id],
        result
      );
      intent.current = null;
      setUnknown(false);
      await client.invalidateQueries({
        queryKey: ["question-bank", profile.id, "generations"]
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "生成请求失败。");
      const definite =
        cause instanceof HttpError &&
        cause.status < 500 &&
        cause.status !== 408;
      setUnknown(!definite);
      if (definite) intent.current = null;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function cancel(item: QuestionGeneration) {
    if (inFlight.current || !canEditQuestion(profile, item.created_by)) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api.questionBank.cancel(item.id, {
        expected_revision: item.revision
      });
      client.setQueryData(
        ["question-bank", profile.id, "generation", item.id],
        result
      );
      await client.invalidateQueries({
        queryKey: ["question-bank", profile.id, "generations"]
      });
      message.success("已取消生成。");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "取消失败，请刷新状态后重试。"
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const generationActions = (item: QuestionGeneration) => (
    <Space>
      {item.question_id && (
        <Button type="link" onClick={() => showQuestion(item.question_id!)}>
          预览审核
        </Button>
      )}
      {["queued", "running"].includes(item.state) && (
        <Button
          disabled={busy || !canEditQuestion(profile, item.created_by)}
          onClick={() => void cancel(item)}
        >
          取消生成
        </Button>
      )}
    </Space>
  );
  const candidateToolbar = entryId && (
    <Space>
      <Tag>当前词条的已发布词义</Tag>
      <Button
        size="small"
        disabled={locked}
        onClick={() =>
          changeContext(() => {
            const next = new URLSearchParams(params);
            next.delete("entry_id");
            next.set("question_level", level);
            next.set("answer_profile", answerProfile);
            setParams(next);
          })
        }
      >
        查看整个词库
      </Button>
    </Space>
  );
  const generationsToolbar = (
    <Button onClick={() => void generations.refetch()}>刷新</Button>
  );

  return (
    <Flex vertical gap={16} style={{ width: "100%" }}>
      <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
        命题词义与四个选项仅来自已发布的智能词库。生成只产生草稿，人工审核通过且来源有效后才用于学习。
      </Typography.Paragraph>
      <Tabs
        tabBarStyle={{ marginBottom: 0 }}
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: "generate", label: "单词义命题" },
          { key: "batches", label: "全库批量命题" },
          { key: "generations", label: "生成任务" }
        ]}
      />
      <section
        hidden={tab !== "generate"}
        aria-hidden={tab !== "generate"}
        inert={tab !== "generate"}
      >
        <Card title="选择命题词义">
          <Form layout="vertical" disabled={locked}>
            <Flex gap={16} wrap>
              <Form.Item label="题目等级">
                <Select
                  aria-label="题目等级"
                  value={level}
                  style={{ width: 150 }}
                  options={["A1", "A2", "B1", "B2", "C1", "C2"].map(
                    (value) => ({ value })
                  )}
                  onChange={(value) => changeContext(() => setLevel(value))}
                />
              </Form.Item>
              <Form.Item label="英美档位">
                <Select
                  aria-label="英美档位"
                  value={answerProfile}
                  style={{ width: 150 }}
                  options={[
                    { value: "BrE", label: "英式英语" },
                    { value: "AmE", label: "美式英语" }
                  ]}
                  onChange={(value) =>
                    changeContext(() => setAnswerProfile(value))
                  }
                />
              </Form.Item>
              <Form.Item
                label="查找已发布词义"
                style={{ flex: 1, minWidth: 220 }}
              >
                <Input.Search
                  aria-label="查找已发布词义"
                  placeholder="输入英文或中文释义"
                  allowClear
                  onSearch={(value) => changeContext(() => setSearch(value))}
                  loading={candidates.isFetching}
                />
              </Form.Item>
            </Flex>
          </Form>

          {candidates.isError ? (
            <>
              <AdminTableToolbar>{candidateToolbar}</AdminTableToolbar>
              <Alert
                type="error"
                showIcon
                title={candidates.error.message}
                action={
                  <Button onClick={() => void candidates.refetch()}>
                    重试
                  </Button>
                }
              />
            </>
          ) : (
            <Table<QuestionCandidate>
              toolbar={candidateToolbar}
              tableId="question-candidates"
              rowKey="candidate_ref"
              dataSource={candidates.data?.items ?? []}
              loading={candidates.isFetching}
              pagination={{
                current: candidatePage,
                disabled: locked,
                pageSize: 20,
                total: candidates.data?.pagination.total ?? 0,
                showSizeChanger: false,
                onChange: (page) => {
                  setTarget(null);
                  setCandidatePage(page);
                }
              }}
              scroll={{ x: 650 }}
              locale={{
                emptyText: (
                  <Empty description="当前等级和档位下没有可命题的已发布词义，请调整条件或先发布词条。" />
                )
              }}
              rowSelection={{
                type: "radio",
                selectedRowKeys: target ? [target.candidate_ref] : [],
                getCheckboxProps: (item) => ({
                  "aria-label": `命题词义 ${item.spelling} · ${item.definition} · ${item.level}`,
                  disabled: locked || !canGenerate || !item.teaching_eligible
                }),
                onChange: (_, rows) => setTarget(rows[0] ?? null)
              }}
              columns={[
                { title: "词条", dataIndex: "spelling" },
                { title: "词性", dataIndex: "part_of_speech" },
                { title: "具体中文释义", dataIndex: "definition" },
                { title: "来源等级", dataIndex: "level" }
              ]}
            />
          )}
          <Space orientation="vertical" style={{ marginTop: 16 }}>
            <Button
              type="primary"
              aria-label={unknown ? "重试原生成请求" : "生成四选一草稿"}
              loading={busy}
              disabled={!canGenerate || (!target && !unknown)}
              onClick={() => {
                if (unknown) {
                  void generate();
                  return;
                }
                modal.confirm({
                  title: "生成四选一草稿？",
                  content:
                    "本次为所选已发布词义生成一道草稿，可能产生模型费用。生成结果仍需人工审核。",
                  okText: "确认生成",
                  cancelText: "返回选择",
                  onOk: generate
                });
              }}
            >
              {unknown ? "重试原生成请求" : "生成四选一草稿"}
            </Button>
            {unknown && (
              <Typography.Text type="secondary">
                请求结果尚未确认；原词义和档位已锁定，重试不会重复创建。
              </Typography.Text>
            )}
            {!canGenerate && (
              <Typography.Text type="secondary">
                需要词条编辑权限才能生成题目。
              </Typography.Text>
            )}
          </Space>
        </Card>
      </section>
      <section
        hidden={tab !== "batches"}
        aria-hidden={tab !== "batches"}
        inert={tab !== "batches"}
      >
        <BatchPanel
          profile={profile}
          showQuestion={showQuestion}
          showQuestions={showQuestions}
          active={active && tab === "batches"}
        />
      </section>
      {activeGeneration && (
        <Card size="small" title="当前生成状态">
          {generation.isError ? (
            <Alert
              type="error"
              title={generation.error.message}
              action={
                <Button onClick={() => void generation.refetch()}>重试</Button>
              }
            />
          ) : (
            generation.data && (
              <Space orientation="vertical">
                <Space>
                  <Tag>{generationLabels[generation.data.state]}</Tag>
                  <Typography.Text>
                    {generation.data.target.spelling} ·{" "}
                    {generation.data.target.definition}
                  </Typography.Text>
                </Space>
                {generationReason(generation.data) && (
                  <Alert
                    type={
                      generation.data.state === "succeeded"
                        ? "warning"
                        : "error"
                    }
                    title={generationReason(generation.data)}
                  />
                )}
                {generation.data.state === "insufficient_candidates" && (
                  <Typography.Paragraph>
                    库内没有足够且合适的干扰词义。请补充发布内容或调整等级，不会使用库外单词凑数。
                  </Typography.Paragraph>
                )}
                {generationActions(generation.data)}
              </Space>
            )
          )}
        </Card>
      )}
      <section
        hidden={tab !== "generations"}
        aria-hidden={tab !== "generations"}
        inert={tab !== "generations"}
      >
        <Card size="small">
          {generations.isError ? (
            <>
              <AdminTableToolbar extra={generationsToolbar}>
                <Typography.Text strong style={{ fontSize: 16 }}>
                  生成记录
                </Typography.Text>
              </AdminTableToolbar>

              <Alert type="error" title={generations.error.message} />
            </>
          ) : (
            <Table<QuestionGeneration>
              toolbar={
                <Typography.Text strong style={{ fontSize: 16 }}>
                  生成记录
                </Typography.Text>
              }
              toolbarExtra={generationsToolbar}
              tableId="question-generations"
              rowKey="id"
              dataSource={generations.data?.items ?? []}
              loading={generations.isFetching}
              scroll={{ x: 720 }}
              pagination={{
                current: generationPage,
                pageSize: 20,
                total: generations.data?.pagination.total ?? 0,
                showSizeChanger: false,
                onChange: setGenerationPage
              }}
              columns={[
                {
                  title: "词义",
                  render: (_, item) =>
                    `${item.target.spelling} · ${item.target.definition}`
                },
                {
                  title: "等级 / 档位",
                  render: (_, item) =>
                    `${item.question_level} / ${item.answer_profile}`
                },
                {
                  title: "状态与原因",
                  render: (_, item) => (
                    <Space orientation="vertical">
                      <Tag>{generationLabels[item.state]}</Tag>
                      {generationReason(item)}
                    </Space>
                  )
                },
                { title: "操作", render: (_, item) => generationActions(item) }
              ]}
            />
          )}
        </Card>
      </section>
      {error && <Alert type="error" showIcon title={error} />}
    </Flex>
  );
}
