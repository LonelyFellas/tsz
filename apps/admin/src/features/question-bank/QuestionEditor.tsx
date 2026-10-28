import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  App,
  Button,
  Card,
  Collapse,
  Drawer,
  Form,
  Input,
  Select,
  Space,
  Spin,
  Tag,
  Typography
} from "antd";
import type {
  AdminProfile,
  BankQuestion,
  QuestionCandidate,
  ReviewBankQuestion
} from "@tsz/types";
import { hasAdminPermission } from "@tsz/shared/auth";
import { api } from "@/lib/auth";
import {
  candidateReference,
  canEditQuestion,
  questionLabels,
  reviewReasonOptions
} from "./model";

function Source({ candidate }: { candidate: QuestionCandidate }) {
  return (
    <Space orientation="vertical" size={2}>
      <Typography.Text>
        {candidate.spelling} · {candidate.part_of_speech} ·{" "}
        {candidate.definition}
      </Typography.Text>
      <Typography.Link
        href={`/words/${candidate.source.entry_id}/v3/wizard/preview`}
        target="_blank"
        rel="noreferrer"
      >
        查看库内词条
      </Typography.Link>
      <Typography.Text type="secondary">
        词义 {candidate.source.sense_id} / 释义 {candidate.source.definition_id}
      </Typography.Text>
      <Typography.Text type="secondary">
        发布版本 {candidate.source.publication_id}
      </Typography.Text>
    </Space>
  );
}

