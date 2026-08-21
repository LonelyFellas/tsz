// 词条录入的体积与长度预检，1:1 镜像后端 tsz-rust `docs/frontend-integration.md` §13。
//
// 分两类：
//   - 富文本长度 / 标注数 / IPA / 停顿：后端不给专门的错误码，超限只会并入所在字段的
//     既有码（grammar_variants_invalid / definition_invalid / sentence_incomplete），
//     管理员看不出「因为太长」，只能反复试错，所以必须前端先拦。
//   - 节点数与请求体字节数：后端有明确信号（aggregate_node_limit_exceeded / 413），
//     本地拦只是不让管理员白等一次往返。
import type {
  Dialect,
  DraftFormsStepContent,
  DraftMeaningsStepContent,
  EnglishTextV2,
  RichText,
  WordFormVariantV2
} from "@tsz/types";
import { HttpError } from "@tsz/api-client/http";
import { richTextLimitIssues } from "@tsz/voice-editor/core";
import { DIALECT_SHORT_LABEL } from "../editorConstants";

/**
 * 承载整步草稿内容的请求体上限（后端 `MAX_STEP_CONTENT_BODY_BYTES`）：
 * 2000 节点 × 4 KiB。**不是 8 MiB** —— 8 MiB 是 8,388,608，比真实上限多 196,608 字节，
 * 按 8 MiB 预检会放过一批服务端仍要 413 的请求，等于白做预检。
 * 上限是闭区间：恰好等于上限会被接受，所以判定用 `>` 而非 `>=`。
 */
export const STEP_CONTENT_BODY_LIMIT = 8_192_000;

/**
 * 单个词条的内容节点上限（后端 `MAX_ENTRY_NODES`）。
 *
 * 注意与对接文档 §13.1 的表述不符：文档写「forms 与 meanings 各自独立计数」，
 * 但后端 `validate_node_limit` 实际拿 `proposed_nodes(forms, meanings)` 的**合计**
 * 与 2000 比较（`src/lexicon/service/editing.rs`）。这里按实现口径做合计，
 * 按文档做各自独立会在「两步各 1200」时漏拦。
 */
export const MAX_ENTRY_CONTENT_NODES = 2000;

/** 413 的统一文案：是「内容过大」而不是「格式错误」，两者的处置动作完全不同。 */
export const PAYLOAD_TOO_LARGE_MESSAGE = "内容过大，请拆分后分次保存";

export interface ContentLimitIssue {
  /** 稳定节点 ID，供保存失败后跳回并聚焦到出问题的节点。 */
  node_id: string;
  field: string;
  message: string;
}

function dialectSuffix(dialect: Dialect): string {
  return dialect === "common" ? "" : `（${DIALECT_SHORT_LABEL[dialect]}）`;
}

/** 英语文本按当前方言模式展开成「方言 → 富文本」；未就绪的槽位不参与校验。 */
function englishTextEntries(value: EnglishTextV2): [Dialect, RichText][] {
  if (value.mode === "unified") return [["common", value.common.value]];
  return (["uk", "us"] as const).flatMap<[Dialect, RichText]>((dialect) => {
    const slot = value[dialect];
    return slot.state === "ready" ? [[dialect, slot.variant.value]] : [];
  });
}

/**
 * 逐段富文本按 §13.1 预检。只有第 3 步（词义与例句）含富文本，
 * 第 2 步的拼写与音标是纯字符串，已由 `formsValidation` 按 200 码点拦。
 */
export function meaningsContentLimitIssues(
  content: DraftMeaningsStepContent
): ContentLimitIssue[] {
  const issues: ContentLimitIssue[] = [];
  const collect = (
    node_id: string,
    field: string,
    where: string,
    value: RichText
  ) => {
    for (const issue of richTextLimitIssues(value)) {
      issues.push({ node_id, field, message: `${where}：${issue.message}` });
    }
  };

  content.pos.forEach((pos, posIndex) => {
    // 只有一个词性时不加词性前缀,避免每条提示都顶着一个恒为 1 的序号。
    const at = content.pos.length > 1 ? `词性 ${posIndex + 1} · ` : "";
    pos.grammar_structures.forEach((grammar, grammarIndex) => {
      for (const variant of grammar.variants) {
        collect(
          grammar.id,
          "content",
          `${at}语法结构 ${grammarIndex + 1}${dialectSuffix(variant.dialect)}`,
          variant.content
        );
      }
    });
    pos.senses.forEach((sense, senseIndex) => {
      const senseAt = `${at}词义 ${senseIndex + 1}`;
      sense.definitions.forEach((definition, definitionIndex) => {
        const where = `${senseAt} · 释义 ${definitionIndex + 1}`;
        if (definition.definition_mode.startsWith("zh_")) {
          collect(
            definition.id,
            "content",
            where,
            definition.content as RichText
          );
          return;
        }
        for (const [dialect, value] of englishTextEntries(
          definition.content as EnglishTextV2
        )) {
          collect(
            definition.id,
            "content",
            `${where}${dialectSuffix(dialect)}`,
            value
          );
        }
      });
      sense.sentences.forEach((sentence, sentenceIndex) => {
        const where = `${senseAt} · 例句 ${sentenceIndex + 1}`;
        for (const [dialect, value] of englishTextEntries(sentence.en_text)) {
          collect(
            sentence.id,
            "sentence",
            `${where}英文${dialectSuffix(dialect)}`,
            value
          );
        }
        collect(sentence.id, "zh_text", `${where}汉语译文`, sentence.zh_text);
      });
    });
  });
  return issues;
}

