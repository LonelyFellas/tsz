import { HttpError } from "@tsz/api-client";
import type {
  AdminProfile,
  AdminWordListItem,
  AdminWordListQuery,
  AdminWordListResponse,
  AdminWordStats,
  AdminWordV2,
  AdminWordDraftV2Envelope,
  RetiredStableSlotV2,
  AdminWordV2Envelope,
  CreatePartOfSpeechInput,
  CreateSubPartOfSpeechInput,
  CreateAdminWordV2Input,
  DetectWordInputV2,
  DetectWordResponseV2,
  Dialect,
  DialectVariantSuggestionItemV2,
  DraftFormsStepContent,
  DraftMeaningsStepContent,
  DraftValidationIssue,
  DraftValidationIssueV2,
  DraftValidationResponse,
  DeletePartOfSpeechQuery,
  EntryDeleteBatchInput,
  EntryReferenceKind,
  EntryReferenceSummary,
  EntryDeleteBatchResponse,
  EntryLifecycleBatchInput,
  EntryLifecycleBatchResponse,
  EntryLifecycleInput,
  FormsImpactItemV2,
  PartOfSpeechCatalogResponse,
  PartOfSpeechConfig,
  PartOfSpeechConfigListQuery,
  PartOfSpeechConfigListResponse,
  PreviewFormsImpactInputV2,
  PreviewFormsImpactResponseV2,
  PublishAdminWordV2Input,
  RelatedSearchResponse,
  RelatedSearchQuery,
  RelatedWordSense,
  RichText,
  SaveFormsStepInput,
  SaveMeaningsStepInput,
  SuggestDialectVariantsInputV2,
  SuggestDialectVariantsResponseV2,
  SurfaceContentScopeV2,
  SurfaceMatchCandidateV2,
  SurfaceMatchPageV2,
  LexiconSurfaceMatchV2,
  MatchedEntryContextV2,
  SubPartOfSpeechConfig,
  SubPartOfSpeechListResponse,
  UpdatePartOfSpeechInput,
  UpdateSubPartOfSpeechInput,
  ValidateAdminWordV2Input,
  WordDefinitionV2,
  WordFormVariantV2,
  WordHeadwordsV2,
  WordPosMeaningsV2,
  WordSenseV2
} from "@tsz/types";
import type {
  ClaimPendingSentenceAssociationInput,
  ClaimPendingSentenceAssociationResponse,
  DraftMeaningsWithSentenceAssociations,
  PendingSentenceAssociationPageV1,
  ResolveSentenceAssociationInput,
  ResolveSentenceAssociationResponse
} from "../word-creation/meaningsAndExamples/sentenceAssociationTypes";
import { sentenceAssociationMeanings } from "../word-creation/meaningsAndExamples/sentenceAssociationTypes";
import {
  normalizePendingWord,
  normalizeSentenceAssociations,
  resolveSentenceAssociationFromWord,
  sharedSentenceIssueField
} from "../word-creation/meaningsAndExamples/sentenceAssociationModel";
import {
  ADMIN_WORDS_MOCK_STORAGE_SCHEMA,
  createDetectionFixture,
  createInitialMeanings,
  createInitialMeaningsForAddedPos,
  createInitialSenseGroup,
  normalizeFixtureHeadword,
  richText
} from "./fixtures";
import {
  createAdminWordsMockStorage,
  type AdminWordsMockStorage,
  type AdminWordsMockStorageLike
} from "./storage";
import { createPartOfSpeechSeed } from "./partOfSpeechFixtures";

type MockWord = AdminWordV2;

function isV2(word: MockWord): word is AdminWordV2 {
  return word.schema_version === 2;
}

type MockCreateAdminWordV2Input = CreateAdminWordV2Input & {
  idempotency_key: string;
};
type MockPublishAdminWordV2Input = PublishAdminWordV2Input & {
  idempotency_key: string;
};
type MockSaveFormsStepInput = Omit<
  SaveFormsStepInput,
  "confirmed_impact_token"
> & {
  operation_id?: string;
  confirmed_impact_token?: string | null;
};
type MockSaveMeaningsStepInput = SaveMeaningsStepInput & {
  operation_id?: string;
};

interface MockOperationRecord {
  kind: "forms" | "meanings";
  word_id: string;
  input_json: string;
  result: AdminWordV2Envelope;
}

interface MockImpactTokenRecord {
  word_id: string;
  base_revision: number;
  content_json: string;
  affected: FormsImpactItemV2[];
}

interface MockFormsSurfaceEvidence {
  content_json: string;
  match_ids: string[];
  confirmed_revision: number;
}

interface MockLifecycleOperationRecord {
  scope:
    "archive" | "restore" | "archive_batch" | "restore_batch" | "delete_batch";
  request_json: string;
  response: EntryLifecycleBatchResponse | EntryDeleteBatchResponse;
}

interface MockWordOperationRecord {
  request_json: string;
  response: AdminWordV2Envelope;
}

export interface AdminWordsMockPersistedState {
  sequence: number;
  catalog_version: number;
  parts_of_speech: Record<string, PartOfSpeechConfig>;
  sub_parts: Record<string, SubPartOfSpeechConfig>;
  words: Record<string, MockWord>;
  /** 词条 -> 已退役但仍被永久占用的稳定槽位身份，与后端 lexicon.nodes 同口径。 */
  retired_stable_slots: Record<string, RetiredStableSlotV2[]>;
  detections: Record<string, DetectWordResponseV2>;
  create_idempotency: Record<string, MockWordOperationRecord>;
  operations: Record<string, MockOperationRecord>;
  publish_idempotency: Record<string, MockWordOperationRecord>;
  lifecycle_operations: Record<string, MockLifecycleOperationRecord>;
  publication_words: Record<string, AdminWordV2>;
  impact_tokens: Record<string, MockImpactTokenRecord>;
  forms_surface_evidence: Record<string, MockFormsSurfaceEvidence>;
  lost_publish_responses: string[];
  consumed_detection_ids: string[];
}

interface MockSurfaceSnapshot {
  actor_id: string;
  owner_kind: "create" | "forms";
  detection_id?: string;
  word_id?: string;
  base_revision?: number;
  content_key: string;
  match_ids: string[];
  policy_name:
    "surface_warning_acknowledgement" | "allow_new_exact_headword_entries";
  policy_epoch: number;
  pages: Map<string, SurfaceMatchPageV2>;
  terminal_token?: string;
  impact_token?: string;
}

function isPartOfSpeechActor(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.display_name === "string"
  );
}

function isPartOfSpeechConfig(value: unknown): value is PartOfSpeechConfig {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.code === "string" &&
    typeof value.name_zh === "string" &&
    typeof value.name_en === "string" &&
    typeof value.abbreviation === "string" &&
    Number.isInteger(value.sort_order) &&
    Number.isInteger(value.usage_count) &&
    Number.isInteger(value.sub_part_count) &&
    Number.isInteger(value.revision) &&
    isPartOfSpeechActor(value.created_by) &&
    typeof value.created_at === "string" &&
    typeof value.updated_at === "string"
  );
}

function isSubPartOfSpeechConfig(
  value: unknown
): value is SubPartOfSpeechConfig {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.part_of_speech_id === "string" &&
    typeof value.code === "string" &&
    typeof value.name_zh === "string" &&
    typeof value.name_en === "string" &&
    Number.isInteger(value.sort_order) &&
    Number.isInteger(value.usage_count) &&
    Number.isInteger(value.revision) &&
    isPartOfSpeechActor(value.created_by) &&
    typeof value.created_at === "string" &&
    typeof value.updated_at === "string"
  );
}

type MockAdminProfile = Pick<
  AdminProfile,
  "id" | "display_name" | "role" | "permissions"
>;

export interface CreateAdminWordsMockOptions {
  getAdminProfile: () => MockAdminProfile | undefined;
  /** 混合模式下词性由真实 catalog 约束，mock 不再用内部 seed 二次否决。 */
  partOfSpeechValidation?: "internal" | "external";
  now?: () => Date;
  latencyMs?: number;
  maxPayloadBytes?: number;
  storage?: AdminWordsMockStorage<AdminWordsMockPersistedState>;
  sessionStorage?: AdminWordsMockStorageLike;
  warn?: (message: string, error?: unknown) => void;
  /** Legacy remains available for fixture compatibility; runtime selects the current policy. */
  surfaceWarnings?: "legacy" | "enabled" | "temporarily_disabled";
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSenseGroupV2(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name_zh === "string" &&
    typeof value.name_en === "string"
  );
}

function isMockWord(value: unknown): value is MockWord {
  if (!isRecord(value)) return false;
  if (
    typeof value.id !== "string" ||
    typeof value.created_by !== "string" ||
    typeof value.created_at !== "string" ||
    !Number.isFinite(Date.parse(value.created_at)) ||
    typeof value.updated_at !== "string" ||
    !Number.isFinite(Date.parse(value.updated_at)) ||
    (value.status !== "draft" &&
      value.status !== "published" &&
      value.status !== "archived")
  ) {
    return false;
  }
  return (
    value.schema_version === 2 &&
    typeof value.revision === "number" &&
    typeof value.lifecycle_revision === "number" &&
    Array.isArray(value.completed_steps) &&
    isRecord(value.forms) &&
    Array.isArray(value.forms.pos) &&
    isRecord(value.meanings) &&
    Array.isArray(value.meanings.pos) &&
    Array.isArray(value.meanings.sense_groups) &&
    value.meanings.sense_groups.every(isSenseGroupV2)
  );
}

export function isAdminWordsMockPersistedState(
  value: unknown
): value is AdminWordsMockPersistedState {
  if (!isRecord(value)) return false;
  if (
    !Number.isInteger(value.sequence) ||
    !Number.isInteger(value.catalog_version) ||
    !isRecord(value.parts_of_speech) ||
    !Object.values(value.parts_of_speech).every(isPartOfSpeechConfig) ||
    !isRecord(value.sub_parts) ||
    !Object.values(value.sub_parts).every(isSubPartOfSpeechConfig) ||
    !isRecord(value.words) ||
    !Object.values(value.words).every(isMockWord) ||
    !isRecord(value.retired_stable_slots) ||
    !Object.values(value.retired_stable_slots).every(
      (entry) =>
        Array.isArray(entry) &&
        entry.every(
          (slot) =>
            isRecord(slot) &&
            typeof slot.id === "string" &&
            typeof slot.parent_node_id === "string" &&
            typeof slot.node_role === "string"
        )
    ) ||
    !isRecord(value.detections) ||
    !Object.values(value.detections).every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.detection_id === "string" &&
        typeof entry.expires_at === "string" &&
        Number.isFinite(Date.parse(entry.expires_at)) &&
        isRecord(entry.request) &&
        entry.request.language === "en" &&
        typeof entry.request.headword === "string" &&
        isRecord(entry.builtin_dictionary) &&
        isRecord(entry.smart_dictionary)
    ) ||
    !isRecord(value.create_idempotency) ||
    !Object.values(value.create_idempotency).every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.request_json === "string" &&
        isRecord(entry.response) &&
        isMockWord(entry.response.word) &&
        isV2(entry.response.word)
    ) ||
    !isRecord(value.operations) ||
    !Object.values(value.operations).every(
      (entry) =>
        isRecord(entry) &&
        (entry.kind === "forms" || entry.kind === "meanings") &&
        typeof entry.word_id === "string" &&
        typeof entry.input_json === "string" &&
        isRecord(entry.result) &&
        isMockWord(entry.result.word)
    ) ||
    !isRecord(value.publish_idempotency) ||
    !Object.values(value.publish_idempotency).every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.request_json === "string" &&
        isRecord(entry.response) &&
        isMockWord(entry.response.word) &&
        isV2(entry.response.word)
    ) ||
    !isRecord(value.lifecycle_operations) ||
    !Object.values(value.lifecycle_operations).every(
      (entry) =>
        isRecord(entry) &&
        ["archive", "restore", "archive_batch", "restore_batch"].includes(
          entry.scope as string
        ) &&
        typeof entry.request_json === "string" &&
        isRecord(entry.response) &&
        Array.isArray(entry.response.words) &&
        entry.response.words.every(isMockWord) &&
        Number.isInteger(entry.response.affected) &&
        (entry.response.affected as number) >= 0
    ) ||
    !isRecord(value.publication_words) ||
    !Object.values(value.publication_words).every(
      (entry) => isMockWord(entry) && isV2(entry)
    ) ||
    !isRecord(value.impact_tokens) ||
    !Object.values(value.impact_tokens).every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.word_id === "string" &&
        typeof entry.base_revision === "number" &&
        typeof entry.content_json === "string" &&
        Array.isArray(entry.affected) &&
        entry.affected.every(
          (affected) =>
            isRecord(affected) &&
            typeof affected.node_id === "string" &&
            typeof affected.node_type === "string" &&
            typeof affected.reason === "string"
        )
    ) ||
    (value.forms_surface_evidence !== undefined &&
      (!isRecord(value.forms_surface_evidence) ||
        !Object.values(value.forms_surface_evidence).every(
          (entry) =>
            isRecord(entry) &&
            typeof entry.content_json === "string" &&
            Array.isArray(entry.match_ids) &&
            entry.match_ids.every((matchId) => typeof matchId === "string") &&
            Number.isInteger(entry.confirmed_revision) &&
            (entry.confirmed_revision as number) >= 1
        ))) ||
    !Array.isArray(value.lost_publish_responses) ||
    !value.lost_publish_responses.every((entry) => typeof entry === "string") ||
    !Array.isArray(value.consumed_detection_ids) ||
    !value.consumed_detection_ids.every((entry) => typeof entry === "string")
  ) {
    return false;
  }
  return true;
}

function makeInitialState(nowIso: string): AdminWordsMockPersistedState {
  const seed = createPartOfSpeechSeed(nowIso);
  return {
    sequence: 0,
    catalog_version: 1,
    parts_of_speech: Object.fromEntries(
      seed.partsOfSpeech.map((item) => [item.id, item])
    ),
    sub_parts: Object.fromEntries(seed.subParts.map((item) => [item.id, item])),
    words: {},
    retired_stable_slots: {},
    detections: {},
    create_idempotency: {},
    operations: {},
    publish_idempotency: {},
    lifecycle_operations: {},
    publication_words: {},
    impact_tokens: {},
    forms_surface_evidence: {},
    lost_publish_responses: [],
    consumed_detection_ids: []
  };
}

function displayHeadword(word: MockWord): string {
  if (word.headwords.mode === "unified") return word.headwords.common;
  return word.headwords[word.headwords.source_dialect];
}

/**
 * 列表行的词汇列：真实后端用 `string_agg` 把并列拼写拼成一个字符串下发，
 * 顺序为 `common` → 检测基准侧 → 另一侧。mock 必须同构，否则开 mock 时看到的
 * 词汇列与真实后端不一致。注意这与 `displayHeadword` 不同——后者取单个主词，
 * 用于搜索匹配与例句文案，不能混用。
 */
function listHeadword(word: MockWord): string {
  if (word.headwords.mode === "unified") return word.headwords.common;
  const { source_dialect } = word.headwords;
  const other = source_dialect === "uk" ? "us" : "uk";
  return `${word.headwords[source_dialect]} / ${word.headwords[other]}`;
}

/** 与 `listHeadword` 同序，供列表行的方言列使用。 */
function listDialects(word: MockWord): AdminWordListItem["dialects"] {
  if (word.headwords.mode === "unified") return ["common"];
  const { source_dialect } = word.headwords;
  return [source_dialect, source_dialect === "uk" ? "us" : "uk"];
}

/** 与 `listHeadword` / `listDialects` 同序，镜像后端必填的逐侧拼写。 */
function listHeadwordVariants(
  word: MockWord
): AdminWordListItem["headword_variants"] {
  if (word.headwords.mode === "unified") {
    return [{ dialect: "common", headword: word.headwords.common }];
  }
  const { source_dialect } = word.headwords;
  const other = source_dialect === "uk" ? "us" : "uk";
  return [
    {
      dialect: source_dialect,
      headword: word.headwords[source_dialect]
    },
    { dialect: other, headword: word.headwords[other] }
  ];
}

function allHeadwords(word: MockWord): Array<{
  value: string;
  dialect: "uk" | "us" | "common";
}> {
  return word.headwords.mode === "unified"
    ? [{ value: word.headwords.common, dialect: "common" }]
    : [
        { value: word.headwords.uk, dialect: "uk" },
        { value: word.headwords.us, dialect: "us" }
      ];
}

function v2ChineseDefinition(definition: WordDefinitionV2): string {
  return definition.definition_mode === "zh_definition" ||
    definition.definition_mode === "zh_sentence"
    ? definition.content.text
    : "";
}

function wordGloss(word: MockWord): string {
  for (const pos of word.meanings.pos) {
    for (const sense of pos.senses) {
      const definition = sense.definitions.find(
        (entry) => v2ChineseDefinition(entry).trim() !== ""
      );
      if (definition) return v2ChineseDefinition(definition);
    }
  }
  return "";
}

function wordPos(word: MockWord) {
  return word.forms.pos.map((entry) => entry.pos);
}

function wordLevels(word: MockWord) {
  const levels = word.meanings.pos.flatMap((pos) =>
    pos.senses.map((sense) => sense.level)
  );
  return [...new Set(levels)].sort();
}

function dateParts(value: string | Date): { day: string; month: string } {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value instanceof Date ? value : new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const month = `${get("year")}-${get("month")}`;
  return { month, day: `${month}-${get("day")}` };
}

type MatchedDialect = "common" | "uk" | "us";

/**
 * 词形变体的稳定槽位身份，键是 (父槽位, 角色)，方言编在角色里 ——
 * 与后端 `forms.form_variant:<dialect>` 同口径。
 *
 * 这个键一旦保存过就永久绑定同一个节点 ID：mock 也必须照此校验，
 * 否则本地永远绿、真机 422。
 */
function formVariantStableSlots(
  content: DraftFormsStepContent
): RetiredStableSlotV2[] {
  return content.pos.flatMap((pos) =>
    [pos.base_form, ...pos.form_groups.flatMap((group) => group.slots)].flatMap(
      (slot) =>
        slot.variants.map((variant) => ({
          id: variant.id,
          parent_node_id: slot.id,
          node_role: `forms.form_variant:${variant.dialect}`
        }))
    )
  );
}

function stableSlotKey(slot: RetiredStableSlotV2): string {
  return `${slot.parent_node_id}:${slot.node_role}`;
}

function sourceHeadword(headwords: WordHeadwordsV2): string {
  return headwords.mode === "unified"
    ? headwords.common
    : headwords[headwords.source_dialect];
}

