import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { HttpError } from "@tsz/api-client";
import type {
  AdminWordV2,
  CefrLevel,
  RelatedWordResult,
  RelatedSearchResponse,
  WordSenseV2,
  WordSentenceV2
} from "@tsz/types";
import type {
  LinkedSentenceAssociationV1,
  PendingSentenceAssociationItemV1,
  PendingSentenceAssociationV1,
  ResolveSentenceAssociationResponse,
  SentenceFormCandidateV1,
  SentenceSourceRangeV1,
  SharedWordSentenceV1
} from "./sentenceAssociationTypes";
import {
  Alert,
  App,
  Button,
  Card,
  Drawer,
  Flex,
  Input,
  Select,
  Space,
  Tag,
  Typography
} from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDialectPreference } from "@/features/settings/useDialectPreference";
import { sentenceAssociationsDataSource } from "../../dataSource";
import { useRelatedSearchV2 } from "../../api";
import { CEFR_OPTIONS } from "../../labels";
import { newWordNodeId, toWordRichText } from "../../word-model/primitives";
import { collapseEnglishText } from "../model";
import {
  addSentenceAssociation,
  deriveSharedSentencesForSense,
  normalizePendingWord,
  prepareSharedSentenceTextChange,
  renderSharedSentence,
  resolveSentenceAssociationFromWord,
  selectionToSourceRange,
  sharedSentenceIssueField
} from "./sentenceAssociationModel";

interface Props {
  word: AdminWordV2;
  sense: WordSenseV2;
  value: SharedWordSentenceV1[];
  readOnly?: boolean;
  showPendingClaims?: boolean;
  onChange: (
    next: SharedWordSentenceV1[],
    legacySentences: WordSentenceV2[]
  ) => void;
}

interface TargetChoice {
  key: string;
  word_id: string;
  sense_id: string;
  headword: string;
  gloss: string;
  current?: boolean;
}

interface ResolutionState {
  target: TargetChoice;
  response: ResolveSentenceAssociationResponse;
}

function emptyRichText() {
  return { version: 1 as const, text: "", spans: [], liaisons: [] };
}

function createMultidimensionalSentence(): SharedWordSentenceV1 {
  return {
    id: newWordNodeId(),
    level: "A1",
    en_text_id: newWordNodeId(),
    en_text: emptyRichText(),
    zh_text_id: newWordNodeId(),
    zh_text: emptyRichText(),
    associations: []
  };
}

function upgradeLegacySentence(
  sentence: WordSentenceV2,
  wordId: string,
  senseId: string,
  preference: "uk" | "us"
): SharedWordSentenceV1 {
  const english = collapseEnglishText(sentence.en_text, preference).common;
  const associations = sentence.links.map((link, index) => ({
    id: newWordNodeId(),
    state: "legacy_unpositioned" as const,
    target_word_id: link.word_id,
    target_sense_id: link.sense_id,
    legacy_role: link.role,
    sort_order: index
  }));
  if (
    !associations.some(
      (association) =>
        association.target_word_id === wordId &&
        association.target_sense_id === senseId
    )
  ) {
    associations.unshift({
      id: newWordNodeId(),
      state: "legacy_unpositioned",
      target_word_id: wordId,
      target_sense_id: senseId,
      legacy_role: "focus",
      sort_order: 0
    });
  }
  return {
    id: sentence.id,
    level: sentence.level,
    en_text_id: english.id,
    en_text: english.value,
    zh_text_id: sentence.zh_text_id,
    zh_text: sentence.zh_text,
    associations
  };
}

function targetChoices(results: RelatedWordResult[]): TargetChoice[] {
  return results.flatMap((word) =>
    word.senses.map((sense) => ({
      key: `${word.word_id}:${sense.sense_id}`,
      word_id: word.word_id,
      sense_id: sense.sense_id,
      headword: word.headword,
      gloss: sense.gloss
    }))
  );
}

function relatedSearchResults(pages: RelatedSearchResponse[] | undefined) {
  return pages?.flatMap((page) => page.results) ?? [];
}

function uniqueTargetWords(results: RelatedWordResult[]) {
  return Array.from(
    new Map(results.map((result) => [result.word_id, result])).values()
  );
}