function variantNodeCount(variants: WordFormVariantV2[]): number {
  return variants.reduce(
    (count, variant) => count + 1 + variant.pronunciations.length,
    0
  );
}

/** 镜像后端 `proposed_nodes` 的 forms 侧：pos、词形槽位、方言变体、读音各算一个节点。 */
export function formsContentNodeCount(forms: DraftFormsStepContent): number {
  return forms.pos.reduce((total, pos) => {
    const derived = pos.form_groups.reduce(
      (count, group) =>
        count +
        1 +
        group.slots.reduce(
          (slotCount, slot) => slotCount + 1 + variantNodeCount(slot.variants),
          0
        ),
      0
    );
    return total + 1 + 1 + variantNodeCount(pos.base_form.variants) + derived;
  }, 0);
}

/** 镜像后端 `proposed_nodes` 的 meanings 侧；meanings 的 pos 本身不是节点。 */
export function meaningsContentNodeCount(
  meanings: DraftMeaningsStepContent
): number {
  let count = meanings.sense_groups.length;
  for (const pos of meanings.pos) {
    for (const grammar of pos.grammar_structures) {
      count += 1 + grammar.variants.length;
    }
    for (const sense of pos.senses) {
      count += 1 + sense.relations.length;
      for (const definition of sense.definitions) {
        count +=
          1 +
          (definition.definition_mode.startsWith("zh_")
            ? 1
            : englishTextEntries(definition.content as EnglishTextV2).length);
      }
      for (const sentence of sense.sentences) {
        count += 2 + englishTextEntries(sentence.en_text).length;
      }
    }
  }
  return count;
}

export function entryContentNodeIssue(
  forms: DraftFormsStepContent,
  meanings: DraftMeaningsStepContent
): string | undefined {
  const formsNodes = formsContentNodeCount(forms);
  const meaningsNodes = meaningsContentNodeCount(meanings);
  const total = formsNodes + meaningsNodes;
  if (total <= MAX_ENTRY_CONTENT_NODES) return undefined;
  return (
    `本词条共 ${total} 个内容节点（词形 ${formsNodes} + 词义 ${meaningsNodes}），` +
    `超出单个词条上限 ${MAX_ENTRY_CONTENT_NODES}，` +
    `请删减 ${total - MAX_ENTRY_CONTENT_NODES} 个节点（词义、例句或派生词形）后再保存`
  );
}

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(2)} MB`
    : `${Math.ceil(bytes / 1024)} KB`;
}

/** 量的是序列化后的字节数，不是字符数——中文一个字就是 3 字节。 */
export function stepContentByteSize(payload: unknown): number {
  return new TextEncoder().encode(JSON.stringify(payload)).byteLength;
}

export function stepContentBodyIssue(payload: unknown): string | undefined {
  const bytes = stepContentByteSize(payload);
  if (bytes <= STEP_CONTENT_BODY_LIMIT) return undefined;
  // 主数字给精确字节：上限本身是 7.81 MB，只报四舍五入的兆字节会让「本次提交 7.81 MB，
  // 超出上限 7.81 MB」看起来自相矛盾，管理员也判断不出还差多少。
  return (
    `本次提交 ${bytes} 字节（约 ${formatBytes(bytes)}），超出单步保存上限 ` +
    `${STEP_CONTENT_BODY_LIMIT} 字节，需删减 ` +
    `${bytes - STEP_CONTENT_BODY_LIMIT} 字节后分次保存`
  );
}

/**
 * 413：请求体超过路由上限。与「JSON 格式错」「DTO 形状错」互不混淆，
 * 不能落进「格式错误」分支——管理员该做的是拆分内容，不是检查格式。
 */
export function payloadTooLargeMessage(error: unknown): string | undefined {
  return error instanceof HttpError &&
    (error.status === 413 || error.code === "payload_too_large")
    ? PAYLOAD_TOO_LARGE_MESSAGE
    : undefined;
}
