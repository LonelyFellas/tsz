import type { ReactNode } from "react";
import type { NextDraft, NextForm, WordCreationStep } from "@tsz/types";
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
  exists = true
}: {
  draft?: NextDraft;
  step: WordCreationStep;
  onStepChange?: (step: WordCreationStep) => void;
  children: ReactNode;
  exists?: boolean;
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
  return (
    <WordCreationLayout
      currentStep={step}
      onStepChange={onStepChange}
      dictionary={{
        path: "/lexicon-next",
        label: "智能词库",
        back: "返回智能词库"
      }}
      stepLabels={{
        forms: { title: "词性与发音", subtitle: "基本词性｜词形变化｜多发音" },
        meanings: { title: "词义与译词", subtitle: "目标语言｜媒介语言" },
        preview: { title: "预览", subtitle: "结构核对｜语言组合" }
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
        status: <Tag>草稿</Tag>,
        progressBadge: `${progress.filter((row) => row.completed).length}/${progress.length}`,
        progress: <V3ProductProgressList currentKey={step} rows={progress} />
      }}
    >
      {children}
    </WordCreationLayout>
  );
}
