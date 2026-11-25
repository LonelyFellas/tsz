import { SectionAI } from "./GenerationActions";
import { Button, Space } from "@tsz/ui/admin/display";
import { Input, Select } from "@tsz/ui/admin/forms";
import { BookOpen, Languages, Trash2, Plus } from "lucide-react";
import { useLexiconEditorTranslation } from "@/features/dictionary/i18n/editor";
import { SenseEmptyState } from "./SenseEmptyState";
import type {
  NextDefinition,
  NextEquivalent,
  NextGrammarStructure
} from "@tsz/types";
import { grammarText } from "./model";
import { useState } from "react";
import { SenseSection } from "@/features/dictionary/word-creation-v3/components/V3SenseSection";
import { V3RowIndex } from "@/features/dictionary/word-creation-v3/components/V3RowIndex";

type Row = NextEquivalent | NextDefinition;
export function ContentRows({
  rows,
  locale,
  label,
  definition = false,
  definitionTemplates,
  grouped = false,
  textClassName,
  disabled,
  grammars,
  grammarLocale = locale,
  onChange
}: {
  rows: Row[];
  locale: string;
  label: string;
  definition?: boolean;
  definitionTemplates?: readonly { style?: "definition" | "sentence" }[];
  grouped?: boolean;
  textClassName?: string;
  disabled: boolean;
  grammars?: NextGrammarStructure[];
  grammarLocale?: string;
  onChange: (rows: Row[]) => void;
}) {
  const { t } = useLexiconEditorTranslation();
  const [templates, setTemplates] = useState<
    Record<string, { plan: string; rows: NextDefinition[] }>
  >({});
  const stored = rows.filter((row) => row.locale === locale);
  const template = templates[locale];
  const plan = definitionTemplates
    ?.map((row) => row.style ?? "definition")
    .join(",");
  const untouched =
    template &&
    template.rows.every(
      (row) => !row.text.trim() && !row.grammar_structure_id
    ) &&
    template.rows.map((row) => row.style).join(",") === template.plan;
  if (
    definition &&
    definitionTemplates &&
    (!template || (template.plan !== plan && !stored.length && untouched))
  ) {
    setTemplates({
      ...templates,
      [locale]: {
        plan: plan!,
        rows: stored.length
          ? []
          : definitionTemplates.map((plan) => ({
              id: crypto.randomUUID(),
              locale,
              text: "",
              style: plan.style ?? "definition"
            }))
      }
    });
  }
  const slots = template?.rows ?? [];
  const visible = [
    ...slots.map((slot) => stored.find((row) => row.id === slot.id) ?? slot),
    ...stored.filter((row) => !slots.some((slot) => slot.id === row.id))
  ];
  function updateRow(next: Row) {
    const slotIndex = slots.findIndex((slot) => slot.id === next.id);
    const existing = rows.some((row) => row.id === next.id);
    if (slotIndex >= 0) {
      setTemplates((current) => ({
        ...current,
        [locale]: {
          ...current[locale]!,
          rows: current[locale]!.rows.map((row) =>
            row.id === next.id ? (next as NextDefinition) : row
          )
        }
      }));
      if (!next.text.trim()) {
        if (existing) onChange(rows.filter((row) => row.id !== next.id));
        return;
      }
    }
    if (existing) {
      onChange(rows.map((row) => (row.id === next.id ? next : row)));
      return;
    }
    const before =
      slotIndex < 0
        ? -1
        : rows.findIndex((row) => {
            if (row.locale !== locale) return false;
            const index = slots.findIndex((slot) => slot.id === row.id);
            return index < 0 || index > slotIndex;
          });
    const index = before < 0 ? rows.length : before;
    onChange([...rows.slice(0, index), next, ...rows.slice(index)]);
  }
  const [collapsed, setCollapsed] = useState(false);
  const content = (
    <>
      {visible.map((row, index) => (
        <div
          key={row.id}
          className={grouped ? "lexicon-next-content-row" : "lexicon-next-row"}
        >
          {grouped && <V3RowIndex index={index} />}
          {definition ? (
            <Input.TextArea
              className={textClassName}
              aria-label={`${label} ${index + 1}`}
              value={row.text}
              disabled={disabled}
              autoSize={{ minRows: 2, maxRows: 8 }}
              onChange={(e) => updateRow({ ...row, text: e.target.value })}
            />
          ) : (
            <Input
              className={textClassName}
              aria-label={`${label} ${index + 1}`}
              value={row.text}
              disabled={disabled}
              onChange={(e) => updateRow({ ...row, text: e.target.value })}
            />
          )}
          <Space>
            {definition && grammars !== undefined && (
              <Select
                aria-label={`${label} ${index + 1} 语法结构`}
                placeholder="请选择语法结构"
                disabled={disabled}
                value={(row as NextDefinition).grammar_structure_id}
                status={
                  (row as NextDefinition).grammar_structure_id &&
                  !grammars.some(
                    (g) => g.id === (row as NextDefinition).grammar_structure_id
                  )
                    ? "error"
                    : undefined
                }
                options={[
                  ...((row as NextDefinition).grammar_structure_id &&
                  !grammars.some(
                    (g) => g.id === (row as NextDefinition).grammar_structure_id
                  )
                    ? [
                        {
                          value: (row as NextDefinition).grammar_structure_id!,
                          label: "细分词性不匹配，请重新选择",
                          disabled: true
                        }
                      ]
                    : []),
                  ...grammars.map((g, i) => ({
                    value: g.id,
                    label: `${i + 1}. ${grammarText(g, grammarLocale) || "未填写当前方言内容"}`
                  }))
                ]}
                notFoundContent="请先为当前细分词性添加语法结构"
                onChange={(grammar_structure_id: string) =>
                  updateRow({ ...row, grammar_structure_id })
                }
              />
            )}
            {"style" in row && (
              <Select
                aria-label={`${label} ${index + 1} 格式`}
                value={row.style}
                disabled={disabled}
                options={[
                  { value: "definition", label: "定义" },
                  { value: "sentence", label: "整句释义" }
                ]}
                onChange={(style) => updateRow({ ...row, style })}
              />
            )}
            <Button
              aria-label={`删除${label} ${index + 1}`}
              icon={<Trash2 aria-hidden="true" />}
              danger={grouped}
              type={grouped ? "text" : "default"}
              disabled={disabled}
              onClick={() => {
                if (slots.some((slot) => slot.id === row.id))
                  setTemplates((current) => ({
                    ...current,
                    [locale]: {
                      ...current[locale]!,
                      rows: current[locale]!.rows.filter(
                        (item) => item.id !== row.id
                      )
                    }
                  }));
                onChange(rows.filter((item) => item.id !== row.id));
              }}
            />
          </Space>
        </div>
      ))}
      <Button
        block={grouped}
        type={grouped ? "dashed" : "default"}
        className={grouped ? "word-section-add-button" : undefined}
        icon={<Plus aria-hidden="true" />}
        disabled={disabled}
        onClick={() =>
          onChange([
            ...rows,
            {
              id: crypto.randomUUID(),
              locale,
              text: "",
              ...(definition ? { style: "definition" as const } : {})
            }
          ])
        }
      >
        添加{label}
      </Button>
    </>
  );
  return grouped ? (
    <SenseSection
      headerAction={
        <SectionAI
          section={definition ? "definitions" : "equivalents"}
          locale={locale}
          label={label}
          disabled={disabled}
        />
      }
      label={label}
      count={visible.length}
      unit="条"
      collapsed={collapsed}
      onToggle={() => setCollapsed(!collapsed)}
    >
      {!visible.length && (
        <SenseEmptyState
          icon={definition ? BookOpen : Languages}
          description={t("panel_no_yet", { p0: label })}
        />
      )}
      {content}
    </SenseSection>
  ) : (
    <section className="lexicon-next-rows" aria-label={label}>
      <h4>{label}</h4>
      {!visible.length && <p className="lexicon-next-muted">尚无{label}</p>}
      {content}
    </section>
  );
}