function sameHeadword(left: string, right: string): boolean {
  return (
    normalizeFixtureHeadword(left).key === normalizeFixtureHeadword(right).key
  );
}

function compatibleHeadwords(
  detected: WordHeadwordsV2,
  matchedDialect: MatchedDialect,
  submitted: WordHeadwordsV2
): boolean {
  const detectedSource =
    detected.mode === "distinguish"
      ? detected.source_dialect
      : matchedDialect === "common"
        ? undefined
        : matchedDialect;
  if (
    detectedSource !== undefined &&
    submitted.mode === "distinguish" &&
    submitted.source_dialect !== detectedSource
  ) {
    return false;
  }
  return sameHeadword(sourceHeadword(detected), sourceHeadword(submitted));
}

function headwordOrigin(
  detected: WordHeadwordsV2,
  matchedDialect: MatchedDialect,
  submitted: WordHeadwordsV2,
  dialect: WordFormVariantV2["dialect"],
  spelling: string
): WordFormVariantV2["origin"] {
  let dictionaryValue: string | undefined;
  if (submitted.mode === "unified" && dialect === "common") {
    dictionaryValue = sourceHeadword(detected);
  } else if (submitted.mode === "distinguish") {
    if (detected.mode === "distinguish") {
      if (dialect === "uk" || dialect === "us") {
        dictionaryValue = detected[dialect];
      }
    } else {
      const lockedDialect =
        matchedDialect === "common" ? submitted.source_dialect : matchedDialect;
      if (dialect === lockedDialect) dictionaryValue = detected.common;
    }
  }
  return dictionaryValue !== undefined &&
    sameHeadword(dictionaryValue, spelling)
    ? "dictionary"
    : "manual";
}

function baseVariant(
  createId: (prefix: string) => string,
  dialect: WordFormVariantV2["dialect"],
  spelling: string,
  origin: WordFormVariantV2["origin"]
): WordFormVariantV2 {
  return {
    id: createId("form-variant"),
    dialect,
    spelling,
    origin,
    pronunciations: [
      {
        id: createId("pronunciation"),
        dict_phonetic: "",
        actual_pron: "",
        style: "normal"
      }
    ]
  };
}

function alignBaseForms(
  forms: DraftFormsStepContent,
  detected: WordHeadwordsV2,
  matchedDialect: MatchedDialect,
  submitted: WordHeadwordsV2,
  createId: (prefix: string) => string
): void {
  const mode = submitted.mode;
  for (const pos of forms.pos) {
    pos.dialect_rules.spelling_mode = mode;
    pos.dialect_rules.phonetic_mode = mode;
    pos.base_form.variants =
      submitted.mode === "unified"
        ? [
            baseVariant(
              createId,
              "common",
              submitted.common,
              headwordOrigin(
                detected,
                matchedDialect,
                submitted,
                "common",
                submitted.common
              )
            )
          ]
        : (["uk", "us"] as const).map((dialect) =>
            baseVariant(
              createId,
              dialect,
              submitted[dialect],
              headwordOrigin(
                detected,
                matchedDialect,
                submitted,
                dialect,
                submitted[dialect]
              )
            )
          );
  }
}

function isNonEmptyEnglishText(
  value: WordSenseV2["sentences"][number]["en_text"]
): boolean {
  if (value.mode === "unified") return value.common.value.text.trim() !== "";
  return (
    value.uk.state === "ready" &&
    value.us.state === "ready" &&
    value.uk.variant.value.text.trim() !== "" &&
    value.us.variant.value.text.trim() !== ""
  );
}

function validateForms(
  content: DraftFormsStepContent,
  headwords: WordHeadwordsV2,
  current: AdminWordsMockPersistedState,
  validatePartOfSpeech = true
): DraftValidationIssue[] {
  const issues: DraftValidationIssue[] = [];
  if (content.pos.length === 0) {
    issues.push({
      step: "forms",
      node_id: "forms",
      field: "pos",
      code: "pos_required",
      message: "至少保留一个基本词性"
    });
  }
  for (const pos of content.pos) {
    const configuredPart = Object.values(current.parts_of_speech).find(
      (part) => part.code === pos.pos
    );
    if (validatePartOfSpeech && !configuredPart) {
      issues.push({
        step: "forms",
        node_id: pos.pos_id,
        field: "pos",
        code: "unknown_part_of_speech",
        message: `基本词性 ${pos.pos} 未配置`
      });
    }
    for (const formGroup of pos.form_groups) {
      if (
        new Set(formGroup.slots.map((slot) => slot.form_type)).size !==
        formGroup.slots.length
      ) {
        issues.push({
          step: "forms",
          node_id: formGroup.id,
          field: "slots",
          code: "duplicate_form_type",
          message: "同组内词形类型不能重复"
        });
      }
    }
    const expectedDialects: Array<"uk" | "us" | "common"> =
      pos.dialect_rules.spelling_mode === "distinguish" ||
      pos.dialect_rules.phonetic_mode === "distinguish"
        ? ["uk", "us"]
        : ["common"];
    const slots = [
      pos.base_form,
      ...pos.form_groups.flatMap((entry) => entry.slots)
    ];
    for (const slot of slots) {
      const actualDialects = slot.variants.map((variant) => variant.dialect);
      if (
        actualDialects.length !== expectedDialects.length ||
        new Set(actualDialects).size !== actualDialects.length ||
        expectedDialects.some((dialect) => !actualDialects.includes(dialect))
      ) {
        issues.push({
          step: "forms",
          node_id: slot.id,
          field: "variants",
          code: "dialect_variants_invalid",
          message: "词形方言行必须与当前方言规则完全一致"
        });
      }
      for (const dialect of expectedDialects) {
        const variant = slot.variants.find(
          (entry) => entry.dialect === dialect
        );
        if (!variant || variant.spelling.trim() === "") {
          issues.push({
            step: "forms",
            node_id: slot.id,
            field: `variants.${dialect}.spelling`,
            code: "spelling_required",
            message: `${dialect} 拼写不能为空`
          });
          continue;
        }
        if (
          variant.pronunciations.length === 0 ||
          variant.pronunciations.some(
            (entry) =>
              entry.dict_phonetic.trim() === "" ||
              entry.actual_pron.trim() === ""
          )
        ) {
          issues.push({
            step: "forms",
            node_id: variant.id,
            field: "pronunciations",
            code: "pronunciation_required",
            message: "词典音标和实际发音不能为空"
          });
        }
      }
    }
    for (const variant of pos.base_form.variants) {
      const expectedSpelling =
        headwords.mode === "unified"
          ? headwords.common
          : variant.dialect === "uk" || variant.dialect === "us"
            ? headwords[variant.dialect]
            : "";
      if (variant.spelling !== expectedSpelling) {
        issues.push({
          step: "forms",
          node_id: variant.id,
          field: "spelling",
          code: "base_spelling_mismatch",
          message: "原形拼写必须与只读主词形一致"
        });
      }
    }
  }
  return issues;
}

function validPercent(value: string | undefined): boolean {
  if (
    value === undefined ||
    !/^(?:100(?:\.0{1,2})?|\d{1,2}(?:\.\d{1,2})?)$/.test(value)
  ) {
    return false;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100;
}

function wordHasSense(word: MockWord, senseId: string): boolean {
  return word.meanings.pos.some((pos) =>
    pos.senses.some((sense) => sense.id === senseId)
  );
}

function validateMeanings(
  word: AdminWordV2,
  content: DraftMeaningsWithSentenceAssociations,
  current: AdminWordsMockPersistedState,
  validatePartOfSpeech = true
): DraftValidationIssue[] {
  const issues: DraftValidationIssue[] = [];
  const senseGroupIds = new Set(content.sense_groups.map((group) => group.id));
  if (content.sense_groups.length === 0) {
    issues.push({
      step: "meanings",
      node_id: word.id,
      field: "sense_groups",
      code: "sense_group_required",
      message: "至少需要一个语义区间"
    });
  }
  for (const sentence of content.shared_sentences ?? []) {
    const field = sharedSentenceIssueField(sentence);
    if (field) {
      issues.push({
        step: "meanings",
        node_id: sentence.id,
        field,
        code: "shared_sentence_invalid",
        message: "请补齐多维例句正文、译文和有效位置关联"
      });
    }
  }
  for (const group of content.sense_groups) {
    const names = [
      ["name_zh", group.name_zh],
      ["name_en", group.name_en]
    ] as const;
    for (const [field, name] of names) {
      const normalized = name.trim();
      if (!normalized) {
        issues.push({
          step: "meanings",
          node_id: group.id,
          field,
          code: "sense_group_name_required",
          message:
            field === "name_zh"
              ? "请填写语义区间中文名"
              : "请填写语义区间英文名"
        });
      } else if ([...normalized].length > 200) {
        issues.push({
          step: "meanings",
          node_id: group.id,
          field,
          code: "sense_group_name_too_long",
          message:
            field === "name_zh"
              ? "语义区间中文名不能超过 200 个字符"
              : "语义区间英文名不能超过 200 个字符"
        });
      }
    }
  }
  const hasTargetSense = (wordId: string, senseId: string) => {
    if (wordId === word.id) {
      return content.pos.some((pos) =>
        pos.senses.some((sense) => sense.id === senseId)
      );
    }
    const target = current.words[wordId];
    if (!target || target.status === "archived") return false;
    const publication = current.publication_words[wordId];
    return publication ? wordHasSense(publication, senseId) : false;
  };
  for (const formsPos of word.forms.pos) {
    const pos = content.pos.find((entry) => entry.pos_id === formsPos.pos_id);
    if (!pos) {
      issues.push({
        step: "meanings",
        node_id: formsPos.pos_id,
        field: "pos",
        code: "pos_meanings_required",
        message: "每个基本词性都需要词义数据"
      });
      continue;
    }
    if (pos.grammar_structures.length === 0) {
      issues.push({
        step: "meanings",
        node_id: pos.pos_id,
        field: "grammar_structures",
        code: "grammar_required",
        message: "每个词性至少填写一条完整语法结构"
      });
    }
    for (const grammar of pos.grammar_structures) {
      const dialects = grammar.variants.map((variant) => variant.dialect);
      // 与真实后端同口径（tsz-rust #35 / P1）：`unified` 只接受 `[common]`，
      // `distinguish` 接受 `[common]`（收敛后）或 `[uk, us]`（尚未收敛的存量）。
      const shapeValid =
        new Set(dialects).size === dialects.length &&
        ((dialects.length === 1 && dialects[0] === "common") ||
          (word.headwords.mode === "distinguish" &&
            dialects.length === 2 &&
            dialects.includes("uk") &&
            dialects.includes("us")));
      if (
        !shapeValid ||
        grammar.variants.some((variant) => variant.content.text.trim() === "")
      ) {
        issues.push({
          step: "meanings",
          node_id: grammar.id,
          field: "variants",
          code: "grammar_variants_invalid",
          message: "语法结构必须包含当前方言的完整文本"
        });
      }
    }
    if (pos.senses.length === 0) {
      issues.push({
        step: "meanings",
        node_id: pos.pos_id,
        field: "senses",
        code: "sense_required",
        message: "每个词性至少填写一个词义"
      });
    }
    for (const sense of pos.senses) {
      if (sense.sub_pos === "") {
        issues.push({
          step: "meanings",
          node_id: sense.id,
          field: "sub_pos",
          code: "sub_pos_required",
          message: "请选择细分词性"
        });
      } else {
        const configuredPart = Object.values(current.parts_of_speech).find(
          (part) => part.code === formsPos.pos
        );
        const configuredSubPart = Object.values(current.sub_parts).find(
          (subPart) => subPart.code === sense.sub_pos
        );
        if (
          validatePartOfSpeech &&
          (!configuredPart ||
            !configuredSubPart ||
            configuredSubPart.part_of_speech_id !== configuredPart.id)
        ) {
          issues.push({
            step: "meanings",
            node_id: sense.id,
            field: "sub_pos",
            code: "invalid_sub_part_of_speech",
            message: `细分词性 ${sense.sub_pos} 不属于当前基本词性`
          });
        }
      }
      if (!validPercent(sense.frequency)) {
        issues.push({
          step: "meanings",
          node_id: sense.id,
          field: "frequency",
          code: "frequency_invalid",
          message: "词义词频必须是 0–100 且最多两位小数"
        });
      }
      if (!sense.sense_group_id) {
        issues.push({
          step: "meanings",
          node_id: sense.id,
          field: "sense_group_id",
          code: "sense_group_required",
          message: "请选择语义区间"
        });
      } else if (!senseGroupIds.has(sense.sense_group_id)) {
        issues.push({
          step: "meanings",
          node_id: sense.id,
          field: "sense_group_id",
          code: "sense_group_not_found",
          message: "词义分组引用不存在"
        });
      }
      if (
        !sense.definitions.some(
          (definition) => v2ChineseDefinition(definition).trim() !== ""
        )
      ) {
        issues.push({
          step: "meanings",
          node_id: sense.id,
          field: "definitions",
          code: "native_definition_required",
          message: "至少填写一条本语言释义"
        });
      }
      const grammarIds = new Set(
        pos.grammar_structures.map((grammar) => grammar.id)
      );
      for (const definition of sense.definitions) {
        const textValid =
          "mode" in definition.content
            ? isNonEmptyEnglishText(definition.content)
            : definition.content.text.trim() !== "";
        if (
          !textValid ||
          (definition.grammar_structure_id !== undefined &&
            !grammarIds.has(definition.grammar_structure_id))
        ) {
          issues.push({
            step: "meanings",
            node_id: definition.id,
            field: "content",
            code: "definition_invalid",
            message: "释义文本或语法结构引用无效"
          });
        }
      }
      for (const sentence of sense.sentences) {
        const focus = sentence.links.filter((link) => link.role === "focus");
        if (
          sentence.zh_text.text.trim() === "" ||
          !isNonEmptyEnglishText(sentence.en_text) ||
          focus.length !== 1 ||
          focus[0]?.word_id !== word.id ||
          focus[0]?.sense_id !== sense.id
        ) {
          issues.push({
            step: "meanings",
            node_id: sentence.id,
            field: "sentence",
            code: "sentence_incomplete",
            message: "例句需包含完整中英文和唯一当前词义焦点"
          });
        }
        for (const link of sentence.links) {
          if (!hasTargetSense(link.word_id, link.sense_id)) {
            issues.push({
              step: "meanings",
              node_id: sentence.id,
              field: "links",
              code: "sentence_link_not_found",
              message: "例句词义关联不存在"
            });
          }
        }
      }
      for (const relation of sense.relations) {
        const targetWordId = relation.target_word_id ?? "";
        const targetSenseId = relation.target_sense_id ?? "";
        const pending = (relation.pending_target_headword ?? "").trim();
        // 待物化形态（只有词面）在真后端是合法的，mock 也得放行，
        // 否则会出现「mock 拦、真机放行」的反向不一致。
        const shapeOk =
          targetWordId && targetSenseId
            ? hasTargetSense(targetWordId, targetSenseId)
            : !targetWordId && !targetSenseId && pending !== "";
        if (!shapeOk || !validPercent(relation.score)) {
          issues.push({
            step: "meanings",
            node_id: relation.id,
            field: "target_sense_id",
            code: "relation_invalid",
            message: "关联词目标或关联度无效"
          });
        }
      }
    }
  }
  return issues;
}

function v2ProblemIssues(
  issues: DraftValidationIssue[]
): DraftValidationIssueV2[] {
  return issues.map(
    ({
      reference_location,
      node_location,
      ...issue
    }): DraftValidationIssueV2 => ({
      schema_version: 2,
      ...issue,
      ...(reference_location == null ? {} : { reference_location }),
      ...(node_location == null ? {} : { node_location })
    })
  );
}

function meaningsForRemovedPos(
  word: AdminWordV2,
  content: DraftFormsStepContent
): FormsImpactItemV2[] {
  const remaining = new Set(content.pos.map((entry) => entry.pos_id));
  const affected: FormsImpactItemV2[] = [];
  for (const pos of word.meanings.pos) {
    if (remaining.has(pos.pos_id)) continue;
    const hasDownstreamContent =
      pos.grammar_structures.some((grammar) =>
        grammar.variants.some((variant) => variant.content.text.trim() !== "")
      ) ||
      pos.senses.some(
        (sense) =>
          sense.sub_pos !== "" ||
          sense.frequency !== undefined ||
          sense.definitions.some(
            (definition) => v2ChineseDefinition(definition).trim() !== ""
          ) ||
          sense.sentences.some(
            (sentence) =>
              sentence.zh_text.text.trim() !== "" ||
              isNonEmptyEnglishText(sentence.en_text)
          ) ||
          sense.relations.length > 0
      );
    if (!hasDownstreamContent) continue;
    affected.push({
      node_id: pos.pos_id,
      node_type: "pos",
      reason: "删除词性会同时删除其词义与例句"
    });
    for (const grammar of pos.grammar_structures) {
      affected.push({
        node_id: grammar.id,
        node_type: "grammar_structure",
        reason: "所属词性已删除"
      });
    }
    for (const sense of pos.senses) {
      affected.push({
        node_id: sense.id,
        node_type: "sense",
        reason: "所属词性已删除"
      });
      for (const definition of sense.definitions) {
        affected.push({
          node_id: definition.id,
          node_type: "definition",
          reason: "所属词义已删除"
        });
      }
      for (const sentence of sense.sentences) {
        affected.push({
          node_id: sentence.id,
          node_type: "sentence",
          reason: "所属词义已删除"
        });
      }
    }
  }
  return affected;
}

const DIALECT_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["centre", "center"],
  ["colour", "color"],
  ["organise", "organize"],
  ["travelling", "traveling"]
];

interface ConvertedDialectText {
  text: string;
  boundaryMap: number[];
}

interface DialectReplacement {
  start: number;
  end: number;
  value: string;
}

function preserveDialectCase(source: string, target: string): string {
  const letters = [...source].filter((character) => /[A-Za-z]/.test(character));
  if (
    letters.length > 0 &&
    letters.every((character) => character === character.toUpperCase())
  ) {
    return target.toUpperCase();
  }
  if (
    letters[0] === letters[0]?.toUpperCase() &&
    letters.slice(1).every((character) => character === character.toLowerCase())
  ) {
    return `${target[0]?.toUpperCase()}${target.slice(1)}`;
  }
  return target;
}