interface DraftFields {
  prompt: string;
  explanation: string;
  option_explanations: string[];
}
export function QuestionEditor({
  id,
  open,
  profile,
  onClose,
  onDirtyChange
}: {
  id: string;
  open: boolean;
  profile: AdminProfile;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const detail = useQuery({
    queryKey: ["question-bank", profile.id, "question", id],
    queryFn: ({ signal }) => api.questionBank.question(id, { signal }),
    staleTime: Infinity,
    refetchOnWindowFocus: false
  });
  return (
    <Drawer title="题目预览与审核" open={open} onClose={onClose} size={880}>
      {detail.isPending ? (
        <Spin />
      ) : detail.isError ? (
        <Alert
          type="error"
          showIcon
          title={detail.error.message}
          action={<Button onClick={() => void detail.refetch()}>重试</Button>}
        />
      ) : (
        <QuestionDraft
          key={`${profile.id}:${id}`}
          initial={detail.data}
          profile={profile}
          onDirtyChange={onDirtyChange}
        />
      )}
    </Drawer>
  );
}

function QuestionDraft({
  initial,
  profile,
  onDirtyChange
}: {
  initial: BankQuestion;
  profile: AdminProfile;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { message, modal } = App.useApp();
  const client = useQueryClient();
  const [question, setQuestion] = useState(initial);
  const [options, setOptions] = useState(
    initial.content.options.map((o) => o.candidate)
  );
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [search, setSearch] = useState("");
  const [form] = Form.useForm<DraftFields>();
  const [reviewForm] =
    Form.useForm<Pick<ReviewBankQuestion, "reason_codes" | "comment">>();
  const writable = canEditQuestion(profile, question.created_by);
  const reviewable = writable && hasAdminPermission(profile, "words.publish");
  const editable = writable && question.state !== "approved";
  const candidateQuery = useQuery({
    queryKey: ["question-bank", profile.id, "replacement", question.id, search],
    enabled: editable,
    queryFn: ({ signal }) =>
      api.questionBank.candidates(
        {
          query: search,
          question_level: question.content.question_level,
          answer_profile: question.content.answer_profile
        },
        { signal }
      )
  });
  const candidates = new Map(
    [...options, ...(candidateQuery.data?.items ?? [])].map((candidate) => [
      candidate.candidate_ref,
      candidate
    ])
  );
  const markDirty = () => {
    setDirty(true);
    onDirtyChange(true);
  };
  async function accept(result: BankQuestion) {
    client.setQueryData(
      ["question-bank", profile.id, "question", result.id],
      result
    );
    if (mounted.current) {
      setError("");
      setQuestion(result);
      setOptions(result.content.options.map((o) => o.candidate));
      form.setFieldsValue({
        prompt: result.content.prompt,
        explanation: result.content.explanation,
        option_explanations: result.content.options.map((o) => o.explanation)
      });
      setDirty(false);
      onDirtyChange(false);
    }
    await client.invalidateQueries({
      queryKey: ["question-bank", profile.id, "questions"]
    });
  }
  async function save(values: DraftFields) {
    if (!editable || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api.questionBank.edit(question.id, {
        expected_revision: question.revision,
        ...values,
        options: options.map(candidateReference)
      });
      await accept(result);
      if (mounted.current) message.success("草稿已保存，请确认后审核。");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "保存失败，修改已保留。"
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function review(decision: ReviewBankQuestion["decision"]) {
    if (!reviewable || dirty || inFlight.current) return;
    const values = await reviewForm.validateFields();
    if (!mounted.current || inFlight.current) return;
    if (decision !== "approve" && !values.reason_codes?.length) {
      reviewForm.setFields([
        { name: "reason_codes", errors: ["请选择退回或停用的原因。"] }
      ]);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api.questionBank.review(question.id, {
        expected_revision: question.revision,
        decision,
        reason_codes: values.reason_codes ?? [],
        comment: values.comment?.trim() ?? ""
      });
      await accept(result);
      if (mounted.current)
        message.success(`题目${questionLabels[result.state]}`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "审核失败，意见已保留。"
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <Space orientation="vertical" size="large" style={{ width: "100%" }}>
      <Space wrap>
        <Tag>{questionLabels[question.state]}</Tag>
        <Tag>{question.content.question_level}</Tag>
        <Tag>{question.content.answer_profile}</Tag>
        <Typography.Text type="secondary">
          版本 {question.revision}
        </Typography.Text>
      </Space>
      <Card size="small" title="正确答案的原始词义">
        <Source candidate={question.content.target} />
      </Card>
      {question.content.concerns.length > 0 && (
        <Alert
          type="warning"
          showIcon
          title="生成风险，请人工核查"
          description={
            <ul>
              {question.content.concerns.map((concern) => (
                <li key={concern}>{concern}</li>
              ))}
            </ul>
          }
        />
      )}
      <Collapse
        items={[
          {
            key: "original",
            label: "查看生成原稿",
            children: (
              <Space orientation="vertical">
                <Typography.Paragraph>
                  {question.original_content.prompt}
                </Typography.Paragraph>
                {question.original_content.options.map((option) => (
                  <div key={option.option_id}>
                    <Typography.Text strong>
                      {option.option_id}. {option.candidate.spelling}
                    </Typography.Text>
                    <Typography.Paragraph>
                      {option.explanation}
                    </Typography.Paragraph>
                  </div>
                ))}
                <Typography.Paragraph>
                  {question.original_content.explanation}
                </Typography.Paragraph>
              </Space>
            )
          }
        ]}
      />
      {!writable && (
        <Alert
          type="info"
          showIcon
          title="当前账号仅可查看此题；编辑需要词条编辑权限及对应归属范围。"
        />
      )}
      {question.state === "approved" && (
        <Alert
          type="info"
          title="已通过的题目正在供学习使用。如需修改，请先停用，再保存并重新审核。"
        />
      )}
      <Form
        form={form}
        layout="vertical"
        disabled={busy || !editable}
        onValuesChange={markDirty}
        onFinish={(values) => void save(values)}
        initialValues={{
          prompt: initial.content.prompt,
          explanation: initial.content.explanation,
          option_explanations: initial.content.options.map((o) => o.explanation)
        }}
      >
        <Form.Item
          name="prompt"
          label="中文题干"
          rules={[
            { required: true, whitespace: true, message: "请输入中文题干。" }
          ]}
        >
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} />
        </Form.Item>
        {editable && (
          <Form.Item
            label="搜索库内替换选项"
            extra="只能使用当前等级和英美档位下可用的已发布词义。"
          >
            <Input.Search
              allowClear
              placeholder="输入英文或中文释义"
              onSearch={setSearch}
              loading={candidateQuery.isFetching}
            />
          </Form.Item>
        )}
        {candidateQuery.isError && (
          <Alert type="error" title={candidateQuery.error.message} />
        )}
        {options.map((candidate, index) => {
          const target =
            candidate.candidate_ref === question.content.target.candidate_ref;
          return (
            <Card
              key={question.content.options[index]!.option_id}
              size="small"
              style={{ marginBottom: 16 }}
              title={
                <Space>
                  {String.fromCharCode(65 + index)}
                  <Tag color={target ? "success" : undefined}>
                    {target ? "正确项" : "干扰项"}
                  </Tag>
                </Space>
              }
            >
              <Form.Item label={`选项 ${String.fromCharCode(65 + index)}`}>
                <Select
                  value={candidate.candidate_ref}
                  disabled={!editable || busy || target}
                  showSearch={{ optionFilterProp: "label" }}
                  style={{ width: "100%" }}
                  options={[...candidates.values()].map((item) => ({
                    value: item.candidate_ref,
                    label: `${item.spelling} · ${item.definition}`,
                    disabled: options.some(
                      (selected, i) =>
                        i !== index &&
                        selected.candidate_ref === item.candidate_ref
                    )
                  }))}
                  onChange={(value) => {
                    const replacement = candidates.get(value);
                    if (replacement) {
                      setOptions((old) =>
                        old.map((item, i) => (i === index ? replacement : item))
                      );
                      form.setFieldValue(["option_explanations", index], "");
                      markDirty();
                    }
                  }}
                />
              </Form.Item>
              <Source candidate={candidate} />
              <Form.Item
                name={["option_explanations", index]}
                label={
                  target
                    ? "正确项说明"
                    : "干扰项理由（为什么看似合理、为什么错误）"
                }
                rules={[
                  {
                    required: true,
                    whitespace: true,
                    message: "请说明此选项的理由。"
                  }
                ]}
                style={{ marginTop: 12 }}
              >
                <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} />
              </Form.Item>
            </Card>
          );
        })}
        <Form.Item
          name="explanation"
          label="答后解析"
          rules={[
            { required: true, whitespace: true, message: "请输入答后解析。" }
          ]}
        >
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} />
        </Form.Item>
        {editable && (
          <Button
            type="primary"
            htmlType="submit"
            loading={busy}
            disabled={!dirty}
          >
            保存修改
          </Button>
        )}
      </Form>
      <Card title="人工审核" size="small">
        {dirty && (
          <Alert
            type="warning"
            title="请先保存修改，再审核当前版本。"
            style={{ marginBottom: 16 }}
          />
        )}
        <Form
          form={reviewForm}
          layout="vertical"
          disabled={busy || !reviewable}
          initialValues={{ reason_codes: [], comment: "" }}
        >
          <Form.Item name="reason_codes" label="审核原因">
            <Select mode="multiple" options={reviewReasonOptions} />
          </Form.Item>
          <Form.Item name="comment" label="审核意见">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} />
          </Form.Item>
        </Form>
        <Space wrap>
          {question.state !== "approved" && (
            <Button
              type="primary"
              loading={busy}
              disabled={!reviewable || dirty}
              onClick={() => void review("approve")}
            >
              审核通过并启用
            </Button>
          )}
          {["draft", "rejected"].includes(question.state) && (
            <Button
              disabled={busy || !reviewable || dirty}
              onClick={() => void review("reject")}
            >
              退回修改
            </Button>
          )}
          {question.state === "approved" && (
            <Button
              danger
              disabled={busy || !reviewable || dirty}
              onClick={() => void review("disable")}
            >
              停用题目
            </Button>
          )}
        </Space>
        {question.review_comment && (
          <Typography.Paragraph style={{ marginTop: 12 }}>
            上次审核意见：{question.review_comment}
          </Typography.Paragraph>
        )}
      </Card>
      {error && (
        <Alert
          type="error"
          showIcon
          title={error}
          description="本地修改和审核意见已保留；若版本已变化，请核对最新记录后再操作。"
          action={
            <Button
              disabled={busy}
              onClick={() =>
                modal.confirm({
                  title: "重新加载服务器版本？",
                  content:
                    "未保存的修改将被替换。取消可保留当前输入，先复制需要保留的内容。",
                  okText: "重新加载",
                  cancelText: "保留输入",
                  onOk: async () => {
                    await accept(await api.questionBank.question(question.id));
                  }
                })
              }
            >
              重新加载
            </Button>
          }
        />
      )}
    </Space>
  );
}
