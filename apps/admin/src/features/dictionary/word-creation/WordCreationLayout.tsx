import {
  CheckCircleFilled,
  ClockCircleOutlined,
  LeftOutlined,
  MinusCircleOutlined
} from "@ant-design/icons";
import { Breadcrumb, Button, Flex, Steps, Tag, Typography } from "antd";
import type {
  AdminWordV2,
  WordCreationStep,
  WordHeadwordsV2
} from "@tsz/types";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDialectPreference } from "@/features/settings/useDialectPreference";
import type { PartOfSpeechLookup } from "../part-of-speech/catalog";
import { WORD_STEP_ORDER, WORD_STEP_TITLE, wordDisplayHeadword } from "./model";
import {
  buildWordReadiness,
  type ReadinessTarget,
  type WordReadinessDraft
} from "./readiness";
import "./word-creation.css";

interface Props {
  word?: AdminWordV2;
  entryKind?: AdminWordV2["kind"];
  draftHeadwords?: WordHeadwordsV2;
  currentStep: WordCreationStep;
  reachableSteps?: ReadonlySet<WordCreationStep>;
  readOnly?: boolean;
  onStepChange?: (step: WordCreationStep) => void;
  readinessDraft?: WordReadinessDraft;
  partOfSpeechLookup?: PartOfSpeechLookup;
  onReadinessNavigate?: (target: ReadinessTarget) => void;
  presentation?: {
    wordExists: boolean;
    breadcrumbTitle: ReactNode;
    completedSteps: readonly WordCreationStep[];
    summaryHeadword: ReactNode;
    status?: ReactNode;
    progress: ReactNode;
  };
  children: ReactNode;
}

const STEP_SUBTITLE: Record<WordCreationStep, string> = {
  basics: "所属语言｜英美区分",
  forms: "词性分类｜词形变化",
  meanings: "多维释义｜多维例句",
  preview: "结构核对｜提交生效"
};

function HeadwordSummary({ headwords }: { headwords?: WordHeadwordsV2 }) {
  const { preference } = useDialectPreference();
  if (!headwords) {
    return (
      <Typography.Text className="word-summary-pending-detection">
        待检测
      </Typography.Text>
    );
  }
  if (headwords.mode === "unified") {
    return (
      <div className="word-creation-summary-headword">
        <span className="dialect-dot dialect-dot-common" />
        <strong>{headwords.common}</strong>
      </div>
    );
  }
  // 偏好侧排首位并保持主视觉。原先按检测基准侧排(手测 C5)：输入 center 却看到
  // centre 在前且字号更大，会被读成主词被静默换成了另一侧拼写。
  const sides = (
    preference === "uk" ? (["uk", "us"] as const) : (["us", "uk"] as const)
  ).map((dialect) => ({
    dialect,
    spelling: dialect === "uk" ? headwords.uk : headwords.us,
    caption: dialect === "uk" ? "英式英语 · BrE" : "美式英语 · AmE",
    // 「检测基准」标在真正命中的那一侧，不再等同于首行——首行现在按偏好排。
    detectionBasis: dialect === headwords.source_dialect
  }));
  return (
    <Flex vertical gap={5}>
      {sides.map(({ dialect, spelling, caption, detectionBasis }, index) => (
        <div
          key={dialect}
          className={`word-creation-summary-headword${index === 0 ? "" : " word-creation-summary-alt"}`}
        >
          <span className={`dialect-dot dialect-dot-${dialect}`} />
          {index === 0 ? <strong>{spelling}</strong> : <span>{spelling}</span>}
          <small>
            {caption}
            {detectionBasis ? " · 检测基准" : ""}
          </small>
        </div>
      ))}
    </Flex>
  );
}

