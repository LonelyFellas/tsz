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
      baseCount: forms.filter((form) => form.form_type === "base").length,
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