function convertDialectText(
  value: string,
  source: "uk" | "us",
  target: "uk" | "us",
  protectedBoundaries: ReadonlySet<number> = new Set(),
  protectedRanges: ReadonlyArray<readonly [number, number]> = []
): ConvertedDialectText {
  const replacements = new Map(
    DIALECT_PAIRS.map(([uk, us]) =>
      source === "uk" && target === "us" ? [uk, us] : [us, uk]
    )
  );
  const operations: DialectReplacement[] = [];
  for (const match of value.matchAll(/[A-Za-z]+(?:['’\-][A-Za-z]+)*/g)) {
    const matched = match[0];
    const replacement = replacements.get(matched.toLowerCase());
    if (!replacement || match.index === undefined) continue;
    const start = [...value.slice(0, match.index)].length;
    const end = start + [...matched].length;
    const hasInternalBoundary = [...protectedBoundaries].some(
      (position) => start < position && position < end
    );
    const overlapsProtectedRange = protectedRanges.some(
      ([rangeStart, rangeEnd]) => start < rangeEnd && rangeStart < end
    );
    if (hasInternalBoundary || overlapsProtectedRange) continue;
    operations.push({
      start,
      end,
      value: preserveDialectCase(matched, replacement)
    });
  }

  const old = [...value];
  const boundaryMap = Array.from({ length: old.length + 1 }, () => 0);
  const output: string[] = [];
  let oldCursor = 0;
  let newCursor = 0;
  for (const operation of operations) {
    for (let offset = 0; offset <= operation.start - oldCursor; offset += 1) {
      boundaryMap[oldCursor + offset] = newCursor + offset;
    }
    output.push(old.slice(oldCursor, operation.start).join(""));
    newCursor += operation.start - oldCursor;

    const replacementLength = [...operation.value].length;
    const oldLength = operation.end - operation.start;
    for (let offset = 0; offset <= oldLength; offset += 1) {
      boundaryMap[operation.start + offset] =
        newCursor + Math.floor((offset * replacementLength) / oldLength);
    }
    output.push(operation.value);
    newCursor += replacementLength;
    oldCursor = operation.end;
  }
  for (let offset = 0; offset <= old.length - oldCursor; offset += 1) {
    boundaryMap[oldCursor + offset] = newCursor + offset;
  }
  output.push(old.slice(oldCursor).join(""));
  return { text: output.join(""), boundaryMap };
}

function convertDialectRichText(
  value: RichText,
  source: "uk" | "us",
  target: "uk" | "us"
): RichText {
  const output = clone(value);
  const protectedBoundaries = new Set<number>();
  const protectedRanges: Array<readonly [number, number]> = [];
  if (output.version === 1) {
    for (const span of output.spans) {
      protectedBoundaries.add(span.start);
      protectedBoundaries.add(span.end);
    }
    for (const liaison of output.liaisons) {
      protectedBoundaries.add(liaison);
    }
  } else {
    for (const annotation of output.annotations) {
      if (annotation.type === "pause") {
        protectedBoundaries.add(annotation.at);
        continue;
      }
      protectedBoundaries.add(annotation.start);
      protectedBoundaries.add(annotation.end);
      if (annotation.type === "phoneme") {
        protectedRanges.push([annotation.start, annotation.end]);
      }
    }
  }

  const converted = convertDialectText(
    output.text,
    source,
    target,
    protectedBoundaries,
    protectedRanges
  );
  output.text = converted.text;
  if (output.version === 1) {
    for (const span of output.spans) {
      span.start = converted.boundaryMap[span.start]!;
      span.end = converted.boundaryMap[span.end]!;
    }
    output.liaisons = output.liaisons.map(
      (liaison) => converted.boundaryMap[liaison]!
    );
  } else {
    for (const annotation of output.annotations) {
      if (annotation.type === "pause") {
        annotation.at = converted.boundaryMap[annotation.at]!;
      } else {
        annotation.start = converted.boundaryMap[annotation.start]!;
        annotation.end = converted.boundaryMap[annotation.end]!;
      }
    }
  }
  return output;
}

function invalidDialectSuggestion(field: string, message: string): never {
  throw new HttpError(422, message, [], "validation_failed", [], {
    code: field
  });
}

function isValidRichTextRange(
  value: Record<string, unknown>,
  textLength: number
): boolean {
  return (
    Number.isInteger(value.start) &&
    Number.isInteger(value.end) &&
    Number(value.start) >= 0 &&
    Number(value.start) < Number(value.end) &&
    Number(value.end) <= textLength
  );
}

function richTextRangeContainsNewline(
  value: Record<string, unknown>,
  text: string
): boolean {
  return [...text].slice(Number(value.start), Number(value.end)).includes("\n");
}

function isValidDialectSuggestionRichText(value: unknown): boolean {
  if (!isRecord(value) || typeof value.text !== "string") return false;
  const textLength = [...value.text].length;
  if (textLength > 5000 || value.text.includes("\0")) return false;
  if (value.version === 1) {
    if (
      !Array.isArray(value.spans) ||
      value.spans.length > 500 ||
      !Array.isArray(value.liaisons) ||
      value.liaisons.length > 500
    ) {
      return false;
    }
    return (
      value.spans.every(
        (span) =>
          isRecord(span) &&
          isValidRichTextRange(span, textLength) &&
          ["bold", "blue"].includes(String(span.type))
      ) &&
      value.liaisons.every(
        (liaison) =>
          Number.isInteger(liaison) &&
          liaison >= 0 &&
          Number(liaison) + 2 <= textLength
      )
    );
  }
  if (
    value.version !== 2 ||
    !Array.isArray(value.annotations) ||
    value.annotations.length > 500
  ) {
    return false;
  }
  const phonemes: Array<{ start: number; end: number }> = [];
  const emphases: Array<{ start: number; end: number }> = [];
  const pauses: number[] = [];
  for (const annotation of value.annotations) {
    if (!isRecord(annotation) || typeof annotation.type !== "string") {
      return false;
    }
    if (annotation.type === "pause") {
      if (
        !Number.isInteger(annotation.at) ||
        Number(annotation.at) < 0 ||
        Number(annotation.at) > textLength ||
        !Number.isInteger(annotation.duration_ms) ||
        Number(annotation.duration_ms) < 1 ||
        Number(annotation.duration_ms) > 5000
      ) {
        return false;
      }
      pauses.push(Number(annotation.at));
      continue;
    }
    if (
      !isValidRichTextRange(annotation, textLength) ||
      richTextRangeContainsNewline(annotation, value.text)
    ) {
      return false;
    }
    const range = {
      start: Number(annotation.start),
      end: Number(annotation.end)
    };
    if (annotation.type === "emphasis") {
      if (annotation.level !== "strong") return false;
      emphases.push(range);
      continue;
    }
    if (annotation.type === "phoneme") {
      if (
        annotation.alphabet !== "ipa" ||
        typeof annotation.phoneme !== "string" ||
        annotation.phoneme.includes("\0") ||
        annotation.phoneme.trim() === "" ||
        [...annotation.phoneme.trim()].length > 200
      ) {
        return false;
      }
      phonemes.push(range);
      continue;
    }
    if (annotation.type === "liaison") continue;
    if (annotation.type === "highlight") {
      if (
        !["yellow", "green", "pink", "blue", "orange"].includes(
          String(annotation.color)
        )
      ) {
        return false;
      }
      continue;
    }
    return false;
  }

  phonemes.sort(
    (left, right) => left.start - right.start || left.end - right.end
  );
  if (
    phonemes.some(
      (phoneme, index) => index > 0 && phoneme.start < phonemes[index - 1]!.end
    )
  ) {
    return false;
  }
  for (const phoneme of phonemes) {
    if (
      emphases.some(
        (emphasis) =>
          emphasis.start < phoneme.end &&
          emphasis.end > phoneme.start &&
          (emphasis.start > phoneme.start || emphasis.end < phoneme.end)
      ) ||
      pauses.some((pause) => pause > phoneme.start && pause < phoneme.end)
    ) {
      return false;
    }
  }
  return true;
}

function validateDialectSuggestionInput(
  input: SuggestDialectVariantsInputV2
): void {
  if (
    !["uk", "us"].includes(input.source_dialect) ||
    !["uk", "us"].includes(input.target_dialect) ||
    input.source_dialect === input.target_dialect
  ) {
    invalidDialectSuggestion(
      "target_dialect",
      "target_dialect must differ from source_dialect"
    );
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    invalidDialectSuggestion("items", "items must not be empty");
  }
  if (input.items.length > 100) {
    invalidDialectSuggestion("items", "items must not contain over 100 values");
  }
  const clientIds = new Set<string>();
  for (const item of input.items) {
    if (
      typeof item.client_id !== "string" ||
      item.client_id.trim() === "" ||
      [...item.client_id].length > 100
    ) {
      invalidDialectSuggestion(
        "items.client_id",
        "client_id must contain between 1 and 100 characters"
      );
    }
    if (clientIds.has(item.client_id)) {
      invalidDialectSuggestion(
        "items.client_id",
        "client_id must be unique within one request"
      );
    }
    clientIds.add(item.client_id);
    if (item.field_kind === "form") {
      if (
        typeof item.value !== "string" ||
        item.value.trim() === "" ||
        [...item.value].length > 200
      ) {
        invalidDialectSuggestion(
          "items.value",
          "form values must contain between 1 and 200 characters"
        );
      }
      continue;
    }
    if (
      !["definition", "example"].includes(item.field_kind) ||
      !isValidDialectSuggestionRichText(item.value)
    ) {
      invalidDialectSuggestion("items.value", "rich text value is invalid");
    }
  }
}

/** Stateful contract-shaped mock for the complete admin words namespace. */
export function createAdminWordsMock({
  getAdminProfile,
  partOfSpeechValidation = "internal",
  now = () => new Date(),
  latencyMs = 0,
  maxPayloadBytes,
  storage,
  sessionStorage: providedSessionStorage,
  warn,
  surfaceWarnings = "legacy"
}: CreateAdminWordsMockOptions) {
  const validatesInternalPartOfSpeech = partOfSpeechValidation === "internal";
  const persistedStorage =
    storage ??
    createAdminWordsMockStorage({
      storage:
        providedSessionStorage ??
        (typeof globalThis.sessionStorage === "undefined"
          ? undefined
          : globalThis.sessionStorage),
      schemaVersion: ADMIN_WORDS_MOCK_STORAGE_SCHEMA,
      // 10 -> 11 只是新增 retired_stable_slots，migrateLegacy 会补空对象，
      // 没必要让正在用 mock 的人丢掉本地已录的词条。
      legacySchemaVersions: [8, 10],
      isState: isAdminWordsMockPersistedState,
      migrateLegacy: (legacyState) => {
        if (!isRecord(legacyState)) return undefined;
        // 默认值放在 spread 之前：只补旧版本缺的字段，已有值一律保留。
        // v8 三个字段都不存在，补空正确；v10 只缺 retired_stable_slots，
        // 若反过来无条件覆盖会把它已有的 consumed_detection_ids
        // 与 forms_surface_evidence 一并清空。
        const migrated = {
          retired_stable_slots: {},
          consumed_detection_ids: [],
          forms_surface_evidence: {},
          ...legacyState
        };
        return isAdminWordsMockPersistedState(migrated)
          ? clone(migrated)
          : undefined;
      },
      warn
    });
  let activeProfileId: string | undefined;
  let state: AdminWordsMockPersistedState | undefined;
  const surfaceSnapshotPages = new Map<string, MockSurfaceSnapshot>();
  const surfaceTokenSnapshotIds = new Map<string, string>();
  const activeFormsSurfaceSnapshotIds = new Map<string, string>();
  const sentenceClaimIdempotency = new Map<
    string,
    {
      request_json: string;
      response: ClaimPendingSentenceAssociationResponse;
    }
  >();
  function clearSurfaceRuntime(): void {
    surfaceSnapshotPages.clear();
    surfaceTokenSnapshotIds.clear();
    activeFormsSurfaceSnapshotIds.clear();
  }
  async function pause(): Promise<void> {
    if (latencyMs <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, latencyMs));
  }

  function context(): {
    profile: MockAdminProfile;
    state: AdminWordsMockPersistedState;
  } {
    const profile = getAdminProfile();
    if (!profile) {
      if (activeProfileId) persistedStorage.clear(activeProfileId);
      activeProfileId = undefined;
      state = undefined;
      clearSurfaceRuntime();
      throw new HttpError(401, "admin session required", [], "unauthorized");
    }
    if (activeProfileId && activeProfileId !== profile.id) {
      persistedStorage.clear(activeProfileId);
      activeProfileId = undefined;
      state = undefined;
      clearSurfaceRuntime();
    }
    if (
      profile.role !== "super_admin" &&
      !profile.permissions.includes("words.access")
    ) {
      throw new HttpError(403, "words access required", [], "forbidden");
    }
    if (activeProfileId !== profile.id || !state) {
      activeProfileId = profile.id;
      const loaded = persistedStorage.load(profile.id);
      state = loaded
        ? {
            ...loaded,
            forms_surface_evidence: loaded.forms_surface_evidence ?? {}
          }
        : makeInitialState(now().toISOString());
    }
    return { profile, state };
  }

  function persist(current: AdminWordsMockPersistedState): void {
    if (!activeProfileId) return;
    persistedStorage.save(activeProfileId, clone(current));
  }

  function nextId(
    current: AdminWordsMockPersistedState,
    prefix: string
  ): string {
    current.sequence += 1;
    return `${prefix}-${current.sequence}`;
  }

  function nextTimestamp(current: AdminWordsMockPersistedState): string {
    current.sequence += 1;
    return new Date(now().getTime() + current.sequence).toISOString();
  }

  function requireWord(
    current: AdminWordsMockPersistedState,
    wordId: string
  ): MockWord {
    const word = current.words[wordId];
    if (!word) throw new HttpError(404, "word not found", [], "word_not_found");
    return word;
  }

  function requireV2Draft(
    current: AdminWordsMockPersistedState,
    wordId: string
  ): AdminWordV2 {
    const word = requireWord(current, wordId);
    if (word.status === "archived") {
      throw new HttpError(409, "entry is archived", [], "entry_archived");
    }
    return word;
  }

  function assertRevision(word: AdminWordV2, baseRevision: number): void {
    if (word.revision === baseRevision) return;
    throw new HttpError(
      409,
      "word revision conflict",
      [],
      "revision_conflict",
      [],
      {
        word_id: word.id,
        current_revision: word.revision,
        max_reachable_step: word.max_reachable_step
      }
    );
  }

  function assertPayload(value: unknown): void {
    if (
      maxPayloadBytes !== undefined &&
      new TextEncoder().encode(JSON.stringify(value)).byteLength >
        maxPayloadBytes
    ) {
      throw new HttpError(
        413,
        "word payload too large",
        [],
        "payload_too_large"
      );
    }
  }

  function duplicatesFor(
    current: AdminWordsMockPersistedState,
    values: string[],
    kind?: MockWord["kind"]
  ) {
    const normalized = new Set(
      values.map((entry) => entry.toLocaleLowerCase("en"))
    );
    return Object.values(current.words)
      .filter((word) => !kind || word.kind === kind)
      .flatMap((word) =>
        allHeadwords(word)
          .filter((entry) =>
            normalized.has(entry.value.toLocaleLowerCase("en"))
          )
          .map((entry) => ({
            word_id: word.id,
            headword: entry.value,
            dialect: entry.dialect,
            status: word.status
          }))
      );
  }

  function surfaceCandidates(
    detectionId: string,
    headwords: WordHeadwordsV2,
    entryKind: MockWord["kind"]
  ): SurfaceMatchCandidateV2[] {
    return headwords.mode === "unified"
      ? [
          {
            candidate_type: "headword" as const,
            candidate_ref: `${detectionId}:headword:common`,
            surface: headwords.common,
            normalized_surface: normalizeFixtureHeadword(headwords.common).key,
            dialect: "common" as const,
            entry_kind: entryKind
          }
        ]
      : (["uk", "us"] as const).map((dialect) => ({
          candidate_type: "headword" as const,
          candidate_ref: `${detectionId}:headword:${dialect}`,
          surface: headwords[dialect],
          normalized_surface: normalizeFixtureHeadword(headwords[dialect]).key,
          dialect,
          entry_kind: entryKind
        }));
  }

  function formSurfaceCandidates(
    word: AdminWordV2,
    content: DraftFormsStepContent
  ): SurfaceMatchCandidateV2[] {
    return content.pos.flatMap((pos) => {
      const slots = [
        pos.base_form,
        ...pos.form_groups.flatMap((group) => group.slots)
      ];
      return slots.flatMap((slot) =>
        slot.variants.flatMap((variant) => {
          const normalized = normalizeFixtureHeadword(variant.spelling);
          if (!normalized.key) return [];
          return [
            {
              candidate_type: "form" as const,
              candidate_ref: `${word.id}:form:${pos.pos_id}:${slot.id}:${variant.id}`,
              candidate_word_id: word.id,
              candidate_node_id: variant.id,
              surface: variant.spelling,
              normalized_surface: normalized.key,
              dialect: variant.dialect,
              pos_id: pos.pos_id,
              pos: pos.pos,
              form_type: slot.form_type
            }
          ];
        })
      );
    });
  }

  function dialectsOverlap(
    candidate: "common" | "uk" | "us",
    existing: "common" | "uk" | "us"
  ): boolean {
    return (
      candidate === "common" || existing === "common" || candidate === existing
    );
  }

  /**
   * mock 侧的入站引用统计，口径**必须**与后端 entry_reference_rows 一致：
   * 按引用方词条去重、含草稿引用、排除自引用。否则会出现单测全绿而真机
   * 「显示 0 却删不掉」。mock 只模拟关联词一类引用，其余 5 类在 mock 中不存在。
   */
  function entryReferenceSources(
    current: AdminWordsMockPersistedState,
    wordId: string
  ): Map<string, EntryReferenceKind> {
    const sources = new Map<string, EntryReferenceKind>();
    for (const source of Object.values(current.words)) {
      if (!source || source.id === wordId) continue;
      const references = source.meanings.pos.some((pos) =>
        pos.senses.some((sense) =>
          sense.relations.some((relation) => relation.target_word_id === wordId)
        )
      );
      if (references) sources.set(source.id, "relation");
    }
    return sources;
  }

  function entryReferenceSummary(
    current: AdminWordsMockPersistedState,
    wordId: string
  ): EntryReferenceSummary {
    const sources = [...entryReferenceSources(current, wordId)].sort(
      ([left], [right]) => left.localeCompare(right)
    );
    const previews = sources.slice(0, 5).map(([sourceId, kind]) => {
      const source = current.words[sourceId]!;
      return {
        source_word_id: sourceId,
        source_headword: displayHeadword(source),
        source_status: source.status,
        source_kind: kind
      };
    });
    return {
      total: sources.length,
      previews,
      truncated: sources.length > previews.length
    };
  }

  function matchedEntryContext(
    current: AdminWordsMockPersistedState,
    word: MockWord
  ): MatchedEntryContextV2 {
    const gloss = wordGloss(word);
    const inbound = Object.entries(current.publication_words)
      .flatMap(([sourceWordId, publication]) => {
        const sourceWord = current.words[sourceWordId];
        if (!sourceWord || sourceWord.status === "archived") return [];
        return publication.meanings.pos.flatMap((pos) =>
          pos.senses.flatMap((sense) =>
            sense.relations
              .filter(
                (relation) =>
                  relation.target_word_id === word.id &&
                  ["synonym", "antonym", "derivative"].includes(
                    relation.relation
                  )
              )
              .map((relation) => ({
                node_id: relation.id,
                source_word_id: sourceWordId,
                source_headword: displayHeadword(publication),
                relation: relation.relation as
                  "synonym" | "antonym" | "derivative"
              }))
          )
        );
      })
      .sort(
        (left, right) =>
          left.source_word_id.localeCompare(right.source_word_id) ||
          left.relation.localeCompare(right.relation) ||
          left.node_id.localeCompare(right.node_id)
      );
    const byType = { synonym: 0, antonym: 0, derivative: 0 };
    for (const reference of inbound) byType[reference.relation] += 1;
    const previews = inbound
      .slice(0, 5)
      .map(({ node_id: _, ...preview }) => preview);
    return {
      word_id: word.id,
      pos_labels: wordPos(word).slice(0, 5),
      gloss_previews: gloss ? [gloss] : [],
      updated_at: word.updated_at,
      inbound_relations: {
        total: inbound.length,
        by_type: byType,
        previews,
        truncated: inbound.length > previews.length
      }
    };
  }

  function surfaceContents(current: AdminWordsMockPersistedState): Array<{
    entry: MockWord;
    content: AdminWordV2;
    content_scope: SurfaceContentScopeV2;
    source_revision: string;
  }> {
    return Object.values(current.words).flatMap((entry) => {
      const records: Array<{
        entry: MockWord;
        content: AdminWordV2;
        content_scope: SurfaceContentScopeV2;
        source_revision: string;
      }> = [
        {
          entry,
          content: entry,
          content_scope: "draft" as const,
          source_revision: `draft-${entry.revision}`
        }
      ];
      const publication = current.publication_words[entry.id];
      if (publication) {
        records.push({
          entry,
          content: publication,
          content_scope: "current_publication",
          source_revision: `publication-${publication.published_revision ?? publication.revision}`
        });
      }
      return records;
    });
  }

  function matchesForSurfaceCandidates(
    current: AdminWordsMockPersistedState,
    candidates: SurfaceMatchCandidateV2[],
    excludedWordId?: string
  ): { items: LexiconSurfaceMatchV2[]; contexts: MatchedEntryContextV2[] } {
    const items: LexiconSurfaceMatchV2[] = [];
    const contexts = new Map<string, MatchedEntryContextV2>();
    for (const candidate of candidates) {
      const normalizedCandidate = candidate.normalized_surface;
      for (const projection of surfaceContents(current)) {
        const {
          entry: word,
          content,
          content_scope,
          source_revision
        } = projection;
        if (word.id === excludedWordId) continue;
        for (const existing of allHeadwords(content)) {
          if (
            normalizeFixtureHeadword(existing.value).key !==
              normalizedCandidate ||
            !dialectsOverlap(candidate.dialect, existing.dialect)
          ) {
            continue;
          }
          const sourceId =
            candidate.candidate_type === "form"
              ? `${word.id}:${content_scope}:headword:${existing.dialect}:${existing.value}`
              : `${word.id}:${source_revision}:headword:${existing.dialect}`;
          items.push({
            match_id: `${candidate.candidate_ref}:${sourceId}:${word.status}`,
            match_category:
              candidate.candidate_type === "form"
                ? "form_headword"
                : word.kind === candidate.entry_kind
                  ? "exact_headword"
                  : "cross_kind_headword",
            severity: "warning",
            attention_level:
              candidate.candidate_type === "headword" &&
              word.kind === candidate.entry_kind
                ? "high"
                : "normal",
            can_continue: true,
            confirmation_reasons: ["unacknowledged_surface_matches"],
            candidate: clone(candidate),
            existing: {
              word_id: word.id,
              headword: displayHeadword(content),
              kind: word.kind,
              status: word.status,
              source: {
                source_kind: "headword",
                source_id: sourceId,
                content_scope,
                surface: existing.value,
                dialect: existing.dialect
              }
            }
          });
          contexts.set(word.id, matchedEntryContext(current, word));
        }
        for (const pos of content.forms.pos) {
          const slots = [
            pos.base_form,
            ...pos.form_groups.flatMap((group) => group.slots)
          ];
          for (const slot of slots) {
            for (const variant of slot.variants) {
              if (
                normalizeFixtureHeadword(variant.spelling).key !==
                  normalizedCandidate ||
                !dialectsOverlap(candidate.dialect, variant.dialect)
              ) {
                continue;
              }
              const sourceId =
                candidate.candidate_type === "form"
                  ? `${word.id}:${content_scope}:form:${slot.id}:${variant.id}:${slot.form_type}:${variant.dialect}:${variant.spelling}`
                  : `${word.id}:${source_revision}:form:${slot.id}:${variant.id}`;
              items.push({
                match_id: `${candidate.candidate_ref}:${sourceId}:${word.status}`,
                match_category:
                  candidate.candidate_type === "headword"
                    ? "headword_form"
                    : "form_form",
                severity: "warning",
                attention_level: "normal",
                can_continue: true,
                confirmation_reasons: ["unacknowledged_surface_matches"],
                candidate: clone(candidate),
                existing: {
                  word_id: word.id,
                  headword: displayHeadword(content),
                  kind: word.kind,
                  status: word.status,
                  source: {
                    source_kind: "form",
                    source_id: sourceId,
                    source_node_id: variant.id,
                    content_scope,
                    surface: variant.spelling,
                    dialect: variant.dialect,
                    pos_id: pos.pos_id,
                    pos: pos.pos,
                    form_type: slot.form_type
                  }
                }
              });
              contexts.set(word.id, matchedEntryContext(current, word));
            }
          }
        }
      }
    }
    items.sort(
      (left, right) =>
        left.existing.word_id.localeCompare(right.existing.word_id) ||
        left.match_id.localeCompare(right.match_id)
    );
    return { items, contexts: [...contexts.values()] };
  }

  function currentSurfaceMatches(
    current: AdminWordsMockPersistedState,
    detectionId: string,
    headwords: WordHeadwordsV2,
    entryKind: MockWord["kind"]
  ): { items: LexiconSurfaceMatchV2[]; contexts: MatchedEntryContextV2[] } {
    return matchesForSurfaceCandidates(
      current,
      surfaceCandidates(detectionId, headwords, entryKind)
    );
  }

  function allFormsSurfaceMatches(
    current: AdminWordsMockPersistedState,
    word: AdminWordV2,
    content: DraftFormsStepContent
  ): { items: LexiconSurfaceMatchV2[]; contexts: MatchedEntryContextV2[] } {
    return matchesForSurfaceCandidates(
      current,
      formSurfaceCandidates(word, content),
      word.id
    );
  }

  function unacknowledgedFormsSurfaceMatches(
    current: AdminWordsMockPersistedState,
    word: AdminWordV2,
    content: DraftFormsStepContent
  ): { items: LexiconSurfaceMatchV2[]; contexts: MatchedEntryContextV2[] } {
    const matches = allFormsSurfaceMatches(current, word, content);
    const evidence = current.forms_surface_evidence[word.id];
    if (!evidence || evidence.content_json !== JSON.stringify(content)) {
      return matches;
    }
    const acknowledged = new Set(evidence.match_ids);
    const items = matches.items.filter(
      (item) => !acknowledged.has(item.match_id)
    );
    const matchedWordIds = new Set(items.map((item) => item.existing.word_id));
    return {
      items,
      contexts: matches.contexts.filter((entry) =>
        matchedWordIds.has(entry.word_id)
      )
    };
  }

  function buildSurfaceSnapshot(
    current: AdminWordsMockPersistedState,
    actorId: string,
    detectionId: string,
    headwords: WordHeadwordsV2,
    entryKind: MockWord["kind"]
  ): SurfaceMatchPageV2 | undefined {
    const { items, contexts } = currentSurfaceMatches(
      current,
      detectionId,
      headwords,
      entryKind
    );
    if (items.length === 0) return undefined;
    const snapshotId = nextId(current, "surface-snapshot");
    const policyEpoch = 1;
    const pageSize = 2;
    const pages = new Map<string, SurfaceMatchPageV2>();
    const hasExactHeadword = items.some(
      (item) => item.match_category === "exact_headword"
    );
    const gateDisabled =
      surfaceWarnings === "temporarily_disabled" && hasExactHeadword;
    const policyName = hasExactHeadword
      ? ("allow_new_exact_headword_entries" as const)
      : ("surface_warning_acknowledgement" as const);
    const terminalToken = gateDisabled
      ? undefined
      : nextId(current, "surface-token");
    const pageCount = Math.ceil(items.length / pageSize);
    let firstPage: SurfaceMatchPageV2 | undefined;
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      const pageItems = items.slice(
        pageIndex * pageSize,
        (pageIndex + 1) * pageSize
      );
      const pageWordIds = new Set(
        pageItems.map((item) => item.existing.word_id)
      );
      const nextCursor =
        pageIndex + 1 < pageCount
          ? `${snapshotId}:cursor:${pageIndex + 1}`
          : null;
      const base = {
        schema_version: 2 as const,
        snapshot_id: snapshotId,
        items: clone(pageItems),
        total: items.length,
        matched_entry_contexts: clone(
          contexts.filter((context) => pageWordIds.has(context.word_id))
        ),
        confirmation_reasons: ["unacknowledged_surface_matches" as const],
        policy_name: policyName,
        policy_epoch: policyEpoch
      };
      const page: SurfaceMatchPageV2 = gateDisabled
        ? {
            ...base,
            continuation_policy: "temporarily_disabled",
            next_cursor: nextCursor,
            policy_block_code: "exact_headword_creation_temporarily_disabled"
          }
        : nextCursor
          ? {
              ...base,
              continuation_policy: "enabled",
              next_cursor: nextCursor
            }
          : {
              ...base,
              continuation_policy: "enabled",
              next_cursor: null,
              surface_confirmation_token: terminalToken!
            };
      if (pageIndex === 0) firstPage = page;
      else pages.set(`${snapshotId}:cursor:${pageIndex}`, page);
    }
    const matchIds = items.map((item) => item.match_id);
    surfaceSnapshotPages.set(snapshotId, {
      actor_id: actorId,
      owner_kind: "create",
      detection_id: detectionId,
      content_key: JSON.stringify(headwords),
      match_ids: matchIds,
      policy_name: policyName,
      policy_epoch: policyEpoch,
      pages,
      terminal_token: terminalToken
    });
    if (terminalToken) surfaceTokenSnapshotIds.set(terminalToken, snapshotId);
    return firstPage!;
  }

  function issueImpactToken(
    current: AdminWordsMockPersistedState,
    word: AdminWordV2,
    content: DraftFormsStepContent,
    affected: FormsImpactItemV2[]
  ): string {
    const token = nextId(current, "impact");
    current.impact_tokens[token] = {
      word_id: word.id,
      base_revision: word.revision,
      content_json: JSON.stringify(content),
      affected: clone(affected)
    };
    return token;
  }

  function buildFormsSurfaceSnapshot(
    current: AdminWordsMockPersistedState,
    actorId: string,
    word: AdminWordV2,
    content: DraftFormsStepContent,
    affected: FormsImpactItemV2[],
    matches = unacknowledgedFormsSurfaceMatches(current, word, content)
  ): SurfaceMatchPageV2 | undefined {
    const { items, contexts } = matches;
    if (items.length === 0) return undefined;
    const activeContextKey = `${actorId}:forms:${word.id}`;
    const previousSnapshotId =
      activeFormsSurfaceSnapshotIds.get(activeContextKey);
    if (previousSnapshotId) {
      const previous = surfaceSnapshotPages.get(previousSnapshotId);
      if (previous?.terminal_token) {
        surfaceTokenSnapshotIds.delete(previous.terminal_token);
      }
      if (previous?.impact_token) {
        delete current.impact_tokens[previous.impact_token];
      }
      surfaceSnapshotPages.delete(previousSnapshotId);
    }
    const snapshotId = nextId(current, "surface-snapshot");
    const terminalToken = nextId(current, "surface-token");
    const impactToken =
      affected.length > 0
        ? issueImpactToken(current, word, content, affected)
        : undefined;
    const policyEpoch = 1;
    const pageSize = 2;
    const pages = new Map<string, SurfaceMatchPageV2>();
    const pageCount = Math.ceil(items.length / pageSize);
    let firstPage: SurfaceMatchPageV2 | undefined;
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      const pageItems = items.slice(
        pageIndex * pageSize,
        (pageIndex + 1) * pageSize
      );
      const pageWordIds = new Set(
        pageItems.map((item) => item.existing.word_id)
      );
      const nextCursor =
        pageIndex + 1 < pageCount
          ? `${snapshotId}:cursor:${pageIndex + 1}`
          : null;
      const base = {
        schema_version: 2 as const,
        snapshot_id: snapshotId,
        items: clone(pageItems),
        total: items.length,
        matched_entry_contexts: clone(
          contexts.filter((context) => pageWordIds.has(context.word_id))
        ),
        confirmation_reasons: ["unacknowledged_surface_matches" as const],
        policy_name: "surface_warning_acknowledgement" as const,
        policy_epoch: policyEpoch
      };
      const page: SurfaceMatchPageV2 = nextCursor
        ? {
            ...base,
            continuation_policy: "enabled",
            next_cursor: nextCursor
          }
        : {
            ...base,
            continuation_policy: "enabled",
            next_cursor: null,
            surface_confirmation_token: terminalToken,
            ...(impactToken ? { impact_confirmation_token: impactToken } : {})
          };
      if (pageIndex === 0) firstPage = page;
      else pages.set(`${snapshotId}:cursor:${pageIndex}`, page);
    }
    const matchIds = items.map((item) => item.match_id);
    surfaceSnapshotPages.set(snapshotId, {
      actor_id: actorId,
      owner_kind: "forms",
      word_id: word.id,
      base_revision: word.revision,
      content_key: JSON.stringify(content),
      match_ids: matchIds,
      policy_name: "surface_warning_acknowledgement",
      policy_epoch: policyEpoch,
      pages,
      terminal_token: terminalToken,
      impact_token: impactToken
    });
    surfaceTokenSnapshotIds.set(terminalToken, snapshotId);
    activeFormsSurfaceSnapshotIds.set(activeContextKey, snapshotId);
    return firstPage!;
  }

  function requireSuperAdmin(profile: MockAdminProfile): void {
    if (profile.role === "super_admin") return;
    throw new HttpError(
      403,
      "super admin required",
      [],
      "super_admin_required"
    );
  }

  function partUsageCount(
    current: AdminWordsMockPersistedState,
    code: string
  ): number {
    return Object.values(current.words).filter((word) =>
      wordPos(word).includes(code)
    ).length;
  }

  function subPartUsageCount(
    current: AdminWordsMockPersistedState,
    code: string
  ): number {
    return Object.values(current.words).reduce((total, word) => {
      const senses = word.meanings.pos.flatMap((pos) => pos.senses);
      return total + senses.filter((sense) => sense.sub_pos === code).length;
    }, 0);
  }

  function sortedParts(current: AdminWordsMockPersistedState) {
    return Object.values(current.parts_of_speech).sort(
      (left, right) =>
        left.sort_order - right.sort_order ||
        left.created_at.localeCompare(right.created_at) ||
        left.id.localeCompare(right.id)
    );
  }

  function sortedSubParts(
    current: AdminWordsMockPersistedState,
    partId: string
  ) {
    return Object.values(current.sub_parts)
      .filter((item) => item.part_of_speech_id === partId)
      .sort(
        (left, right) =>
          left.sort_order - right.sort_order ||
          left.created_at.localeCompare(right.created_at) ||
          left.id.localeCompare(right.id)
      );
  }

  function materializePart(
    current: AdminWordsMockPersistedState,
    item: PartOfSpeechConfig
  ): PartOfSpeechConfig {
    return {
      ...clone(item),
      usage_count: partUsageCount(current, item.code),
      sub_part_count: sortedSubParts(current, item.id).length
    };
  }

  function materializeSubPart(
    current: AdminWordsMockPersistedState,
    item: SubPartOfSpeechConfig
  ): SubPartOfSpeechConfig {
    return {
      ...clone(item),
      usage_count: subPartUsageCount(current, item.code)
    };
  }

  function assertConfiguredForms(
    current: AdminWordsMockPersistedState,
    content: DraftFormsStepContent
  ): void {
    if (!validatesInternalPartOfSpeech) return;
    const unknown = content.pos.find(
      (pos) =>
        !Object.values(current.parts_of_speech).some(
          (part) => part.code === pos.pos
        )
    );
    if (unknown) {
      throw new HttpError(
        422,
        `part of speech ${unknown.pos} is not configured`,
        [],
        "unknown_part_of_speech",
        [],
        { code: unknown.pos }
      );
    }
  }

  function assertConfiguredMeanings(
    current: AdminWordsMockPersistedState,
    forms: DraftFormsStepContent,
    meanings: DraftMeaningsStepContent
  ): void {
    if (!validatesInternalPartOfSpeech) return;
    const formById = new Map(forms.pos.map((pos) => [pos.pos_id, pos]));
    for (const posMeanings of meanings.pos) {
      const formPos = formById.get(posMeanings.pos_id);
      if (!formPos) continue;
      const configuredPart = Object.values(current.parts_of_speech).find(
        (part) => part.code === formPos.pos
      );
      const invalidSense = posMeanings.senses.find((sense) => {
        if (!sense.sub_pos) return false;
        const subPart = Object.values(current.sub_parts).find(
          (candidate) => candidate.code === sense.sub_pos
        );
        return (
          !configuredPart ||
          !subPart ||
          subPart.part_of_speech_id !== configuredPart.id
        );
      });
      if (invalidSense) {
        throw new HttpError(
          422,
          `sub-part of speech ${invalidSense.sub_pos} is invalid for ${formPos.pos}`,
          [],
          "invalid_sub_part_of_speech",
          [],
          { code: invalidSense.sub_pos }
        );
      }
    }
  }

  function trimPartInput<
    T extends {
      name_zh: string;
      name_en: string;
      abbreviation: string;
      sort_order: number;
    }
  >(input: T): T {
    return {
      ...input,
      name_zh: input.name_zh.trim(),
      name_en: input.name_en.trim(),
      abbreviation: input.abbreviation.trim()
    };
  }

  function trimSubPartInput<
    T extends {
      name_zh: string;
      name_en: string;
      sort_order: number;
    }
  >(input: T): T {
    return {
      ...input,
      name_zh: input.name_zh.trim(),
      name_en: input.name_en.trim()
    };
  }

  function assertPartFields(input: {
    code?: string;
    name_zh: string;
    name_en: string;
    abbreviation: string;
    sort_order: number;
  }): void {
    if (input.code !== undefined && !/^[a-z][a-z0-9_]{0,31}$/.test(input.code))
      throw invalidPartOfSpeech("code", "invalid part of speech code");
    if (!input.name_zh || input.name_zh.length > 64)
      throw invalidPartOfSpeech("name_zh", "invalid Chinese name");
    if (!input.name_en || input.name_en.length > 64)
      throw invalidPartOfSpeech("name_en", "invalid English name");
    if (!input.abbreviation || input.abbreviation.length > 16)
      throw invalidPartOfSpeech("abbreviation", "invalid abbreviation");
    if (!Number.isInteger(input.sort_order))
      throw invalidPartOfSpeech("sort_order", "invalid sort order");
  }

  function assertSubPartFields(input: {
    code?: string;
    name_zh: string;
    name_en: string;
    sort_order: number;
  }): void {
    if (input.code !== undefined && !/^[A-Z][A-Z0-9_-]{0,31}$/.test(input.code))
      throw invalidPartOfSpeech("code", "invalid sub-part code");
    if (!input.name_zh || input.name_zh.length > 64)
      throw invalidPartOfSpeech("name_zh", "invalid Chinese name");
    if (!input.name_en || input.name_en.length > 64)
      throw invalidPartOfSpeech("name_en", "invalid English name");
    if (!Number.isInteger(input.sort_order))
      throw invalidPartOfSpeech("sort_order", "invalid sort order");
  }

  function invalidPartOfSpeech(field: string, detail: string): HttpError {
    return new HttpError(400, detail, [], "invalid_part_of_speech", {
      type: "urn:tsz:problem:invalid_part_of_speech",
      title: "Invalid part of speech",
      status: 400,
      detail,
      code: "invalid_part_of_speech",
      field
    });
  }

  function assertPositiveRevision(
    revision: number,
    source: "body" | "query"
  ): void {
    if (Number.isInteger(revision) && revision >= 1) return;
    if (source === "body") {
      throw invalidPartOfSpeech("base_revision", "invalid base revision");
    }
    throw new HttpError(400, "invalid base revision", [], "invalid_query");
  }

  function assertUniquePart(
    current: AdminWordsMockPersistedState,
    input: {
      code?: string;
      name_zh: string;
      name_en: string;
      abbreviation: string;
    },
    excludeId?: string
  ): void {
    const duplicate = Object.values(current.parts_of_speech).find(
      (item) =>
        item.id !== excludeId &&
        ((input.code !== undefined && item.code === input.code) ||
          item.name_zh === input.name_zh ||
          item.name_en.toLocaleLowerCase("en") ===
            input.name_en.toLocaleLowerCase("en") ||
          item.abbreviation.toLocaleLowerCase("en") ===
            input.abbreviation.toLocaleLowerCase("en"))
    );
    if (duplicate)
      throw new HttpError(
        409,
        "part of speech configuration already exists",
        [],
        "part_of_speech_conflict"
      );
  }

  function assertUniqueSubPart(
    current: AdminWordsMockPersistedState,
    partId: string,
    input: { code?: string; name_zh: string; name_en: string },
    excludeId?: string
  ): void {
    const duplicate = Object.values(current.sub_parts).find(
      (item) =>
        item.id !== excludeId &&
        ((input.code !== undefined && item.code === input.code) ||
          (item.part_of_speech_id === partId &&
            (item.name_zh === input.name_zh ||
              item.name_en.toLocaleLowerCase("en") ===
                input.name_en.toLocaleLowerCase("en"))))
    );
    if (duplicate)
      throw new HttpError(
        409,
        "sub-part of speech configuration already exists",
        [],
        "sub_part_of_speech_conflict"
      );
  }

  async function partOfSpeechCatalog(): Promise<PartOfSpeechCatalogResponse> {
    await pause();
    const { state: current } = context();
    return {
      catalog_version: current.catalog_version,
      items: sortedParts(current).map((part) => ({
        id: part.id,
        code: part.code,
        name_zh: part.name_zh,
        name_en: part.name_en,
        abbreviation: part.abbreviation,
        sort_order: part.sort_order,
        sub_parts: sortedSubParts(current, part.id).map((subPart) => ({
          id: subPart.id,
          code: subPart.code,
          name_zh: subPart.name_zh,
          name_en: subPart.name_en,
          sort_order: subPart.sort_order
        }))
      }))
    };
  }

  async function listPartOfSpeechConfigs(
    query: PartOfSpeechConfigListQuery = {}
  ): Promise<PartOfSpeechConfigListResponse> {
    await pause();
    const { profile, state: current } = context();
    requireSuperAdmin(profile);
    const q = query.q?.trim().toLocaleLowerCase() ?? "";
    const filtered = sortedParts(current)
      .filter((item) => {
        if (!q) return true;
        return [item.code, item.name_zh, item.name_en, item.abbreviation].some(
          (value) => value.toLocaleLowerCase().includes(q)
        );
      })
      .map((item) => materializePart(current, item));
    const pageSize = Math.min(100, Math.max(1, query.page_size ?? 10));
    const page = Math.max(1, query.page ?? 1);
    const start = (page - 1) * pageSize;
    return {
      items: filtered.slice(start, start + pageSize),
      pagination: {
        page,
        page_size: pageSize,
        total: filtered.length,
        total_pages: Math.ceil(filtered.length / pageSize)
      }
    };
  }

  async function createPartOfSpeech(
    rawInput: CreatePartOfSpeechInput
  ): Promise<PartOfSpeechConfig> {
    await pause();
    const { profile, state: current } = context();
    requireSuperAdmin(profile);
    const input = trimPartInput({ ...rawInput, code: rawInput.code.trim() });
    assertPartFields(input);
    assertUniquePart(current, input);
    const timestamp = nextTimestamp(current);
    const item: PartOfSpeechConfig = {
      id: nextId(current, "pos-config"),
      ...input,
      usage_count: 0,
      sub_part_count: 0,
      revision: 1,
      created_by: { id: profile.id, display_name: profile.display_name },
      created_at: timestamp,
      updated_at: timestamp
    };
    current.parts_of_speech[item.id] = item;
    current.catalog_version += 1;
    persist(current);
    return clone(item);
  }

  async function updatePartOfSpeech(
    id: string,
    rawInput: UpdatePartOfSpeechInput
  ): Promise<PartOfSpeechConfig> {
    await pause();
    const { profile, state: current } = context();
    requireSuperAdmin(profile);
    const existing = current.parts_of_speech[id];
    if (!existing)
      throw new HttpError(
        404,
        "part of speech not found",
        [],
        "part_of_speech_not_found"
      );
    assertPositiveRevision(rawInput.base_revision, "body");
    if (existing.revision !== rawInput.base_revision)
      throw new HttpError(
        409,
        "configuration changed",
        [],
        "revision_conflict",
        [],
        {
          current_revision: existing.revision,
          part_of_speech_id: existing.id,
          code: existing.code
        }
      );
    const input = trimPartInput(rawInput);
    assertPartFields(input);
    assertUniquePart(current, input, id);
    const updated: PartOfSpeechConfig = {
      ...existing,
      ...input,
      revision: existing.revision + 1,
      updated_by: { id: profile.id, display_name: profile.display_name },
      updated_at: nextTimestamp(current)
    };
    current.parts_of_speech[id] = updated;
    current.catalog_version += 1;
    persist(current);
    return materializePart(current, updated);
  }

  async function removePartOfSpeech(
    id: string,
    query: DeletePartOfSpeechQuery
  ): Promise<void> {
    await pause();
    const { profile, state: current } = context();
    requireSuperAdmin(profile);
    const existing = current.parts_of_speech[id];
    if (!existing)
      throw new HttpError(
        404,
        "part of speech not found",
        [],
        "part_of_speech_not_found"
      );
    assertPositiveRevision(query.base_revision, "query");
    if (existing.revision !== query.base_revision)
      throw new HttpError(
        409,
        "configuration changed",
        [],
        "revision_conflict",
        [],
        {
          current_revision: existing.revision,
          part_of_speech_id: existing.id,
          code: existing.code
        }
      );
    const usageCount = partUsageCount(current, existing.code);
    if (usageCount > 0)
      throw new HttpError(
        409,
        "part of speech is in use",
        [],
        "part_of_speech_in_use",
        [],
        { usage_count: usageCount, part_of_speech_id: id, code: existing.code }
      );
    for (const subPart of sortedSubParts(current, id)) {
      delete current.sub_parts[subPart.id];
    }
    delete current.parts_of_speech[id];
    current.catalog_version += 1;
    persist(current);
  }

  async function listSubParts(
    partId: string
  ): Promise<SubPartOfSpeechListResponse> {
    await pause();
    const { profile, state: current } = context();
    requireSuperAdmin(profile);
    if (!current.parts_of_speech[partId])
      throw new HttpError(
        404,
        "part of speech not found",
        [],
        "part_of_speech_not_found"
      );
    return {
      items: sortedSubParts(current, partId).map((item) =>
        materializeSubPart(current, item)
      )
    };
  }

  async function createSubPart(
    partId: string,
    rawInput: CreateSubPartOfSpeechInput
  ): Promise<SubPartOfSpeechConfig> {
    await pause();
    const { profile, state: current } = context();
    requireSuperAdmin(profile);
    if (!current.parts_of_speech[partId])
      throw new HttpError(
        404,
        "part of speech not found",
        [],
        "part_of_speech_not_found"
      );
    const input = trimSubPartInput({
      ...rawInput,
      code: rawInput.code.trim()
    });
    assertSubPartFields(input);
    assertUniqueSubPart(current, partId, input);
    const timestamp = nextTimestamp(current);
    const item: SubPartOfSpeechConfig = {
      id: nextId(current, "sub-pos-config"),
      part_of_speech_id: partId,
      ...input,
      usage_count: 0,
      revision: 1,
      created_by: { id: profile.id, display_name: profile.display_name },
      created_at: timestamp,
      updated_at: timestamp
    };
    current.sub_parts[item.id] = item;
    current.catalog_version += 1;
    persist(current);
    return clone(item);
  }

  async function updateSubPart(
    partId: string,
    subId: string,
    rawInput: UpdateSubPartOfSpeechInput
  ): Promise<SubPartOfSpeechConfig> {
    await pause();
    const { profile, state: current } = context();
    requireSuperAdmin(profile);
    const existing = current.sub_parts[subId];
    if (!existing || existing.part_of_speech_id !== partId)
      throw new HttpError(
        404,
        "sub-part not found",
        [],
        "sub_part_of_speech_not_found"
      );
    assertPositiveRevision(rawInput.base_revision, "body");
    if (existing.revision !== rawInput.base_revision)
      throw new HttpError(
        409,
        "configuration changed",
        [],
        "revision_conflict",
        [],
        {
          current_revision: existing.revision,
          part_of_speech_id: partId,
          code: existing.code
        }
      );
    const input = trimSubPartInput(rawInput);
    assertSubPartFields(input);
    assertUniqueSubPart(current, partId, input, subId);
    const updated: SubPartOfSpeechConfig = {
      ...existing,
      ...input,
      revision: existing.revision + 1,
      updated_by: { id: profile.id, display_name: profile.display_name },
      updated_at: nextTimestamp(current)
    };
    current.sub_parts[subId] = updated;
    current.catalog_version += 1;
    persist(current);
    return materializeSubPart(current, updated);
  }

  async function removeSubPart(
    partId: string,
    subId: string,
    query: DeletePartOfSpeechQuery
  ): Promise<void> {
    await pause();
    const { profile, state: current } = context();
    requireSuperAdmin(profile);
    const existing = current.sub_parts[subId];
    if (!existing || existing.part_of_speech_id !== partId)
      throw new HttpError(
        404,
        "sub-part not found",
        [],
        "sub_part_of_speech_not_found"
      );
    assertPositiveRevision(query.base_revision, "query");
    if (existing.revision !== query.base_revision)
      throw new HttpError(
        409,
        "configuration changed",
        [],
        "revision_conflict",
        [],
        {
          current_revision: existing.revision,
          part_of_speech_id: partId,
          code: existing.code
        }
      );
    const usageCount = subPartUsageCount(current, existing.code);
    if (usageCount > 0)
      throw new HttpError(
        409,
        "sub-part of speech is in use",
        [],
        "sub_part_of_speech_in_use",
        [],
        {
          usage_count: usageCount,
          part_of_speech_id: partId,
          code: existing.code
        }
      );
    delete current.sub_parts[subId];
    current.catalog_version += 1;
    persist(current);
  }

  function reconcileProgress(
    word: AdminWordV2,
    current: AdminWordsMockPersistedState,
    step: "forms" | "meanings",
    intent: "save" | "complete",
    priorCompleted: ReadonlySet<AdminWordV2["completed_steps"][number]>
  ): void {
    const formsValid =
      validateForms(
        word.forms,
        word.headwords,
        current,
        validatesInternalPartOfSpeech
      ).length === 0;
    const meaningsValid =
      formsValid &&
      validateMeanings(
        word,
        word.meanings,
        current,
        validatesInternalPartOfSpeech
      ).length === 0;
    let formsCompleted = priorCompleted.has("forms") && formsValid;
    let meaningsCompleted =
      formsCompleted && priorCompleted.has("meanings") && meaningsValid;

    if (step === "forms" && intent === "complete") formsCompleted = true;
    if (step === "meanings" && intent === "complete") meaningsCompleted = true;
    if (!formsCompleted) meaningsCompleted = false;

    const completed: AdminWordV2["completed_steps"] = ["basics"];
    if (formsCompleted) completed.push("forms");
    if (meaningsCompleted) completed.push("meanings");
    word.completed_steps = completed;
    word.max_reachable_step = meaningsCompleted
      ? "preview"
      : formsCompleted
        ? "meanings"
        : "forms";
  }

  async function list(
    query: AdminWordListQuery = {}
  ): Promise<AdminWordListResponse> {
    await pause();
    const { profile, state: current } = context();
    const q = query.q?.trim().toLocaleLowerCase("en") ?? "";
    const gloss = query.gloss?.trim().toLocaleLowerCase() ?? "";
    const items: AdminWordListItem[] = Object.values(current.words)
      .filter((word) => {
        // 两侧拼写都要能搜到：列表词汇列展示的是并列拼写，只匹配基准侧会让
        // 管理员搜自己眼前看得见的另一侧拼写却搜不到。真实后端对词头键表匹配，
        // 两侧同样都能命中。
        const headwords = allHeadwords(word).map((item) =>
          item.value.toLocaleLowerCase("en")
        );
        const createdBy =
          word.created_by === profile.id
            ? profile.display_name
            : word.created_by;
        if (
          q &&
          !headwords.some((headword) => headword.includes(q)) &&
          !createdBy.toLocaleLowerCase().includes(q)
        )
          return false;
        if (gloss && !wordGloss(word).toLocaleLowerCase().includes(gloss))
          return false;
        if (query.kind && word.kind !== query.kind) return false;
        if (query.pos && !wordPos(word).includes(query.pos)) return false;
        if (query.level && !wordLevels(word).includes(query.level))
          return false;
        if (query.status && word.status !== query.status) return false;
        if (!query.status && word.status === "archived") return false;
        if (query.created_from && word.created_at < query.created_from)
          return false;
        if (query.created_to && word.created_at >= query.created_to)
          return false;
        return true;
      })
      .map((word) => ({
        schema_version: 2 as const,
        id: word.id,
        headword: listHeadword(word),
        kind: word.kind,
        dialects: listDialects(word),
        headword_variants: listHeadwordVariants(word),
        ...(word.headwords.mode === "distinguish"
          ? { source_dialect: word.headwords.source_dialect }
          : {}),
        gloss: wordGloss(word),
        pos_list: wordPos(word),
        levels: wordLevels(word),
        status: word.status,
        max_reachable_step: word.max_reachable_step,
        revision: word.revision,
        lifecycle_revision: word.lifecycle_revision,
        ...(word.published_revision !== undefined
          ? { published_revision: word.published_revision }
          : {}),
        has_unpublished_changes: word.has_unpublished_changes,
        created_by_name:
          word.created_by === profile.id
            ? profile.display_name
            : word.created_by,
        created_by: word.created_by,
        reference_summary: entryReferenceSummary(current, word.id),
        created_at: word.created_at,
        updated_at: word.updated_at
      }))
      .sort(
        (left, right) =>
          right.created_at.localeCompare(left.created_at) ||
          right.id.localeCompare(left.id)
      );
    const pageSize = Math.min(100, Math.max(1, query.page_size ?? 20));
    const page = Math.max(1, query.page ?? 1);
    const start = (page - 1) * pageSize;
    return {
      words: clone(items.slice(start, start + pageSize)),
      page: { page, page_size: pageSize, total: items.length }
    };
  }

  async function stats(): Promise<AdminWordStats> {
    await pause();
    const { state: current } = context();
    const words = Object.values(current.words).filter(
      (word) => word.status !== "archived"
    );
    const currentDate = dateParts(now());
    return {
      total: words.length,
      today: words.filter(
        (word) => dateParts(word.created_at).day === currentDate.day
      ).length,
      month: words.filter(
        (word) => dateParts(word.created_at).month === currentDate.month
      ).length
    };
  }

  async function detect(
    input: DetectWordInputV2
  ): Promise<DetectWordResponseV2> {
    await pause();
    const { profile, state: current } = context();
    if (input.language !== "en") {
      throw new HttpError(
        422,
        "unsupported language",
        [],
        "unsupported_language"
      );
    }
    if (/\p{Cc}/u.test(input.headword)) {
      throw new HttpError(
        400,
        "headword contains control characters",
        [],
        "invalid_headword"
      );
    }
    const normalized = normalizeFixtureHeadword(input.headword);
    if (!normalized.display)
      throw new HttpError(400, "headword is required", [], "invalid_headword");
    if ([...normalized.display].length > 200) {
      throw new HttpError(
        400,
        "headword cannot be normalized",
        [],
        "invalid_headword"
      );
    }
    if (normalized.key === "server-error") {
      throw new HttpError(
        500,
        "mock internal error",
        [],
        "mock_internal_error"
      );
    }
    const detectionId = nextId(current, "det");
    const response = createDetectionFixture(
      input,
      detectionId,
      now().getTime()
    );
    if (surfaceWarnings === "legacy") {
      const dynamicDuplicates = duplicatesFor(
        current,
        [response.normalized_headword],
        response.entry_kind
      );
      if (dynamicDuplicates.length > 0) {
        response.smart_dictionary = {
          status: "duplicate",
          duplicates: dynamicDuplicates
        };
      }
    } else {
      const candidateHeadwords =
        response.builtin_dictionary.status === "matched"
          ? response.builtin_dictionary.headwords
          : ({ mode: "unified", common: response.request.headword } as const);
      const firstPage = buildSurfaceSnapshot(
        current,
        profile.id,
        detectionId,
        candidateHeadwords,
        response.entry_kind
      );
      if (firstPage) {
        response.smart_dictionary = {
          status: "warning",
          duplicates: [],
          surface_match_page: firstPage,
          matched_entry_contexts: []
        };
      }
    }
    current.detections[detectionId] = clone(response);
    persist(current);
    return clone(response);
  }

  async function suggestDialectVariants(
    input: SuggestDialectVariantsInputV2
  ): Promise<SuggestDialectVariantsResponseV2> {
    await pause();
    context();
    validateDialectSuggestionInput(input);
    const suggestions: DialectVariantSuggestionItemV2[] = [];
    for (const item of input.items) {
      if (item.field_kind === "form") {
        const converted = convertDialectText(
          item.value,
          input.source_dialect,
          input.target_dialect
        ).text;
        if (converted !== item.value) {
          suggestions.push({ ...item, value: converted });
        }
        continue;
      }
      const converted = convertDialectRichText(
        item.value,
        input.source_dialect,
        input.target_dialect
      );
      if (converted.text !== item.value.text) {
        suggestions.push({ ...item, value: converted });
      }
    }
    return {
      provider: {
        kind: "dictionary_region_rules",
        version: "1"
      },
      suggestions
    };
  }

  async function surfaceMatchSnapshotPage(
    snapshotId: string,
    cursor: string,
    signal?: AbortSignal
  ): Promise<SurfaceMatchPageV2> {
    await pause();
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const { profile } = context();
    const snapshot = surfaceSnapshotPages.get(snapshotId);
    const page = snapshot?.pages.get(cursor);
    if (!snapshot || snapshot.actor_id !== profile.id || !page) {
      throw new HttpError(
        410,
        "surface match snapshot expired",
        [],
        "surface_match_snapshot_expired"
      );
    }
    snapshot.pages.delete(cursor);
    return clone(page);
  }

  async function createV2(
    input: MockCreateAdminWordV2Input
  ): Promise<AdminWordV2Envelope>;
  async function createV2(
    idempotencyKey: string,
    input: CreateAdminWordV2Input
  ): Promise<AdminWordV2Envelope>;
  async function createV2(
    idempotencyKeyOrInput: string | MockCreateAdminWordV2Input,
    wireInput?: CreateAdminWordV2Input
  ): Promise<AdminWordV2Envelope> {
    await pause();
    const { profile, state: current } = context();
    const input: MockCreateAdminWordV2Input =
      typeof idempotencyKeyOrInput === "string"
        ? {
            ...wireInput!,
            idempotency_key: idempotencyKeyOrInput
          }
        : idempotencyKeyOrInput;
    assertPayload(input);
    const requestJson = JSON.stringify({
      schema_version: input.schema_version,
      detection_id: input.detection_id,
      headwords:
        input.headwords.mode === "unified"
          ? { mode: "unified", common: input.headwords.common }
          : {
              mode: "distinguish",
              uk: input.headwords.uk,
              us: input.headwords.us,
              source_dialect: input.headwords.source_dialect
            },
      confirmed_surface_match_token: input.confirmed_surface_match_token
    });
    const existingOperation = current.create_idempotency[input.idempotency_key];
    if (existingOperation) {
      if (existingOperation.request_json !== requestJson) {
        throw new HttpError(
          409,
          "idempotency key reused",
          [],
          "idempotency_conflict"
        );
      }
      return clone(existingOperation.response);
    }
    if (current.consumed_detection_ids.includes(input.detection_id)) {
      throw new HttpError(410, "detection consumed", [], "detection_expired");
    }
    const detection = current.detections[input.detection_id];
    if (!detection) {
      throw new HttpError(
        422,
        "detection does not exist",
        [],
        "detection_mismatch"
      );
    }
    if (
      surfaceWarnings === "legacy" &&
      new Date(detection.expires_at).getTime() <= now().getTime()
    ) {
      throw new HttpError(410, "detection expired", [], "detection_expired");
    }
    const dictionaryMatched =
      detection.builtin_dictionary.status === "matched" &&
      detection.matched_dialect !== undefined &&
      compatibleHeadwords(
        detection.builtin_dictionary.headwords,
        detection.matched_dialect,
        input.headwords
      );
    // 未命中内置词典时按管理员原输入建 unified 词条,单词与短语同一条路径。
    const unmatchedDictionary =
      detection.builtin_dictionary.status === "not_found" &&
      input.headwords.mode === "unified" &&
      normalizeFixtureHeadword(input.headwords.common).key ===
        detection.normalized_headword;
    if (
      (surfaceWarnings === "legacy" &&
        detection.smart_dictionary.status !== "clear") ||
      (!dictionaryMatched && !unmatchedDictionary)
    ) {
      const code =
        detection.smart_dictionary.status === "duplicate"
          ? "duplicate_word"
          : "detection_mismatch";
      throw new HttpError(
        code === "duplicate_word" ? 409 : 422,
        "detection cannot create an entry",
        [],
        code
      );
    }
    if (detection.smart_dictionary.status === "duplicate") {
      throw new HttpError(409, "word already exists", [], "duplicate_word");
    }
    if (detection.smart_dictionary.status === "unavailable") {
      throw new HttpError(
        503,
        "smart dictionary unavailable",
        [],
        "service_unavailable"
      );
    }
    let acknowledgedSurface:
      | {
          snapshot: MockSurfaceSnapshot;
          items: LexiconSurfaceMatchV2[];
        }
      | undefined;
    if (surfaceWarnings !== "legacy") {
      const currentMatches = currentSurfaceMatches(
        current,
        detection.detection_id,
        input.headwords,
        detection.entry_kind
      );
      if (currentMatches.items.length > 0) {
        const freshPage = () =>
          buildSurfaceSnapshot(
            current,
            profile.id,
            detection.detection_id,
            input.headwords,
            detection.entry_kind
          )!;
        const token = input.confirmed_surface_match_token;
        if (!token) {
          const page = freshPage();
          const disabled = page.continuation_policy === "temporarily_disabled";
          throw new HttpError(
            409,
            disabled
              ? "exact headword creation temporarily disabled"
              : "surface match acknowledgement required",
            [],
            disabled
              ? "exact_headword_creation_temporarily_disabled"
              : detection.smart_dictionary.status === "clear"
                ? "surface_matches_changed"
                : "surface_match_acknowledgement_required",
            [],
            {
              surface_match_page: page,
              current_policy_name: page.policy_name,
              current_policy_epoch: page.policy_epoch
            }
          );
        }
        const snapshotId = surfaceTokenSnapshotIds.get(token);
        const snapshot = snapshotId
          ? surfaceSnapshotPages.get(snapshotId)
          : undefined;
        if (!snapshot) {
          throw new HttpError(
            410,
            "surface match snapshot expired",
            [],
            "surface_match_snapshot_expired"
          );
        }
        const currentMatchIds = currentMatches.items.map(
          (item) => item.match_id
        );
        const changed =
          snapshot.actor_id !== profile.id ||
          snapshot.owner_kind !== "create" ||
          snapshot.detection_id !== detection.detection_id ||
          snapshot.content_key !== JSON.stringify(input.headwords) ||
          snapshot.match_ids.length !== currentMatchIds.length ||
          snapshot.match_ids.some(
            (matchId, index) => matchId !== currentMatchIds[index]
          );
        if (changed) {
          const page = freshPage();
          throw new HttpError(
            409,
            "surface matches changed",
            [],
            "surface_matches_changed",
            [],
            {
              surface_match_page: page,
              current_policy_name: page.policy_name,
              current_policy_epoch: page.policy_epoch
            }
          );
        }
        acknowledgedSurface = { snapshot, items: currentMatches.items };
      }
    }
    const headwordValues =
      input.headwords.mode === "unified"
        ? [input.headwords.common]
        : [input.headwords.uk, input.headwords.us];
    if (
      surfaceWarnings === "legacy" &&
      duplicatesFor(current, headwordValues, detection.entry_kind).length > 0
    ) {
      throw new HttpError(409, "word already exists", [], "duplicate_word");
    }
    const wordId = nextId(current, "word-v2");
    const timestamp = nextTimestamp(current);
    const forms =
      detection.builtin_dictionary.status === "matched"
        ? clone(detection.builtin_dictionary.suggested_forms)
        : { pos: [] };
    assertConfiguredForms(current, forms);
    if (
      detection.builtin_dictionary.status === "matched" &&
      detection.matched_dialect !== undefined
    ) {
      alignBaseForms(
        forms,
        detection.builtin_dictionary.headwords,
        detection.matched_dialect,
        input.headwords,
        (prefix) => nextId(current, prefix)
      );
    }
    const smartDictionarySnapshot = acknowledgedSurface
      ? {
          smart_dictionary_status: "warning" as const,
          surface_warning: {
            total: acknowledgedSurface.snapshot.match_ids.length,
            match_digest: `mock:${acknowledgedSurface.snapshot.match_ids.join("|")}`,
            acknowledged: true as const,
            acknowledged_at: timestamp,
            acknowledged_by: profile.id,
            policy_name: acknowledgedSurface.snapshot.policy_name,
            policy_epoch: acknowledgedSurface.snapshot.policy_epoch,
            preview: acknowledgedSurface.items.slice(0, 5).map((item) => {
              const existing = current.words[item.existing.word_id];
              const existingDialect = item.existing.source.dialect;
              return {
                match_id: item.match_id,
                match_category: item.match_category,
                existing_word_id: item.existing.word_id,
                existing_headword: item.existing.headword,
                existing_kind: item.existing.kind,
                existing_status: item.existing.status,
                existing_dialect: existingDialect,
                pos_labels: existing ? wordPos(existing).slice(0, 5) : [],
                gloss_previews: existing
                  ? [wordGloss(existing)].filter(Boolean).slice(0, 5)
                  : []
              };
            }),
            truncated:
              acknowledgedSurface.snapshot.match_ids.length >
              Math.min(5, acknowledgedSurface.items.length)
          }
        }
      : { smart_dictionary_status: "clear" as const };
    const word: AdminWordV2 = {
      schema_version: 2,
      id: wordId,
      language: "en",
      kind: detection.entry_kind,
      status: "draft",
      revision: 1,
      lifecycle_revision: 1,
      headwords: clone(input.headwords),
      detection_snapshot: {
        detection_id: detection.detection_id,
        request: clone(detection.request),
        normalized_headword: detection.normalized_headword,
        entry_kind: detection.entry_kind,
        matched_dialect: detection.matched_dialect ?? "common",
        builtin_dictionary_status:
          detection.builtin_dictionary.status === "matched"
            ? "matched"
            : "not_found",
        ...smartDictionarySnapshot,
        headwords:
          detection.builtin_dictionary.status === "matched"
            ? clone(detection.builtin_dictionary.headwords)
            : clone(input.headwords),
        suggested_pos: forms.pos.map((entry) => entry.pos),
        detected_at: timestamp
      },
      forms,
      meanings: createInitialMeanings(
        forms,
        wordId,
        detection.normalized_headword === "large-fixture"
      ),
      completed_steps: ["basics"],
      max_reachable_step: "forms",
      created_by: profile.id,
      created_at: timestamp,
      updated_at: timestamp,
      has_unpublished_changes: false
    };
    const response = { word: clone(word) };
    current.words[word.id] = word;
    current.create_idempotency[input.idempotency_key] = {
      request_json: requestJson,
      response: clone(response)
    };
    current.consumed_detection_ids.push(input.detection_id);
    persist(current);
    return response;
  }

  async function get(wordId: string): Promise<AdminWordDraftV2Envelope> {
    await pause();
    const { state: current } = context();
    const word = requireWord(current, wordId);
    return {
      word: clone(word),
      retired_stable_slots: clone(current.retired_stable_slots[wordId] ?? [])
    };
  }

  async function previewFormsImpact(
    wordId: string,
    input: PreviewFormsImpactInputV2
  ): Promise<PreviewFormsImpactResponseV2> {
    await pause();
    const { profile, state: current } = context();
    assertPayload(input);
    const word = requireV2Draft(current, wordId);
    assertRevision(word, input.base_revision);
    assertConfiguredForms(current, input.content);
    const affected = meaningsForRemovedPos(word, input.content);
    if (surfaceWarnings !== "legacy") {
      const surfaceMatches = unacknowledgedFormsSurfaceMatches(
        current,
        word,
        input.content
      );
      const surfaceMatchPage = buildFormsSurfaceSnapshot(
        current,
        profile.id,
        word,
        input.content,
        affected,
        surfaceMatches
      );
      if (surfaceMatchPage) {
        persist(current);
        return {
          schema_version: 2,
          base_revision: word.revision,
          requires_confirmation: affected.length > 0,
          affected: clone(affected),
          surface_match_page: surfaceMatchPage
        };
      }
    }
    if (affected.length === 0) {
      return {
        schema_version: 2,
        base_revision: word.revision,
        requires_confirmation: false,
        affected: []
      };
    }
    const token = issueImpactToken(current, word, input.content, affected);
    persist(current);
    return {
      schema_version: 2,
      base_revision: word.revision,
      requires_confirmation: true,
      affected: clone(affected),
      confirmation_token: token
    };
  }

  async function saveFormsStep(
    wordId: string,
    input: MockSaveFormsStepInput
  ): Promise<AdminWordV2Envelope> {
    await pause();
    const { profile, state: current } = context();
    assertPayload(input);
    const operationId = input.operation_id;
    const prior = operationId ? current.operations[operationId] : undefined;
    if (prior) {
      if (
        prior.kind !== "forms" ||
        prior.word_id !== wordId ||
        prior.input_json !== JSON.stringify(input)
      ) {
        throw new HttpError(
          409,
          "operation id reused",
          [],
          "operation_id_reused"
        );
      }
      return clone(prior.result);
    }
    const word = requireV2Draft(current, wordId);
    assertRevision(word, input.base_revision);
    assertConfiguredForms(current, input.content);
    const affected = meaningsForRemovedPos(word, input.content);
    let acknowledgedSurfaceSnapshot: MockSurfaceSnapshot | undefined;
    let formsSurfaceMatchIds: string[] = [];
    if (surfaceWarnings !== "legacy") {
      const allSurfaceMatches = allFormsSurfaceMatches(
        current,
        word,
        input.content
      );
      formsSurfaceMatchIds = allSurfaceMatches.items.map(
        (item) => item.match_id
      );
      const currentMatches = unacknowledgedFormsSurfaceMatches(
        current,
        word,
        input.content
      );
      if (currentMatches.items.length > 0) {
        const freshPage = () =>
          buildFormsSurfaceSnapshot(
            current,
            profile.id,
            word,
            input.content,
            affected,
            currentMatches
          )!;
        const surfaceToken = input.confirmed_surface_match_token;
        if (!surfaceToken) {
          const page = freshPage();
          persist(current);
          throw new HttpError(
            409,
            "surface match acknowledgement required",
            [],
            "surface_match_acknowledgement_required",
            [],
            {
              surface_match_page: page,
              current_policy_name: page.policy_name,
              current_policy_epoch: page.policy_epoch
            }
          );
        }
        const snapshotId = surfaceTokenSnapshotIds.get(surfaceToken);
        const snapshot = snapshotId
          ? surfaceSnapshotPages.get(snapshotId)
          : undefined;
        if (!snapshot) {
          throw new HttpError(
            410,
            "surface match snapshot expired",
            [],
            "surface_match_snapshot_expired"
          );
        }
        const currentMatchIds = currentMatches.items.map(
          (item) => item.match_id
        );
        const changed =
          snapshot.actor_id !== profile.id ||
          snapshot.owner_kind !== "forms" ||
          snapshot.word_id !== word.id ||
          snapshot.base_revision !== word.revision ||
          snapshot.content_key !== JSON.stringify(input.content) ||
          currentMatchIds.some(
            (matchId) => !snapshot.match_ids.includes(matchId)
          );
        if (changed) {
          const page = freshPage();
          persist(current);
          throw new HttpError(
            409,
            "surface matches changed",
            [],
            "surface_matches_changed",
            [],
            {
              surface_match_page: page,
              current_policy_name: page.policy_name,
              current_policy_epoch: page.policy_epoch
            }
          );
        }
        acknowledgedSurfaceSnapshot = snapshot;
      }
    }
    if (affected.length > 0) {
      const token = input.confirmed_impact_token
        ? current.impact_tokens[input.confirmed_impact_token]
        : undefined;
      if (
        !token ||
        (acknowledgedSurfaceSnapshot !== undefined &&
          acknowledgedSurfaceSnapshot.impact_token !==
            input.confirmed_impact_token) ||
        token.word_id !== word.id ||
        token.base_revision !== word.revision ||
        token.content_json !== JSON.stringify(input.content)
      ) {
        throw new HttpError(
          409,
          "downstream confirmation required",
          [],
          "downstream_confirmation_required",
          [],
          {
            word_id: word.id,
            current_revision: word.revision,
            max_reachable_step: word.max_reachable_step,
            affected_node_ids: affected.map((entry) => entry.node_id)
          }
        );
      }
    }
    const issues = validateForms(
      input.content,
      word.headwords,
      current,
      validatesInternalPartOfSpeech
    );
    if (input.intent === "complete" && issues.length > 0) {
      throw new HttpError(
        422,
        "forms are incomplete",
        [],
        "validation_failed",
        v2ProblemIssues(issues),
        {
          word_id: word.id,
          current_revision: word.revision,
          max_reachable_step: word.max_reachable_step
        }
      );
    }
    // 稳定槽位身份：(父槽位, 方言) 一经保存就永久绑定同一个节点 ID，
    // 退役节点也照样占着槽位。真实后端在 lexicon.nodes 上是唯一索引，这里同口径校验。
    const retiredSlots = current.retired_stable_slots[word.id] ?? [];
    const proposedSlots = formVariantStableSlots(input.content);
    const boundSlots = new Map(
      [...formVariantStableSlots(word.forms), ...retiredSlots].map((slot) => [
        stableSlotKey(slot),
        slot
      ])
    );
    const identityIssues = proposedSlots
      .filter((slot) => {
        const bound = boundSlots.get(stableSlotKey(slot));
        return bound !== undefined && bound.id !== slot.id;
      })
      .map((slot) => ({
        step: "forms" as const,
        node_id: slot.id,
        field: "id",
        code: "stable_node_id_changed",
        message: "已有内容槽位必须保留原节点 ID"
      }));
    if (identityIssues.length > 0) {
      throw new HttpError(
        422,
        "draft validation failed",
        [],
        "validation_failed",
        v2ProblemIssues(identityIssues),
        {
          word_id: word.id,
          current_revision: word.revision,
          max_reachable_step: word.max_reachable_step
        }
      );
    }
    const liveSlotKeys = new Set(proposedSlots.map(stableSlotKey));
    current.retired_stable_slots[word.id] = [...boundSlots.values()]
      .filter((slot) => !liveSlotKeys.has(stableSlotKey(slot)))
      .sort((a, b) => stableSlotKey(a).localeCompare(stableSlotKey(b)));

    const priorCompleted = new Set(word.completed_steps);
    word.forms = clone(input.content);
    if (word.meanings.sense_groups.length === 0) {
      const defaultSenseGroup = createInitialSenseGroup(word.id);
      word.meanings.sense_groups.push(defaultSenseGroup);
      word.meanings.pos = word.meanings.pos.map((pos) => ({
        ...pos,
        senses: pos.senses.map((sense) => ({
          ...sense,
          sense_group_id: defaultSenseGroup.id
        }))
      }));
    }
    const defaultSenseGroupId = word.meanings.sense_groups[0]!.id;
    const remaining = new Set(word.forms.pos.map((entry) => entry.pos_id));
    word.meanings.pos = word.meanings.pos.filter((entry) =>
      remaining.has(entry.pos_id)
    );
    for (const formsPos of word.forms.pos) {
      if (
        !word.meanings.pos.some((entry) => entry.pos_id === formsPos.pos_id)
      ) {
        word.meanings.pos.push(
          createInitialMeaningsForAddedPos(
            formsPos,
            word.id,
            defaultSenseGroupId
          )
        );
      }
    }
    word.revision += 1;
    word.updated_at = nextTimestamp(current);
    reconcileProgress(word, current, "forms", input.intent, priorCompleted);
    word.has_unpublished_changes = word.published_revision !== undefined;
    if (surfaceWarnings !== "legacy") {
      current.forms_surface_evidence[word.id] = {
        content_json: JSON.stringify(input.content),
        match_ids: formsSurfaceMatchIds,
        confirmed_revision: word.revision
      };
    }
    const result = { word: clone(word) };
    if (operationId) {
      current.operations[operationId] = {
        kind: "forms",
        word_id: word.id,
        input_json: JSON.stringify(input),
        result: clone(result)
      };
    }
    persist(current);
    return result;
  }

  async function saveMeaningsStep(
    wordId: string,
    input: MockSaveMeaningsStepInput
  ): Promise<AdminWordV2Envelope> {
    await pause();
    const { state: current } = context();
    assertPayload(input);
    const operationId = input.operation_id;
    const prior = operationId ? current.operations[operationId] : undefined;
    if (prior) {
      if (
        prior.kind !== "meanings" ||
        prior.word_id !== wordId ||
        prior.input_json !== JSON.stringify(input)
      ) {
        throw new HttpError(
          409,
          "operation id reused",
          [],
          "operation_id_reused"
        );
      }
      return clone(prior.result);
    }
    const word = requireV2Draft(current, wordId);
    assertRevision(word, input.base_revision);
    assertConfiguredForms(current, word.forms);
    if (
      !word.completed_steps.includes("forms") ||
      validateForms(
        word.forms,
        word.headwords,
        current,
        validatesInternalPartOfSpeech
      ).length > 0
    ) {
      throw new HttpError(
        409,
        "forms step is incomplete",
        [],
        "step_not_reachable",
        [],
        {
          word_id: word.id,
          current_revision: word.revision,
          max_reachable_step: word.max_reachable_step
        }
      );
    }
    const localContent = sentenceAssociationMeanings(input.content);
    assertConfiguredMeanings(current, word.forms, localContent);
    const issues = validateMeanings(
      word,
      localContent,
      current,
      validatesInternalPartOfSpeech
    );
    if (input.intent === "complete" && issues.length > 0) {
      throw new HttpError(
        422,
        "meanings are incomplete",
        [],
        "validation_failed",
        v2ProblemIssues(issues),
        {
          word_id: word.id,
          current_revision: word.revision,
          max_reachable_step: word.max_reachable_step
        }
      );
    }
    const priorCompleted = new Set(word.completed_steps);
    const normalizedContent: DraftMeaningsWithSentenceAssociations = {
      ...localContent,
      ...(localContent.shared_sentences
        ? {
            shared_sentences: localContent.shared_sentences.map((sentence) => ({
              ...sentence,
              associations: normalizeSentenceAssociations(
                sentence.id,
                sentence.associations
              )
            }))
          }
        : {})
    };
    word.meanings = clone(normalizedContent);
    word.revision += 1;
    word.updated_at = nextTimestamp(current);
    reconcileProgress(word, current, "meanings", input.intent, priorCompleted);
    word.has_unpublished_changes = word.published_revision !== undefined;
    const result = { word: clone(word) };
    if (operationId) {
      current.operations[operationId] = {
        kind: "meanings",
        word_id: word.id,
        input_json: JSON.stringify(input),
        result: clone(result)
      };
    }
    persist(current);
    return result;
  }

  async function validateV2(
    wordId: string,
    input: ValidateAdminWordV2Input
  ): Promise<DraftValidationResponse> {
    await pause();
    const { state: current } = context();
    const word = requireWord(current, wordId);
    if (word.status === "archived") {
      throw new HttpError(409, "entry is archived", [], "entry_archived");
    }
    assertRevision(word, input.base_revision);
    const issues = [
      ...validateForms(
        word.forms,
        word.headwords,
        current,
        validatesInternalPartOfSpeech
      ),
      ...validateMeanings(
        word,
        word.meanings,
        current,
        validatesInternalPartOfSpeech
      )
    ];
    return {
      schema_version: 2,
      validated_revision: word.revision,
      valid: issues.length === 0,
      issues
    };
  }

  async function publishV2(
    wordId: string,
    input: MockPublishAdminWordV2Input
  ): Promise<AdminWordV2Envelope>;
  async function publishV2(
    wordId: string,
    idempotencyKey: string,
    input: PublishAdminWordV2Input
  ): Promise<AdminWordV2Envelope>;
  async function publishV2(
    wordId: string,
    idempotencyKeyOrInput: string | MockPublishAdminWordV2Input,
    wireInput?: PublishAdminWordV2Input
  ): Promise<AdminWordV2Envelope> {
    await pause();
    const { state: current } = context();
    const input: MockPublishAdminWordV2Input =
      typeof idempotencyKeyOrInput === "string"
        ? {
            ...wireInput!,
            idempotency_key: idempotencyKeyOrInput
          }
        : idempotencyKeyOrInput;
    const requestJson = JSON.stringify({
      word_id: wordId,
      base_revision: input.base_revision
    });
    const existingOperation =
      current.publish_idempotency[input.idempotency_key];
    if (existingOperation) {
      if (existingOperation.request_json !== requestJson) {
        throw new HttpError(
          409,
          "idempotency key reused",
          [],
          "idempotency_conflict"
        );
      }
      return clone(existingOperation.response);
    }
    const word = requireV2Draft(current, wordId);
    assertRevision(word, input.base_revision);
    assertConfiguredForms(current, word.forms);
    assertConfiguredMeanings(current, word.forms, word.meanings);
    const issues = [
      ...validateForms(
        word.forms,
        word.headwords,
        current,
        validatesInternalPartOfSpeech
      ),
      ...validateMeanings(
        word,
        word.meanings,
        current,
        validatesInternalPartOfSpeech
      )
    ];
    if (issues.length > 0) {
      throw new HttpError(
        422,
        "word is incomplete",
        [],
        "validation_failed",
        v2ProblemIssues(issues),
        {
          word_id: word.id,
          current_revision: word.revision,
          max_reachable_step: word.max_reachable_step
        }
      );
    }
    word.status = "published";
    word.updated_at = nextTimestamp(current);
    word.published_at = word.updated_at;
    word.published_revision = word.revision;
    word.has_unpublished_changes = false;
    const response = { word: clone(word) };
    current.publish_idempotency[input.idempotency_key] = {
      request_json: requestJson,
      response: clone(response)
    };
    current.publication_words[word.id] = clone(word);
    persist(current);

    // 可控的 response-lost fixture：状态已提交，首个响应模拟网络丢失；同 key 重试读回 canonical。
    if (
      input.idempotency_key.startsWith("response-lost") &&
      !current.lost_publish_responses.includes(input.idempotency_key)
    ) {
      current.lost_publish_responses.push(input.idempotency_key);
      persist(current);
      throw new HttpError(
        500,
        "mock publish response lost",
        [],
        "response_lost"
      );
    }
    return response;
  }

  async function transitionLifecycle(
    scope: "archive" | "restore" | "archive_batch" | "restore_batch",
    target: "archived" | "active",
    idempotencyKey: string,
    input: EntryLifecycleBatchInput
  ): Promise<EntryLifecycleBatchResponse> {
    await pause();
    const { profile, state: current } = context();
    if (input.entries.length < 1 || input.entries.length > 100) {
      throw new HttpError(
        422,
        "entries must contain between 1 and 100 values",
        [],
        "validation_failed"
      );
    }
    const ids = new Set(input.entries.map((entry) => entry.id));
    if (
      ids.size !== input.entries.length ||
      input.entries.some(
        (entry) => entry.base_revision < 1 || entry.base_lifecycle_revision < 1
      )
    ) {
      throw new HttpError(
        422,
        "entry ids must be unique and revisions must be positive",
        [],
        "validation_failed"
      );
    }

    const requestJson = JSON.stringify(input);
    const existingOperation = current.lifecycle_operations[idempotencyKey];
    if (existingOperation) {
      if (
        existingOperation.scope !== scope ||
        existingOperation.request_json !== requestJson
      ) {
        throw new HttpError(
          409,
          "idempotency key reused",
          [],
          "idempotency_conflict"
        );
      }
      // scope 已与本次调用比对过，此处必为生命周期批量的响应形状。
      return clone(existingOperation.response) as EntryLifecycleBatchResponse;
    }

    const words = input.entries.map((entry) => {
      const word = requireWord(current, entry.id);
      assertRevision(word, entry.base_revision);
      const alreadyTarget =
        target === "archived"
          ? word.status === "archived"
          : word.status !== "archived";
      if (
        !alreadyTarget &&
        word.lifecycle_revision !== entry.base_lifecycle_revision
      ) {
        throw new HttpError(
          409,
          "entry lifecycle revision conflict",
          [],
          "revision_conflict",
          [],
          { current_lifecycle_revision: word.lifecycle_revision }
        );
      }
      return { word, alreadyTarget };
    });

    const transitioningIds = new Set(
      words
        .filter(({ alreadyTarget }) => !alreadyTarget)
        .map(({ word }) => word.id)
    );
    if (target === "archived") {
      const references = Object.entries(current.publication_words).flatMap(
        ([sourceEntryId, publication]) => {
          const sourceWord = current.words[sourceEntryId];
          if (
            !sourceWord ||
            !isV2(sourceWord) ||
            sourceWord.status === "archived" ||
            transitioningIds.has(sourceEntryId)
          ) {
            return [];
          }
          return publication.meanings.pos.flatMap((pos) =>
            pos.senses.flatMap((sense) => [
              ...sense.sentences.flatMap((sentence) =>
                sentence.links
                  .filter(
                    (link) =>
                      link.role === "context" &&
                      transitioningIds.has(link.word_id)
                  )
                  .map((link) => ({
                    target_sense_id: link.sense_id,
                    source_entry_id: sourceEntryId,
                    source_publication_id: `mock-publication-${sourceEntryId}-${sourceWord.published_revision ?? sourceWord.revision}`,
                    source_node_id: sentence.id,
                    reference_kind: "sentence_context"
                  }))
              ),
              // 待物化关联词还没有目标词条，构不成引用；flatMap 顺带窄化可选属性。
              ...sense.relations.flatMap((relation) => {
                const targetWordId = relation.target_word_id;
                const targetSenseId = relation.target_sense_id;
                if (targetWordId === undefined || targetSenseId === undefined) {
                  return [];
                }
                if (!transitioningIds.has(targetWordId)) return [];
                return [
                  {
                    target_sense_id: targetSenseId,
                    source_entry_id: sourceEntryId,
                    source_publication_id: `mock-publication-${sourceEntryId}-${sourceWord.published_revision ?? sourceWord.revision}`,
                    source_node_id: relation.id,
                    reference_kind: "relation"
                  }
                ];
              })
            ])
          );
        }
      );
      if (references.length > 0) {
        throw new HttpError(
          409,
          "entry is referenced by another active current publication",
          [],
          "entry_has_inbound_publication_refs",
          [],
          { reference_locations: references }
        );
      }
    } else {
      const references = words.flatMap(({ word, alreadyTarget }) => {
        if (alreadyTarget) return [];
        const publication = current.publication_words[word.id];
        if (!publication) return [];
        return publication.meanings.pos.flatMap((pos) =>
          pos.senses.flatMap((sense) => [
            ...sense.sentences.flatMap((sentence) =>
              sentence.links
                .filter(
                  (link) =>
                    link.role === "context" &&
                    link.word_id !== word.id &&
                    (!current.publication_words[link.word_id] ||
                      (current.words[link.word_id]?.status === "archived" &&
                        !transitioningIds.has(link.word_id)) ||
                      !wordHasSense(
                        current.publication_words[link.word_id]!,
                        link.sense_id
                      ))
                )
                .map((link) => ({
                  target_sense_id: link.sense_id,
                  source_entry_id: word.id,
                  source_publication_id: `mock-publication-${word.id}-${word.published_revision ?? word.revision}`,
                  source_node_id: sentence.id,
                  reference_kind: "sentence_context"
                }))
            ),
            // 待物化关联词没有目标可查，不参与「引用了已归档/不可用目标」的判定。
            ...sense.relations.flatMap((relation) => {
              const targetWordId = relation.target_word_id;
              const targetSenseId = relation.target_sense_id;
              if (targetWordId === undefined || targetSenseId === undefined) {
                return [];
              }
              const publication = current.publication_words[targetWordId];
              const unavailable =
                !publication ||
                (current.words[targetWordId]?.status === "archived" &&
                  !transitioningIds.has(targetWordId)) ||
                !wordHasSense(publication, targetSenseId);
              if (!unavailable) return [];
              return [
                {
                  target_sense_id: targetSenseId,
                  source_entry_id: word.id,
                  source_publication_id: `mock-publication-${word.id}-${word.published_revision ?? word.revision}`,
                  source_node_id: relation.id,
                  reference_kind: "relation"
                }
              ];
            })
          ])
        );
      });
      if (references.length > 0) {
        throw new HttpError(
          409,
          "entry current publication references an archived or unavailable target",
          [],
          "entry_has_unavailable_publication_refs",
          [],
          { reference_locations: references }
        );
      }
    }

    let affected = 0;
    for (const { word, alreadyTarget } of words) {
      if (alreadyTarget) continue;
      const timestamp = nextTimestamp(current);
      word.lifecycle_revision += 1;
      word.updated_at = timestamp;
      if (target === "archived") {
        word.status = "archived";
        word.archived_at = timestamp;
        word.archived_by = profile.id;
      } else {
        word.status =
          word.published_revision === undefined ? "draft" : "published";
        delete word.archived_at;
        delete word.archived_by;
      }
      affected += 1;
    }
    const response: EntryLifecycleBatchResponse = {
      words: words.map(({ word }) => clone(word)),
      affected
    };
    current.lifecycle_operations[idempotencyKey] = {
      scope,
      request_json: requestJson,
      response: clone(response)
    };
    persist(current);
    return response;
  }

  async function archive(
    wordId: string,
    idempotencyKey: string,
    input: EntryLifecycleInput
  ): Promise<AdminWordV2Envelope> {
    const response = await transitionLifecycle(
      "archive",
      "archived",
      idempotencyKey,
      { entries: [{ id: wordId, ...input }] }
    );
    return { word: response.words[0]! };
  }

  async function restore(
    wordId: string,
    idempotencyKey: string,
    input: EntryLifecycleInput
  ): Promise<AdminWordV2Envelope> {
    const response = await transitionLifecycle(
      "restore",
      "active",
      idempotencyKey,
      { entries: [{ id: wordId, ...input }] }
    );
    return { word: response.words[0]! };
  }

  async function archiveBatch(
    idempotencyKey: string,
    input: EntryLifecycleBatchInput
  ): Promise<EntryLifecycleBatchResponse> {
    return transitionLifecycle(
      "archive_batch",
      "archived",
      idempotencyKey,
      input
    );
  }

  async function restoreBatch(
    idempotencyKey: string,
    input: EntryLifecycleBatchInput
  ): Promise<EntryLifecycleBatchResponse> {
    return transitionLifecycle(
      "restore_batch",
      "active",
      idempotencyKey,
      input
    );
  }

  /**
   * 判定一条能否永久删除；顺序与后端 delete_entry_in_transaction 严格一致
   * （revision → lifecycle → 归属 → 发布历史），否则同时踩两个条件时
   * mock 与真机会给出不同错误码。只校验不改状态，供批量先全验后全删。
   */
  function assertEntryDeletable(
    profile: MockAdminProfile,
    current: AdminWordsMockPersistedState,
    wordId: string,
    input: { base_revision: number; base_lifecycle_revision: number }
  ): void {
    const word = current.words[wordId];
    if (!word) throw new HttpError(404, "word not found", [], "word_not_found");
    if (word.revision !== input.base_revision) {
      throw new HttpError(
        409,
        "entry changed since it was loaded",
        [],
        "revision_conflict"
      );
    }
    if (word.lifecycle_revision !== input.base_lifecycle_revision) {
      throw new HttpError(
        409,
        "entry lifecycle changed since it was loaded",
        [],
        "revision_conflict"
      );
    }
    // 普通管理员只能删自己创建的；超管不受限。
    if (profile.role !== "super_admin" && word.created_by !== profile.id) {
      throw new HttpError(
        403,
        "entry can only be deleted by its creator",
        [],
        "entry_delete_forbidden"
      );
    }
    // 归档态可删（垃圾桶是软删除中间站）；真正不可删的是发布过。
    if (current.publication_words[wordId]) {
      throw new HttpError(
        409,
        "entry cannot be deleted",
        [],
        "entry_not_deletable"
      );
    }
    // 被别的词条引用则删不掉——与后端入站引用拦截同口径。
    if (entryReferenceSources(current, wordId).size > 0) {
      throw new HttpError(
        409,
        "entry cannot be deleted",
        [],
        "entry_not_deletable"
      );
    }
  }

  function applyEntryDeletion(
    current: AdminWordsMockPersistedState,
    wordId: string
  ): void {
    delete current.words[wordId];
    delete current.retired_stable_slots[wordId];
  }

  async function deleteDraft(
    wordId: string,
    input: { base_revision: number; base_lifecycle_revision: number }
  ): Promise<void> {
    await pause();
    const { profile, state: current } = context();
    assertEntryDeletable(profile, current, wordId, input);
    applyEntryDeletion(current, wordId);
    persist(current);
  }

  async function deleteBatch(
    idempotencyKey: string,
    input: EntryDeleteBatchInput
  ): Promise<EntryDeleteBatchResponse> {
    await pause();
    const { profile, state: current } = context();
    if (input.entries.length < 1 || input.entries.length > 100) {
      throw new HttpError(
        422,
        "entries must contain between 1 and 100 values",
        [],
        "validation_failed"
      );
    }
    const ids = new Set(input.entries.map((entry) => entry.id));
    if (
      ids.size !== input.entries.length ||
      input.entries.some(
        (entry) => entry.base_revision < 1 || entry.base_lifecycle_revision < 1
      )
    ) {
      throw new HttpError(
        422,
        "entry ids must be unique and revisions must be positive",
        [],
        "validation_failed"
      );
    }
    const requestJson = JSON.stringify(input);
    const existingOperation = current.lifecycle_operations[idempotencyKey];
    if (existingOperation) {
      if (
        existingOperation.scope !== "delete_batch" ||
        existingOperation.request_json !== requestJson
      ) {
        throw new HttpError(
          409,
          "idempotency key reused",
          [],
          "idempotency_conflict"
        );
      }
      return clone(existingOperation.response) as EntryDeleteBatchResponse;
    }
    // 原子：先把整批验完，任意一条不合格就整批不动；验完再统一删。
    for (const entry of input.entries) {
      assertEntryDeletable(profile, current, entry.id, entry);
    }
    for (const entry of input.entries) {
      applyEntryDeletion(current, entry.id);
    }
    const response: EntryDeleteBatchResponse = {
      affected: input.entries.length
    };
    current.lifecycle_operations[idempotencyKey] = {
      scope: "delete_batch",
      request_json: requestJson,
      response: clone(response)
    };
    persist(current);
    return clone(response);
  }

  async function relatedSearch(
    q: string,
    opts?: RelatedSearchQuery
  ): Promise<RelatedSearchResponse> {
    await pause();
    const { state: current } = context();
    const query = q.trim().toLocaleLowerCase("en");
    if (!query)
      return opts?.match_mode
        ? { results: [], total: 0, next_cursor: null }
        : { results: [] };
    const limit = Math.min(
      100,
      Math.max(1, opts?.page_size ?? opts?.limit ?? 20)
    );
    const offset = Math.max(0, Number(opts?.cursor ?? 0) || 0);
    const results = Object.values(current.words)
      .filter((word) => {
        const kind = word.kind;
        return (
          word.status === "published" &&
          (!opts?.kind || kind === opts.kind) &&
          (opts?.match_mode === "exact"
            ? displayHeadword(word).toLocaleLowerCase("en") === query
            : displayHeadword(word).toLocaleLowerCase("en").includes(query)) &&
          (!opts?.exclude_exact ||
            displayHeadword(word).toLocaleLowerCase("en") !== query)
        );
      })
      .map((word) => {
        const displayedWord = current.publication_words[word.id] ?? word;
        const senses: RelatedWordSense[] = displayedWord.meanings.pos.flatMap(
          (pos) =>
            pos.senses.map((sense) => ({
              sense_id: sense.id,
              gloss:
                sense.definitions
                  .map(v2ChineseDefinition)
                  .find((entry) => entry.trim() !== "") ?? ""
            }))
        );
        const dialects =
          displayedWord.headwords.mode === "unified"
            ? (["common"] as Dialect[])
            : (["uk", "us"] as Dialect[]);
        const headwordVariants =
          displayedWord.headwords.mode === "unified"
            ? [
                {
                  dialect: "common" as const,
                  headword: displayedWord.headwords.common
                }
              ]
            : [
                {
                  dialect: "uk" as const,
                  headword: displayedWord.headwords.uk
                },
                { dialect: "us" as const, headword: displayedWord.headwords.us }
              ];
        return {
          schema_version: 2 as const,
          word_id: word.id,
          headword: displayHeadword(displayedWord),
          kind: word.kind,
          dialects,
          headword_variants: headwordVariants,
          pos_labels: displayedWord.meanings.pos.map((pos) => pos.pos_id),
          senses
        };
      })
      .sort((left, right) =>
        [left.kind, left.headword.toLocaleLowerCase("en"), left.word_id]
          .join("\0")
          .localeCompare(
            [
              right.kind,
              right.headword.toLocaleLowerCase("en"),
              right.word_id
            ].join("\0")
          )
      );
    const page = results.slice(offset, offset + limit);
    if (!opts?.match_mode) return { results: clone(page) };
    return {
      results: clone(page),
      total: results.length,
      next_cursor:
        offset + page.length < results.length
          ? String(offset + page.length)
          : null
    };
  }

  async function resolveSentenceAssociation(
    input: ResolveSentenceAssociationInput
  ): Promise<ResolveSentenceAssociationResponse> {
    await pause();
    const { state: current } = context();
    const published = current.publication_words[input.target_word_id];
    const currentDraft =
      input.current_word_id === input.target_word_id
        ? current.words[input.target_word_id]
        : undefined;
    const target = published ?? currentDraft;
    if (!target) return { resolution: "unmatched", candidates: [] };
    return clone(
      resolveSentenceAssociationFromWord(input, target, {
        allowDraft: target.status === "draft" && target === currentDraft
      })
    );
  }

  function publishedSurfaces(word: AdminWordV2): Set<string> {
    const surfaces = new Set<string>();
    if (word.headwords.mode === "unified") {
      surfaces.add(normalizePendingWord(word.headwords.common));
    } else {
      surfaces.add(normalizePendingWord(word.headwords.uk));
      surfaces.add(normalizePendingWord(word.headwords.us));
    }
    for (const pos of word.forms.pos) {
      for (const slot of [
        pos.base_form,
        ...pos.form_groups.flatMap((group) => group.slots)
      ]) {
        for (const variant of slot.variants) {
          surfaces.add(normalizePendingWord(variant.spelling));
        }
      }
    }
    return surfaces;
  }

  async function listPendingSentenceAssociations(
    targetWordId: string,
    query: { page_size?: number; cursor?: string } = {}
  ): Promise<PendingSentenceAssociationPageV1> {
    await pause();
    const { state: current } = context();
    const target = current.publication_words[targetWordId];
    if (!target) return { results: [], total: 0, next_cursor: null };
    const surfaces = publishedSurfaces(target);
    const results = Object.values(current.words)
      .flatMap((owner) =>
        (
          sentenceAssociationMeanings(owner.meanings).shared_sentences ?? []
        ).flatMap((sentence) =>
          sentence.associations.flatMap((association) => {
            if (
              association.state !== "pending" ||
              !surfaces.has(
                association.normalized_pending_word ??
                  normalizePendingWord(association.pending_word)
              )
            ) {
              return [];
            }
            return [
              {
                association_id: association.id,
                sentence_id: sentence.id,
                owner_entry_id: owner.id,
                owner_entry_revision: owner.revision,
                en_text: sentence.en_text,
                zh_text: sentence.zh_text,
                source_range: association.source_range,
                pending_word: association.pending_word,
                created_at: association.created_at ?? owner.updated_at
              }
            ];
          })
        )
      )
      .sort((left, right) =>
        [left.created_at, left.association_id]
          .join("\0")
          .localeCompare([right.created_at, right.association_id].join("\0"))
      );
    const limit = Math.min(100, Math.max(1, query.page_size ?? 20));
    const offset = Math.max(0, Number(query.cursor ?? 0) || 0);
    const page = results.slice(offset, offset + limit);
    return {
      results: clone(page),
      total: results.length,
      next_cursor:
        offset + page.length < results.length
          ? String(offset + page.length)
          : null
    };
  }

  async function claimPendingSentenceAssociation(
    associationId: string,
    idempotencyKey: string,
    input: ClaimPendingSentenceAssociationInput
  ): Promise<ClaimPendingSentenceAssociationResponse> {
    await pause();
    const { state: current } = context();
    const requestJson = JSON.stringify({ associationId, input });
    const prior = sentenceClaimIdempotency.get(idempotencyKey);
    if (prior) {
      if (prior.request_json !== requestJson) {
        throw new HttpError(
          409,
          "idempotency key reused",
          [],
          "idempotency_key_conflict"
        );
      }
      return clone(prior.response);
    }

    let owner: AdminWordV2 | undefined;
    let sentenceIndex = -1;
    let associationIndex = -1;
    for (const candidate of Object.values(current.words)) {
      const sentences =
        sentenceAssociationMeanings(candidate.meanings).shared_sentences ?? [];
      for (
        let currentSentenceIndex = 0;
        currentSentenceIndex < sentences.length;
        currentSentenceIndex += 1
      ) {
        const currentAssociationIndex = sentences[
          currentSentenceIndex
        ]!.associations.findIndex((item) => item.id === associationId);
        if (currentAssociationIndex >= 0) {
          owner = candidate;
          sentenceIndex = currentSentenceIndex;
          associationIndex = currentAssociationIndex;
          break;
        }
      }
      if (owner) break;
    }
    const sentence = owner
      ? sentenceAssociationMeanings(owner.meanings).shared_sentences?.[
          sentenceIndex
        ]
      : undefined;
    const pending = sentence?.associations[associationIndex];
    if (!owner || !sentence || !pending || pending.state !== "pending") {
      throw new HttpError(
        409,
        "pending association already claimed",
        [],
        "pending_sentence_association_claimed"
      );
    }
    if (owner.revision !== input.base_owner_entry_revision) {
      throw new HttpError(
        409,
        "owner entry revision changed",
        [],
        "entry_revision_conflict"
      );
    }
    const target = current.publication_words[input.target_word_id];
    const resolution = target
      ? resolveSentenceAssociationFromWord(
          {
            en_text: sentence.en_text,
            source_range: pending.source_range,
            target_word_id: input.target_word_id,
            target_sense_id: input.target_sense_id
          },
          target
        )
      : { resolution: "unmatched" as const, candidates: [] as const };
    const candidates =
      resolution.resolution === "resolved"
        ? [resolution.candidate]
        : resolution.candidates;
    const form = candidates.find(
      (candidate) => candidate.form_slot_id === input.form_slot_id
    );
    if (!target || !form) {
      throw new HttpError(
        422,
        "sentence form unmatched",
        [],
        "sentence_form_unmatched"
      );
    }
    const targetSense = target.meanings.pos
      .flatMap((pos) => pos.senses)
      .find((sense) => sense.id === input.target_sense_id);
    const sortOrder =
      Math.max(
        -1,
        ...(
          sentenceAssociationMeanings(owner.meanings).shared_sentences ?? []
        ).flatMap((item) =>
          item.associations.flatMap((association) =>
            association.state === "linked" &&
            association.target_sense_id === input.target_sense_id
              ? [association.sort_order]
              : []
          )
        )
      ) + 1;
    const linked = {
      id: pending.id,
      state: "linked" as const,
      source_range: pending.source_range,
      target_word_id: input.target_word_id,
      target_sense_id: input.target_sense_id,
      form_slot_id: form.form_slot_id,
      sort_order: sortOrder,
      resolved_pos: form.pos,
      resolved_form_type: form.form_type,
      target_headword: displayHeadword(target),
      target_gloss:
        targetSense?.definitions
          .map(v2ChineseDefinition)
          .find((value) => value.trim() !== "") ?? "",
      form_variants: form.variants
    };
    sentence.associations[associationIndex] = linked;
    owner.revision += 1;
    owner.updated_at = nextTimestamp(current);
    owner.has_unpublished_changes = owner.published_revision !== undefined;
    const response = {
      association: clone(linked),
      owner_entry_id: owner.id,
      owner_entry_revision: owner.revision
    };
    sentenceClaimIdempotency.set(idempotencyKey, {
      request_json: requestJson,
      response: clone(response)
    });
    persist(current);
    return response;
  }

  function clearSession(): void {
    if (activeProfileId) persistedStorage.clear(activeProfileId);
    activeProfileId = undefined;
    state = undefined;
    clearSurfaceRuntime();
    sentenceClaimIdempotency.clear();
  }

  async function createContentCompletionJob(): Promise<never> {
    throw new Error("自动生成只支持真实后端，不提供 mock 内容");
  }

  async function getContentCompletionJob(): Promise<never> {
    throw new Error("自动生成只支持真实后端，不提供 mock 内容");
  }

  async function retryContentCompletionJob(): Promise<never> {
    throw new Error("自动生成只支持真实后端，不提供 mock 内容");
  }

  return {
    list,
    stats,
    detect,
    surfaceMatchSnapshotPage,
    suggestDialectVariants,
    createV2,
    get,
    previewFormsImpact,
    saveFormsStep,
    saveMeaningsStep,
    createContentCompletionJob,
    getContentCompletionJob,
    retryContentCompletionJob,
    validateV2,
    publishV2,
    archive,
    restore,
    archiveBatch,
    restoreBatch,
    deleteDraft,
    deleteBatch,
    relatedSearch,
    sentenceAssociations: {
      resolve: resolveSentenceAssociation,
      listPending: listPendingSentenceAssociations,
      claim: claimPendingSentenceAssociation
    },
    partOfSpeechSettings: {
      catalog: partOfSpeechCatalog,
      list: listPartOfSpeechConfigs,
      create: createPartOfSpeech,
      update: updatePartOfSpeech,
      remove: removePartOfSpeech,
      listSubParts,
      createSubPart,
      updateSubPart,
      removeSubPart
    },
    clearSession
  };
}