function currentSenseChoice(
  word: AdminWordV2,
  sense: WordSenseV2
): TargetChoice {
  const gloss =
    sense.definitions
      .map((definition) =>
        "content_id" in definition ? definition.content.text.trim() : ""
      )
      .find(Boolean) ?? sense.id;
  return {
    key: `${word.id}:${sense.id}`,
    word_id: word.id,
    sense_id: sense.id,
    headword:
      word.headwords.mode === "unified"
        ? word.headwords.common
        : `${word.headwords.uk} / ${word.headwords.us}`,
    gloss,
    current: true
  };
}

function formLabel(candidate: SentenceFormCandidateV1): string {
  const variants = candidate.variants
    .map((variant) => `${variant.dialect}: ${variant.spelling}`)
    .join(" / ");
  return `${candidate.pos} · ${candidate.form_type}${variants ? ` · ${variants}` : ""}`;
}

function MultidimensionalSentenceDrawerContent({
  word,
  sense,
  value,
  readOnly,
  onChange,
  onReannotationRemainingChange,
  onEnglishDraftDirtyChange
}: {
  word: AdminWordV2;
  sense: WordSenseV2;
  value: SharedWordSentenceV1;
  readOnly?: boolean;
  onChange: (next: SharedWordSentenceV1) => void;
  onReannotationRemainingChange: (remaining: number) => void;
  onEnglishDraftDirtyChange: (dirty: boolean) => void;
}) {
  const { message, modal } = App.useApp();
  const { preference } = useDialectPreference();
  const [englishDraft, setEnglishDraft] = useState(value.en_text.text);
  const [selection, setSelection] = useState<SentenceSourceRangeV1>();
  const [selectionError, setSelectionError] = useState<string>();
  const [selectedTargetKey, setSelectedTargetKey] = useState<string>();
  const [resolution, setResolution] = useState<ResolutionState>();
  const [selectedFormSlotId, setSelectedFormSlotId] = useState<string>();
  const [resolving, setResolving] = useState(false);
  const [feedback, setFeedback] = useState<string>();
  const [reannotationTargetCount, setReannotationTargetCount] = useState(0);
  const [reannotationSuggestions, setReannotationSuggestions] = useState<
    Array<LinkedSentenceAssociationV1 | PendingSentenceAssociationV1>
  >([]);
  const resolveVersion = useRef(0);
  const relatedSearch = useRelatedSearchV2(
    selection?.surface ?? "",
    "word",
    !readOnly && Boolean(selection) && englishDraft === value.en_text.text
  );
  const currentTargetResolution = useMemo(() => {
    if (!selection || englishDraft !== value.en_text.text) return undefined;
    return resolveSentenceAssociationFromWord(
      {
        en_text: value.en_text,
        source_range: selection,
        target_word_id: word.id,
        target_sense_id: sense.id,
        current_word_id: word.id
      },
      word,
      { allowDraft: true }
    );
  }, [englishDraft, selection, sense, value.en_text, word]);
  const currentTarget = useMemo(
    () =>
      currentTargetResolution?.resolution === "unmatched" ||
      !currentTargetResolution
        ? undefined
        : currentSenseChoice(word, sense),
    [currentTargetResolution, sense, word]
  );
  const exactResults = uniqueTargetWords(
    relatedSearchResults(relatedSearch.exact.data?.pages)
  ).filter((result) => result.kind === "word");
  const exactWordIds = new Set(exactResults.map((result) => result.word_id));
  const containsResults = uniqueTargetWords(
    relatedSearchResults(relatedSearch.contains.data?.pages)
  ).filter(
    (result) => result.kind === "word" && !exactWordIds.has(result.word_id)
  );
  const targets = [
    ...(currentTarget ? [currentTarget] : []),
    ...targetChoices([...exactResults, ...containsResults]).filter(
      (target) => target.key !== currentTarget?.key
    )
  ];
  const rendered = useMemo(
    () => renderSharedSentence(value, preference),
    [preference, value]
  );

  useEffect(() => {
    setEnglishDraft(value.en_text.text);
    onEnglishDraftDirtyChange(false);
  }, [onEnglishDraftDirtyChange, value.en_text.text]);

  const clearResolution = () => {
    resolveVersion.current += 1;
    setSelectedTargetKey(undefined);
    setResolution(undefined);
    setSelectedFormSlotId(undefined);
    setResolving(false);
  };

  const positionedAssociationCount = value.associations.filter(
    (association) => association.state !== "legacy_unpositioned"
  ).length;
  const reannotationRemaining = Math.max(
    0,
    reannotationTargetCount - positionedAssociationCount
  );

  const updateSentence = (next: SharedWordSentenceV1) => {
    onChange(next);
    const nextPositionedCount = next.associations.filter(
      (association) => association.state !== "legacy_unpositioned"
    ).length;
    onReannotationRemainingChange(
      Math.max(0, reannotationTargetCount - nextPositionedCount)
    );
  };

  const captureSelection = (target: HTMLTextAreaElement) => {
    if (englishDraft !== value.en_text.text) {
      setSelection(undefined);
      setSelectionError("请先应用英文原文修改，再标注位置");
      clearResolution();
      return;
    }
    const result = selectionToSourceRange(
      value.en_text.text,
      target.selectionStart,
      target.selectionEnd
    );
    if (!result.ok) {
      setSelection(undefined);
      setSelectionError(result.error);
      clearResolution();
      return;
    }
    setSelection(result.range);
    setSelectionError(undefined);
    setFeedback(undefined);
    clearResolution();
  };

  const applyEnglishChange = () => {
    const result = prepareSharedSentenceTextChange(value, englishDraft);
    const affectedTotal = result.affected.linked + result.affected.pending;
    const apply = () => {
      onChange(result.sentence);
      onEnglishDraftDirtyChange(false);
      setSelection(undefined);
      clearResolution();
      setReannotationTargetCount(result.reannotation_suggestions.length);
      setReannotationSuggestions(result.reannotation_suggestions);
      onReannotationRemainingChange(result.reannotation_suggestions.length);
      setFeedback(
        result.reannotation_suggestions.length > 0
          ? `原位置已失效，${result.reannotation_suggestions.length} 项需要重新标注`
          : undefined
      );
    };
    if (affectedTotal === 0) {
      apply();
      return;
    }
    modal.confirm({
      title: "修改多维例句英文原文？",
      content: `这会影响 ${result.affected.linked} 条正式关联和 ${result.affected.pending} 条预关联。确认后旧位置全部失效，需要逐项重新标注。`,
      okText: "确认修改并重新标注",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: apply
    });
  };

  const chooseTarget = async (key: string) => {
    if (!selection) return;
    const target = targets.find((item) => item.key === key);
    if (!target) return;
    const version = ++resolveVersion.current;
    setSelectedTargetKey(key);
    setResolving(true);
    setFeedback(undefined);
    try {
      const response =
        target.current && currentTargetResolution
          ? currentTargetResolution
          : await sentenceAssociationsDataSource.resolve({
              en_text: value.en_text,
              source_range: selection,
              target_word_id: target.word_id,
              target_sense_id: target.sense_id,
              current_word_id: word.id
            });
      if (version === resolveVersion.current) {
        setResolution({ target, response });
        setSelectedFormSlotId(
          response.resolution === "resolved"
            ? response.candidate.form_slot_id
            : undefined
        );
      }
    } catch (error) {
      if (version === resolveVersion.current) {
        setSelectedTargetKey(undefined);
        message.error(error instanceof Error ? error.message : "词形解析失败");
      }
    } finally {
      if (version === resolveVersion.current) setResolving(false);
    }
  };

  const confirmLinked = () => {
    if (!selection || !resolution) return;
    const candidates =
      resolution.response.resolution === "resolved"
        ? [resolution.response.candidate]
        : resolution.response.candidates;
    const form = candidates.find(
      (candidate) => candidate.form_slot_id === selectedFormSlotId
    );
    if (!form) return;
    const result = addSentenceAssociation(value.id, value.associations, {
      id: newWordNodeId(),
      state: "linked",
      source_range: selection,
      target_word_id: resolution.target.word_id,
      target_sense_id: resolution.target.sense_id,
      form_slot_id: form.form_slot_id,
      sort_order: 0,
      resolved_pos: form.pos,
      resolved_form_type: form.form_type,
      target_headword: resolution.target.headword,
      target_gloss: resolution.target.gloss,
      form_variants: form.variants
    });
    if (result.status !== "added") {
      setFeedback("该原句位置已经有关联，请先删除原关联再重试");
      return;
    }
    updateSentence({
      ...value,
      associations: result.associations.filter(
        (association) =>
          association.state !== "legacy_unpositioned" ||
          association.target_word_id !== resolution.target.word_id ||
          association.target_sense_id !== resolution.target.sense_id
      )
    });
    setFeedback("已确认正式关联");
    setSelection(undefined);
    clearResolution();
  };

  const savePending = () => {
    if (!selection) return;
    const result = addSentenceAssociation(value.id, value.associations, {
      id: newWordNodeId(),
      state: "pending",
      source_range: selection,
      pending_word: selection.surface,
      normalized_pending_word: normalizePendingWord(selection.surface)
    });
    if (result.status === "duplicate") {
      setFeedback("同一多维例句、同一位置的预关联已存在，未重复添加");
      return;
    }
    if (result.status === "position_conflict") {
      setFeedback("该原句位置已经有关联，请先删除原关联再重试");
      return;
    }
    updateSentence({ ...value, associations: result.associations });
    setFeedback("已保存为预关联");
    setSelection(undefined);
    clearResolution();
  };

  return (
    <Space orientation="vertical" size={12} style={{ width: "100%" }}>
      <Alert
        type="info"
        title="在英文原句中选择单词，再确认词条和具体词义"
        description="词性和词形由已发布词库自动识别；只有真实歧义才需要额外选择。"
      />
      <Flex gap={8} align="start">
        <Select
          aria-label="多维例句等级"
          value={value.level}
          options={CEFR_OPTIONS}
          disabled={readOnly}
          style={{ width: 90 }}
          onChange={(level: CefrLevel) => onChange({ ...value, level })}
        />
        <Space orientation="vertical" size={6} style={{ flex: 1 }}>
          <Input.TextArea
            aria-label="多维例句英文原文"
            value={englishDraft}
            readOnly={readOnly}
            placeholder="输入英文例句，然后选择其中一个单词"
            autoSize={{ minRows: 2, maxRows: 6 }}
            onChange={(event) => {
              const next = event.target.value;
              setEnglishDraft(next);
              onEnglishDraftDirtyChange(next !== value.en_text.text);
            }}
            onMouseUp={(event) => captureSelection(event.currentTarget)}
            onKeyUp={(event) => captureSelection(event.currentTarget)}
          />
          {!readOnly && englishDraft !== value.en_text.text && (
            <Button size="small" onClick={applyEnglishChange}>
              应用英文原文修改
            </Button>
          )}
        </Space>
        <Input.TextArea
          aria-label="多维例句中文译文"
          value={value.zh_text.text}
          readOnly={readOnly}
          placeholder="输入中文译文"
          autoSize={{ minRows: 2, maxRows: 6 }}
          style={{ flex: 1 }}
          onChange={(event) =>
            onChange({
              ...value,
              zh_text: toWordRichText(event.target.value, value.zh_text)
            })
          }
        />
      </Flex>

      {selectionError && <Alert type="warning" title={selectionError} />}
      {reannotationRemaining > 0 && (
        <Alert
          type="warning"
          title={`${reannotationRemaining} 项待重新标注`}
          description={
            <Space orientation="vertical" size={2}>
              <Typography.Text>
                旧目标仅作为人工参考，不会自动恢复原位置或复用旧关联 ID。
              </Typography.Text>
              {reannotationSuggestions.map((suggestion) => (
                <Typography.Text type="secondary" key={suggestion.id}>
                  {suggestion.source_range.surface} →{" "}
                  {suggestion.state === "linked"
                    ? `${suggestion.target_headword ?? suggestion.target_word_id} · ${suggestion.target_gloss ?? suggestion.target_sense_id}`
                    : `待关联词 ${suggestion.pending_word}`}
                </Typography.Text>
              ))}
            </Space>
          }
        />
      )}
      {selection && (
        <Card size="small" type="inner" title="原句位置标注">
          <Space orientation="vertical" size={8} style={{ width: "100%" }}>
            <Typography.Text>
              已选择 <Tag color="blue">{selection.surface}</Tag> 码点范围 [
              {selection.start}, {selection.end})
            </Typography.Text>
            {!readOnly && (
              <Select
                aria-label="选择词条和具体词义"
                placeholder="选择词条和具体词义"
                loading={
                  relatedSearch.exact.isFetching ||
                  relatedSearch.contains.isFetching ||
                  resolving
                }
                showSearch
                filterOption={false}
                value={selectedTargetKey}
                style={{ width: "100%" }}
                options={targets.map((target) => ({
                  value: target.key,
                  label: `${target.headword} · ${target.gloss || "（无释义）"}${target.current ? "（当前词义）" : ""}`
                }))}
                onChange={(key) => void chooseTarget(key)}
              />
            )}
            {!readOnly &&
              (relatedSearch.exact.hasNextPage ||
                relatedSearch.contains.hasNextPage) && (
                <Space wrap>
                  {relatedSearch.exact.hasNextPage && (
                    <Button
                      size="small"
                      loading={relatedSearch.exact.isFetchingNextPage}
                      onClick={() => void relatedSearch.exact.fetchNextPage()}
                    >
                      加载更多完全同名词条
                    </Button>
                  )}
                  {relatedSearch.contains.hasNextPage && (
                    <Button
                      size="small"
                      loading={relatedSearch.contains.isFetchingNextPage}
                      onClick={() =>
                        void relatedSearch.contains.fetchNextPage()
                      }
                    >
                      加载更多相关候选
                    </Button>
                  )}
                </Space>
              )}
            {resolution?.response.resolution === "resolved" && (
              <Alert
                type="success"
                title="词性与词形已自动识别"
                description={formLabel(resolution.response.candidate)}
              />
            )}
            {resolution?.response.resolution === "ambiguous" && (
              <Select
                aria-label="选择歧义词形"
                placeholder="存在真实歧义，请选择词形"
                value={selectedFormSlotId}
                options={resolution.response.candidates.map((candidate) => ({
                  value: candidate.form_slot_id,
                  label: formLabel(candidate)
                }))}
                onChange={setSelectedFormSlotId}
                style={{ width: "100%" }}
              />
            )}
            {resolution?.response.resolution === "unmatched" && (
              <Alert
                type="warning"
                title="所选词义没有可匹配的已发布词形"
                description="可以改选目标，或把当前位置保存为预关联。"
              />
            )}
            {!readOnly && (
              <Space wrap>
                {resolution &&
                  resolution.response.resolution !== "unmatched" && (
                    <Button
                      type="primary"
                      disabled={!selectedFormSlotId}
                      onClick={confirmLinked}
                    >
                      确认关联
                    </Button>
                  )}
                <Button onClick={savePending}>保存为预关联</Button>
              </Space>
            )}
          </Space>
        </Card>
      )}

      {feedback && <Alert type="info" title={feedback} />}

      <div className="word-sentence-association-list">
        {value.associations.map((association) => (
          <Flex
            key={association.id}
            justify="space-between"
            align="center"
            gap={8}
          >
            <Space wrap>
              <Tag
                color={
                  association.state === "linked"
                    ? "green"
                    : association.state === "pending"
                      ? "orange"
                      : "default"
                }
              >
                {association.state === "linked"
                  ? "正式关联"
                  : association.state === "pending"
                    ? "预关联"
                    : "待补位置"}
              </Tag>
              {association.state !== "legacy_unpositioned" && (
                <Typography.Text>
                  {association.source_range.surface} [
                  {association.source_range.start},{" "}
                  {association.source_range.end})
                </Typography.Text>
              )}
              {association.state === "linked" && (
                <Typography.Text type="secondary">
                  {association.target_headword ?? association.target_word_id} ·{" "}
                  {association.target_gloss ?? association.target_sense_id}
                </Typography.Text>
              )}
              {association.state === "pending" && (
                <Typography.Text type="secondary">
                  待关联词：{association.pending_word}
                </Typography.Text>
              )}
            </Space>
            {!readOnly && (
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                aria-label={`删除位置关联 ${association.id}`}
                onClick={() =>
                  updateSentence({
                    ...value,
                    associations: value.associations.filter(
                      (item) => item.id !== association.id
                    )
                  })
                }
              />
            )}
          </Flex>
        ))}
      </div>

      {value.associations.some((item) => item.state === "linked") && (
        <Alert
          type={
            rendered.missing_association_ids.length > 0 ? "warning" : "info"
          }
          title={`${preference === "uk" ? "英式" : "美式"}偏好预览：${rendered.text}`}
          description={
            rendered.missing_association_ids.length > 0
              ? `${rendered.missing_association_ids.length} 个位置缺少可用方言词形，已保留原文。`
              : "显示由个人偏好和词库词形决定；例句关联不保存方言字段。"
          }
        />
      )}
    </Space>
  );
}

