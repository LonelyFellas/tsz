import { HttpError } from "@tsz/api-client";
import type {
  AdminProfile,
  AdminWord,
  AdminWordAnyEnvelope,
  AdminWordBatchDeleteResponse,
  AdminWordCreateInput,
  AdminWordEnvelope,
  AdminWordListItem,
  AdminWordListQuery,
  AdminWordListResponse,
  AdminWordSaveInput,
  AdminWordStats,
  AdminWordV2,
  AdminWordV2Envelope,
  CreateAdminWordV2Input,
  DetectWordInputV2,
  DetectWordResponseV2,
  DraftFormsStepContent,
  DraftMeaningsStepContent,
  DraftValidationIssue,
  DraftValidationResponse,
  FormsImpactItemV2,
  PreviewFormsImpactInputV2,
  PreviewFormsImpactResponseV2,
  PublishAdminWordV2Input,
  RelatedSearchResponse,
  RelatedWordSense,
  SaveFormsStepInput,
  SaveMeaningsStepInput,
  SuggestDialectVariantsInputV2,
  SuggestDialectVariantsResponseV2,
  ValidateAdminWordV2Input,
  WordDefinitionV2,
  WordHeadwordsV2,
  WordPosMeaningsV2,
  WordSenseV2
} from "@tsz/types";
import {
  ADMIN_WORDS_MOCK_STORAGE_SCHEMA,
  createDetectionFixture,
  createInitialMeanings,
  createInitialMeaningsForAddedPos,
  createSeedLegacyWords,
  richText
} from "./fixtures";
import {
  createAdminWordsMockStorage,
  type AdminWordsMockStorage,
  type AdminWordsMockStorageLike
} from "./storage";

type MockWord = AdminWord | AdminWordV2;

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

export interface AdminWordsMockPersistedState {
  sequence: number;
  words: Record<string, MockWord>;
  detections: Record<string, DetectWordResponseV2>;
  create_idempotency: Record<string, string>;
  operations: Record<string, MockOperationRecord>;
  publish_idempotency: Record<string, string>;
  impact_tokens: Record<string, MockImpactTokenRecord>;
  lost_publish_responses: string[];
}

type MockAdminProfile = Pick<
  AdminProfile,
  "id" | "display_name" | "role" | "permissions"
>;

export interface CreateAdminWordsMockOptions {
  getAdminProfile: () => MockAdminProfile | undefined;
  now?: () => Date;
  latencyMs?: number;
  maxPayloadBytes?: number;
  storage?: AdminWordsMockStorage<AdminWordsMockPersistedState>;
  sessionStorage?: AdminWordsMockStorageLike;
  warn?: (message: string, error?: unknown) => void;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
    (value.status !== "draft" && value.status !== "published")
  ) {
    return false;
  }
  if (value.schema_version === 2) {
    return (
      typeof value.revision === "number" &&
      Array.isArray(value.completed_steps) &&
      isRecord(value.forms) &&
      Array.isArray(value.forms.pos) &&
      isRecord(value.meanings) &&
      Array.isArray(value.meanings.pos) &&
      Array.isArray(value.meanings.sense_groups)
    );
  }
  return (
    typeof value.headword === "string" &&
    Array.isArray(value.pos) &&
    Array.isArray(value.sense_groups)
  );
}

export function isAdminWordsMockPersistedState(
  value: unknown
): value is AdminWordsMockPersistedState {
  if (!isRecord(value)) return false;
  const allStringValues = (record: Record<string, unknown>) =>
    Object.values(record).every((entry) => typeof entry === "string");
  if (
    !Number.isInteger(value.sequence) ||
    !isRecord(value.words) ||
    !Object.values(value.words).every(isMockWord) ||
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
    !allStringValues(value.create_idempotency) ||
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
    !allStringValues(value.publish_idempotency) ||
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
    !Array.isArray(value.lost_publish_responses) ||
    !value.lost_publish_responses.every((entry) => typeof entry === "string")
  ) {
    return false;
  }
  return true;
}

