import type { AdminWordV2, Dialect, RichText } from "@tsz/types";
import type {
  LinkedSentenceAssociationV1,
  PendingSentenceAssociationV1,
  ResolveSentenceAssociationInput,
  ResolveSentenceAssociationResponse,
  SentenceAssociationV1,
  SentenceFormCandidateV1,
  SentenceSourceRangeV1,
  SharedWordSentenceV1
} from "./sentenceAssociationTypes";

export type SourceRangeSelectionResult =
  { ok: true; range: SentenceSourceRangeV1 } | { ok: false; error: string };

export type AddSentenceAssociationResult = {
  status: "added" | "duplicate" | "position_conflict";
  associations: SentenceAssociationV1[];
};

const ENGLISH_WORD = /^[A-Za-z]+(?:['‘’\-‐‑‒–—―][A-Za-z]+)*$/u;
const ENGLISH_WORD_CONTINUATION = /^[A-Za-z'‘’\-‐‑‒–—―]$/u;
const CEFR_LEVELS = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);
const APOSTROPHES = /[‘’]/gu;
const HYPHENS = /[‐‑‒–—―]/gu;

function codePointOffsets(text: string): number[] {
  const offsets = [0];
  let utf16Offset = 0;
  for (const codePoint of text) {
    utf16Offset += codePoint.length;
    offsets.push(utf16Offset);
  }
  return offsets;
}

export function selectionToSourceRange(
  text: string,
  selectionStart: number,
  selectionEnd: number
): SourceRangeSelectionResult {
  if (
    !Number.isInteger(selectionStart) ||
    !Number.isInteger(selectionEnd) ||
    selectionStart < 0 ||
    selectionEnd < selectionStart ||
    selectionEnd > text.length
  ) {
    return { ok: false, error: "选区超出原文范围" };
  }
  if (selectionStart === selectionEnd) {
    return { ok: false, error: "请选择一个单词" };
  }
  const offsets = codePointOffsets(text);
  const start = offsets.indexOf(selectionStart);
  const end = offsets.indexOf(selectionEnd);
  if (start < 0 || end < 0) {
    return { ok: false, error: "选区边界不能切开 Unicode 字符" };
  }
  const surface = text.slice(selectionStart, selectionEnd);
  if (surface.trim() !== surface) {
    return { ok: false, error: "选区不能包含首尾空白" };
  }
  if (!ENGLISH_WORD.test(surface)) {
    return { ok: false, error: "一期只支持连续的单个英文单词" };
  }
  const codePoints = Array.from(text);
  if (
    (start > 0 && ENGLISH_WORD_CONTINUATION.test(codePoints[start - 1]!)) ||
    (end < codePoints.length &&
      ENGLISH_WORD_CONTINUATION.test(codePoints[end]!))
  ) {
    return { ok: false, error: "请选择完整的英文单词" };
  }
  return { ok: true, range: { start, end, surface } };
}

export function normalizePendingWord(value: string): string {
  return value
    .normalize("NFKC")
    .replace(APOSTROPHES, "'")
    .replace(HYPHENS, "-")
    .trim()
    .toLocaleLowerCase("en");
}

export function pendingAssociationKey(
  sentenceId: string,
  association: Pick<
    PendingSentenceAssociationV1,
    "source_range" | "pending_word" | "normalized_pending_word"
  >
): string {
  const normalized =
    association.normalized_pending_word ||
    normalizePendingWord(association.pending_word);
  const { start, end } = association.source_range;
  return `${sentenceId}\0${start}:${end}\0${normalized}`;
}

function rangesOverlap(
  left: SentenceSourceRangeV1,
  right: SentenceSourceRangeV1
): boolean {
  return left.start < right.end && right.start < left.end;
}

export function addSentenceAssociation(
  sentenceId: string,
  associations: SentenceAssociationV1[],
  candidate: SentenceAssociationV1
): AddSentenceAssociationResult {
  if (candidate.state === "legacy_unpositioned") {
    return { status: "added", associations: [...associations, candidate] };
  }
  if (
    candidate.state === "pending" &&
    associations.some(
      (item) =>
        item.state === "pending" &&
        pendingAssociationKey(sentenceId, item) ===
          pendingAssociationKey(sentenceId, candidate)
    )
  ) {
    return { status: "duplicate", associations };
  }
  if (
    associations.some(
      (item) =>
        item.state !== "legacy_unpositioned" &&
        rangesOverlap(item.source_range, candidate.source_range)
    )
  ) {
    return { status: "position_conflict", associations };
  }
  return { status: "added", associations: [...associations, candidate] };
}

/** Mock 保存的最终防线：保留第一个有效状态，去掉同业务键或同位置重复项。 */
export function normalizeSentenceAssociations(
  sentenceId: string,
  associations: SentenceAssociationV1[]
): SentenceAssociationV1[] {
  let normalized: SentenceAssociationV1[] = [];
  for (const association of associations) {
    const candidate =
      association.state === "pending"
        ? {
            ...association,
            normalized_pending_word: normalizePendingWord(
              association.pending_word
            )
          }
        : association;
    const result = addSentenceAssociation(sentenceId, normalized, candidate);
    normalized = result.associations;
  }
  return normalized;
}

export function sharedSentenceIssueField(
  sentence: SharedWordSentenceV1
): "id" | "level" | "en_text" | "zh_text" | "associations" | undefined {
  if (!sentence.id || !sentence.en_text_id || !sentence.zh_text_id) return "id";
  if (!CEFR_LEVELS.has(sentence.level)) return "level";
  if (!sentence.en_text.text.trim()) return "en_text";
  if (!sentence.zh_text.text.trim()) return "zh_text";
  if (sentence.associations.length === 0) return "associations";
  if (
    new Set(sentence.associations.map((association) => association.id)).size !==
    sentence.associations.length
  ) {
    return "associations";
  }
  let accepted: SentenceAssociationV1[] = [];
  const codePoints = Array.from(sentence.en_text.text);
  for (const association of sentence.associations) {
    if (association.state === "legacy_unpositioned") {
      if (!association.target_word_id || !association.target_sense_id) {
        return "associations";
      }
      accepted.push(association);
      continue;
    }
    const { start, end, surface } = association.source_range;
    if (
      start < 0 ||
      end <= start ||
      end > codePoints.length ||
      codePoints.slice(start, end).join("") !== surface ||
      !ENGLISH_WORD.test(surface) ||
      (start > 0 && ENGLISH_WORD_CONTINUATION.test(codePoints[start - 1]!)) ||
      (end < codePoints.length &&
        ENGLISH_WORD_CONTINUATION.test(codePoints[end]!))
    ) {
      return "associations";
    }
    if (
      (association.state === "linked" &&
        (!association.target_word_id ||
          !association.target_sense_id ||
          !association.form_slot_id)) ||
      (association.state === "pending" &&
        !normalizePendingWord(association.pending_word))
    ) {
      return "associations";
    }
    const result = addSentenceAssociation(sentence.id, accepted, association);
    if (result.status !== "added") return "associations";
    accepted = result.associations;
  }
  return undefined;
}

export function deriveSharedSentencesForSense(
  sentences: SharedWordSentenceV1[],
  targetSenseId: string
): SharedWordSentenceV1[] {
  return sentences
    .flatMap((sentence) => {
      const orders = sentence.associations.flatMap((association) =>
        association.state !== "pending" &&
        association.target_sense_id === targetSenseId
          ? [association.sort_order]
          : []
      );
      return orders.length > 0
        ? [{ sentence, sortOrder: Math.min(...orders) }]
        : [];
    })
    .sort(
      (left, right) =>
        left.sortOrder - right.sortOrder ||
        left.sentence.id.localeCompare(right.sentence.id)
    )
    .map(({ sentence }) => sentence);
}

function dialectSpelling(
  association: LinkedSentenceAssociationV1,
  dialect: Exclude<Dialect, "common">
): string | undefined {
  return (
    association.form_variants?.find((item) => item.dialect === dialect)
      ?.spelling ??
    association.form_variants?.find((item) => item.dialect === "common")
      ?.spelling
  );
}

export function renderSharedSentence(
  sentence: SharedWordSentenceV1,
  dialect: Exclude<Dialect, "common">
): { text: string; missing_association_ids: string[] } {
  const codePoints = Array.from(sentence.en_text.text);
  const replacements: Array<{
    start: number;
    end: number;
    spelling: string;
  }> = [];
  const missingAssociationIds: string[] = [];
  for (const association of sentence.associations) {
    if (association.state !== "linked") continue;
    const spelling = dialectSpelling(association, dialect);
    if (!spelling) {
      missingAssociationIds.push(association.id);
      continue;
    }
    const { start, end, surface } = association.source_range;
    if (
      start < 0 ||
      end <= start ||
      end > codePoints.length ||
      codePoints.slice(start, end).join("") !== surface
    ) {
      missingAssociationIds.push(association.id);
      continue;
    }
    replacements.push({ start, end, spelling });
  }
  replacements.sort((left, right) => right.start - left.start);
  for (const replacement of replacements) {
    codePoints.splice(
      replacement.start,
      replacement.end - replacement.start,
      ...Array.from(replacement.spelling)
    );
  }
  return {
    text: codePoints.join(""),
    missing_association_ids: missingAssociationIds
  };
}

function replaceRichTextText(value: RichText, text: string): RichText {
  return value.version === 2
    ? { ...value, text, annotations: [] }
    : { ...value, text, spans: [], liaisons: [] };
}

export function prepareSharedSentenceTextChange(
  sentence: SharedWordSentenceV1,
  text: string
): {
  sentence: SharedWordSentenceV1;
  affected: { linked: number; pending: number };
  reannotation_suggestions: Array<
    LinkedSentenceAssociationV1 | PendingSentenceAssociationV1
  >;
} {
  if (sentence.en_text.text === text) {
    return {
      sentence,
      affected: { linked: 0, pending: 0 },
      reannotation_suggestions: []
    };
  }
  const positioned = sentence.associations.filter(
    (
      association
    ): association is
      LinkedSentenceAssociationV1 | PendingSentenceAssociationV1 =>
      association.state !== "legacy_unpositioned"
  );
  return {
    sentence: {
      ...sentence,
      en_text: replaceRichTextText(sentence.en_text, text),
      associations: sentence.associations.filter(
        (association) => association.state === "legacy_unpositioned"
      )
    },
    affected: {
      linked: positioned.filter((item) => item.state === "linked").length,
      pending: positioned.filter((item) => item.state === "pending").length
    },
    reannotation_suggestions: positioned
  };
}

export function canonicalSharedSentences(
  sentences: SharedWordSentenceV1[]
): SharedWordSentenceV1[] {
  return sentences.map((sentence) => ({
    id: sentence.id,
    level: sentence.level,
    en_text_id: sentence.en_text_id,
    en_text: sentence.en_text,
    zh_text_id: sentence.zh_text_id,
    zh_text: sentence.zh_text,
    associations: sentence.associations.map((association) => {
      if (association.state === "legacy_unpositioned") {
        return {
          id: association.id,
          state: association.state,
          target_word_id: association.target_word_id,
          target_sense_id: association.target_sense_id,
          legacy_role: association.legacy_role,
          sort_order: association.sort_order
        };
      }
      if (association.state === "pending") {
        return {
          id: association.id,
          state: association.state,
          source_range: association.source_range,
          pending_word: association.pending_word
        };
      }
      return {
        id: association.id,
        state: association.state,
        source_range: association.source_range,
        target_word_id: association.target_word_id,
        target_sense_id: association.target_sense_id,
        form_slot_id: association.form_slot_id,
        sort_order: association.sort_order
      };
    })
  }));
}

function rangeMatchesText(text: string, range: SentenceSourceRangeV1): boolean {
  const codePoints = Array.from(text);
  return (
    range.start >= 0 &&
    range.end > range.start &&
    range.end <= codePoints.length &&
    codePoints.slice(range.start, range.end).join("") === range.surface
  );
}

function formCandidatesForSense(
  word: AdminWordV2,
  targetSenseId: string,
  surface: string
): SentenceFormCandidateV1[] {
  const meaningPos = word.meanings.pos.find((pos) =>
    pos.senses.some((sense) => sense.id === targetSenseId)
  );
  const formsPos = word.forms.pos.find(
    (pos) => pos.pos_id === meaningPos?.pos_id
  );
  if (!formsPos) return [];
  const slots = [
    formsPos.base_form,
    ...formsPos.form_groups.flatMap((group) => group.slots)
  ];
  const normalizedSurface = normalizePendingWord(surface);
  return slots.flatMap((slot) => {
    const matches = slot.variants.some(
      (variant) => normalizePendingWord(variant.spelling) === normalizedSurface
    );
    if (!matches) return [];
    return [
      {
        pos_id: formsPos.pos_id,
        pos: formsPos.pos,
        form_slot_id: slot.id,
        form_type: slot.form_type,
        variants: slot.variants.map((variant) => ({
          dialect: variant.dialect,
          spelling: variant.spelling
        }))
      }
    ];
  });
}

/** 开发 mock 的权威解析器；真实环境必须改由后端 resolver 执行。 */
export function resolveSentenceAssociationFromWord(
  input: ResolveSentenceAssociationInput,
  publishedWord: AdminWordV2,
  options: { allowDraft?: boolean } = {}
): ResolveSentenceAssociationResponse {
  if (
    (publishedWord.status !== "published" && !options.allowDraft) ||
    publishedWord.id !== input.target_word_id ||
    !rangeMatchesText(input.en_text.text, input.source_range)
  ) {
    return { resolution: "unmatched", candidates: [] };
  }
  const candidates = formCandidatesForSense(
    publishedWord,
    input.target_sense_id,
    input.source_range.surface
  );
  if (candidates.length === 0) {
    return { resolution: "unmatched", candidates: [] };
  }
  if (candidates.length === 1) {
    return { resolution: "resolved", candidate: candidates[0]! };
  }
  return { resolution: "ambiguous", candidates };
}
