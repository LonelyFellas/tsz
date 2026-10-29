import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  Alert,
  App,
  Button,
  Drawer,
  Empty,
  Input,
  Select,
  Space,
  Tabs,
  Tag,
  Typography,
  theme
} from "antd";
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ClockCircleOutlined,
  PlusOutlined,
  UnorderedListOutlined
} from "@ant-design/icons";
import type {
  AdminProfile,
  BankQuestion,
  BankQuestionState,
  QuestionGeneration,
  QuestionWorkbenchItem
} from "@tsz/types";
import { hasAdminPermission } from "@tsz/shared/auth";
import { HttpError } from "@tsz/api-client";
import { api, useAuthStore } from "@/lib/auth";
import { AdminTable } from "@/components/AdminTable";
import { canReviewQuestion, questionLabels } from "./model";
import { GenerationTools } from "./GenerationTools";
import { QuestionReview } from "./QuestionReview";
import "./question-bank.css";

type QueueItem = Pick<
  QuestionWorkbenchItem,
  | "id"
  | "revision"
  | "spelling"
  | "definition"
  | "question_level"
  | "answer_profile"
  | "created_by"
> & { state?: BankQuestionState };
function queueQuestion(q: BankQuestion): QueueItem {
  return {
    id: q.id,
    revision: q.revision,
    state: q.state,
    spelling: q.content.target.spelling,
    definition: q.content.target.definition,
    question_level: q.content.question_level,
    answer_profile: q.content.answer_profile,
    created_by: q.created_by
  };
}
export function QuestionBank() {
  const profile = useAuthStore((s) => s.profile);
  return profile ? <Workbench key={profile.id} profile={profile} /> : null;
}
function Workbench({ profile }: { profile: AdminProfile }) {
  const { modal, message } = App.useApp();
  const { token } = theme.useToken();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<BankQuestionState>();
  const [level, setLevel] = useState<string>();
  const [variant, setVariant] = useState<string>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selected, setSelected] = useState<React.Key[]>([]);
  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  const [activeId, setActiveId] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const [trial, setTrial] = useState(false);
  const [queueVisible, setQueueVisible] = useState(false);
  const [generationOpen, setGenerationOpen] = useState(
    params.has("entry_id") || params.has("batch_id")
  );
  const [generationTab, setGenerationTab] = useState<
    "generate" | "batches" | "generations"
  >(params.has("batch_id") ? "batches" : "generate");
  const [opening, setOpening] = useState(false);
  const inFlight = useRef(false);
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const list = useQuery({
    queryKey: [
      "question-bank",
      profile.id,
      "workbench",
      search,
      status,
      level,
      variant,
      page,
      pageSize
    ],
    queryFn: ({ signal }) =>
      api.questionBank.workbench(
        {
          query: search,
          state: status,
          question_level: level,
          answer_profile: variant,
          page,
          page_size: pageSize
        },
        { signal }
      ),
    enabled: queue === null && !generationOpen,
    retry: false
  });
  useEffect(() => {
    if (
      queue === null &&
      list.data &&
      list.data.pagination.total_pages > 0 &&
      page > list.data.pagination.total_pages
    )
      setPage(list.data.pagination.total_pages);
  }, [list.data, page, queue]);
  function changeFilter(update: () => void) {
    setSelected([]);
    setPage(1);
    update();
  }
  function guard(action: () => void | Promise<void>) {
    if (!dirty) {
      void action();
      return;
    }
    modal.confirm({
      title: "当前题目有未保存的修改",
      content: "切换会丢弃本地修改。取消可返回继续编辑。",
      okText: "丢弃并继续",
      cancelText: "继续编辑",
      onOk: action
    });
  }
  function selectActive(id: string | undefined, freshlyRead = false) {
    if (id && !freshlyRead)
      client.removeQueries({
        queryKey: ["question-bank", profile.id, "inspection", id],
        exact: true
      });
    setActiveId(id);
  }
  function begin(items: QueueItem[], id = items[0]?.id, freshlyRead = false) {
    setQueue(items);
    selectActive(id, freshlyRead);
    setDirty(false);
    setTrial(false);
    setQueueVisible(false);
    setGenerationOpen(false);
  }
  const updateQuestion = useCallback((updated: BankQuestion) => {
    setQueue((previous) => {
      if (!previous?.some((item) => item.id === updated.id)) return previous;
      const old = previous.find((item) => item.id === updated.id)!;
      if (old.revision === updated.revision && old.state === updated.state)
        return previous;
      return previous.map((item) =>
        item.id === updated.id ? queueQuestion(updated) : item
      );
    });
  }, []);
  function decided(updated: BankQuestion) {
    const nextQueue =
      queue?.map((item) =>
        item.id === updated.id ? queueQuestion(updated) : item
      ) ?? [];
    setQueue(nextQueue);
    if (updated.state === "disabled") return;
    const index = nextQueue.findIndex((item) => item.id === updated.id);
    const next = [
      ...nextQueue.slice(index + 1),
      ...nextQueue.slice(0, index)
    ].find((item) => item.state === undefined || item.state === "draft");
    selectActive(next?.id);
    setDirty(false);
    setTrial(false);
  }
  function skip() {
    if (!queue) return;
    const index = queue.findIndex((item) => item.id === activeId);
    const next = [...queue.slice(index + 1), ...queue.slice(0, index)].find(
      (item) =>
        item.id !== activeId &&
        (item.state === undefined || item.state === "draft")
    );
    if (!next) {
      message.info("本批没有其他待处理题目。");
      return;
    }
    guard(() => {
      selectActive(next.id);
      setDirty(false);
      setTrial(false);
    });
  }
  async function openGenerated(id: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setOpening(true);
    try {
      const result = await client.fetchQuery({
        queryKey: ["question-bank", profile.id, "inspection", id],
        queryFn: ({ signal }) => api.questionBank.inspect(id, { signal }),
        staleTime: 0
      });
      if (alive.current)
        begin([queueQuestion(result.question)], result.question.id, true);
    } catch (cause) {
      if (alive.current)
        message.error(
          cause instanceof Error ? cause.message : "读取题目失败。"
        );
    } finally {
      inFlight.current = false;
      if (alive.current) setOpening(false);
    }
  }
  function generatedBatch(items: QuestionGeneration[]) {
    const ids = new Set<string>();
    const entries = items.flatMap((item): QueueItem[] => {
      if (!item.question_id || ids.has(item.question_id)) return [];
      ids.add(item.question_id);
      return [
        {
          id: item.question_id,
          revision: 0,
          spelling: item.target.spelling,
          definition: item.target.definition,
          question_level: item.question_level,
          answer_profile: item.answer_profile,
          created_by: item.created_by
        }
      ];
    });
    if (entries.length) guard(() => begin(entries));
  }
  function openGeneration(tab: typeof generationTab) {
    setGenerationTab(tab);
    setGenerationOpen(true);
  }
  function regenerate(question: BankQuestion) {
    if (!hasAdminPermission(profile, "words.edit")) return;
    const next = new URLSearchParams(params);
    next.set("entry_id", question.content.target.source.entry_id);
    next.set("question_level", question.content.question_level);
    next.set("answer_profile", question.content.answer_profile);
    setParams(next);
    openGeneration("generate");
  }
  const pageItems = list.data?.items ?? [];
  const reviewable = pageItems.filter(
    (item) =>
      item.state === "draft" && canReviewQuestion(profile, item.created_by)
  );
  const chosen = reviewable.filter((item) => selected.includes(item.id));
  const scoped = chosen.length ? chosen : reviewable;
  const counts = list.data?.counts;
  const countAll =
    counts && Object.values(counts).reduce((sum, count) => sum + count, 0);
  const style = {
    "--qbw-primary": token.colorPrimary,
    "--qbw-primary-bg": token.colorPrimaryBg,
    "--qbw-border": token.colorBorderSecondary,
    "--qbw-bg": token.colorBgContainer,
    "--qbw-muted": token.colorTextSecondary,
    "--qbw-text": token.colorText,
    "--qbw-soft": token.colorFillQuaternary
  } as CSSProperties;
  return (
    <div className="qbw" style={style}>
      <header className="qbw-page-heading">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            单选题工作台
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ margin: "6px 0 0" }}>
            仅从已发布的智能词库命题，审清词义与干扰项，再交给学生。
          </Typography.Paragraph>
        </div>
        <Space>
          <Button
            icon={<ClockCircleOutlined aria-hidden />}
            onClick={() => openGeneration("generations")}
          >
            生成任务
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined aria-hidden />}
            disabled={!hasAdminPermission(profile, "words.edit")}
            onClick={() => openGeneration("generate")}
          >
            生成题目
          </Button>
        </Space>
      </header>
      {queue === null ? (
        <>
          <div className="qbw-filters">
            <Tabs
              activeKey={status ?? "all"}
              onChange={(key) =>
                changeFilter(() =>
                  setStatus(
                    key === "all" ? undefined : (key as BankQuestionState)
                  )
                )
              }
              items={[
                {
                  key: "all",
                  label: `全部题目${countAll === undefined ? "" : ` ${countAll}`}`
                },
                ...Object.entries(questionLabels).map(([value, label]) => ({
                  key: value,
                  label: `${label}${counts ? ` ${counts[value as BankQuestionState]}` : ""}`
                }))
              ]}
            />
            <Space wrap>
              <Input.Search
                aria-label="搜索单词或题干"
                placeholder="搜索单词或题干"
                defaultValue={search}
                allowClear
                onSearch={(value) => changeFilter(() => setSearch(value))}
                style={{ width: 230 }}
                loading={list.isFetching}
              />
              <Select
                aria-label="筛选题目等级"
                placeholder="全部等级"
                allowClear
                value={level}
                onChange={(value) => changeFilter(() => setLevel(value))}
                style={{ width: 115 }}
                options={["A1", "A2", "B1", "B2", "C1", "C2"].map((value) => ({
                  value
                }))}
              />
              <Select
                aria-label="筛选英美档位"
                placeholder="英美档位"
                allowClear
                value={variant}
                onChange={(value) => changeFilter(() => setVariant(value))}
                style={{ width: 125 }}
                options={[
                  { value: "BrE", label: "英式 BrE" },
                  { value: "AmE", label: "美式 AmE" }
                ]}
              />
            </Space>
          </div>
          {list.isError ? (
            <Alert
              type="error"
              showIcon
              title={
                list.error instanceof HttpError && list.error.status === 404
                  ? "当前后端尚未支持新版题库读取，请更新服务后重试。"
                  : list.error.message
              }
              action={<Button onClick={() => void list.refetch()}>重试</Button>}
            />
          ) : (
            <AdminTable<QuestionWorkbenchItem>
              tableId="question-workbench"
              rowKey="id"
              loading={list.isFetching || opening}
              dataSource={pageItems}
              toolbar={
                <Space>
                  <Typography.Text strong>题库</Typography.Text>
                  <Typography.Text type="secondary">
                    {selected.length
                      ? `已选择本页 ${selected.length} 道题`
                      : "先筛选定位，再逐题审核"}
                  </Typography.Text>
                </Space>
              }
              toolbarExtra={
                <Button
                  type="primary"
                  icon={<ArrowRightOutlined aria-hidden />}
                  iconPlacement="end"
                  disabled={!scoped.length || opening}
                  onClick={() => begin(scoped)}
                >
                  {chosen.length
                    ? `审核已选 ${chosen.length} 道`
                    : `审核本页 ${reviewable.length} 道`}
                </Button>
              }
              scroll={{ x: 1030, y: "max(280px, calc(100dvh - 425px))" }}
              pagination={{
                current: page,
                pageSize,
                total: list.data?.pagination.total ?? 0,
                showSizeChanger: true,
                pageSizeOptions: [20, 50],
                showTotal: (total, range) =>
                  `共 ${total} 道 · ${range[0]}–${range[1]}`,
                onChange: (next, size) => {
                  setSelected([]);
                  setPage(next);
                  setPageSize(size);
                }
              }}
              rowSelection={{
                selectedRowKeys: selected,
                onChange: setSelected,
                getCheckboxProps: (item) => ({
                  disabled:
                    item.state !== "draft" ||
                    !canReviewQuestion(profile, item.created_by)
                })
              }}
              columns={[
                {
                  title: "目标词 / 题干",
                  key: "target",
                  width: 230,
                  render: (_, item) => (
                    <div>
                      <Button
                        type="link"
                        className="qbw-word-link tsz-words"
                        onClick={() => {
                          begin([item]);
                        }}
                      >
                        {item.spelling}
                      </Button>
                      <p className="qbw-row-prompt">
                        {item.part_of_speech} · {item.prompt}
                      </p>
                      {item.has_concerns && (
                        <Typography.Text type="warning">
                          有生成提示
                        </Typography.Text>
                      )}
                    </div>
                  )
                },
                {
                  title: "四个选项",
                  key: "options",
                  render: (_, item) => (
                    <Space size={[4, 6]} wrap>
                      {item.options.map((option) => (
                        <Tag
                          key={option.option_id}
                          color={
                            option.option_id === item.correct_option_id
                              ? "success"
                              : undefined
                          }
                        >
                          <span className="qbw-letter">{option.option_id}</span>{" "}
                          <span className="tsz-words">{option.spelling}</span>
                        </Tag>
                      ))}
                    </Space>
                  )
                },
                {
                  title: "等级 / 档位",
                  key: "context",
                  width: 115,
                  render: (_, item) => (
                    <Space orientation="vertical" size={2}>
                      <Typography.Text>{item.question_level}</Typography.Text>
                      <Typography.Text type="secondary">
                        {item.answer_profile}
                      </Typography.Text>
                    </Space>
                  )
                },
                {
                  title: "状态",
                  dataIndex: "state",
                  width: 135,
                  render: (value: BankQuestionState, item) => (
                    <Space orientation="vertical" size={3}>
                      <Tag
                        color={
                          value === "approved"
                            ? "success"
                            : value === "draft"
                              ? "warning"
                              : undefined
                        }
                      >
                        {questionLabels[value]}
                      </Tag>
                      {!item.source_current && (
                        <Typography.Text type="warning">
                          来源需更新
                        </Typography.Text>
                      )}
                    </Space>
                  )
                },
                {
                  title: "操作",
                  key: "actions",
                  width: 85,
                  render: (_, item) => (
                    <Button
                      type="link"
                      disabled={opening}
                      onClick={() => begin([item])}
                    >
                      {item.state === "draft" &&
                      canReviewQuestion(profile, item.created_by)
                        ? "审核"
                        : "查看"}
                    </Button>
                  )
                }
              ]}
            />
          )}
        </>
      ) : (
        <>
          <div className="qbw-scope">
            <Space wrap>
              <Button
                icon={<ArrowLeftOutlined aria-hidden />}
                onClick={() =>
                  guard(() => {
                    setQueue(null);
                    setActiveId(undefined);
                    setDirty(false);
                    setTrial(false);
                  })
                }
              >
                返回题库
              </Button>
              <Typography.Text strong>本次审核</Typography.Text>
              <Typography.Text type="secondary">
                {search ? `搜索“${search}” · ` : ""}
                {status ? questionLabels[status] : "全部状态"}
                {level ? ` · ${level}` : ""}
                {variant ? ` · ${variant}` : ""}
              </Typography.Text>
            </Space>
            <Typography.Text type="secondary">
              本次 {queue.length} 道 · 已处理{" "}
              {
                queue.filter(
                  (item) => item.state !== undefined && item.state !== "draft"
                ).length
              }{" "}
              道
            </Typography.Text>
          </div>
          <div
            className={`qbw-review-grid ${queueVisible ? "qbw-show-queue" : ""}`}
          >
            <aside className="qbw-queue" aria-label="本次审核队列">
              <div className="qbw-queue-title">
                <Typography.Text strong>本次审核队列</Typography.Text>
                <Typography.Text type="secondary">
                  {queue.length} 道
                </Typography.Text>
              </div>
              <div className="qbw-queue-items">
                {trial ? (
                  <p className="qbw-queue-note">
                    试做期间隐藏目标词，返回审核视图后可继续选题。
                  </p>
                ) : (
                  queue.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={`qbw-queue-item ${activeId === item.id ? "qbw-selected" : ""}`}
                      aria-current={activeId === item.id}
                      onClick={() => {
                        if (item.id !== activeId)
                          guard(() => {
                            selectActive(item.id);
                            setDirty(false);
                            setTrial(false);
                            setQueueVisible(false);
                          });
                      }}
                    >
                      <strong className="tsz-words">{item.spelling}</strong>
                      <span>{item.definition}</span>
                      <small>
                        {item.question_level} · {item.answer_profile} ·{" "}
                        {item.state ? questionLabels[item.state] : "待核查状态"}
                      </small>
                    </button>
                  ))
                )}
              </div>
              <p className="qbw-queue-note">只处理选定范围，不追加全库题目。</p>
            </aside>
            <div className="qbw-current">
              <Button
                className="qbw-mobile-queue"
                icon={<UnorderedListOutlined aria-hidden />}
                onClick={() => setQueueVisible(!queueVisible)}
              >
                本次题目
              </Button>
              {activeId ? (
                <QuestionReview
                  id={activeId}
                  profile={profile}
                  onDirtyChange={setDirty}
                  onQuestionChange={updateQuestion}
                  onDecision={decided}
                  onRegenerate={regenerate}
                  onSkip={skip}
                  onTrialChange={setTrial}
                />
              ) : (
                <div className="qbw-loading">
                  <Empty description="本批题目已处理，可以返回题库继续筛选。">
                    <Button
                      onClick={() => {
                        setQueue(null);
                        setTrial(false);
                      }}
                    >
                      返回题库
                    </Button>
                  </Empty>
                </div>
              )}
            </div>
          </div>
        </>
      )}
      <Drawer
        title="命题与生成任务"
        open={generationOpen}
        onClose={() => setGenerationOpen(false)}
        size="large"
        forceRender
        styles={{ wrapper: { width: "min(1080px, 96vw)" } }}
      >
        <GenerationTools
          key={profile.id}
          profile={profile}
          active={generationOpen}
          initialTab={generationTab}
          showQuestion={(id) => guard(() => openGenerated(id))}
          showQuestions={generatedBatch}
        />
      </Drawer>
    </div>
  );
}
