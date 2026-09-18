import type {
  AdminWordV3,
  SentenceTarget,
  SentenceEntryTarget,
  SharedSentenceAnnotation,
  SentenceSourceRangeV3
} from "@tsz/types";
import {
  associationWords,
  codePointSlice,
  rangesOverlap,
  wordSegments
} from "@tsz/voice-editor/core";

// Mirrors the backend's versioned headword normalization for immediate feedback.
export const normalizeSentenceSurface = (text: string) =>
  text
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .replace(/[‘’ʼ]/gu, "'")
    .replace(/[‐‑‒–—−]/gu, "-")
    .toLowerCase();

export function matchesSentenceTarget(
  text: string,
  segments: SentenceSourceRangeV3[],
  dialect: string,
  target: SentenceEntryTarget
): boolean {
  const words = associationWords(text);
  if (
    !segments.length ||
    segments.some(
      (segment, index) =>
        segment.start < (segments[index - 1]?.end ?? 0) ||
        codePointSlice(text, segment.start, segment.end) !== segment.surface ||
        !words.some((word) => word.start === segment.start) ||
        !words.some((word) => word.end === segment.end)
    )
  )
    return false;
  if (
    /[.!?;:\n\r。！？；：]/u.test(
      codePointSlice(text, segments[0]!.start, segments.at(-1)!.end)
    )
  )
    return false;
  const literal = segments.map((segment) => segment.surface).join(" ");
  if (target.kind === "word" && associationWords(literal).length !== 1)
    return false;
  return target.surfaces.some(
    (form) =>
      (dialect === "common" || form.dialect === dialect) &&
      normalizeSentenceSurface(form.surface) ===
        normalizeSentenceSurface(literal)
  );
}

export function currentSentenceCandidates(
  text: string,
  dialect: string,
  target: SentenceEntryTarget,
  annotations: SharedSentenceAnnotation[]
): SentenceSourceRangeV3[][] {
  const words = associationWords(text);
  const result: SentenceSourceRangeV3[][] = [];
  const lengths = new Set(
    target.surfaces.map((form) => associationWords(form.surface).length)
  );
  for (let start = 0; start < words.length; start++) {
    for (const length of lengths) {
      if (!length || start + length > words.length) continue;
      const segments = wordSegments(text, words.slice(start, start + length));
      if (
        matchesSentenceTarget(text, segments, dialect, target) &&
        !annotations.some(
          (a) =>
            a.source_dialect === dialect &&
            rangesOverlap(a.source_segments, segments)
        )
      )
        result.push(segments);
    }
  }
  return result;
}

export function savedSenseTargets(word: AdminWordV3, senseId: string) {
  const pos = word.meanings.pos.find((row) =>
    row.senses.some((sense) => sense.id === senseId)
  );
  const sense = pos?.senses.find((item) => item.id === senseId);
  const forms = word.forms.pos.find((row) => row.pos_id === pos?.pos_id);
  if (!sense || !forms) return [];
  const definition = sense.definitions.find(
    (item) =>
      item.definition_mode === "zh_definition" ||
      item.definition_mode === "zh_sentence"
  );
  const gloss =
    definition?.definition_mode === "zh_definition" ||
    definition?.definition_mode === "zh_sentence"
      ? definition.content.text
      : "暂无释义";
  return forms.forms.flatMap((form) => {
    const bases =
      form.form_type === "base"
        ? [form]
        : forms.forms.filter(
            (base) =>
              base.form_type === "base" &&
              forms.form_groups.some(
                (group) =>
                  group.members.some((member) => member.form_id === base.id) &&
                  group.members.some((member) => member.form_id === form.id)
              )
          );
    const variants =
      form.regional_variants.mode === "common"
        ? [form.regional_variants.common]
        : [form.regional_variants.uk, form.regional_variants.us];
    return bases.flatMap((base) =>
      variants.map((variant) => ({
        target: {
          state: "linked",
          target_entry_id: word.id,
          target_pos_id: forms.pos_id,
          target_base_form_id: base.id,
          target_form_id: form.id,
          target_variant_id: variant.id,
          target_dialect: variant.dialect,
          target_sense_id: senseId
        } satisfies Extract<SentenceTarget, { state: "linked" }>,
        gloss,
        surface: {
          id: word.id,
          headword: variant.spelling,
          kind: word.kind,
          surfaces: (variant.dialect === "common"
            ? ["uk", "us"]
            : [variant.dialect]
          ).map((dialect) => ({ dialect, surface: variant.spelling }))
        } satisfies SentenceEntryTarget
      }))
    );
  });
}

/**
 * 两个引用是否指向同一个「词形 + 方言侧」。
 *
 * 变体实例 id 会随「英美通用 ↔ 英/美」结构切换而换（TASK#58 解锁后这是常态路径），所以 id
 * 不等时改按方言侧判：`target_dialect` 优先——自 TASK#58 起新引用都会写入；缺字段的存量引用用
 * `fallbackDialect`（通常是标注的 `source_dialect`）——它在上层是宽松的 `string`，取值与
 * `Dialect` 同口径。方言侧判定与后端 `shared_target_matches` 对齐：common 引用可落到任一侧，
 * uk/us 只认同侧。（拼写比对不在本函数，由调用方的 `matchesSentenceTarget` 按 `source_dialect`
 * 完成；方言与拼写侧不一致的异常数据下前端比后端更保守：可能漏认，不会误认。）
 */
function sameVariantCoordinate(
  left: Extract<SentenceTarget, { state: "linked" }>,
  right: Extract<SentenceTarget, { state: "linked" }>,
  fallbackDialect?: string
): boolean {
  if (left.target_variant_id === right.target_variant_id) return true;
  const leftSide = left.target_dialect ?? fallbackDialect;
  const rightSide = right.target_dialect ?? fallbackDialect;
  if (leftSide === undefined || rightSide === undefined) return false;
  return (
    leftSide === "common" || rightSide === "common" || leftSide === rightSide
  );
}

export function sameSentenceTarget(
  left: SentenceTarget,
  right: SentenceTarget,
  fallbackDialect?: string
) {
  return (
    left.state === "linked" &&
    right.state === "linked" &&
    left.target_entry_id === right.target_entry_id &&
    left.target_sense_id === right.target_sense_id &&
    left.target_pos_id === right.target_pos_id &&
    left.target_base_form_id === right.target_base_form_id &&
    left.target_form_id === right.target_form_id &&
    sameVariantCoordinate(left, right, fallbackDialect)
  );
}