function makeInitialState(nowIso: string): AdminWordsMockPersistedState {
  return {
    sequence: 0,
    words: Object.fromEntries(
      createSeedLegacyWords(nowIso).map((word) => [word.id, word])
    ),
    detections: {},
    create_idempotency: {},
    operations: {},
    publish_idempotency: {},
    impact_tokens: {},
    lost_publish_responses: []
  };
}

function isV2(word: MockWord): word is AdminWordV2 {
  return word.schema_version === 2;
}

function displayHeadword(word: MockWord): string {
  if (!isV2(word)) return word.headword;
  if (word.headwords.mode === "unified") return word.headwords.common;
  return word.headwords[word.headwords.source_dialect];
}

function allHeadwords(word: MockWord): Array<{
  value: string;
  dialect: "uk" | "us" | "common";
}> {
  if (!isV2(word)) {
    const dialect = word.dialects.length === 1 ? word.dialects[0]! : "common";
    return [{ value: word.headword, dialect }];
  }
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
  if (!isV2(word)) {
    const definition = word.pos[0]?.senses[0]?.definitions.find(
      (entry) => entry.def_type === "zh"
    );
    return definition?.text.text ?? "";
  }
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
  return isV2(word)
    ? word.forms.pos.map((entry) => entry.pos)
    : word.pos.map((entry) => entry.pos);
}

