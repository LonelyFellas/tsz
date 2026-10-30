import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  App,
  Button,
  Checkbox,
  Collapse,
  Drawer,
  Form,
  Input,
  Modal,
  Radio,
  Space,
  Spin,
  Tag,
  Typography
} from "antd";
import {
  ArrowRightOutlined,
  CheckOutlined,
  EditOutlined,
  EyeOutlined,
  SwapOutlined
} from "@ant-design/icons";
import type {
  AdminProfile,
  BankQuestion,
  QuestionCandidate,
  QuestionInspection,
  ReviewBankQuestion
} from "@tsz/types";
import { api } from "@/lib/auth";
import { HttpError } from "@tsz/api-client";
import { hasAdminPermission } from "@tsz/shared/auth";
import { useQuestionDraft } from "./useQuestionDraft";
import { questionLabels, reviewReasonOptions } from "./model";
import { CandidatePicker } from "./CandidatePicker";
import { PublishedSource } from "./PublishedSource";

export interface QuestionReviewProps {
  id: string;
  profile: AdminProfile;
  onDirtyChange: (dirty: boolean) => void;
  onQuestionChange: (question: BankQuestion) => void;
  onDecision: (question: BankQuestion) => void;
  onRegenerate: (question: BankQuestion) => void;
  onSkip: () => void;
  onTrialChange: (trial: boolean) => void;
}
export function QuestionReview(props: QuestionReviewProps) {
  const { onQuestionChange } = props;
  const detail = useQuery({
    queryKey: ["question-bank", props.profile.id, "inspection", props.id],
    queryFn: ({ signal }) => api.questionBank.inspect(props.id, { signal }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false
  });
  useEffect(() => {
    if (detail.data) onQuestionChange(detail.data.question);
  }, [detail.data, onQuestionChange]);
  const inaccessible =
    detail.error instanceof HttpError &&
    [401, 403, 404].includes(detail.error.status);
  return detail.isPending ? (
    <div className="qbw-loading">
      <Spin />
      <Typography.Text type="secondary">正在读取题目与发布来源</Typography.Text>
    </div>
  ) : detail.isError && (!detail.data || inaccessible) ? (
    <div className="qbw-loading">
      <Alert
        type="error"
        showIcon
        title={detail.error.message}
        action={<Button onClick={() => void detail.refetch()}>重试</Button>}
      />
    </div>
  ) : (
    <ReviewSession
      key={`${props.profile.id}:${props.id}`}
      {...props}
      inspection={detail.data!}
      readError={detail.isError ? detail.error.message : undefined}
      onRetryInspection={() => void detail.refetch()}
    />
  );
}
function ReviewSession({
  inspection,
  readError,
  onRetryInspection,
  ...props
}: QuestionReviewProps & {
  inspection: QuestionInspection;
  readError?: string;
  onRetryInspection: () => void;
}) {
  const { modal } = App.useApp();
  const {
    question,
    options,
    setOptions,
    dirty,
    busy,
    error,
    editable,
    reviewable,
    form,
    reviewForm,
    markDirty,
    accept,
    save,
    review
  } = useQuestionDraft({
    initial: inspection.question,
    profile: props.profile,
    onDirtyChange: props.onDirtyChange,
    onQuestionChange: props.onQuestionChange,
    onDecision: (updated) => {
      setDecision(null);
      props.onDecision(updated);
    }
  });
  const [editing, setEditing] = useState(false);
  const [focusPath, setFocusPath] = useState<(string | number)[] | null>(null);
  const [activeOption, setActiveOption] = useState("A");
  const [trial, setTrial] = useState(false);
  const [answer, setAnswer] = useState<string>();
  const [submitted, setSubmitted] = useState(false);
  const [picker, setPicker] = useState<number | null>(null);
  const [source, setSource] = useState<QuestionCandidate | null>(null);
  const [originalOpen, setOriginalOpen] = useState(false);
  const [decision, setDecision] = useState<
    ReviewBankQuestion["decision"] | null
  >(null);
  const prompt = Form.useWatch("prompt", form) ?? question.content.prompt;
  const explanation =
    Form.useWatch("explanation", form) ?? question.content.explanation;
  const targetCurrent = inspection.target_current;
  const current = (index: number) => {
    const original = inspection.question.content.options[index];
    if (!original || !options[index]) return false;
    return (
      original.candidate.content_fingerprint ===
        options[index]?.content_fingerprint &&
      inspection.sources.find((s) => s.option_id === original.option_id)
        ?.current === true
    );
  };
  const sourceCurrent =
    !readError && targetCurrent && options.every((_, index) => current(index));
  const canModify = editable && targetCurrent;
  const semanticReview = inspection.semantic_review;
  const semanticReviewCurrent = !dirty && inspection.semantic_review_current;
  const unresolvedAmbiguity = semanticReview?.verdict === "needs_revision";
  const ordinaryConcerns = question.content.concerns.filter(
    (concern) => !semanticReview?.issues.includes(concern)
  );
  const semanticReviewBlocked = unresolvedAmbiguity && semanticReviewCurrent;
  const correctId = question.content.correct_option_id;
  const correctIndex = question.content.options.findIndex(
    (o) => o.option_id === correctId
  );
  const onTrialChange = props.onTrialChange;
  useEffect(() => () => onTrialChange(false), [onTrialChange]);
  useEffect(() => {
    if (!focusPath) return;
    const control = form.getFieldInstance(focusPath) as
      { focus?: () => void } | undefined;
    control?.focus?.();
    setFocusPath(null);
  }, [focusPath, form]);
  function switchTrial(value: boolean) {
    setTrial(value);
    setAnswer(undefined);
    setSubmitted(false);
    props.onTrialChange(value);
  }
  function discardEdit() {
    const discard = () => {
      void accept(question).then(() => setEditing(false));
    };
    if (dirty)
      modal.confirm({
        title: "放弃本地修改？",
        content: "取消可继续编辑，放弃后恢复当前已保存版本。",
        okText: "放弃修改",
        cancelText: "继续编辑",
        onOk: discard
      });
    else setEditing(false);
  }
  async function saveDraft() {
    try {
      const values = await form.validateFields();
      if (await save(values)) setEditing(false);
    } catch (cause) {
      const fields = (
        cause as { errorFields?: { name: (string | number)[] }[] }
      ).errorFields;
      const name = fields?.[0]?.name;
      if (name) setFocusPath(name);
      if (name?.[0] === "option_explanations" && typeof name[1] === "number") {
        setActiveOption(question.content.options[name[1]]!.option_id);
      }
    }
  }
  function choose(candidate: QuestionCandidate) {
    if (picker === null || picker === correctIndex || !canModify) return;
    const index = picker;
    setOptions((previous) =>
      previous.map((c, i) => (i === index ? candidate : c))
    );
    form.setFieldValue(["option_explanations", index], "");
    setActiveOption(question.content.options[index]!.option_id);
    setEditing(true);
    setFocusPath(["option_explanations", index]);
    markDirty();
    setPicker(null);
  }
  const questionError = error && (
    <Alert
      type="error"
      showIcon
      title={error}
      description="本地修改和审核意见已保留。版本或来源变化时，请核对后再操作。"
      action={
        <Button
          disabled={busy}
          onClick={() =>
            modal.confirm({
              title: "重新加载服务器版本？",
              content:
                "未保存的本地修改会被替换。取消可保留输入，先复制需要保留的内容。",
              okText: "重新加载",
              cancelText: "保留输入",
              onOk: async () => {
                const result = await api.questionBank.inspect(question.id);
                await accept(result.question);
                setEditing(false);
              }
            })
          }
        >
          重新加载
        </Button>
      }
    />
  );
  return (
    <Form
      form={form}
      component="div"
      layout="vertical"
      className="qbw-session"
      onValuesChange={markDirty}
      initialValues={{
        prompt: question.content.prompt,
        explanation: question.content.explanation,
        option_explanations: question.content.options.map((o) => o.explanation)
      }}
    >
      <div className={`qbw-preview ${trial ? "qbw-student-preview" : ""}`}>
        <div className="qbw-review-heading">
          <Space>
            <Tag
              color={
                question.state === "approved"
                  ? "success"
                  : question.state === "draft"
                    ? "warning"
                    : undefined
              }
            >
              {questionLabels[question.state]}
            </Tag>
            <Typography.Text type="secondary">
              版本 {question.revision}
              {dirty ? " · 未保存" : ""}
            </Typography.Text>
          </Space>
          <Space.Compact>
            <Button
              onClick={() => switchTrial(false)}
              type={!trial ? "primary" : "default"}
            >
              审核视图
            </Button>
            <Button
              icon={<EyeOutlined aria-hidden />}
              disabled={!sourceCurrent || editing}
              onClick={() => switchTrial(true)}
              type={trial ? "primary" : "default"}
            >
              学生试做
            </Button>
          </Space.Compact>
        </div>
        {readError && (
          <Alert
            type="warning"
            showIcon
            title="暂未能重新核查发布来源"
            description="当前输入已保留；请重试核查后再审核。"
            action={<Button onClick={onRetryInspection}>重试核查</Button>}
          />
        )}
        {!sourceCurrent && (!dirty || !targetCurrent) && !readError && (
          <Alert
            type="warning"
            showIcon
            title={
              targetCurrent
                ? "部分选项的发布来源已变化"
                : "命题词义的发布来源已变化"
            }
            description={
              targetCurrent
                ? question.state === "approved"
                  ? "请先停用，再更换来源并重新审核。来源已变化的题目不会进入新的练习。"
                  : "请更换或重新选择当前有效发布词义，保存后再审核。"
                : "正确项不能自动重绑到新词义，请从当前已发布词义重新命题。"
            }
            action={
              !targetCurrent && (
                <Button
                  disabled={!hasAdminPermission(props.profile, "words.edit")}
                  onClick={() => props.onRegenerate(question)}
                >
                  重新选择命题词义
                </Button>
              )
            }
          />
        )}
        {!trial && unresolvedAmbiguity && (
          <Alert
            type="error"
            showIcon
            title={
              semanticReviewCurrent
                ? "存在尚未解决的歧义"
                : "原稿存在歧义，当前修改尚未复审"
            }
            description={
              <div>
                <p>
                  {semanticReviewCurrent
                    ? "当前题面未通过语义复审，不能直接通过。请更换干扰项或重新命题；不要在解析里补充题干没有的条件。"
                    : "保存修改不会自动消除这条风险记录。请按当前题干逐项确认答案，或重新命题并人工审核。"}
                </p>
                <details>
                  <summary>
                    查看 {semanticReview.issues.length} 条具体问题
                  </summary>
                  <ul>
                    {semanticReview.issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </details>
              </div>
            }
            action={
              hasAdminPermission(props.profile, "words.edit") && (
                <Button
                  disabled={busy}
                  onClick={() => props.onRegenerate(question)}
                >
                  重新命题
                </Button>
              )
            }
          />
        )}
        {!trial &&
          !unresolvedAmbiguity &&
          (!semanticReview || !semanticReviewCurrent) && (
            <Alert
              type="warning"
              showIcon
              title={
                semanticReview
                  ? "题面已修改，语义复审待确认"
                  : "缺少语义复审记录"
              }
              description={
                semanticReview
                  ? "原复审结果不能直接覆盖当前修改。请人工核查每个选项是否可能正确，必要时重新命题。"
                  : "此题没有结构化的语义复审结果，不能据此认定答案唯一。请结合题干和已发布词义人工核查。"
              }
            />
          )}
        {!trial && ordinaryConcerns.length > 0 && (
          <Alert
            type="info"
            showIcon
            title="生成说明（供参考）"
            description={
              <details>
                <summary>展开 {ordinaryConcerns.length} 条生成说明</summary>
                <ul>
                  {ordinaryConcerns.map((concern) => (
                    <li key={concern}>{concern}</li>
                  ))}
                </ul>
              </details>
            }
          />
        )}
        <article className="qbw-question-sheet">
          <div className="qbw-sheet-header">
            <span>
              中文释义 → 英文单选 · {question.content.target.part_of_speech}
            </span>
            <span>
              {question.content.question_level} /{" "}
              {question.content.answer_profile}
            </span>
          </div>
          <div className="qbw-sheet-content">
            <p className="qbw-instruction">请选择与下列中文释义对应的单词</p>
            <h2>{prompt}</h2>
            <Radio.Group
              className="qbw-choice-grid"
              aria-label="四个英文选项"
              value={answer}
              disabled={!trial || submitted || busy}
              onChange={(event) => setAnswer(event.target.value)}
            >
              {options.map((candidate, index) => {
                const id = question.content.options[index]!.option_id;
                const correct = id === correctId;
                const reveal = !trial || submitted;
                return (
                  <div
                    key={id}
                    className={`qbw-choice ${reveal && correct ? "qbw-correct" : ""} ${trial && submitted && answer === id && !correct ? "qbw-wrong" : ""}`}
                  >
                    <Radio
                      value={id}
                      aria-label={`选项 ${id} ${candidate.spelling}`}
                    >
                      <span className="qbw-letter">{id}</span>
                      <span className="tsz-words qbw-option-word">
                        {candidate.spelling}
                      </span>
                    </Radio>
                    {reveal && correct && (
                      <span className="qbw-answer-mark">
                        <CheckOutlined aria-hidden /> 正确答案
                      </span>
                    )}
                    {!trial && !editing && !correct && canModify && (
                      <Button
                        type="link"
                        size="small"
                        icon={<SwapOutlined aria-hidden />}
                        aria-label={`更换选项 ${id} ${candidate.spelling}`}
                        onClick={() => setPicker(index)}
                      >
                        更换干扰项
                      </Button>
                    )}
                  </div>
                );
              })}
            </Radio.Group>
            {(!trial || submitted) && (
              <div className="qbw-explanation">
                <Typography.Text strong>答后解析</Typography.Text>
                <p>{explanation}</p>
              </div>
            )}
            {trial && (
              <div className="qbw-trial-actions">
                {submitted ? (
                  <>
                    <Typography.Text
                      type={answer === correctId ? "success" : "danger"}
                    >
                      {answer === correctId
                        ? "回答正确"
                        : "回答错误，请查看解析"}
                    </Typography.Text>
                    <Button
                      onClick={() => {
                        setSubmitted(false);
                        setAnswer(undefined);
                      }}
                    >
                      重新试做
                    </Button>
                  </>
                ) : (
                  <Button
                    type="primary"
                    disabled={!answer}
                    onClick={() => setSubmitted(true)}
                  >
                    提交答案
                  </Button>
                )}
                <Typography.Text type="secondary">
                  试做不写入学习记录
                </Typography.Text>
              </div>
            )}
          </div>
          <div className="qbw-sheet-note">
            {trial
              ? "答前不展示答案和词义来源"
              : "四个选项均引用已发布智能词库的具体词义"}
          </div>
        </article>
        {questionError}
      </div>
      <aside
        className="qbw-reference"
        aria-label={editing ? "修改题目" : "命题词义与选项来源"}
      >
        {trial ? (
          <>
            <Typography.Title level={5}>学生视角试做</Typography.Title>
            <Typography.Paragraph type="secondary">
              检查学生能否凭题干选出唯一答案，以及干扰项是否看似合理但确实不符合题干。
            </Typography.Paragraph>
            <Typography.Paragraph type="secondary">
              单选结果不代表拼写掌握度。此处只预览题面，不提交真实学习记录。
            </Typography.Paragraph>
            <Button onClick={() => switchTrial(false)}>返回审核视图</Button>
          </>
        ) : editing ? (
          <>
            <div className="qbw-reference-title">
              <Typography.Text strong>修改题目</Typography.Text>
              <Tag>待审核草稿</Tag>
            </div>
            <div className="qbw-editor-target">
              <strong className="tsz-words">
                {question.content.target.spelling}
              </strong>{" "}
              · {question.content.target.definition}
              <p>正确项固定。更换干扰项后，重新填写理由。</p>
            </div>
            <Form.Item
              name="prompt"
              label="中文题干"
              rules={[
                { required: true, whitespace: true, message: "请输入题干。" }
              ]}
            >
              <Input.TextArea
                disabled={busy || !canModify}
                maxLength={2000}
                autoSize={{ minRows: 2, maxRows: 5 }}
              />
            </Form.Item>
            <Collapse
              activeKey={activeOption}
              accordion
              onChange={(key) =>
                setActiveOption(Array.isArray(key) ? (key[0] ?? "") : key)
              }
              items={options.map((candidate, index) => ({
                key: question.content.options[index]!.option_id,
                forceRender: true,
                label: (
                  <Space>
                    <span>{question.content.options[index]!.option_id}</span>
                    <strong className="tsz-words">{candidate.spelling}</strong>
                    <Tag>{index === correctIndex ? "正确项" : "干扰项"}</Tag>
                  </Space>
                ),
                children: (
                  <>
                    <Typography.Paragraph type="secondary">
                      {candidate.part_of_speech} · {candidate.definition} ·
                      来源释义 {candidate.level}
                    </Typography.Paragraph>
                    {index !== correctIndex && (
                      <Button
                        size="small"
                        disabled={busy || !canModify}
                        onClick={() => setPicker(index)}
                      >
                        从已发布词库更换
                      </Button>
                    )}
                    <Form.Item
                      name={["option_explanations", index]}
                      label={
                        index === correctIndex
                          ? "正确项说明"
                          : "为什么容易混淆、为什么错误"
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
                      <Input.TextArea
                        disabled={busy || !canModify}
                        maxLength={2000}
                        autoSize={{ minRows: 3, maxRows: 6 }}
                      />
                    </Form.Item>
                  </>
                )
              }))}
            />
            <Form.Item
              name="explanation"
              label="学生答后解析"
              rules={[
                {
                  required: true,
                  whitespace: true,
                  message: "请输入答后解析。"
                }
              ]}
              style={{ marginTop: 18 }}
            >
              <Input.TextArea
                disabled={busy || !canModify}
                maxLength={2000}
                autoSize={{ minRows: 3, maxRows: 7 }}
              />
            </Form.Item>
          </>
        ) : (
          <>
            <div className="qbw-reference-title">
              <Typography.Text strong>命题词义</Typography.Text>
              {canModify && (
                <Button
                  size="small"
                  aria-label="修改"
                  icon={<EditOutlined aria-hidden />}
                  disabled={busy}
                  onClick={() => {
                    setEditing(true);
                    setFocusPath(["prompt"]);
                  }}
                >
                  修改
                </Button>
              )}
            </div>
            <h3 className="tsz-words qbw-source-word">
              {question.content.target.spelling}
            </h3>
            <p>
              {question.content.target.part_of_speech} ·{" "}
              {question.content.target.definition}
            </p>
            <Tag>已发布智能词库 · 引用快照</Tag>
            <p className="qbw-source-meta">
              来源释义 {question.content.target.level} · 题目{" "}
              {question.content.question_level} /{" "}
              {question.content.answer_profile}
            </p>
            <Button
              type="link"
              size="small"
              onClick={() => setSource(question.content.target)}
            >
              查看引用的发布词义
            </Button>
            <section className="qbw-reference-section">
              <Typography.Text strong>四个选项与理由</Typography.Text>
              {options.map((candidate, index) => (
                <div
                  className="qbw-option-source"
                  key={question.content.options[index]!.option_id}
                >
                  <div>
                    <Space>
                      <Typography.Text type="secondary">
                        {question.content.options[index]!.option_id}
                      </Typography.Text>
                      <strong className="tsz-words">
                        {candidate.spelling}
                      </strong>
                    </Space>
                    {index === correctIndex ? (
                      <Tag color="success">正确项 · 固定</Tag>
                    ) : (
                      canModify && (
                        <Button
                          type="link"
                          size="small"
                          disabled={busy}
                          onClick={() => setPicker(index)}
                        >
                          更换
                        </Button>
                      )
                    )}
                  </div>
                  <p>
                    {candidate.part_of_speech} · {candidate.definition}
                  </p>
                  {!current(index) && <Tag color="warning">来源已变化</Tag>}
                  <details>
                    <summary>
                      {index === correctIndex
                        ? "为什么正确"
                        : "为什么容易混淆、为什么错误"}
                    </summary>
                    <p>{question.content.options[index]!.explanation}</p>
                    <Button
                      type="link"
                      size="small"
                      onClick={() => setSource(candidate)}
                    >
                      核查发布词义
                    </Button>
                  </details>
                </div>
              ))}
            </section>
            <section className="qbw-reference-section">
              <Typography.Paragraph type="secondary">
                同词性、不同词条和档位校验只是基础。仍需检查其他已发布释义，确保答案唯一。
              </Typography.Paragraph>
              <Button
                type="link"
                size="small"
                onClick={() => setOriginalOpen(true)}
              >
                生成原稿对照
              </Button>
              {question.review_comment && (
                <div>
                  <Typography.Text strong>上次审核意见</Typography.Text>
                  <p>{question.review_comment}</p>
                </div>
              )}
            </section>
          </>
        )}
      </aside>
      <footer className="qbw-review-actions">
        <div>
          <Typography.Text type="secondary">
            {editing
              ? dirty
                ? "有未保存的修改"
                : "当前版本尚未修改"
              : !reviewable
                ? "当前权限仅可查看或编辑，不能审核"
                : "每次决定仅作用于当前题目"}
          </Typography.Text>
        </div>
        <Space>
          {editing ? (
            <>
              <Button disabled={busy} onClick={discardEdit}>
                取消编辑
              </Button>
              <Button
                type="primary"
                disabled={!dirty || !canModify}
                loading={busy}
                onClick={() => void saveDraft()}
              >
                保存修改
              </Button>
            </>
          ) : (
            <>
              <Button disabled={busy} onClick={props.onSkip}>
                下一题
              </Button>
              {question.state === "approved" ? (
                <Button
                  danger
                  disabled={busy || !reviewable}
                  onClick={() => setDecision("disable")}
                >
                  停用题目
                </Button>
              ) : (
                <>
                  {question.state !== "disabled" && (
                    <Button
                      disabled={busy || !reviewable}
                      onClick={() => setDecision("reject")}
                    >
                      退回修改
                    </Button>
                  )}
                  <Button
                    type="primary"
                    icon={<ArrowRightOutlined aria-hidden />}
                    iconPlacement="end"
                    disabled={
                      busy ||
                      !reviewable ||
                      !sourceCurrent ||
                      semanticReviewBlocked
                    }
                    loading={busy}
                    onClick={() => void review("approve", true)}
                  >
                    {question.state === "draft"
                      ? "通过并下一题"
                      : "审核通过并启用"}
                  </Button>
                </>
              )}
            </>
          )}
        </Space>
      </footer>
      <CandidatePicker
        key={picker ?? "closed"}
        profile={props.profile}
        question={question}
        options={options}
        index={picker}
        allowCurrent={picker !== null && !current(picker)}
        onClose={() => setPicker(null)}
        onChoose={choose}
      />
      <PublishedSource
        candidate={source}
        current={
          source !== null &&
          (source.candidate_ref === question.content.target.candidate_ref
            ? targetCurrent
            : options.some(
                (c, i) => c.candidate_ref === source.candidate_ref && current(i)
              ))
        }
        onClose={() => setSource(null)}
      />
      <Drawer
        title="生成原稿与当前版本"
        open={originalOpen}
        onClose={() => setOriginalOpen(false)}
        size={920}
      >
        <div className="qbw-compare">
          {[
            ["生成原稿", question.original_content],
            ["当前已保存内容", question.content]
          ].map(([title, value]) => {
            const content = value as BankQuestion["content"];
            return (
              <section key={String(title)}>
                <Typography.Title level={5}>{String(title)}</Typography.Title>
                <p>{content.prompt}</p>
                {content.options.map((o) => (
                  <div key={o.option_id}>
                    <Typography.Text strong>
                      {o.option_id}. {o.candidate.spelling}
                    </Typography.Text>
                    <p>{o.explanation}</p>
                  </div>
                ))}
                <Typography.Text strong>答后解析</Typography.Text>
                <p>{content.explanation}</p>
              </section>
            );
          })}
        </div>
      </Drawer>
      <Modal
        title={decision === "disable" ? "停用这道题？" : "退回修改"}
        open={decision !== null}
        forceRender
        onCancel={() => {
          if (!busy) setDecision(null);
        }}
        okText={decision === "disable" ? "确认停用" : "确认退回"}
        cancelText="取消"
        confirmLoading={busy}
        cancelButtonProps={{ disabled: busy }}
        closable={!busy}
        onOk={() => {
          if (decision) void review(decision);
        }}
      >
        <Typography.Paragraph type="secondary">
          {decision === "disable"
            ? "停用后不再进入新的练习，已有学习记录和题目原稿保留。"
            : "选择需要修改的问题，可以多选。意见会随当前受审核版本保留。"}
        </Typography.Paragraph>
        <Form
          form={reviewForm}
          layout="vertical"
          initialValues={{ reason_codes: [], comment: "" }}
          disabled={busy}
        >
          <Form.Item name="reason_codes" label="审核原因">
            <Checkbox.Group options={reviewReasonOptions} />
          </Form.Item>
          <Form.Item name="comment" label="补充审核意见">
            <Input.TextArea
              maxLength={2000}
              autoSize={{ minRows: 3, maxRows: 6 }}
            />
          </Form.Item>
        </Form>
        {decision !== null && error && (
          <Alert type="error" showIcon title={error} />
        )}
      </Modal>
    </Form>
  );
}
