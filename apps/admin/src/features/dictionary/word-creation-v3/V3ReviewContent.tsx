import { RichTextReadOnly } from "@tsz/voice-editor/reader";
import {
  EMPTY_SYNTHESIS,
  pronunciationSynthesisContent,
  synthesisInputIssue,
  synthesisLocaleIssue,
  pronunciationLocale
} from "@tsz/shared";
import { useDialectPreference } from "@/features/settings/useDialectPreference";
import { PronunciationPreviewControls } from "../word-creation/PronunciationPreview";
import { useFormTypeLabel } from "../part-of-speech/FormTypeLabels";
import { usePartOfSpeechLabel } from "../part-of-speech/PartOfSpeechLabels";
import { ReadOutlined, SoundOutlined } from "@ant-design/icons";
import { Button, Card, Collapse, Empty, Flex, Tag, Typography } from "antd";
import type { AdminWordV3, Dialect, WordPronunciationV3 } from "@tsz/types";
import { useEffect, useState, type ReactNode } from "react";
import { dialectLabel, pronunciationStyleLabel } from "./presentation";
import { buildV3ReviewModel } from "./reviewModel";
import { V3MeaningsPreview, reviewSenseTitle } from "./V3MeaningsPreview";
import "./v3-preview.css";

interface Props {
  word: AdminWordV3;
  actions?: ReactNode;
  readiness?: ReactNode;
  sentenceCount?: number | null;
  playback?: boolean;
  renderSentences?: (senseId: string) => ReactNode;
  onEdit?: (nodeId: string) => void;
}

function ReviewPronunciationPlayback({
  pronunciation,
  spelling,
  dialect
}: {
  pronunciation: WordPronunciationV3;
  spelling: string;
  dialect: Dialect;
}) {
  const synthesis = pronunciation.synthesis ?? EMPTY_SYNTHESIS;
  const { preference } = useDialectPreference();
  const locale = pronunciationLocale(dialect, preference);
  const content = pronunciationSynthesisContent(
    spelling,
    pronunciation.synthesis,
    locale,
    dialect === "common"
  );
  return (
    <PronunciationPreviewControls
      playbackOnly
      pronunciationId={pronunciation.id}
      dialect={dialect}
      ariaLabelPrefix={`${spelling} 最终读音`}
      disabled={!content}
      disabledReason={
        content
          ? undefined
          : (synthesisInputIssue(
              synthesis.alphabet,
              synthesis[synthesis.alphabet]
            ) ??
            synthesisLocaleIssue(
              synthesis,
              synthesis.alphabet,
              locale,
              dialect === "common"
            ) ??
            (!spelling.trim() ? "请先填写词形拼写" : undefined))
      }
      content={content ?? { version: 2, text: "", annotations: [] }}
      voiceProfile={pronunciation.voice_profile}
    />
  );
}

