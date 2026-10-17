import {
  Accordion as MuiAccordion,
  AccordionSummary as MuiAccordionSummary,
  Box as MuiBox,
  AccordionDetails as MuiAccordionDetails
} from "@mui/material";
import { Card as MuiCard, CardContent as MuiCardContent } from "@mui/material";
import {
  Button as MuiButton,
  Chip as MuiChip,
  Stack as MuiStack,
  Typography as MuiTypography
} from "@mui/material";
import { RichTextReadOnly } from "@tsz/voice-editor/reader";
import {
  EMPTY_SYNTHESIS,
  pronunciationSynthesisContent,
  pronunciationSynthesisSpeech,
  synthesisInputIssue,
  synthesisLocaleIssue,
  pronunciationLocale,
  synthesisForLocale,
  pronunciationSynthesisLabel
} from "@tsz/shared";
import { useDialectPreference } from "@/features/settings/useDialectPreference";
import { PronunciationPreviewControls } from "../word-creation/PronunciationPreview";
import { useFormTypeLabel } from "../part-of-speech/FormTypeLabels";
import { usePartOfSpeechLabel } from "../part-of-speech/PartOfSpeechLabels";
import ReadOutlined from "@mui/icons-material/MenuBookOutlined";
import SoundOutlined from "@mui/icons-material/VolumeUpOutlined";

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
  dialect,
  legacyDialect
}: {
  pronunciation: WordPronunciationV3;
  spelling: string;
  dialect: Dialect;
  legacyDialect: Dialect;
}) {
  const { preference } = useDialectPreference();
  const locale = pronunciationLocale(dialect, preference);
  const synthesis = synthesisForLocale(
    pronunciation.synthesis ?? EMPTY_SYNTHESIS,
    locale,
    legacyDialect
  );
  const content = pronunciationSynthesisContent(
    spelling,
    pronunciation.synthesis ? synthesis : undefined,
    locale,
    dialect === "common"
  );
  return (
    <PronunciationPreviewControls
      playbackOnly
      pronunciationId={pronunciation.id}
      dialect={dialect}
      ariaLabelPrefix={`${spelling} ${pronunciation.synthesis?.uk || pronunciation.synthesis?.us ? `${dialect === "uk" ? "英式" : "美式"} ` : ""}最终读音`}
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
      voiceProfile={
        pronunciationSynthesisSpeech(synthesis)?.voice_profile ??
        pronunciation.voice_profile
      }
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
    return (
      <MuiTypography color="text.secondary">{"暂无词形与发音"}</MuiTypography>
    );
  return (
    <MuiStack direction="column" spacing={2}>
      {word.forms.pos.map((pos) => (
        <section className="v3-review-pos" key={pos.pos_id}>
          <MuiStack
            direction="row"
            alignItems={"center"}
            justifyContent={"space-between"}
          >
            <MuiTypography style={{ margin: 0 }} component="h4" variant="h6">
              {partOfSpeechLabel(pos.pos)}
            </MuiTypography>
            <MuiChip label={<>{pos.form_groups.length} 个变化组</>} />
          </MuiStack>
          <div className="v3-review-group-list">
            {pos.form_groups.length === 0 && (
              <MuiTypography component="span" color="text.secondary">
                暂无变化组
              </MuiTypography>
            )}
            {pos.form_groups.map((group, index) => (
              <div
                className="v3-review-group"
                data-testid={`preview-group-${group.id}`}
                key={group.id}
              >
                <MuiChip label={<>变化组 {index + 1}</>} />
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
                        {variant ? (
                          <>
                            {" · "}
                            <span
                              className="tsz-words"
                              style={{ fontWeight: 700 }}
                            >
                              {variant.spelling}
                            </span>
                          </>
                        ) : null}
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
                                <strong className="tsz-words">
                                  <RichTextReadOnly
                                    value={
                                      variant.spelling_rich ?? {
                                        version: 2,
                                        text: variant.spelling,
                                        annotations: []
                                      }
                                    }
                                    emptyText="待填写拼写"
                                  />
                                </strong>
                                <small>{dialectLabel(variant.dialect)}</small>
                              </>
                            )}
                          </td>
                          <td>
                            {pronunciation ? (
                              <>
                                <div className="v3-review-pronunciation-cell">
                                  {playback &&
                                    (pronunciation.synthesis?.uk ||
                                    pronunciation.synthesis?.us
                                      ? (["uk", "us"] as const)
                                      : [variant.dialect]
                                    ).map((dialect) => (
                                      <ReviewPronunciationPlayback
                                        key={dialect}
                                        pronunciation={pronunciation}
                                        spelling={variant.spelling}
                                        dialect={dialect}
                                        legacyDialect={variant.dialect}
                                      />
                                    ))}
                                  <RichTextReadOnly
                                    className="tsz-phonetics"
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
                                    : "未选择读法"}
                                </small>
                                {pronunciation.synthesis && (
                                  <small>
                                    {pronunciationSynthesisLabel(
                                      pronunciation.synthesis,
                                      variant.dialect
                                    )}
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
                                className="tsz-phonetics tsz-actual-pronunciation"
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
    </MuiStack>
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
        : "primary";
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
      <MuiCard className="v3-review-header" variant="outlined">
        <MuiCardContent className="admin-card-body">
          <MuiStack
            direction="row"
            spacing={3}
            alignItems={"flex-start"}
            justifyContent={"space-between"}
            useFlexGap
            flexWrap="wrap"
          >
            <div>
              <MuiTypography className="v3-review-kicker" component="span">
                当前词条
              </MuiTypography>
              <MuiTypography className="tsz-words" component="h2" variant="h4">
                {model.identity.label}
              </MuiTypography>
              <MuiStack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                <MuiChip label={<>{model.identity.kindLabel}</>} />
                <MuiChip label={<>{model.identity.languageLabel}</>} />
              </MuiStack>
              {model.state.status === "published" ||
              model.state.status === "archived" ? (
                <MuiTypography component="span" color="text.secondary">
                  当前词条为只读查看
                </MuiTypography>
              ) : null}
            </div>
            <MuiStack direction="column" spacing={1} alignItems={"flex-end"}>
              <MuiChip
                className="v3-review-status"
                color={statusColor}
                label={<>{model.state.statusLabel}</>}
              />
              {actions}
            </MuiStack>
          </MuiStack>
        </MuiCardContent>
      </MuiCard>

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
            <MuiBox>
              {[
                {
                  key: "forms",
                  label: (
                    <MuiStack direction="row" spacing={1} alignItems={"center"}>
                      <SoundOutlined fontSize="inherit" />
                      词形与发音
                    </MuiStack>
                  ),
                  children: (
                    <section id="review-forms">
                      {onEdit && (
                        <MuiButton
                          onClick={() =>
                            onEdit(word.forms.pos[0]?.pos_id ?? word.id)
                          }
                          variant={"text"}
                        >
                          编辑词形与发音
                        </MuiButton>
                      )}
                      <FormsReview word={word} playback={playback} />
                    </section>
                  )
                },
                {
                  key: "meanings",
                  label: (
                    <MuiStack direction="row" spacing={1} alignItems={"center"}>
                      <ReadOutlined fontSize="inherit" />
                      词义结构
                    </MuiStack>
                  ),
                  extra: (
                    <MuiTypography component="span" color="text.secondary">
                      释义、例句与关系
                    </MuiTypography>
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
              ].map((section) => (
                <MuiAccordion
                  data-admin-accordion
                  key={section.key}
                  disableGutters
                  expanded={openSections.includes(section.key)}
                  onChange={(event, nextExpanded) =>
                    ((keys) =>
                      setOpenSections(Array.isArray(keys) ? keys : [keys]))(
                      nextExpanded ? [section.key] : []
                    )
                  }
                  slotProps={{ transition: { mountOnEnter: true } }}
                >
                  <MuiAccordionSummary
                    component="div"
                    className="admin-section-header"
                  >
                    {section.label}
                    <MuiBox sx={{ ml: "auto" }}>{section.extra}</MuiBox>
                  </MuiAccordionSummary>
                  <MuiAccordionDetails className="admin-section-body">
                    {section.children}
                  </MuiAccordionDetails>
                </MuiAccordion>
              ))}
            </MuiBox>
          </div>
        </div>
      </div>
    </section>
  );
}