function wordLevels(word: MockWord) {
  const levels = isV2(word)
    ? word.meanings.pos.flatMap((pos) => pos.senses.map((sense) => sense.level))
    : word.pos.flatMap((pos) => pos.senses.map((sense) => sense.level));
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

function compatibleHeadwords(
  detected: WordHeadwordsV2,
  submitted: WordHeadwordsV2
): boolean {
  if (detected.mode !== submitted.mode) return false;
  if (detected.mode === "unified" && submitted.mode === "unified") {
    return (
      submitted.common.trim() !== "" && submitted.common === detected.common
    );
  }
  if (detected.mode === "distinguish" && submitted.mode === "distinguish") {
    const source = detected.source_dialect;
    const target = source === "uk" ? "us" : "uk";
    return (
      submitted.source_dialect === source &&
      submitted[source] === detected[source] &&
      submitted[target].trim() !== ""
    );
  }
  return false;
}

function equalHeadwords(
  left: WordHeadwordsV2,
  right: WordHeadwordsV2
): boolean {
  if (left.mode !== right.mode) return false;
  if (left.mode === "unified" && right.mode === "unified") {
    return left.common === right.common;
  }
  return (
    left.mode === "distinguish" &&
    right.mode === "distinguish" &&
    left.source_dialect === right.source_dialect &&
    left.uk === right.uk &&
    left.us === right.us
  );
}

function alignBaseFormSpelling(
  forms: DraftFormsStepContent,
  headwords: WordHeadwordsV2
): void {
  for (const pos of forms.pos) {
    for (const variant of pos.base_form.variants) {
      const spelling =
        headwords.mode === "unified"
          ? headwords.common
          : variant.dialect === "uk" || variant.dialect === "us"
            ? headwords[variant.dialect]
            : "";
      if (variant.spelling !== spelling) {
        variant.spelling = spelling;
        variant.origin = "manual";
      }
    }
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
  headwords: WordHeadwordsV2
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
    if (pos.form_groups.length === 0) {
      issues.push({
        step: "forms",
        node_id: pos.pos_id,
        field: "form_groups",
        code: "form_group_required",
        message: "每个词性至少需要一组词形变化"
      });
    }
    for (const formGroup of pos.form_groups) {
      if (formGroup.slots.length === 0) {
        issues.push({
          step: "forms",
          node_id: formGroup.id,
          field: "slots",
          code: "form_slot_required",
          message: "每组词形变化至少需要一个词形"
        });
      }
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
  return isV2(word)
    ? word.meanings.pos.some((pos) =>
        pos.senses.some((sense) => sense.id === senseId)
      )
    : word.pos.some((pos) => pos.senses.some((sense) => sense.id === senseId));
}

function validateMeanings(
  word: AdminWordV2,
  content: DraftMeaningsStepContent,
  current: AdminWordsMockPersistedState
): DraftValidationIssue[] {
  const issues: DraftValidationIssue[] = [];
  const senseGroupIds = new Set(content.sense_groups.map((group) => group.id));
  const hasTargetSense = (wordId: string, senseId: string) => {
    if (wordId === word.id) {
      return content.pos.some((pos) =>
        pos.senses.some((sense) => sense.id === senseId)
      );
    }
    const target = current.words[wordId];
    return target ? wordHasSense(target, senseId) : false;
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
    const expectedGrammarDialects: Array<"uk" | "us" | "common"> =
      word.headwords.mode === "unified" ? ["common"] : ["uk", "us"];
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
      if (
        dialects.length !== expectedGrammarDialects.length ||
        new Set(dialects).size !== dialects.length ||
        expectedGrammarDialects.some(
          (dialect) => !dialects.includes(dialect)
        ) ||
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
      if (
        sense.sense_group_id !== undefined &&
        !senseGroupIds.has(sense.sense_group_id)
      ) {
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
        if (
          !hasTargetSense(relation.target_word_id, relation.target_sense_id) ||
          !validPercent(relation.score)
        ) {
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

function v1PublishIssues(word: AdminWord): string[] {
  const issues: string[] = [];
  if (!word.frequency) issues.push("词频不能为空");
  if (word.pos.length === 0) issues.push("至少需要一个基本词性");
  if (word.pos.some((pos) => pos.senses.length === 0)) {
    issues.push("每个词性至少需要一个词义");
  }
  return issues;
}

function convertDialectText(
  value: string,
  source: "uk" | "us",
  target: "uk" | "us"
): string {
  if (source === target) return value;
  const pairs: Array<[string, string]> = [
    ["centre", "center"],
    ["colour", "color"],
    ["organise", "organize"],
    ["travelling", "traveling"]
  ];
  return pairs.reduce((result, [uk, us]) => {
    const from = source === "uk" ? uk : us;
    const to = target === "uk" ? uk : us;
    return result.replaceAll(from, to);
  }, value);
}

/** Stateful contract-shaped mock for the complete admin words namespace. */
export function createAdminWordsMock({
  getAdminProfile,
  now = () => new Date(),
  latencyMs = 0,
  maxPayloadBytes,
  storage,
  sessionStorage: providedSessionStorage,
  warn
}: CreateAdminWordsMockOptions) {
  const persistedStorage =
    storage ??
    createAdminWordsMockStorage({
      storage:
        providedSessionStorage ??
        (typeof globalThis.sessionStorage === "undefined"
          ? undefined
          : globalThis.sessionStorage),
      schemaVersion: ADMIN_WORDS_MOCK_STORAGE_SCHEMA,
      isState: isAdminWordsMockPersistedState,
      warn
    });
  let activeProfileId: string | undefined;
  let state: AdminWordsMockPersistedState | undefined;

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
      throw new HttpError(401, "admin session required", [], "unauthorized");
    }
    if (activeProfileId && activeProfileId !== profile.id) {
      persistedStorage.clear(activeProfileId);
      activeProfileId = undefined;
      state = undefined;
    }
    if (
      profile.role !== "super_admin" &&
      !profile.permissions.includes("words.access")
    ) {
      throw new HttpError(403, "words access required", [], "forbidden");
    }
    if (activeProfileId !== profile.id || !state) {
      activeProfileId = profile.id;
      state =
        persistedStorage.load(profile.id) ??
        makeInitialState(now().toISOString());
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
    if (!isV2(word)) {
      throw new HttpError(409, "word is legacy", [], "schema_version_mismatch");
    }
    if (word.status === "published") {
      throw new HttpError(
        409,
        "word is already published",
        [],
        "word_already_published",
        [],
        {
          word_id: word.id,
          current_revision: word.revision,
          max_reachable_step: word.max_reachable_step
        }
      );
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
    values: string[]
  ) {
    const normalized = new Set(
      values.map((entry) => entry.toLocaleLowerCase("en"))
    );
    return Object.values(current.words).flatMap((word) =>
      allHeadwords(word)
        .filter((entry) => normalized.has(entry.value.toLocaleLowerCase("en")))
        .map((entry) => ({
          word_id: word.id,
          headword: entry.value,
          dialect: entry.dialect
        }))
    );
  }

  function reconcileProgress(
    word: AdminWordV2,
    current: AdminWordsMockPersistedState,
    step: "forms" | "meanings",
    intent: "save" | "complete",
    priorCompleted: ReadonlySet<AdminWordV2["completed_steps"][number]>
  ): void {
    const formsValid = validateForms(word.forms, word.headwords).length === 0;
    const meaningsValid =
      formsValid && validateMeanings(word, word.meanings, current).length === 0;
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
        const headword = displayHeadword(word).toLocaleLowerCase("en");
        const createdBy =
          word.created_by === profile.id
            ? profile.display_name
            : word.created_by;
        if (
          q &&
          !headword.includes(q) &&
          !createdBy.toLocaleLowerCase().includes(q)
        )
          return false;
        if (gloss && !wordGloss(word).toLocaleLowerCase().includes(gloss))
          return false;
        if (query.kind && (isV2(word) ? "word" : word.kind) !== query.kind)
          return false;
        if (query.pos && !wordPos(word).includes(query.pos)) return false;
        if (query.level && !wordLevels(word).includes(query.level))
          return false;
        if (query.status && word.status !== query.status) return false;
        if (query.created_from && word.created_at < query.created_from)
          return false;
        if (query.created_to && word.created_at >= query.created_to)
          return false;
        return true;
      })
      .map((word) => ({
        schema_version: isV2(word) ? (2 as const) : word.schema_version,
        id: word.id,
        headword: displayHeadword(word),
        kind: isV2(word) ? "word" : word.kind,
        gloss: wordGloss(word),
        pos_list: wordPos(word),
        levels: wordLevels(word),
        status: word.status,
        ...(isV2(word) ? { max_reachable_step: word.max_reachable_step } : {}),
        created_by_name:
          word.created_by === profile.id
            ? profile.display_name
            : word.created_by,
        created_at: word.created_at,
        updated_at: word.updated_at
      }))
      .sort((left, right) => right.created_at.localeCompare(left.created_at));
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
    const words = Object.values(current.words);
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
    const { state: current } = context();
    const headword = input.headword.trim();
    if (input.language !== "en") {
      throw new HttpError(
        422,
        "unsupported language",
        [],
        "unsupported_language"
      );
    }
    if (!headword)
      throw new HttpError(400, "headword is required", [], "invalid_headword");
    if (headword.length > 200) {
      throw new HttpError(
        422,
        "headword cannot be normalized",
        [],
        "invalid_headword"
      );
    }
    if (headword.toLocaleLowerCase("en") === "server-error") {
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
    const dynamicDuplicates = duplicatesFor(current, [
      response.normalized_headword
    ]);
    if (dynamicDuplicates.length > 0) {
      response.smart_dictionary = {
        status: "duplicate",
        duplicates: dynamicDuplicates
      };
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
    if (input.source_dialect === input.target_dialect) {
      throw new HttpError(
        400,
        "dialects must differ",
        [],
        "invalid_dialect_pair"
      );
    }
    return {
      suggestions: input.items.map((item) => {
        if (item.field_kind === "form") {
          return {
            ...item,
            value: convertDialectText(
              item.value,
              input.source_dialect,
              input.target_dialect
            ),
            model_version: "mock-dialect-v1"
          };
        }
        const converted = convertDialectText(
          item.value.text,
          input.source_dialect,
          input.target_dialect
        );
        return {
          ...item,
          value:
            converted === item.value.text
              ? clone(item.value)
              : richText(converted),
          model_version: "mock-dialect-v1"
        };
      })
    };
  }

  async function create(
    input: AdminWordCreateInput
  ): Promise<AdminWordEnvelope> {
    await pause();
    const { profile, state: current } = context();
    const headword = input.headword.trim();
    if (!headword)
      throw new HttpError(400, "headword is required", [], "invalid_headword");
    const kind = input.kind ?? "word";
    const duplicate = Object.values(current.words).some(
      (word) =>
        (isV2(word) ? "word" : word.kind) === kind &&
        allHeadwords(word).some(
          (entry) =>
            entry.value.toLocaleLowerCase("en") ===
            headword.toLocaleLowerCase("en")
        )
    );
    if (duplicate) {
      throw new HttpError(409, "word already exists", [], "duplicate_word");
    }
    const timestamp = nextTimestamp(current);
    const word: AdminWord = {
      schema_version: 1,
      id: nextId(current, "legacy-word"),
      kind,
      headword,
      dialect_mode: "unified",
      dialects: [],
      status: "draft",
      created_by: profile.id,
      created_at: timestamp,
      updated_at: timestamp,
      sense_groups: [],
      pos: []
    };
    current.words[word.id] = word;
    persist(current);
    return { word: clone(word) };
  }

  async function createV2(
    input: CreateAdminWordV2Input
  ): Promise<AdminWordV2Envelope> {
    await pause();
    const { profile, state: current } = context();
    assertPayload(input);
    const existingWordId = current.create_idempotency[input.idempotency_key];
    if (existingWordId) {
      const existing = requireWord(current, existingWordId);
      if (
        !isV2(existing) ||
        existing.detection_snapshot.detection_id !== input.detection_id ||
        !equalHeadwords(existing.headwords, input.headwords)
      ) {
        throw new HttpError(
          409,
          "idempotency key reused",
          [],
          "idempotency_key_reused"
        );
      }
      return { word: clone(existing) };
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
    if (new Date(detection.expires_at).getTime() <= now().getTime()) {
      throw new HttpError(410, "detection expired", [], "detection_expired");
    }
    if (
      detection.entry_kind !== "word" ||
      detection.builtin_dictionary.status !== "matched" ||
      detection.matched_dialect === undefined ||
      detection.smart_dictionary.status !== "clear" ||
      !compatibleHeadwords(
        detection.builtin_dictionary.headwords,
        input.headwords
      )
    ) {
      const code =
        detection.smart_dictionary.status === "duplicate"
          ? "duplicate_word"
          : "detection_mismatch";
      throw new HttpError(
        code === "duplicate_word" ? 409 : 422,
        "detection cannot create a word",
        [],
        code
      );
    }
    const headwordValues =
      input.headwords.mode === "unified"
        ? [input.headwords.common]
        : [input.headwords.uk, input.headwords.us];
    if (duplicatesFor(current, headwordValues).length > 0) {
      throw new HttpError(409, "word already exists", [], "duplicate_word");
    }
    const wordId = nextId(current, "word-v2");
    const timestamp = nextTimestamp(current);
    const forms = clone(detection.builtin_dictionary.suggested_forms);
    alignBaseFormSpelling(forms, input.headwords);
    const word: AdminWordV2 = {
      schema_version: 2,
      id: wordId,
      language: "en",
      kind: "word",
      status: "draft",
      revision: 1,
      headwords: clone(input.headwords),
      detection_snapshot: {
        detection_id: detection.detection_id,
        request: clone(detection.request),
        normalized_headword: detection.normalized_headword,
        entry_kind: "word",
        matched_dialect: detection.matched_dialect,
        builtin_dictionary_status: "matched",
        smart_dictionary_status: "clear",
        headwords: clone(detection.builtin_dictionary.headwords),
        suggested_pos: forms.pos.map((entry) => entry.pos),
        detected_at: timestamp
      },
      forms,
      meanings: createInitialMeanings(
        forms,
        input.headwords,
        wordId,
        detection.normalized_headword === "large-fixture"
      ),
      completed_steps: ["basics"],
      max_reachable_step: "forms",
      created_by: profile.id,
      created_at: timestamp,
      updated_at: timestamp
    };
    current.words[word.id] = word;
    current.create_idempotency[input.idempotency_key] = word.id;
    persist(current);
    return { word: clone(word) };
  }

  async function get(wordId: string): Promise<AdminWordAnyEnvelope> {
    await pause();
    const { state: current } = context();
    const word = requireWord(current, wordId);
    return isV2(word) ? { word: clone(word) } : { word: clone(word) };
  }

  async function saveContent(
    wordId: string,
    input: AdminWordSaveInput
  ): Promise<AdminWordEnvelope> {
    await pause();
    const { state: current } = context();
    assertPayload(input);
    const existing = requireWord(current, wordId);
    if (isV2(existing)) {
      throw new HttpError(
        409,
        "V2 words use step endpoints",
        [],
        "schema_version_mismatch"
      );
    }
    if (existing.updated_at !== input.base_updated_at) {
      throw new HttpError(
        409,
        "word changed since it was loaded",
        [],
        "revision_conflict"
      );
    }
    const word: AdminWord = {
      ...existing,
      frequency: input.frequency || undefined,
      dialect_mode: input.dialect_mode,
      dialects: clone(input.dialects),
      sense_groups: clone(input.sense_groups),
      pos: clone(input.pos),
      updated_at: nextTimestamp(current)
    };
    current.words[word.id] = word;
    persist(current);
    return { word: clone(word) };
  }

  async function previewFormsImpact(
    wordId: string,
    input: PreviewFormsImpactInputV2
  ): Promise<PreviewFormsImpactResponseV2> {
    await pause();
    const { state: current } = context();
    assertPayload(input);
    const word = requireV2Draft(current, wordId);
    assertRevision(word, input.base_revision);
    const affected = meaningsForRemovedPos(word, input.content);
    if (affected.length === 0) {
      return {
        base_revision: word.revision,
        requires_confirmation: false,
        affected: []
      };
    }
    const token = nextId(current, "impact");
    current.impact_tokens[token] = {
      word_id: word.id,
      base_revision: word.revision,
      content_json: JSON.stringify(input.content),
      affected: clone(affected)
    };
    persist(current);
    return {
      base_revision: word.revision,
      requires_confirmation: true,
      affected: clone(affected),
      confirmation_token: token
    };
  }

  async function saveFormsStep(
    wordId: string,
    input: SaveFormsStepInput
  ): Promise<AdminWordV2Envelope> {
    await pause();
    const { state: current } = context();
    assertPayload(input);
    const prior = current.operations[input.operation_id];
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
    const affected = meaningsForRemovedPos(word, input.content);
    if (affected.length > 0) {
      const token = input.confirmed_impact_token
        ? current.impact_tokens[input.confirmed_impact_token]
        : undefined;
      if (
        !token ||
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
    const issues = validateForms(input.content, word.headwords);
    if (input.intent === "complete" && issues.length > 0) {
      throw new HttpError(
        422,
        "forms are incomplete",
        [],
        "validation_failed",
        issues,
        {
          word_id: word.id,
          current_revision: word.revision,
          max_reachable_step: word.max_reachable_step
        }
      );
    }
    const priorCompleted = new Set(word.completed_steps);
    word.forms = clone(input.content);
    const remaining = new Set(word.forms.pos.map((entry) => entry.pos_id));
    word.meanings.pos = word.meanings.pos.filter((entry) =>
      remaining.has(entry.pos_id)
    );
    for (const formsPos of word.forms.pos) {
      if (
        !word.meanings.pos.some((entry) => entry.pos_id === formsPos.pos_id)
      ) {
        word.meanings.pos.push(
          createInitialMeaningsForAddedPos(formsPos, word.headwords, word.id)
        );
      }
    }
    word.revision += 1;
    word.updated_at = nextTimestamp(current);
    reconcileProgress(word, current, "forms", input.intent, priorCompleted);
    const result = { word: clone(word) };
    current.operations[input.operation_id] = {
      kind: "forms",
      word_id: word.id,
      input_json: JSON.stringify(input),
      result: clone(result)
    };
    persist(current);
    return result;
  }

  async function saveMeaningsStep(
    wordId: string,
    input: SaveMeaningsStepInput
  ): Promise<AdminWordV2Envelope> {
    await pause();
    const { state: current } = context();
    assertPayload(input);
    const prior = current.operations[input.operation_id];
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
    if (
      !word.completed_steps.includes("forms") ||
      validateForms(word.forms, word.headwords).length > 0
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
    const issues = validateMeanings(word, input.content, current);
    if (input.intent === "complete" && issues.length > 0) {
      throw new HttpError(
        422,
        "meanings are incomplete",
        [],
        "validation_failed",
        issues,
        {
          word_id: word.id,
          current_revision: word.revision,
          max_reachable_step: word.max_reachable_step
        }
      );
    }
    const priorCompleted = new Set(word.completed_steps);
    word.meanings = clone(input.content);
    word.revision += 1;
    word.updated_at = nextTimestamp(current);
    reconcileProgress(word, current, "meanings", input.intent, priorCompleted);
    const result = { word: clone(word) };
    current.operations[input.operation_id] = {
      kind: "meanings",
      word_id: word.id,
      input_json: JSON.stringify(input),
      result: clone(result)
    };
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
    if (!isV2(word))
      throw new HttpError(409, "word is legacy", [], "schema_version_mismatch");
    assertRevision(word, input.base_revision);
    const issues = [
      ...validateForms(word.forms, word.headwords),
      ...validateMeanings(word, word.meanings, current)
    ];
    return {
      validated_revision: word.revision,
      valid: issues.length === 0,
      issues
    };
  }

  async function publish(wordId: string): Promise<AdminWordEnvelope> {
    await pause();
    const { state: current } = context();
    const existing = requireWord(current, wordId);
    if (isV2(existing)) {
      throw new HttpError(
        409,
        "V2 words require revision",
        [],
        "schema_version_mismatch"
      );
    }
    const details = v1PublishIssues(existing);
    if (details.length > 0) {
      throw new HttpError(
        422,
        "word is incomplete",
        details,
        "word_incomplete"
      );
    }
    if (existing.status !== "published") {
      existing.status = "published";
      existing.updated_at = nextTimestamp(current);
      persist(current);
    }
    return { word: clone(existing) };
  }

  async function publishV2(
    wordId: string,
    input: PublishAdminWordV2Input
  ): Promise<AdminWordV2Envelope> {
    await pause();
    const { state: current } = context();
    const publishedWordId = current.publish_idempotency[input.idempotency_key];
    if (publishedWordId) {
      if (publishedWordId !== wordId) {
        throw new HttpError(
          409,
          "idempotency key reused for another word",
          [],
          "idempotency_key_reused"
        );
      }
      const published = requireWord(current, publishedWordId);
      if (!isV2(published) || input.base_revision !== published.revision - 1) {
        throw new HttpError(
          409,
          "idempotency key reused",
          [],
          "idempotency_key_reused"
        );
      }
      return { word: clone(published) };
    }
    const word = requireV2Draft(current, wordId);
    assertRevision(word, input.base_revision);
    const issues = [
      ...validateForms(word.forms, word.headwords),
      ...validateMeanings(word, word.meanings, current)
    ];
    if (issues.length > 0) {
      throw new HttpError(
        422,
        "word is incomplete",
        [],
        "validation_failed",
        issues,
        {
          word_id: word.id,
          current_revision: word.revision,
          max_reachable_step: word.max_reachable_step
        }
      );
    }
    word.status = "published";
    word.revision += 1;
    word.updated_at = nextTimestamp(current);
    word.published_at = word.updated_at;
    current.publish_idempotency[input.idempotency_key] = word.id;
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
    return { word: clone(word) };
  }

  async function remove(wordId: string): Promise<void> {
    await pause();
    const { state: current } = context();
    if (!current.words[wordId])
      throw new HttpError(404, "word not found", [], "word_not_found");
    delete current.words[wordId];
    persist(current);
  }

  async function batchDelete(
    ids: string[]
  ): Promise<AdminWordBatchDeleteResponse> {
    await pause();
    const { state: current } = context();
    if (ids.length > 100) {
      throw new HttpError(413, "at most 100 word ids", [], "payload_too_large");
    }
    let deleted = 0;
    for (const id of new Set(ids)) {
      if (current.words[id]) {
        delete current.words[id];
        deleted += 1;
      }
    }
    if (deleted > 0) persist(current);
    return { deleted };
  }

  async function relatedSearch(
    q: string,
    opts?: { kind?: "word" | "phrase"; limit?: number }
  ): Promise<RelatedSearchResponse> {
    await pause();
    const { state: current } = context();
    const query = q.trim().toLocaleLowerCase("en");
    if (!query) return { results: [] };
    const limit = Math.min(100, Math.max(1, opts?.limit ?? 20));
    const results = Object.values(current.words)
      .filter((word) => {
        const kind = isV2(word) ? "word" : word.kind;
        return (
          word.status === "published" &&
          (!opts?.kind || kind === opts.kind) &&
          displayHeadword(word).toLocaleLowerCase("en").includes(query)
        );
      })
      .map((word) => {
        const senses: RelatedWordSense[] = isV2(word)
          ? word.meanings.pos.flatMap((pos) =>
              pos.senses.map((sense) => ({
                sense_id: sense.id,
                gloss:
                  sense.definitions
                    .map(v2ChineseDefinition)
                    .find((entry) => entry.trim() !== "") ?? ""
              }))
            )
          : word.pos.flatMap((pos) =>
              pos.senses.map((sense) => ({
                sense_id: sense.id,
                gloss:
                  sense.definitions.find((entry) => entry.def_type === "zh")
                    ?.text.text ?? ""
              }))
            );
        return {
          word_id: word.id,
          headword: displayHeadword(word),
          kind: isV2(word) ? ("word" as const) : word.kind,
          senses
        };
      })
      .slice(0, limit);
    return { results: clone(results) };
  }

  function clearSession(): void {
    if (activeProfileId) persistedStorage.clear(activeProfileId);
    activeProfileId = undefined;
    state = undefined;
  }

  return {
    list,
    stats,
    detect,
    suggestDialectVariants,
    create,
    createV2,
    get,
    saveContent,
    previewFormsImpact,
    saveFormsStep,
    saveMeaningsStep,
    validateV2,
    publish,
    publishV2,
    remove,
    batchDelete,
    relatedSearch,
    clearSession
  };
}

export type AdminWordsMock = ReturnType<typeof createAdminWordsMock>;

/** Test helper for making the generated empty meanings publishable without UI mapping. */
export function completeMockMeanings(
  word: AdminWordV2,
  content: DraftMeaningsStepContent = clone(word.meanings)
): DraftMeaningsStepContent {
  const fillPos = (pos: WordPosMeaningsV2): WordPosMeaningsV2 => ({
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
      sub_pos: sense.sub_pos || "N-COUNT",
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
                    value: richText(`A ${displayHeadword(word)} example.`),
                    origin: "manual"
                  }
                },
                us: {
                  state: "ready",
                  variant: {
                    value: richText(`A ${displayHeadword(word)} example.`),
                    origin: "manual"
                  }
                }
              },
        zh_text: richText("这是一个测试例句。")
      }))
    }))
  });
  return {
    sense_groups: clone(content.sense_groups),
    pos: content.pos.map(fillPos)
  };
}