function FormsReview({
  word,
  playback = false
}: {
  word: AdminWordV3;
  playback?: boolean;
}) {
  const formTypeLabel = useFormTypeLabel();
  const partOfSpeechLabel = usePartOfSpeechLabel();
  if (word.forms.pos.length === 0)
    return <Empty description="暂无词形与发音" />;
  return (
    <Flex vertical gap="middle">
      {word.forms.pos.map((pos) => (
        <section className="v3-review-pos" key={pos.pos_id}>
          <Flex align="center" justify="space-between">
            <Typography.Title level={4} style={{ margin: 0 }}>
              {partOfSpeechLabel(pos.pos)}
            </Typography.Title>
            <Tag>{pos.form_groups.length} 个变化组</Tag>
          </Flex>
          <div className="v3-review-group-list">
            {pos.form_groups.length === 0 && (
              <Typography.Text type="secondary">暂无变化组</Typography.Text>
            )}
            {pos.form_groups.map((group, index) => (
              <div
                className="v3-review-group"
                data-testid={`preview-group-${group.id}`}
                key={group.id}
              >
                <Tag>变化组 {index + 1}</Tag>
                <span className="v3-review-form-chain">
                  {group.members.map((member, i) => {
                    const form = pos.forms.find((f) => f.id === member.form_id);
                    const variant =
                      form?.regional_variants.mode === "common"
                        ? form.regional_variants.common
                        : form?.regional_variants.uk;
                    return (
                      <span
                        data-testid={`preview-membership-${member.id}`}
                        key={member.id}
                      >
                        {i > 0 && <small> → </small>}
                        {i + 1}.{" "}
                        {form ? formTypeLabel(form.form_type) : "未知词形"}
                        {variant ? ` · ${variant.spelling}` : ""}
                      </span>
                    );
                  })}
                </span>
              </div>
            ))}
          </div>
          <div className="v3-review-table-scroll">
            <table className="v3-review-form-table">
              <thead>
                <tr>
                  <th>词形</th>
                  <th>拼写 / 方言</th>
                  <th>字典音标</th>
                  <th>实际发音</th>
                </tr>
              </thead>
              {pos.forms.map((form) => {
                const variants =
                  form.regional_variants.mode === "common"
                    ? [form.regional_variants.common]
                    : [form.regional_variants.uk, form.regional_variants.us];
                return (
                  <tbody key={form.id} data-testid={`preview-form-${form.id}`}>
                    {variants.flatMap((variant) =>
                      (variant.pronunciations.length
                        ? variant.pronunciations
                        : [null]
                      ).map((pronunciation, index) => (
                        <tr
                          key={`${variant.id}:${pronunciation?.id ?? "empty"}`}
                          data-testid={
                            pronunciation
                              ? `preview-pronunciation-${pronunciation.id}`
                              : undefined
                          }
                        >
                          <td>
                            {index === 0 && formTypeLabel(form.form_type)}
                          </td>
                          <td>
                            {index === 0 && (
                              <>
                                <strong className="tsz-entry-en">
                                  {variant.spelling || "待填写拼写"}
                                </strong>
                                <small>{dialectLabel(variant.dialect)}</small>
                              </>
                            )}
                          </td>
                          <td>
                            {pronunciation ? (
                              <>
                                <div className="v3-review-pronunciation-cell">
                                  {playback && (
                                    <ReviewPronunciationPlayback
                                      pronunciation={pronunciation}
                                      spelling={variant.spelling}
                                      dialect={variant.dialect}
                                    />
                                  )}
                                  <RichTextReadOnly
                                    value={
                                      pronunciation.dict_phonetic_rich ?? {
                                        version: 2,
                                        text: pronunciation.dict_phonetic,
                                        annotations: []
                                      }
                                    }
                                  />
                                </div>
                                <small>
                                  {pronunciation.style
                                    ? pronunciationStyleLabel(
                                        pronunciation.style
                                      )
                                    : "未选择发音方式"}
                                </small>
                                {pronunciation.synthesis && (
                                  <small>
                                    {pronunciation.synthesis.use_spelling
                                      ? "词形拼写（语音来源）"
                                      : `Azure ${pronunciation.synthesis.alphabet.toUpperCase()}：${pronunciation.synthesis[pronunciation.synthesis.alphabet] || "未填写"}`}
                                  </small>
                                )}
                              </>
                            ) : (
                              "暂无发音"
                            )}
                          </td>
                          <td>
                            {pronunciation && (
                              <RichTextReadOnly
                                value={
                                  pronunciation.actual_pron_rich ?? {
                                    version: 2,
                                    text: pronunciation.actual_pron,
                                    annotations: []
                                  }
                                }
                              />
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                );
              })}
            </table>
          </div>
        </section>
      ))}
    </Flex>
  );
}

export function V3ReviewContent({
  word,
  actions,
  readiness,
  sentenceCount,
  playback,
  renderSentences,
  onEdit
}: Props) {
  const posLabel = usePartOfSpeechLabel();
  const [openSections, setOpenSections] = useState<string[]>([
    "forms",
    "meanings"
  ]);
  const [activeId, setActiveId] = useState("review-forms");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -55% 0px", threshold: 0 }
    );
    document
      .querySelectorAll(
        ".v3-review [id^=review-sense-], .v3-review #review-forms"
      )
      .forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [word.id, word.revision]);
  const jump = (id: string) => {
    setActiveId(id);
    setOpenSections((current) =>
      Array.from(
        new Set([...current, id === "review-forms" ? "forms" : "meanings"])
      )
    );
    requestAnimationFrame(() =>
      document
        .getElementById(id)
        ?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  };
  const model = buildV3ReviewModel(word);
  const statusColor =
    model.state.status === "published"
      ? "success"
      : model.state.status === "archived"
        ? "warning"
        : "processing";
  const summaryItems = [
    ["基本词性", model.summary.posCount],
    ["原形数", model.summary.baseCount],
    ["全部词形", model.summary.formCount],
    ["发音", model.summary.pronunciationCount],
    ["词义", model.summary.senseCount],
    [
      "例句",
      sentenceCount === null
        ? "—"
        : (sentenceCount ?? model.summary.sentenceCount)
    ],
    ["关系词", model.summary.relationCount]
  ] as const;

  return (
    <section className="v3-review" aria-label="预览并生效">
      <Card className="v3-review-header">
        <Flex align="flex-start" justify="space-between" gap="large" wrap>
          <div>
            <Typography.Text className="v3-review-kicker">
              当前词条
            </Typography.Text>
            <Typography.Title className="tsz-entry-en" level={2}>
              {model.identity.label}
            </Typography.Title>
            <Flex gap="small" wrap>
              <Tag>{model.identity.kindLabel}</Tag>
              <Tag>{model.identity.languageLabel}</Tag>
            </Flex>
            {model.state.status === "published" ||
            model.state.status === "archived" ? (
              <Typography.Text type="secondary">
                当前词条为只读查看
              </Typography.Text>
            ) : null}
          </div>
          <Flex vertical align="flex-end" gap="small">
            <Tag className="v3-review-status" color={statusColor}>
              {model.state.statusLabel}
            </Tag>
            {actions}
          </Flex>
        </Flex>
      </Card>

      <div className="v3-review-summary" aria-label="内容概览">
        <span>内容概览</span>
        {summaryItems.map(([label, value]) => (
          <span key={label}>
            <strong>{value}</strong> {label}
          </span>
        ))}
      </div>
      <div className="v3-review-reading-layout">
        <nav className="v3-review-index" aria-label="词条阅读目录">
          <div className="v3-review-index-title">本词条</div>
          <button
            type="button"
            aria-current={activeId === "review-forms" ? "location" : undefined}
            onClick={() => jump("review-forms")}
          >
            词形与发音
          </button>
          {word.meanings.pos.map((pos) => (
            <div key={pos.pos_id}>
              <strong>
                {posLabel(
                  word.forms.pos.find((p) => p.pos_id === pos.pos_id)?.pos ?? ""
                )}
              </strong>
              {pos.senses.map((sense, index) => (
                <button
                  key={sense.id}
                  type="button"
                  aria-current={
                    activeId === `review-sense-${sense.id}`
                      ? "location"
                      : undefined
                  }
                  onClick={() => jump(`review-sense-${sense.id}`)}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {reviewSenseTitle(sense)}
                </button>
              ))}
            </div>
          ))}
          <a href="#review-publish">发布检查 ↓</a>
        </nav>
        <div className="v3-review-paper">
          <div className="v3-review-readiness" role="status">
            {readiness ?? "当前内容已保存，可查看内容或发布历史。"}
          </div>
          <div className="v3-review-content">
            <Collapse
              activeKey={openSections}
              onChange={(keys) =>
                setOpenSections(Array.isArray(keys) ? keys : [keys])
              }
              items={[
                {
                  key: "forms",
                  label: (
                    <Flex align="center" gap="small">
                      <SoundOutlined />
                      词形与发音
                    </Flex>
                  ),
                  children: (
                    <section id="review-forms">
                      {onEdit && (
                        <Button
                          type="link"
                          onClick={() =>
                            onEdit(word.forms.pos[0]?.pos_id ?? word.id)
                          }
                        >
                          编辑词形与发音
                        </Button>
                      )}
                      <FormsReview word={word} playback={playback} />
                    </section>
                  )
                },
                {
                  key: "meanings",
                  label: (
                    <Flex align="center" gap="small">
                      <ReadOutlined />
                      词义结构
                    </Flex>
                  ),
                  extra: (
                    <Typography.Text type="secondary">
                      释义、例句与关系
                    </Typography.Text>
                  ),
                  children: (
                    <V3MeaningsPreview
                      embedded
                      word={word}
                      renderSentences={renderSentences}
                      onEdit={onEdit}
                    />
                  )
                }
              ]}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