function ProgressSummary({
  word,
  draft,
  partOfSpeechLookup,
  onNavigate
}: {
  word?: AdminWordV2;
  draft?: WordReadinessDraft;
  partOfSpeechLookup?: PartOfSpeechLookup;
  onNavigate?: (target: ReadinessTarget) => void;
}) {
  // 完成度按偏好口径算：存量双份词条保存后只留偏好侧，未收敛的原值会误报未完成。
  const { preference } = useDialectPreference();
  const rows = buildWordReadiness(word, draft, partOfSpeechLookup, preference);
  return (
    <Flex vertical gap={13} className="word-creation-progress-list">
      {rows.map((row) => {
        const done = row.state === "complete";
        // 「无需填写」是中性态:不打勾也不催办,避免 0/0 被读成已完成。
        const notRequired = row.state === "not_required";
        const value = notRequired
          ? "无需填写"
          : row.key === "dialect"
            ? done
              ? "完成"
              : "待完成"
            : `${row.completed}/${row.total}`;
        return (
          <button
            type="button"
            className="word-creation-progress-row"
            data-readiness-state={row.state}
            disabled={!row.target || !onNavigate}
            key={row.key}
            onClick={() => row.target && onNavigate?.(row.target)}
          >
            {done ? (
              <CheckCircleFilled className="word-progress-done" />
            ) : notRequired ? (
              <MinusCircleOutlined className="word-progress-none" />
            ) : (
              <ClockCircleOutlined className="word-progress-wait" />
            )}
            <span>{row.label}</span>
            <Typography.Text type="secondary">{value}</Typography.Text>
          </button>
        );
      })}
    </Flex>
  );
}

export function WordCreationLayout({
  word,
  entryKind,
  draftHeadwords,
  currentStep,
  reachableSteps,
  readOnly,
  onStepChange,
  readinessDraft,
  partOfSpeechLookup,
  onReadinessNavigate,
  presentation,
  children
}: Props) {
  const navigate = useNavigate();
  const currentIndex = WORD_STEP_ORDER.indexOf(currentStep);
  const isBasicsStep = currentStep === "basics";
  const completed = new Set(
    presentation?.completedSteps ?? word?.completed_steps ?? []
  );
  const wordExists = presentation?.wordExists ?? Boolean(word);
  const steps = WORD_STEP_ORDER.map((step) => ({
    title: WORD_STEP_TITLE[step],
    content: STEP_SUBTITLE[step],
    // 只认后端记的 completed_steps。原先「排在当前步之前就算完成」是靠顺序门禁
    // 兜底才成立的；门禁取消后可以越步进入，再用位置推断会把没做完的步骤画成绿勾。
    status:
      currentStep === step
        ? ("process" as const)
        : completed.has(step as "basics" | "forms" | "meanings")
          ? ("finish" as const)
          : ("wait" as const),
    // 只有「草稿还没创建」才禁用：完成度不再决定导航权限，四步随时可进。
    disabled:
      !wordExists ||
      Boolean(readOnly) ||
      Boolean(reachableSteps && !reachableSteps.has(step))
  }));
  const { preference } = useDialectPreference();
  const createTitle =
    entryKind === "word"
      ? "创建单词"
      : entryKind === "phrase"
        ? "创建短语"
        : "创建词条";

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
            title: presentation
              ? presentation.breadcrumbTitle
              : word
                ? `${wordDisplayHeadword(word, preference)} · ${WORD_STEP_TITLE[currentStep]}`
                : createTitle
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

      <div className="word-creation-shell">
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
            {presentation?.summaryHeadword ?? (
              <HeadwordSummary headwords={word?.headwords ?? draftHeadwords} />
            )}

            <div className="word-summary-language">
              <Typography.Text type="secondary">所属语言</Typography.Text>
              <strong>English&nbsp; 英语</strong>
            </div>

            {presentation?.status ??
              (word?.status === "archived" ? (
                <Tag color="warning" style={{ alignSelf: "flex-start" }}>
                  垃圾桶 · 只读
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
              ) : null)}
          </div>

          <div className="word-summary-progress-title">
            <Typography.Text type="secondary" className="word-summary-kicker">
              完成情况
            </Typography.Text>
            <Tag variant="filled">实时</Tag>
          </div>
          {presentation?.progress ?? (
            <ProgressSummary
              word={word}
              draft={readinessDraft}
              partOfSpeechLookup={partOfSpeechLookup}
              onNavigate={onReadinessNavigate}
            />
          )}
        </section>

        <main
          className={`word-creation-content${isBasicsStep ? " word-creation-content--basics" : ""}`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