export type AdminWordsMock = ReturnType<typeof createAdminWordsMock>;

/** Test helper for making the generated empty meanings publishable without UI mapping. */
export function completeMockMeanings(
  word: AdminWordV2,
  content: DraftMeaningsWithSentenceAssociations = clone(
    sentenceAssociationMeanings(word.meanings)
  )
): DraftMeaningsWithSentenceAssociations {
  const senseGroups =
    content.sense_groups.length > 0
      ? content.sense_groups.map((group, index) => ({
          ...group,
          name_zh: group.name_zh.trim() || `语义区间 ${index + 1}`,
          name_en: group.name_en.trim() || `Semantic range ${index + 1}`
        }))
      : [createInitialSenseGroup(word.id, true)];
  const defaultSenseGroupId = senseGroups[0]!.id;
  const defaultSubPart: Record<string, string> = {
    noun: "N-COUNT",
    pronoun: "PRON",
    verb: "V-T",
    adjective: "ADJ",
    adverb: "ADV",
    preposition: "PREP",
    article: "ART",
    determiner: "DET",
    conjunction: "CONJ",
    numeral: "NUM",
    interjection: "INT"
  };
  const fillPos = (pos: WordPosMeaningsV2): WordPosMeaningsV2 => {
    const partCode = word.forms.pos.find(
      (formsPos) => formsPos.pos_id === pos.pos_id
    )?.pos;
    return {
      ...pos,
      grammar_structures: pos.grammar_structures.map((grammar) => ({
        ...grammar,
        variants: grammar.variants.map((variant) => ({
          ...variant,
          content: richText(`the ${displayHeadword(word)}`)
        }))
      })),
      senses: pos.senses.map((sense, index) => ({
        ...sense,
        sense_group_id: senseGroups.some(
          (group) => group.id === sense.sense_group_id
        )
          ? sense.sense_group_id
          : defaultSenseGroupId,
        sub_pos: sense.sub_pos || defaultSubPart[partCode ?? ""] || "",
        frequency: sense.frequency ?? "10",
        definitions: sense.definitions.map((definition) =>
          definition.definition_mode === "zh_definition" ||
          definition.definition_mode === "zh_sentence"
            ? { ...definition, content: richText(`测试释义 ${index + 1}`) }
            : definition
        ),
        sentences: sense.sentences.map((sentence) => ({
          ...sentence,
          en_text:
            sentence.en_text.mode === "unified"
              ? {
                  ...sentence.en_text,
                  common: {
                    ...sentence.en_text.common,
                    value: richText(`A ${displayHeadword(word)} example.`)
                  }
                }
              : {
                  ...sentence.en_text,
                  uk: {
                    state: "ready",
                    variant: {
                      id:
                        sentence.en_text.uk.state === "ready"
                          ? sentence.en_text.uk.variant.id
                          : `${sentence.id}-en-uk`,
                      value: richText(`A ${displayHeadword(word)} example.`),
                      origin: "manual"
                    }
                  },
                  us: {
                    state: "ready",
                    variant: {
                      id:
                        sentence.en_text.us.state === "ready"
                          ? sentence.en_text.us.variant.id
                          : `${sentence.id}-en-us`,
                      value: richText(`A ${displayHeadword(word)} example.`),
                      origin: "manual"
                    }
                  }
                },
          zh_text: richText("这是一个测试例句。")
        }))
      }))
    };
  };
  return {
    sense_groups: clone(senseGroups),
    ...(content.shared_sentences
      ? { shared_sentences: clone(content.shared_sentences) }
      : {}),
    pos: content.pos.map(fillPos)
  };
}
