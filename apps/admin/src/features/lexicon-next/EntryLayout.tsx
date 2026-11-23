import type { ReactNode } from "react";
import type { NextDraft, NextForm, WordCreationStep } from "@tsz/types";
import { groupRelations } from "@/features/dictionary/word-creation-v3/relationGroups";
import { WordCreationLayout } from "@/features/dictionary/word-creation/WordCreationLayout";
import { V3ProductProgressList } from "@/features/dictionary/word-creation-v3/components/V3ProductProgressList";
import { Tag } from "@tsz/ui/admin/display";
import { draftForms, localeLabels } from "./model";
import "@/features/dictionary/word-creation-v3/v3-layout.css";

export function EntryLayout({
  draft,
  step,
  onStepChange,
  children,
  headerAction,
  languageSearch,
  exists = true,
  publicationStatus = "draft",
  relationsAvailable = false
}: {
  draft?: NextDraft;
  step: WordCreationStep;
  onStepChange?: (step: WordCreationStep) => void;
  children: ReactNode;
  headerAction?: ReactNode;
  exists?: boolean;
  relationsAvailable?: boolean;
  publicationStatus?: "draft" | "published" | "archived";
  languageSearch?: string;
}) {
  const senses = draft?.senses ?? [];
  const definitions = senses.flatMap((sense) => sense.definitions);
  const equivalents = draft?.senses.flatMap((sense) => sense.equivalents) ?? [];
  const groups = [
    {
      key: "forms",
      label: "英语词形",
      rows: draft ? draftForms(draft) : [],
      locales: ["en-GB", "en-US"]
    },
    {
      key: "definitions",
      label: "英文释义",
      rows: definitions,
      locales: ["en-GB", "en-US"]
    },
    {
      key: "meanings",
      label: "中文解释",
      rows: definitions,
      locales: ["zh-Hans", "zh-Hant"]
    },
    {
      key: "equivalents",
      label: "中文译词",
      rows: equivalents,
      locales: ["zh-Hans", "zh-Hant"]
    }
  ];
  const matchesLocale = (row: NextForm, locale: string) =>
    row.locale === locale || (locale.startsWith("en-") && row.locale === "en");
  const hasLocales = (rows: NextForm[], locales: string[]) =>
    locales.every((locale) =>
      rows.some((row) => matchesLocale(row, locale) && row.text.trim())
    );
  const progress = groups.map((group, index) => {
    const rows = group.rows.filter(
      (row) =>
        row.text.trim() &&
        group.locales.some((locale) => matchesLocale(row, locale))
    );
    return {
      key: group.key,
      index: index + 1,
      label: group.label,
      completed:
        group.key === "forms"
          ? hasLocales(group.rows, group.locales)
          : Boolean(senses.length) &&
            senses.every((sense) =>
              hasLocales(
                group.key === "equivalents"
                  ? sense.equivalents
                  : sense.definitions,
                group.locales
              )
            ),
      details: rows.map((row) => ({
        key: row.id,
        label: `${localeLabels[row.locale] ?? row.locale}：${row.text}`
      })),
      value: rows.length
    };
  });
  if (draft?.sense_groups) {
    progress.unshift({
      key: "sense_groups",
      index: 0,
      label: "语义区间",
      completed:
        draft.sense_groups.length > 0 &&
        draft.sense_groups.every((group) =>
          Boolean(group.name_zh.trim() && group.name_en.trim())
        ),
      details: draft.sense_groups.map((group) => ({
        key: group.id,
        label:
          [group.name_zh.trim(), group.name_en.trim()]
            .filter(Boolean)
            .join(" · ") || "待填写语义区间"
      })),
      value: draft.sense_groups.length
    });
    progress.forEach((row, index) => {
      row.index = index + 1;
    });
  }
  if (relationsAvailable) {
    const relations = senses.flatMap((sense) =>
      groupRelations(sense.relations ?? [])
    );
    progress.push({
      key: "relations",
      index: progress.length + 1,
      label: "拓展词",
      completed:
        senses.length > 0 &&
        senses.every(
          (sense) =>
            (sense.relations?.length ?? 0) > 0 &&
            sense.relations!.every((row) =>
              Boolean(
                (row.target_word_id && row.target_sense_id) ||
                row.pending_target_headword?.trim()
              )
            )
        ),
      value: relations.length,
      details: (["derivative", "synonym", "antonym"] as const).map((kind) => ({
        key: kind,
        label: { derivative: "派生词", synonym: "近义词", antonym: "反义词" }[
          kind
        ],
        count: relations.filter((group) => group[0]!.relation === kind).length
      }))
    });
  }
  return (
    <WordCreationLayout
      headerAction={headerAction}
      currentStep={step}
      onStepChange={onStepChange}
      allowBasicsStep={exists}
      dictionary={{
        path: `/lexicon-next${languageSearch ? `?${languageSearch}` : ""}`,
        label: "智能词库",
        back: "返回智能词库"
      }}
      stepLabels={{
        basics: { title: "创建新词条" },
        forms: { title: "词形与发音" },
        meanings: { title: "词义与例句" },
        preview: { title: "预览并发布" }
      }}
      presentation={{
        wordExists: exists,
        breadcrumbTitle: exists ? "编辑词条" : "创建词条",
        completedSteps: [],
        summaryHeadword: (
          <strong className="word-summary-headword tsz-words">
            {draft?.headword || "新词条"}
          </strong>
        ),
        status: (
          <Tag
            color={publicationStatus === "published" ? "success" : "default"}
          >
            {publicationStatus === "published"
              ? "已发布"
              : publicationStatus === "archived"
                ? "已归档"
                : "草稿"}
          </Tag>
        ),
        progressBadge: `${progress.filter((row) => row.completed).length}/${progress.length}`,
        progress: (
          <V3ProductProgressList showCompletionIcon={false} rows={progress} />
        )
      }}
    >
      {children}
    </WordCreationLayout>
  );
}
