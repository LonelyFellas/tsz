import {
  DeleteOutlined,
  ExportOutlined,
  LinkOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  SaveOutlined
} from "@ant-design/icons";
import type {
  Dialect,
  EnglishTextV3,
  PhraseComponentUsageV3,
  RelatedWordResultAny,
  ResolveSentenceTargetsV3Response,
  RichTextV3,
  SentenceAssociationInputV3,
  SentenceTranslationBandV3,
  WordSentenceAssociationV3,
  WordSentenceLinkV3,
  WordSentenceTranslationV3,
  WordSentenceWritableV3
} from "@tsz/types";
import {
  Alert,
  Button,
  Card,
  Drawer,
  Empty,
  Flex,
  Input,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography
} from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { CEFR_OPTIONS } from "../../labels";
import { newWordNodeId } from "../../word-model/primitives";
import { useRelatedSearchAny } from "../../api";
import { createV3WordRequests } from "../api";
import { dialectLabel, formTypeLabel } from "../presentation";
import {
  V3SentenceTargetDiscovery,
  type V3SentenceTargetDiscoveryCandidate,
  type V3SentenceTargetDiscoveryOccurrence,
  type V3SentenceTargetDiscoveryRequest,
  type V3SentenceTargetDiscoveryResult
} from "./V3SentenceTargetDiscovery";
import "./V3MultidimensionalSentenceDrawer.css";

export interface V3MultidimensionalSentenceSaveDraft {
  sentence: WordSentenceWritableV3;
  associations: SentenceAssociationInputV3[];
  idempotencyKey: string;
}

interface Props {
  open: boolean;
  wordId: string;
  senseId: string;
  onClose: () => void;
  onSave: (draft: V3MultidimensionalSentenceSaveDraft) => Promise<void>;
  initialSentence?: WordSentenceWritableV3;
  initialAssociations?: readonly WordSentenceAssociationV3[];
  onCreatePendingTarget?: (association: SentenceAssociationInputV3) => void;
  targetDiscoveryEnabled?: boolean;
  idFactory?: () => string;
}

interface AssociationTargetOption {
  key: string;
  wordId: string;
  senseId: string;
  label: string;
}

const TRANSLATION_BANDS: ReadonlyArray<{
  band: SentenceTranslationBandV3;
  label: string;
}> = [
  { band: "c1_c2", label: "初阶" },
  { band: "b1_b2", label: "中阶" },
  { band: "a1_a2", label: "高阶" }
];

function translationBandForLevel(level: string): SentenceTranslationBandV3 {
  if (level === "C1" || level === "C2") return "c1_c2";
  if (level === "A1" || level === "A2") return "a1_a2";
  return "b1_b2";
}

function initialTranslations(
  sentence: WordSentenceWritableV3 | undefined,
  idFactory: () => string
): WordSentenceTranslationV3[] {
  if (sentence?.zh_translations && sentence.zh_translations.length > 0) {
    return structuredClone(sentence.zh_translations).sort(
      (left, right) =>
        TRANSLATION_BANDS.findIndex((item) => item.band === left.band) -
        TRANSLATION_BANDS.findIndex((item) => item.band === right.band)
    );
  }
  return [
    {
      id: sentence?.zh_text_id ?? idFactory(),
      band: translationBandForLevel(sentence?.level ?? "B1"),
      content: sentence
        ? structuredClone(sentence.zh_text)
        : { version: 2, text: "", annotations: [] }
    }
  ];
}

function translationBandMeta(band: SentenceTranslationBandV3) {
  return TRANSLATION_BANDS.find((item) => item.band === band)!;
}

function translationAlias(
  translations: WordSentenceTranslationV3[],
  level: string
) {
  const preferred = translationBandForLevel(level);
  return (
    translations.find((translation) => translation.band === preferred) ??
    translations.find((translation) => translation.band === "b1_b2") ??
    translations.find((translation) => translation.band === "c1_c2") ??
    translations[0]!
  );
}

function associationTargetOptions(
  results: RelatedWordResultAny[]
): AssociationTargetOption[] {
  const options = results.flatMap((result) => {
    const wordId =
      result.schema_version === 2 ? result.word_id : result.entry_id;
    const headword =
      result.schema_version === 2 ? result.headword : result.presentation.label;
    return result.senses.map((sense) => ({
      key: `${wordId}:${sense.sense_id}`,
      wordId,
      senseId: sense.sense_id,
      label: `${headword} · ${sense.gloss || "（无释义）"}`
    }));
  });
  return Array.from(
    new Map(options.map((option) => [option.key, option])).values()
  );
}

