import { Button, Space } from "@tsz/ui/admin/display";
import { Input, Select } from "@tsz/ui/admin/forms";
import { Trash2, Plus } from "lucide-react";
import type {
  NextDefinition,
  NextEquivalent,
  NextGrammarStructure
} from "@tsz/types";
import { grammarText } from "./model";
import { useState } from "react";
import {
  SenseSectionBody,
  SenseSectionTitle
} from "@/features/dictionary/word-creation-v3/components/V3SenseSection";
import { V3RowIndex } from "@/features/dictionary/word-creation-v3/components/V3RowIndex";

type Row = NextEquivalent | NextDefinition;
export function ContentRows({
  rows,
  locale,
  label,
  definition = false,
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
  grouped?: boolean;
  textClassName?: string;
  disabled: boolean;
  grammars?: NextGrammarStructure[];
  grammarLocale?: string;
  onChange: (rows: Row[]) => void;
}) {
  const visible = rows.filter((row) => row.locale === locale);
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
              onChange={(e) =>
                onChange(
                  rows.map((item) =>
                    item.id === row.id
                      ? { ...item, text: e.target.value }
                      : item
                  )
                )
              }
            />
          ) : (
            <Input
              className={textClassName}
              aria-label={`${label} ${index + 1}`}
              value={row.text}
              disabled={disabled}
              onChange={(e) =>
                onChange(
                  rows.map((item) =>
                    item.id === row.id
                      ? { ...item, text: e.target.value }
                      : item
                  )
                )
              }
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
                  onChange(
                    rows.map((item) =>
                      item.id === row.id
                        ? { ...item, grammar_structure_id }
                        : item
                    )
                  )
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
                onChange={(style) =>
                  onChange(
                    rows.map((item) =>
                      item.id === row.id ? { ...item, style } : item
                    )
                  )
                }
              />
            )}
            <Button
              aria-label={`删除${label} ${index + 1}`}
              icon={<Trash2 aria-hidden="true" />}
              danger={grouped}
              type={grouped ? "text" : "default"}
              disabled={disabled}
              onClick={() =>
                onChange(rows.filter((item) => item.id !== row.id))
              }
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
    <section
      className={`word-sense-section${collapsed ? " is-collapsed" : ""}`}
      aria-label={label}
    >
      <SenseSectionTitle
        label={label}
        count={visible.length}
        unit="条"
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
      />
      <SenseSectionBody collapsed={collapsed}>{content}</SenseSectionBody>
    </section>
  ) : (
    <section className="lexicon-next-rows" aria-label={label}>
      <h4>{label}</h4>
      {!visible.length && <p className="lexicon-next-muted">尚无{label}</p>}
      {content}
    </section>
  );
}
