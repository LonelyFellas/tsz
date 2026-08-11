import {
  CheckCircleFilled,
  ClockCircleOutlined,
  LeftOutlined
} from "@ant-design/icons";
import { Breadcrumb, Button, Flex, Steps, Tag, Typography } from "antd";
import type {
  AdminWordV2,
  WordCreationStep,
  WordHeadwordsV2
} from "@tsz/types";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { WORD_STEP_ORDER, WORD_STEP_TITLE, wordDisplayHeadword } from "./model";
import "./word-creation.css";

interface Props {
  word?: AdminWordV2;
  draftHeadwords?: WordHeadwordsV2;
  currentStep: WordCreationStep;
  readOnly?: boolean;
  onStepChange?: (step: WordCreationStep) => void;
  children: ReactNode;
}

const STEP_SUBTITLE: Record<WordCreationStep, string> = {
  basics: "所属语言｜英美区分",
  forms: "词性分类｜词形变化",
  meanings: "多维释义｜多维例句",
  preview: "字典预览｜提交生效"
};

function HeadwordSummary({ headwords }: { headwords?: WordHeadwordsV2 }) {
  if (!headwords) {
    return <Typography.Text type="secondary">完成检测后显示</Typography.Text>;
  }
  if (headwords.mode === "unified") {
    return (
      <div className="word-creation-summary-headword">
        <span className="dialect-dot dialect-dot-common" />
        <strong>{headwords.common}</strong>
      </div>
    );
  }
  return (
    <Flex vertical gap={5}>
      <div className="word-creation-summary-headword">
        <span className="dialect-dot dialect-dot-uk" />
        <strong>{headwords.uk}</strong>
        <small>英式英语 · BrE</small>
      </div>
      <div className="word-creation-summary-headword word-creation-summary-alt">
        <span className="dialect-dot dialect-dot-us" />
        <span>{headwords.us}</span>
        <small>美式英语 · AmE</small>
      </div>
    </Flex>
  );
}

function ProgressSummary({ word }: { word?: AdminWordV2 }) {
  const senseGroupCount = word
    ? Math.max(1, word.meanings.sense_groups.length)
    : 0;
  const grammarCount =
    word?.meanings.pos.reduce(
      (sum, pos) => sum + pos.grammar_structures.length,
      0
    ) ?? 0;
  const senseCount =
    word?.meanings.pos.reduce((sum, pos) => sum + pos.senses.length, 0) ?? 0;
  const sentenceCount =
    word?.meanings.pos.reduce(
      (sum, pos) =>
        sum +
        pos.senses.reduce(
          (senseSum, sense) => senseSum + sense.sentences.length,
          0
        ),
      0
    ) ?? 0;
  const formCount =
    word?.forms.pos.reduce(
      (sum, pos) =>
        sum +
        pos.form_groups.reduce(
          (groupSum, group) => groupSum + group.slots.length,
          0
        ),
      0
    ) ?? 0;
  const completed = new Set(word?.completed_steps ?? []);
  const rows = [
    { label: "方言识别", value: completed.has("basics") ? "完成" : "待完成" },
    {
      label: "基本词性",
      value: word?.forms.pos.length ?? 0
    },
    { label: "词形变化", value: formCount },
    { label: "语义区间", value: senseGroupCount },
    { label: "语法结构", value: grammarCount },
    { label: "多维词义", value: senseCount },
    { label: "多维例句", value: sentenceCount }
  ];
  return (
    <Flex vertical gap={13} className="word-creation-progress-list">
      {rows.map((row, index) => {
        const done =
          index === 0
            ? completed.has("basics")
            : typeof row.value === "number" && row.value > 0;
        return (
          <div className="word-creation-progress-row" key={row.label}>
            {done ? (
              <CheckCircleFilled className="word-progress-done" />
            ) : (
              <ClockCircleOutlined className="word-progress-wait" />
            )}
            <span>{row.label}</span>
            <Typography.Text type="secondary">{row.value}</Typography.Text>
          </div>
        );
      })}
    </Flex>
  );
}

export function WordCreationLayout({
  word,
  draftHeadwords,
  currentStep,
  readOnly,
  onStepChange,
  children
}: Props) {
  const navigate = useNavigate();
  const currentIndex = WORD_STEP_ORDER.indexOf(currentStep);
  const isBasicsStep = currentStep === "basics";
  const maxReachableIndex = word
    ? WORD_STEP_ORDER.indexOf(word.max_reachable_step)
    : 0;
  const completed = new Set(word?.completed_steps ?? []);
  const steps = WORD_STEP_ORDER.map((step, index) => ({
    title: WORD_STEP_TITLE[step],
    content: STEP_SUBTITLE[step],
    status:
      currentStep === step
        ? ("process" as const)
        : completed.has(step as "basics" | "forms" | "meanings") ||
            index < currentIndex
          ? ("finish" as const)
          : ("wait" as const),
    disabled: !word || index > maxReachableIndex
  }));

  return (
    <div className="word-creation-page">
      <Breadcrumb
        className="word-creation-breadcrumb"
        items={[
          { title: "词库管理" },
          {
            title: <Link to="/words">智能词库</Link>
          },
          {
            title: word
              ? `${wordDisplayHeadword(word)} · ${WORD_STEP_TITLE[currentStep]}`
              : "创建单词"
          }
        ]}
      />

      <section
        className={`word-creation-stepper${isBasicsStep ? " word-creation-stepper--basics" : ""}`}
      >
        <Steps
          className="word-creation-steps"
          current={currentIndex}
          responsive={false}
          items={steps}
          onChange={(index) => onStepChange?.(WORD_STEP_ORDER[index]!)}
        />
      </section>

      <div
        className={`word-creation-shell${isBasicsStep ? " word-creation-shell--basics" : ""}`}
      >
        {!isBasicsStep && (
          <section className="word-creation-summary" aria-label="词条摘要">
            <Button
              type="text"
              icon={<LeftOutlined />}
              onClick={() => navigate("/words")}
              className="word-creation-back"
            >
              返回智能词库
            </Button>

            <div className="word-summary-entry-card">
              <Typography.Text type="secondary" className="word-summary-kicker">
                当前词条
              </Typography.Text>
              <HeadwordSummary headwords={word?.headwords ?? draftHeadwords} />

              <div className="word-summary-language">
                <Typography.Text type="secondary">所属语言</Typography.Text>
                <strong>English&nbsp; 英语</strong>
              </div>

              {word?.status === "archived" ? (
                <Tag color="warning" style={{ alignSelf: "flex-start" }}>
                  已归档 · 只读
                </Tag>
              ) : word?.status === "published" ? (
                <Tag
                  color={readOnly ? "success" : "processing"}
                  style={{ alignSelf: "flex-start" }}
                >
                  {readOnly
                    ? "已发布 · 只读"
                    : word.has_unpublished_changes
                      ? "已发布 · 编辑未发布修改"
                      : "已发布 · 编辑中"}
                </Tag>
              ) : null}
            </div>

            <div className="word-summary-progress-title">
              <Typography.Text type="secondary" className="word-summary-kicker">
                完成情况
              </Typography.Text>
              <Tag bordered={false}>实时</Tag>
            </div>
            <ProgressSummary word={word} />
          </section>
        )}

        <main
          className={`word-creation-content${isBasicsStep ? " word-creation-content--basics" : ""}`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