function replaceRichText(value: RichTextV3, text: string): RichTextV3 {
  if (value.text === text) return value;
  return value.version === 1
    ? { version: 1, text, spans: [], liaisons: [] }
    : { version: 2, text, annotations: [] };
}

function editableDialects(enText: EnglishTextV3): Dialect[] {
  if (enText.mode === "unified") return ["common"];
  return (["uk", "us"] as const).filter(
    (dialect) => enText[dialect].state === "ready"
  );
}

function englishText(enText: EnglishTextV3, dialect: Dialect): string {
  if (enText.mode === "unified") return enText.common.value.text;
  if (dialect === "common") return "";
  const slot = enText[dialect];
  return slot.state === "ready" ? slot.variant.value.text : "";
}

function replaceEnglishText(
  enText: EnglishTextV3,
  dialect: Dialect,
  text: string
): EnglishTextV3 {
  if (enText.mode === "unified") {
    return {
      ...enText,
      common: {
        ...enText.common,
        value: replaceRichText(enText.common.value, text)
      }
    };
  }
  if (dialect === "common" || enText[dialect].state !== "ready") return enText;
  const slot = enText[dialect];
  return {
    ...enText,
    [dialect]: {
      state: "ready",
      variant: {
        ...slot.variant,
        value: replaceRichText(slot.variant.value, text)
      }
    }
  };
}

function associationInput(
  association: WordSentenceAssociationV3
): SentenceAssociationInputV3 {
  const base = {
    id: association.id,
    source_dialect: association.source_dialect,
    source_segments: association.source_segments
  };
  if (association.state === "linked") {
    return {
      ...base,
      target_word_id: association.target_word_id,
      target_sense_id: association.target_sense_id,
      ...(association.target_publication_id
        ? { target_publication_id: association.target_publication_id }
        : {}),
      ...(association.target_form_variant_id
        ? { target_form_variant_id: association.target_form_variant_id }
        : {})
    };
  }
  return {
    ...base,
    pending_target_kind: association.pending_target_kind,
    pending_target_headword: association.pending_target_headword,
    ...(association.pending_target_gloss
      ? { pending_target_gloss: association.pending_target_gloss }
      : {})
  };
}

function discoveryResult(
  response: ResolveSentenceTargetsV3Response
): V3SentenceTargetDiscoveryResult {
  return {
    complete: response.completeness === "complete",
    overloaded: response.completeness === "overloaded",
    occurrences: response.range_results.map((range) => {
      const firstEvidence = range.published_matches[0]?.matches[0];
      const kind =
        firstEvidence?.match_kind === "separable_phrase" ||
        range.source_segments.length > 1
          ? "separable_phrase"
          : firstEvidence?.match_kind === "contiguous_phrase" ||
              range.normalized_surface.includes(" ")
            ? "phrase"
            : "word";
      const surface = range.source_segments
        .map((segment) => segment.surface)
        .join(" … ");
      const published: V3SentenceTargetDiscoveryCandidate[] =
        range.published_matches.map((candidate) => ({
          id: `${candidate.entry_id}:${candidate.publication_id}:${candidate.pos_id}:${candidate.base_form_id}:${candidate.matched_variant_id ?? "variant"}`,
          entryId: candidate.entry_id,
          publicationId: candidate.publication_id,
          headword: candidate.headword,
          baseForm: candidate.headword,
          matchedForm: candidate.matches[0]?.surface ?? surface,
          posLabel: candidate.pos,
          formTypeLabel: candidate.matched_form_type,
          matchedDialect: candidate.matched_dialect,
          matchedFormId: candidate.matched_form_id,
          matchedVariantId: candidate.matched_variant_id,
          componentUsages: candidate.component_usages,
          state: "published",
          senses: candidate.senses.map((sense) => ({
            id: sense.sense_id,
            gloss: sense.gloss
          })),
          senseTotal: candidate.senses.length
        }));
      const drafts: V3SentenceTargetDiscoveryCandidate[] =
        range.draft_matches.map((candidate) => ({
          id: candidate.entry_id,
          entryId: candidate.entry_id,
          headword: candidate.headword,
          baseForm: candidate.headword,
          matchedForm: surface,
          posLabel: "草稿",
          state: "draft",
          senses: [],
          senseTotal: 0
        }));
      return {
        id: range.segments_fingerprint,
        kind,
        surface,
        segments: range.source_segments,
        candidates: [...published, ...drafts],
        publishedTotal: range.published_total,
        nextCursor: range.next_cursor,
        componentWords:
          kind === "word"
            ? undefined
            : published[0]?.componentUsages?.map(
                (component) => component.literal
              )
      };
    })
  };
}