function PendingClaimCard({
  item,
  word,
  onClaimed
}: {
  item: PendingSentenceAssociationItemV1;
  word: AdminWordV2;
  onClaimed: () => void;
}) {
  const { message } = App.useApp();
  const [senseId, setSenseId] = useState<string>();
  const [resolution, setResolution] =
    useState<ResolveSentenceAssociationResponse>();
  const [formSlotId, setFormSlotId] = useState<string>();
  const [pending, setPending] = useState(false);
  const resolveVersion = useRef(0);
  const claimInFlight = useRef(false);
  const claimIdempotencyKey = useRef(newWordNodeId());
  const senseOptions = word.meanings.pos.flatMap((pos) =>
    pos.senses.map((sense) => ({
      value: sense.id,
      label:
        sense.definitions
          .map((definition) =>
            "content_id" in definition ? definition.content.text : ""
          )
          .find((value) => value.trim() !== "") || sense.id
    }))
  );

  const chooseSense = async (nextSenseId: string) => {
    const version = ++resolveVersion.current;
    claimIdempotencyKey.current = newWordNodeId();
    setSenseId(nextSenseId);
    setResolution(undefined);
    setFormSlotId(undefined);
    setPending(true);
    try {
      const response = await sentenceAssociationsDataSource.resolve({
        en_text: item.en_text,
        source_range: item.source_range,
        target_word_id: word.id,
        target_sense_id: nextSenseId
      });
      if (version === resolveVersion.current) {
        setResolution(response);
        setFormSlotId(
          response.resolution === "resolved"
            ? response.candidate.form_slot_id
            : undefined
        );
      }
    } catch (error) {
      if (version === resolveVersion.current) {
        message.error(error instanceof Error ? error.message : "词形解析失败");
      }
    } finally {
      if (version === resolveVersion.current) setPending(false);
    }
  };

  const claim = async () => {
    if (!senseId || !formSlotId || claimInFlight.current) return;
    claimInFlight.current = true;
    setPending(true);
    try {
      await sentenceAssociationsDataSource.claim(
        item.association_id,
        claimIdempotencyKey.current,
        {
          target_word_id: word.id,
          target_sense_id: senseId,
          form_slot_id: formSlotId,
          base_owner_entry_revision: item.owner_entry_revision
        }
      );
      message.success("预关联已认领为正式关联");
      onClaimed();
    } catch (error) {
      if (
        error instanceof HttpError &&
        (error.code === "pending_sentence_association_claimed" ||
          error.code === "entry_revision_conflict")
      ) {
        message.warning("该预关联或来源词条已更新，正在刷新真实状态");
        onClaimed();
      } else {
        message.error(error instanceof Error ? error.message : "认领失败");
      }
    } finally {
      claimInFlight.current = false;
      setPending(false);
    }
  };

  const candidates =
    resolution?.resolution === "resolved"
      ? [resolution.candidate]
      : resolution?.resolution === "ambiguous"
        ? resolution.candidates
        : [];
  return (
    <Card size="small" type="inner">
      <Space orientation="vertical" size={8} style={{ width: "100%" }}>
        <Typography.Text>{item.en_text.text}</Typography.Text>
        <Typography.Text type="secondary">
          位置：{item.source_range.surface} [{item.source_range.start},{" "}
          {item.source_range.end}) · 来源词条 {item.owner_entry_id}
        </Typography.Text>
        <Select
          aria-label={`为预关联 ${item.association_id} 选择具体词义`}
          placeholder="选择当前词条的具体词义"
          value={senseId}
          options={senseOptions}
          disabled={pending}
          onChange={(value) => void chooseSense(value)}
          style={{ width: "100%" }}
        />
        {resolution?.resolution === "ambiguous" && (
          <Select
            aria-label={`为预关联 ${item.association_id} 选择歧义词形`}
            placeholder="存在真实歧义，请选择词形"
            value={formSlotId}
            options={candidates.map((candidate) => ({
              value: candidate.form_slot_id,
              label: formLabel(candidate)
            }))}
            onChange={(nextFormSlotId) => {
              claimIdempotencyKey.current = newWordNodeId();
              setFormSlotId(nextFormSlotId);
            }}
            style={{ width: "100%" }}
          />
        )}
        {resolution?.resolution === "unmatched" && (
          <Alert type="warning" title="当前词义没有可匹配的已发布词形" />
        )}
        <Button
          type="primary"
          loading={pending}
          disabled={!senseId || !formSlotId}
          onClick={() => void claim()}
        >
          正式认领
        </Button>
      </Space>
    </Card>
  );
}

