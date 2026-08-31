import type { AdminWordV3 } from "@tsz/types";

export type V3ReviewStatus =
  "draft" | "published" | "published_dirty" | "archived";

export interface V3ReviewModel {
  identity: {
    label: string;
    kindLabel: "单词" | "短语";
    languageLabel: "English 英语";
  };
  state: {
    status: V3ReviewStatus;
    statusLabel: string;
    primaryAction: "edit" | "validate" | "none";
  };
  summary: {
    posCount: number;
    baseCount: number;
    formCount: number;
    pronunciationCount: number;
    senseCount: number;
    sentenceCount: number;
    relationCount: number;
  };
}

/**
 * 原形的拼写身份：英美两侧规范化后拼在一起，common 视作两侧同值，
 * 好让「同一个词的多套变化范式」共用的原形只数一次。两侧都空的原形还没有
 * 身份，跟着后端 presentation 投影的口径一并跳过。
 */
function baseSpellingKey(
  form: AdminWordV3["forms"]["pos"][number]["forms"][number]
): string | undefined {
  const spellings =
    form.regional_variants.mode === "common"
      ? [
          form.regional_variants.common.spelling,
          form.regional_variants.common.spelling
        ]
      : [
          form.regional_variants.uk.spelling,
          form.regional_variants.us.spelling
        ];
  const key = spellings
    .map((spelling) => spelling.trim().toLowerCase())
    .join("|");
  return key === "|" ? undefined : key;
}

export function buildV3ReviewModel(word: AdminWordV3): V3ReviewModel {
  const forms = word.forms.pos.flatMap((pos) => pos.forms);
  const pronunciations = forms.flatMap((form) =>
    form.regional_variants.mode === "common"
      ? form.regional_variants.common.pronunciations
      : [
          ...form.regional_variants.uk.pronunciations,
          ...form.regional_variants.us.pronunciations
        ]
  );
  const senses = word.meanings.pos.flatMap((pos) => pos.senses);
  const status: V3ReviewStatus =
    word.status === "archived"
      ? "archived"
      : word.status === "draft"
        ? "draft"
        : word.has_unpublished_changes
          ? "published_dirty"
          : "published";
  const state = {
    draft: { statusLabel: "草稿", primaryAction: "validate" as const },
    published: { statusLabel: "已发布", primaryAction: "edit" as const },
    published_dirty: {
      statusLabel: "已发布 · 有未发布修改",
      primaryAction: "validate" as const
    },
    archived: { statusLabel: "垃圾桶", primaryAction: "none" as const }
  }[status];
  return {
    identity: {
      label: word.presentation.label,
      kindLabel: word.kind === "phrase" ? "短语" : "单词",
      languageLabel: "English 英语"
    },
    state: { status, ...state },
    summary: {
      posCount: word.forms.pos.length,
      baseCount: new Set(
        forms
          .filter((form) => form.form_type === "base")
          .map(baseSpellingKey)
          .filter((key) => key !== undefined)
      ).size,
      formCount: forms.length,
      pronunciationCount: pronunciations.length,
      senseCount: senses.length,
      sentenceCount: senses.reduce(
        (total, sense) => total + sense.sentences.length,
        0
      ),
      relationCount: senses.reduce(
        (total, sense) => total + sense.relations.length,
        0
      )
    }
  };
}