function segmentsOverlap(
  left: readonly { start: number; end: number }[],
  right: readonly { start: number; end: number }[]
): boolean {
  return left.some((leftSegment) =>
    right.some(
      (rightSegment) =>
        leftSegment.start < rightSegment.end &&
        rightSegment.start < leftSegment.end
    )
  );
}

function isLinkedAssociation(
  association: SentenceAssociationInputV3
): association is Extract<
  SentenceAssociationInputV3,
  { target_word_id: string }
> {
  return typeof association.target_word_id === "string";
}

function componentWordsFromSegments(
  segments: readonly { surface: string }[]
): string[] {
  return segments.flatMap((segment) =>
    Array.from(
      segment.surface.matchAll(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu),
      (match) => match[0]
    )
  );
}

interface AutomaticAssociationSelection {
  occurrence: V3SentenceTargetDiscoveryOccurrence;
  candidate: V3SentenceTargetDiscoveryCandidate;
  senseId: string;
}

function resolveAutomaticAssociations(
  result: V3SentenceTargetDiscoveryResult,
  existing: readonly SentenceAssociationInputV3[],
  sourceDialect: Dialect
): {
  result: V3SentenceTargetDiscoveryResult;
  selections: AutomaticAssociationSelection[];
} {
  const eligible = result.occurrences
    .flatMap((occurrence) => {
      const [candidate] = occurrence.candidates;
      const [sense] = candidate?.senses ?? [];
      return candidate &&
        sense &&
        candidate.publicationId &&
        candidate.matchedVariantId &&
        occurrence.publishedTotal === 1 &&
        occurrence.candidates.length === 1 &&
        candidate.state !== "draft" &&
        candidate.senseTotal === 1 &&
        candidate.senses.length === 1
        ? [{ occurrence, candidate, senseId: sense.id }]
        : [];
    })
    .sort((left, right) => {
      const leftIsWord = left.occurrence.kind === "word" ? 1 : 0;
      const rightIsWord = right.occurrence.kind === "word" ? 1 : 0;
      const leftWidth = left.occurrence.segments.reduce(
        (sum, segment) => sum + segment.end - segment.start,
        0
      );
      const rightWidth = right.occurrence.segments.reduce(
        (sum, segment) => sum + segment.end - segment.start,
        0
      );
      return (
        leftIsWord - rightIsWord ||
        rightWidth - leftWidth ||
        left.occurrence.segments[0]!.start - right.occurrence.segments[0]!.start
      );
    });
  const selections: AutomaticAssociationSelection[] = [];
  for (const item of eligible) {
    const overlapsExisting = existing.some(
      (association) =>
        association.source_dialect === sourceDialect &&
        segmentsOverlap(association.source_segments, item.occurrence.segments)
    );
    const overlapsSelected = selections.some((selected) =>
      segmentsOverlap(selected.occurrence.segments, item.occurrence.segments)
    );
    if (!overlapsExisting && !overlapsSelected) selections.push(item);
  }

  const coveringPhrases = selections.filter(
    (selection) => selection.occurrence.kind !== "word"
  );
  return {
    result: {
      ...result,
      occurrences: result.occurrences.map((occurrence) => {
        const coveringPhrase =
          occurrence.kind === "word"
            ? coveringPhrases.find((selection) =>
                segmentsOverlap(
                  selection.occurrence.segments,
                  occurrence.segments
                )
              )
            : undefined;
        const existingCoveringPhrase =
          occurrence.kind === "word"
            ? existing.find(
                (association) =>
                  association.source_dialect === sourceDialect &&
                  componentWordsFromSegments(association.source_segments)
                    .length > 1 &&
                  segmentsOverlap(
                    association.source_segments,
                    occurrence.segments
                  )
              )
            : undefined;
        const coveredByPhrase =
          coveringPhrase?.occurrence.surface ??
          existingCoveringPhrase?.source_segments
            .map((segment) => segment.surface)
            .join(" … ");
        return {
          ...occurrence,
          ...(occurrence.kind === "word" && coveredByPhrase
            ? { coveredByPhrase }
            : {}),
          ...(occurrence.kind !== "word"
            ? {
                componentWords: componentWordsFromSegments(occurrence.segments)
              }
            : {})
        };
      })
    },
    selections
  };
}