function PendingClaimsPanel({ word }: { word: AdminWordV2 }) {
  const [items, setItems] = useState<PendingSentenceAssociationItemV1[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string>();
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const requestVersion = useRef(0);
  useEffect(() => {
    if (word.status !== "published") return;
    const version = ++requestVersion.current;
    let active = true;
    setLoading(true);
    setLoadingMore(false);
    setError(undefined);
    setItems([]);
    setTotal(0);
    setNextCursor(null);
    void sentenceAssociationsDataSource
      .listPending(word.id, { page_size: 100 })
      .then((page) => {
        if (active && version === requestVersion.current) {
          setItems(page.results);
          setTotal(page.total);
          setNextCursor(page.next_cursor);
        }
      })
      .catch((reason: unknown) => {
        if (active && version === requestVersion.current)
          setError(reason instanceof Error ? reason.message : "预关联加载失败");
      })
      .finally(() => {
        if (active && version === requestVersion.current) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision, word.id, word.status]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    const version = requestVersion.current;
    setLoadingMore(true);
    setError(undefined);
    try {
      const page = await sentenceAssociationsDataSource.listPending(word.id, {
        page_size: 100,
        cursor: nextCursor
      });
      if (version !== requestVersion.current) return;
      setItems((current) =>
        Array.from(
          new Map(
            [...current, ...page.results].map((item) => [
              item.association_id,
              item
            ])
          ).values()
        )
      );
      setTotal(page.total);
      setNextCursor(page.next_cursor);
    } catch (reason) {
      if (version === requestVersion.current) {
        setError(reason instanceof Error ? reason.message : "预关联加载失败");
      }
    } finally {
      if (version === requestVersion.current) setLoadingMore(false);
    }
  };
  if (word.status !== "published") return null;
  return (
    <Card
      size="small"
      title="历史预关联认领"
      loading={loading}
      extra={
        <Tag color={items.length > 0 ? "orange" : "default"}>{total} 条</Tag>
      }
    >
      {error ? (
        <Alert
          type="error"
          title={error}
          action={
            <Button onClick={() => setRevision((value) => value + 1)}>
              重试
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <Typography.Text type="secondary">
          当前已发布词头和词形没有命中历史预关联。
        </Typography.Text>
      ) : (
        <Space orientation="vertical" size={8} style={{ width: "100%" }}>
          {items.map((item) => (
            <PendingClaimCard
              key={item.association_id}
              item={item}
              word={word}
              onClaimed={() => setRevision((value) => value + 1)}
            />
          ))}
          {nextCursor && (
            <Button loading={loadingMore} onClick={() => void loadMore()}>
              加载更多待认领例句
            </Button>
          )}
        </Space>
      )}
    </Card>
  );
}

interface DrawerSession {
  mode: "new" | "shared" | "legacy";
  sentence: SharedWordSentenceV1;
  legacySentenceId?: string;
  reannotationRemaining: number;
  englishDraftDirty: boolean;
}

function referencesSense(
  sentence: SharedWordSentenceV1,
  wordId: string,
  senseId: string
): boolean {
  return sentence.associations.some(
    (association) =>
      association.state !== "pending" &&
      association.target_word_id === wordId &&
      association.target_sense_id === senseId
  );
}

function SentenceSummaryRow({
  sentence,
  index,
  onEdit
}: {
  sentence: SharedWordSentenceV1;
  index: number;
  onEdit: () => void;
}) {
  const { preference } = useDialectPreference();
  const rendered = renderSharedSentence(sentence, preference);
  return (
    <div className="word-table-row word-sentence-row">
      <span className="word-number-cell">{index + 1}</span>
      <Tag>{sentence.level}</Tag>
      <div className="word-sentence-bilingual-grid">
        <button
          type="button"
          className="word-sentence-drawer-trigger word-sentence-english-card"
          aria-label={`编辑多维例句 ${index + 1}`}
          onClick={onEdit}
        >
          <Typography.Text strong>英文例句</Typography.Text>
          <Typography.Paragraph ellipsis={{ rows: 2 }}>
            {rendered.text || "点击输入英文例句"}
          </Typography.Paragraph>
        </button>
        <div className="word-sentence-translation-preview">
          <Typography.Text strong>汉语译文</Typography.Text>
          <Typography.Paragraph ellipsis={{ rows: 2 }}>
            {sentence.zh_text.text || "点击输入汉语译文"}
          </Typography.Paragraph>
        </div>
      </div>
      <Button
        type="text"
        icon={<EditOutlined />}
        aria-label={`打开多维例句 ${index + 1}`}
        onClick={onEdit}
      />
    </div>
  );
}

export function MultidimensionalSentencesEditor({
  word,
  sense,
  value,
  readOnly,
  showPendingClaims,
  onChange
}: Props) {
  const { preference } = useDialectPreference();
  const [session, setSession] = useState<DrawerSession>();
  const displayed = deriveSharedSentencesForSense(value, sense.id);
  const updateEnglishDraftDirty = useCallback(
    (englishDraftDirty: boolean) =>
      setSession((current) =>
        current && current.englishDraftDirty !== englishDraftDirty
          ? { ...current, englishDraftDirty }
          : current
      ),
    []
  );
  if (!sentenceAssociationsDataSource.available) return null;

  const saveSession = () => {
    if (
      !session ||
      session.reannotationRemaining > 0 ||
      session.englishDraftDirty ||
      sharedSentenceIssueField(session.sentence) ||
      !referencesSense(session.sentence, word.id, sense.id)
    ) {
      return;
    }
    const nextShared =
      session.mode === "new" || session.mode === "legacy"
        ? [...value, session.sentence]
        : value.map((sentence) =>
            sentence.id === session.sentence.id ? session.sentence : sentence
          );
    const nextLegacy = session.legacySentenceId
      ? sense.sentences.filter(
          (sentence) => sentence.id !== session.legacySentenceId
        )
      : sense.sentences;
    onChange(nextShared, nextLegacy);
    setSession(undefined);
  };

  const rows = [
    ...sense.sentences.map((sentence) => ({
      key: `legacy:${sentence.id}`,
      sentence: upgradeLegacySentence(sentence, word.id, sense.id, preference),
      mode: "legacy" as const,
      legacySentenceId: sentence.id
    })),
    ...displayed.map((sentence) => ({
      key: `shared:${sentence.id}`,
      sentence,
      mode: "shared" as const
    }))
  ];

  return (
    <>
      {showPendingClaims && !readOnly ? (
        <PendingClaimsPanel word={word} />
      ) : null}
      {rows.map((row, index) => (
        <SentenceSummaryRow
          key={row.key}
          sentence={row.sentence}
          index={index}
          onEdit={() =>
            setSession({
              mode: row.mode,
              sentence: structuredClone(row.sentence),
              reannotationRemaining: 0,
              englishDraftDirty: false,
              ...("legacySentenceId" in row
                ? { legacySentenceId: row.legacySentenceId }
                : {})
            })
          }
        />
      ))}
      {!readOnly && (
        <Button
          className="word-section-add-button"
          type="dashed"
          block
          icon={<PlusOutlined />}
          onClick={() =>
            setSession({
              mode: "new",
              sentence: createMultidimensionalSentence(),
              reannotationRemaining: 0,
              englishDraftDirty: false
            })
          }
        >
          添加例句
        </Button>
      )}
      <Drawer
        title={session?.mode === "new" ? "新增多维例句" : "编辑多维例句"}
        size="large"
        open={Boolean(session)}
        destroyOnHidden
        onClose={() => setSession(undefined)}
        footer={
          readOnly ? null : (
            <Flex justify="end" gap={8}>
              <Button onClick={() => setSession(undefined)}>取 消</Button>
              <Button
                type="primary"
                disabled={
                  !session ||
                  session.reannotationRemaining > 0 ||
                  session.englishDraftDirty ||
                  Boolean(sharedSentenceIssueField(session.sentence)) ||
                  !referencesSense(session.sentence, word.id, sense.id)
                }
                onClick={saveSession}
              >
                完 成
              </Button>
            </Flex>
          )
        }
      >
        {session ? (
          <MultidimensionalSentenceDrawerContent
            word={word}
            sense={sense}
            value={session.sentence}
            readOnly={readOnly}
            onChange={(sentence) =>
              setSession((current) =>
                current ? { ...current, sentence } : current
              )
            }
            onReannotationRemainingChange={(reannotationRemaining) =>
              setSession((current) =>
                current ? { ...current, reannotationRemaining } : current
              )
            }
            onEnglishDraftDirtyChange={updateEnglishDraftDirty}
          />
        ) : null}
      </Drawer>
    </>
  );
}