function Session({
  wordId,
  senseId,
  onClose,
  onSave,
  initialSentence,
  initialAssociations = [],
  onCreatePendingTarget,
  targetDiscoveryEnabled = true,
  idFactory
}: Omit<Props, "open"> & { idFactory: () => string }) {
  const [sentenceId] = useState(() => initialSentence?.id ?? idFactory());
  const [idempotencyKey] = useState(idFactory);
  const [level, setLevel] = useState(initialSentence?.level ?? "B1");
  const [enText, setEnText] = useState<EnglishTextV3>(() =>
    initialSentence
      ? structuredClone(initialSentence.en_text)
      : {
          mode: "unified",
          common: {
            id: idFactory(),
            origin: "manual",
            value: { version: 2, text: "", annotations: [] }
          }
        }
  );
  const dialects = useMemo(() => editableDialects(enText), [enText]);
  const [sourceDialect, setSourceDialect] = useState<Dialect>(
    () => dialects[0] ?? "common"
  );
  const english = englishText(enText, sourceDialect);
  const [translations, setTranslations] = useState<WordSentenceTranslationV3[]>(
    () => initialTranslations(initialSentence, idFactory)
  );
  const [newTranslationBand, setNewTranslationBand] =
    useState<SentenceTranslationBandV3>();
  const missingTranslationBands = TRANSLATION_BANDS.filter(
    ({ band }) => !translations.some((translation) => translation.band === band)
  );
  const [links, setLinks] = useState<WordSentenceLinkV3[]>(() =>
    initialSentence
      ? structuredClone(initialSentence.links)
      : [{ word_id: wordId, sense_id: senseId, role: "head" }]
  );
  const [associations, setAssociations] = useState<
    SentenceAssociationInputV3[]
  >(() => initialAssociations.map(associationInput));
  const [associationComponents, setAssociationComponents] = useState<
    Record<string, PhraseComponentUsageV3[]>
  >(() =>
    Object.fromEntries(
      initialAssociations.flatMap((association) =>
        association.state === "linked" &&
        association.target_component_usages.length > 0
          ? [[association.id, association.target_component_usages]]
          : []
      )
    )
  );
  const associationsRef = useRef(associations);
  useEffect(() => {
    associationsRef.current = associations;
  }, [associations]);
  const [persistedAssociationIds] = useState(
    () => new Set(initialAssociations.map((association) => association.id))
  );
  const requests = useMemo(() => createV3WordRequests(), []);
  const [contextQuery, setContextQuery] = useState("");
  const [selectedContextKey, setSelectedContextKey] = useState<string>();
  const [contextLabels, setContextLabels] = useState<Record<string, string>>(
    {}
  );
  const [saving, setSaving] = useState(false);
  const [showSaveHelp, setShowSaveHelp] = useState(false);
  const [error, setError] = useState<string>();
  const contextRelated = useRelatedSearchAny(
    contextQuery.trim(),
    undefined,
    contextQuery.trim().length >= 2
  );
  const contextTargetOptions = useMemo(
    () =>
      associationTargetOptions([
        ...(contextRelated.exact.data?.pages.flatMap((page) => page.results) ??
          []),
        ...(contextRelated.contains.data?.pages.flatMap(
          (page) => page.results
        ) ?? [])
      ]).filter(
        (option) =>
          !links.some(
            (link) =>
              link.word_id === option.wordId && link.sense_id === option.senseId
          )
      ),
    [
      contextRelated.contains.data?.pages,
      contextRelated.exact.data?.pages,
      links
    ]
  );

  const addAssociation = (association: SentenceAssociationInputV3) => {
    if (
      associations.some(
        (current) =>
          current.source_dialect === association.source_dialect &&
          segmentsOverlap(current.source_segments, association.source_segments)
      )
    ) {
      setError("所选位置与本次关联中的另一项重叠，请先移除冲突项");
      return;
    }
    setAssociations((current) => [...current, association]);
    setError(undefined);
  };

  const discover = async (
    request: V3SentenceTargetDiscoveryRequest,
    signal: AbortSignal
  ): Promise<V3SentenceTargetDiscoveryResult> => {
    const response = await requests.resolveSentenceTargets(
      request.mode === "all_published_targets"
        ? {
            schema_version: 3,
            sentence_text: request.sentenceText,
            source_dialect: request.dialect,
            mode: request.mode,
            page_size_per_range: 100
          }
        : {
            schema_version: 3,
            sentence_text: request.sentenceText,
            source_dialect: request.dialect,
            mode: request.mode,
            selected_segments: request.segments,
            include_drafts: true,
            ...(request.cursor ? { cursor: request.cursor } : {}),
            page_size_per_range: 100
          },
      signal
    );
    const nextResult = discoveryResult(response);
    return nextResult;
  };

  const acceptDiscoveryResult = (
    nextResult: V3SentenceTargetDiscoveryResult,
    request: V3SentenceTargetDiscoveryRequest
  ) => {
    if (request.mode !== "all_published_targets") return nextResult;
    const automatic = resolveAutomaticAssociations(
      nextResult,
      associationsRef.current,
      request.dialect
    );
    const next = [...associationsRef.current];
    const componentUpdates: Record<string, PhraseComponentUsageV3[]> = {};
    for (const selection of automatic.selections) {
      if (
        next.some(
          (association) =>
            association.source_dialect === request.dialect &&
            segmentsOverlap(
              association.source_segments,
              selection.occurrence.segments
            )
        )
      )
        continue;
      const associationId = idFactory();
      next.push({
        id: associationId,
        source_dialect: request.dialect,
        source_segments: selection.occurrence.segments,
        target_word_id: selection.candidate.entryId,
        target_sense_id: selection.senseId,
        target_publication_id: selection.candidate.publicationId!,
        target_form_variant_id: selection.candidate.matchedVariantId!
      });
      if (selection.candidate.componentUsages?.length) {
        componentUpdates[associationId] = selection.candidate.componentUsages;
      }
    }
    associationsRef.current = next;
    setAssociations(next);
    if (Object.keys(componentUpdates).length > 0) {
      setAssociationComponents((current) => ({
        ...current,
        ...componentUpdates
      }));
    }
    setError(undefined);
    return automatic.result;
  };

  const addDiscoveredPending = (
    occurrence: V3SentenceTargetDiscoveryOccurrence,
    candidate?: V3SentenceTargetDiscoveryCandidate
  ) => {
    addAssociation({
      id: idFactory(),
      source_dialect: sourceDialect,
      source_segments: occurrence.segments,
      pending_target_kind: occurrence.kind === "word" ? "word" : "phrase",
      pending_target_headword:
        candidate?.headword ??
        occurrence.segments.map((segment) => segment.surface).join(" ")
    });
  };

  const addContextLink = () => {
    const target = contextTargetOptions.find(
      (option) => option.key === selectedContextKey
    );
    if (!target) return;
    setLinks((current) => [
      ...current,
      {
        word_id: target.wordId,
        sense_id: target.senseId,
        role: "context"
      }
    ]);
    setContextLabels((current) => ({
      ...current,
      [target.key]: target.label
    }));
    setContextQuery("");
    setSelectedContextKey(undefined);
  };

  const addTranslation = () => {
    if (!newTranslationBand || translations.length >= 3) return;
    setTranslations((current) =>
      [
        ...current,
        {
          id: idFactory(),
          band: newTranslationBand,
          content: { version: 2, text: "", annotations: [] } as RichTextV3
        }
      ].sort(
        (left, right) =>
          TRANSLATION_BANDS.findIndex((item) => item.band === left.band) -
          TRANSLATION_BANDS.findIndex((item) => item.band === right.band)
      )
    );
    setNewTranslationBand(undefined);
  };

  const updateTranslation = (id: string, text: string) => {
    setTranslations((current) =>
      current.map((translation) =>
        translation.id === id
          ? {
              ...translation,
              content: replaceRichText(translation.content, text)
            }
          : translation
      )
    );
  };

  const removeTranslation = (id: string) => {
    setTranslations((current) =>
      current.filter((translation) => translation.id !== id)
    );
  };

  const updatePendingGloss = (associationId: string, value: string) => {
    setAssociations((current) =>
      current.map((association) => {
        if (association.id !== associationId || "target_word_id" in association)
          return association;
        const next = { ...association };
        if (value === "") delete next.pending_target_gloss;
        else next.pending_target_gloss = value;
        return next;
      })
    );
  };

  const save = async () => {
    setSaving(true);
    setError(undefined);
    try {
      const canonicalTranslations = translations.map((translation) => ({
        ...translation,
        content: replaceRichText(
          translation.content,
          translation.content.text.trim()
        )
      }));
      const alias = translationAlias(canonicalTranslations, level);
      await onSave({
        sentence: {
          id: sentenceId,
          level,
          en_text: enText,
          zh_text_id: alias.id,
          zh_text: alias.content,
          zh_translations: canonicalTranslations,
          links
        },
        associations,
        idempotencyKey
      });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "例句关联保存失败");
    } finally {
      setSaving(false);
    }
  };

  const canSave =
    english.trim() !== "" &&
    translations.length >= 1 &&
    translations.every(
      (translation) => translation.content.text.trim() !== ""
    ) &&
    associations.length > 0 &&
    !saving;
  const hasCompatibilityLinked = associations.some(
    (association) =>
      isLinkedAssociation(association) &&
      (!association.target_publication_id ||
        !association.target_form_variant_id)
  );

  return (
    <Drawer
      destroyOnHidden
      extra={<Tag color="blue">正式能力</Tag>}
      footer={
        <Flex gap={8} vertical>
          {showSaveHelp ? (
            <Alert
              description="保存例句后，系统会同步更新已关联与待关联信息；如中途失败，可保留当前内容继续处理。"
              id="v3-sentence-save-help"
              showIcon
              title="保存说明"
              type="info"
            />
          ) : null}
          <Flex align="center" gap={8} justify="end">
            <Tooltip title={showSaveHelp ? undefined : "查看保存说明"}>
              <Button
                aria-controls="v3-sentence-save-help"
                aria-expanded={showSaveHelp}
                aria-label={showSaveHelp ? "收起保存说明" : "查看保存说明"}
                icon={<QuestionCircleOutlined />}
                onClick={() => setShowSaveHelp((current) => !current)}
                shape="circle"
                type="text"
              />
            </Tooltip>
            <Button disabled={saving} onClick={onClose}>
              取消
            </Button>
            <Button
              disabled={!canSave}
              icon={<SaveOutlined aria-hidden />}
              loading={saving}
              onClick={() => void save()}
              type="primary"
            >
              保存例句与关联
            </Button>
          </Flex>
        </Flex>
      }
      onClose={onClose}
      open
      rootClassName="v3-sentence-drawer"
      size={900}
      title={initialSentence ? "编辑多维例句" : "新增多维例句"}
    >
      <Space
        className="v3-sentence-drawer-content"
        orientation="vertical"
        size={14}
      >
        <Card size="small" title="例句本体">
          <div className="v3-sentence-drawer-fields">
            <div className="v3-sentence-drawer-metadata">
              <Select
                aria-label="CEFR 等级"
                onChange={setLevel}
                options={CEFR_OPTIONS}
                value={level}
              />
              {dialects.length > 1 ? (
                <Select
                  aria-label="英文例句方言侧"
                  onChange={(dialect: Dialect) => {
                    setSourceDialect(dialect);
                  }}
                  options={dialects.map((dialect) => ({
                    label: dialect === "uk" ? "英式英文" : "美式英文",
                    value: dialect
                  }))}
                  value={sourceDialect}
                />
              ) : null}
            </div>
            <Input.TextArea
              aria-label="英文例句"
              autoSize={{ minRows: 2, maxRows: 5 }}
              onChange={(event) => {
                setEnText((current) =>
                  replaceEnglishText(current, sourceDialect, event.target.value)
                );
                setAssociations((current) =>
                  current.filter(
                    (association) =>
                      association.source_dialect !== sourceDialect
                  )
                );
              }}
              placeholder="输入英文例句"
              value={english}
            />
          </div>
        </Card>

        <Card size="small" title="中文译文">
          <div className="v3-sentence-drawer-translation-list">
            <div className="v3-sentence-drawer-translation-items">
              {translations.map((translation) => {
                const meta = translationBandMeta(translation.band);
                return (
                  <div
                    className="v3-sentence-drawer-translation-row"
                    key={translation.id}
                  >
                    <div className="v3-sentence-drawer-translation-band">
                      <Typography.Text strong>{meta.label}</Typography.Text>
                    </div>
                    <Input.TextArea
                      aria-label={`${meta.label.slice(0, 2)}中文译文`}
                      autoSize={{ minRows: 1, maxRows: 4 }}
                      onChange={(event) =>
                        updateTranslation(translation.id, event.target.value)
                      }
                      placeholder={`输入${meta.label.slice(0, 2)}中文译文`}
                      value={translation.content.text}
                    />
                    <Button
                      aria-label={`删除${meta.label.slice(0, 2)}中文译文`}
                      danger
                      disabled={translations.length <= 1}
                      icon={<DeleteOutlined aria-hidden />}
                      onClick={() => removeTranslation(translation.id)}
                      size="small"
                      type="text"
                    />
                  </div>
                );
              })}
            </div>
            {missingTranslationBands.length > 0 ? (
              <Flex className="v3-sentence-drawer-translation-add" gap={8} wrap>
                <Select
                  aria-label="新增译文等级"
                  onChange={setNewTranslationBand}
                  options={missingTranslationBands.map((item) => ({
                    label: item.label,
                    value: item.band
                  }))}
                  placeholder="选择要补充的译文等级"
                  style={{ flex: 1, minWidth: 260 }}
                  value={newTranslationBand}
                />
                <Button
                  disabled={!newTranslationBand}
                  icon={<PlusOutlined aria-hidden />}
                  onClick={addTranslation}
                >
                  添加译文
                </Button>
              </Flex>
            ) : null}
          </div>
        </Card>

        <Card size="small" title="例句归属词义">
          <Space orientation="vertical" size={9} style={{ width: "100%" }}>
            <Typography.Text type="secondary">
              主关联固定为当前词义；需要让同一句出现在其他词义下时，在这里选择已发布的具体词义。
            </Typography.Text>
            <Flex gap={8} wrap>
              <Select
                aria-label="选择上下文关联词义"
                filterOption={false}
                loading={
                  contextRelated.exact.isFetching ||
                  contextRelated.contains.isFetching
                }
                onChange={setSelectedContextKey}
                onSearch={setContextQuery}
                options={contextTargetOptions.map((option) => ({
                  label: option.label,
                  value: option.key
                }))}
                placeholder="搜索已发布词条并选择具体词义"
                showSearch
                style={{ flex: 1, minWidth: 300 }}
                value={selectedContextKey}
              />
              <Button disabled={!selectedContextKey} onClick={addContextLink}>
                添加词义归属
              </Button>
            </Flex>
            <Space orientation="vertical" size={6} style={{ width: "100%" }}>
              {links.map((link, index) => {
                const key = `${link.word_id}:${link.sense_id}`;
                const primary = link.role === "focus" || link.role === "head";
                return (
                  <Flex
                    align="center"
                    className="v3-sentence-drawer-link"
                    gap={8}
                    justify="space-between"
                    key={`${key}:${index}`}
                  >
                    <Space size={8} wrap>
                      <Tag color={primary ? "blue" : "default"}>
                        {primary ? "当前词义" : "上下文词义"}
                      </Tag>
                      <Typography.Text>
                        {primary
                          ? "当前编辑词义"
                          : (contextLabels[key] ??
                            `${link.word_id} · ${link.sense_id}`)}
                      </Typography.Text>
                    </Space>
                    {!primary ? (
                      <Button
                        aria-label={`删除词义归属 ${index + 1}`}
                        danger
                        icon={<DeleteOutlined aria-hidden />}
                        onClick={() =>
                          setLinks((current) =>
                            current.filter(
                              (_, linkIndex) => linkIndex !== index
                            )
                          )
                        }
                        type="text"
                      />
                    ) : null}
                  </Flex>
                );
              })}
            </Space>
          </Space>
        </Card>

        {targetDiscoveryEnabled ? (
          <V3SentenceTargetDiscovery
            dialect={sourceDialect}
            onConvertDraftToPending={(occurrence, candidate) =>
              addDiscoveredPending(occurrence, candidate)
            }
            onCreatePending={addDiscoveredPending}
            onDiscover={discover}
            onResultAccepted={acceptDiscoveryResult}
            onSelectSense={(occurrence, candidate, sense) =>
              candidate.publicationId && candidate.matchedVariantId
                ? (() => {
                    const associationId = idFactory();
                    addAssociation({
                      id: associationId,
                      source_dialect: sourceDialect,
                      source_segments: occurrence.segments,
                      target_word_id: candidate.entryId,
                      target_sense_id: sense.id,
                      target_publication_id: candidate.publicationId,
                      target_form_variant_id: candidate.matchedVariantId
                    });
                    if (candidate.componentUsages?.length) {
                      setAssociationComponents((current) => ({
                        ...current,
                        [associationId]: candidate.componentUsages!
                      }));
                    }
                  })()
                : undefined
            }
            onViewDraft={(_, candidate) =>
              window.open(
                `/words/${candidate.entryId}/v3/wizard/meanings?mode=edit`,
                "_blank",
                "noopener,noreferrer"
              )
            }
            sentenceText={english}
          />
        ) : (
          <Alert
            showIcon
            title="句中词条发现能力尚未开启"
            description="当前仍可查看和保存已有例句关联；管理员开启发现能力后可使用一键发现与手动选词。"
            type="info"
          />
        )}

        <Card size="small" title="本次关联">
          {hasCompatibilityLinked ? (
            <Alert
              description="保存时服务端会按当前发布版本重新校验。单词可安全解析时会补齐精确身份；短语或多词形无法唯一解析时会明确拒绝，原有关联不会被删除。"
              showIcon
              style={{ marginBottom: 10 }}
              title="包含待补齐精确身份的兼容关联"
              type="warning"
            />
          ) : null}
          {associations.length === 0 ? (
            <Empty
              description="至少添加一条已关联词义或待关联词条"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            <Space orientation="vertical" size={8} style={{ width: "100%" }}>
              {associations.map((association) => {
                const words = componentWordsFromSegments(
                  association.source_segments
                );
                const configuredComponents =
                  associationComponents[association.id] ?? [];
                return (
                  <Flex
                    align="center"
                    className="v3-sentence-drawer-association"
                    gap={8}
                    justify="space-between"
                    key={association.id}
                  >
                    <Space size={8} wrap>
                      <LinkOutlined aria-hidden />
                      <Tag
                        color={
                          "target_word_id" in association ? "green" : "orange"
                        }
                      >
                        {"target_word_id" in association ? "已关联" : "待关联"}
                      </Tag>
                      {isLinkedAssociation(association) &&
                      (!association.target_publication_id ||
                        !association.target_form_variant_id) ? (
                        <Tag color="gold">待服务端校验</Tag>
                      ) : null}
                      <Space orientation="vertical" size={2}>
                        <Typography.Text strong>
                          {"target_word_id" in association
                            ? association.source_segments
                                .map((segment) => segment.surface)
                                .join(" … ")
                            : association.pending_target_headword}
                        </Typography.Text>
                        {words.length > 1 ? (
                          <Flex
                            align="center"
                            className="v3-sentence-drawer-component-words"
                            gap={4}
                            wrap
                          >
                            <Typography.Text type="secondary">
                              成分用词
                            </Typography.Text>
                            {words.map((word, index) => (
                              <Tag key={`${association.id}:${index}:${word}`}>
                                {word}
                              </Tag>
                            ))}
                          </Flex>
                        ) : null}
                        {configuredComponents.length > 0 ? (
                          <Space orientation="vertical" size={4}>
                            {configuredComponents.map((component) => (
                              <Flex gap={6} key={component.id} wrap>
                                <Tag>{component.literal}</Tag>
                                <Tag
                                  color={
                                    component.state === "resolved"
                                      ? "green"
                                      : "gold"
                                  }
                                >
                                  {component.state === "resolved"
                                    ? "已关联词义"
                                    : "待选择词义"}
                                </Tag>
                                {component.state === "resolved" ? (
                                  <Typography.Text type="secondary">
                                    {component.target_headword} ·{" "}
                                    {component.target_gloss || "暂无释义"} ·{" "}
                                    {dialectLabel(component.target_dialect)} ·{" "}
                                    {formTypeLabel(component.target_form_type)}
                                  </Typography.Text>
                                ) : null}
                              </Flex>
                            ))}
                          </Space>
                        ) : null}
                      </Space>
                      {!("target_word_id" in association) ? (
                        <Input
                          aria-label={`编辑待关联词义 ${association.id}`}
                          className="v3-sentence-drawer-inline-gloss"
                          onChange={(event) =>
                            updatePendingGloss(
                              association.id,
                              event.target.value
                            )
                          }
                          placeholder="可选：预填一条中文词义"
                          value={association.pending_target_gloss ?? ""}
                        />
                      ) : null}
                    </Space>
                    <Space size={4}>
                      {!("target_word_id" in association) &&
                      persistedAssociationIds.has(association.id) &&
                      onCreatePendingTarget ? (
                        <Button
                          icon={<ExportOutlined aria-hidden />}
                          onClick={() => onCreatePendingTarget(association)}
                          size="small"
                        >
                          创建目标
                          {association.pending_target_kind === "phrase"
                            ? "短语"
                            : "单词"}
                        </Button>
                      ) : null}
                      <Button
                        aria-label={`删除关联 ${association.id}`}
                        danger
                        icon={<DeleteOutlined aria-hidden />}
                        onClick={() => {
                          setAssociations((current) =>
                            current.filter((item) => item.id !== association.id)
                          );
                          setAssociationComponents((current) => {
                            const next = { ...current };
                            delete next[association.id];
                            return next;
                          });
                        }}
                        type="text"
                      />
                    </Space>
                  </Flex>
                );
              })}
            </Space>
          )}
        </Card>
        {error ? <Alert showIcon title={error} type="error" /> : null}
      </Space>
    </Drawer>
  );
}

export function V3MultidimensionalSentenceDrawer({
  open,
  idFactory = newWordNodeId,
  ...props
}: Props) {
  return open ? <Session {...props} idFactory={idFactory} /> : null;
}
