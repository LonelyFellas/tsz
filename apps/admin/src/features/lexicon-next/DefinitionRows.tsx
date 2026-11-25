import { SectionAI } from "./GenerationActions";
import { useState } from "react";
import type { NextDefinition, NextGrammarStructure } from "@tsz/types";
import { Button } from "@tsz/ui/admin/display";
import { SenseEmptyState } from "./SenseEmptyState";
import { Input, Select } from "@tsz/ui/admin/forms";
import { BookOpen, Plus, Trash2 } from "lucide-react";
import { SenseSection } from "@/features/dictionary/word-creation-v3/components/V3SenseSection";
import { SortableDragHandle } from "@/features/dictionary/word-creation-v3/components/SortableDragHandle";
import {
  reorderVisibleRows,
  sortableRowClass,
  useSortableRows
} from "@/features/dictionary/word-creation-v3/sortableRows";
import { PronunciationPreviewProvider } from "@/features/dictionary/word-creation/PronunciationPreview";
import { EntryDialectContext } from "@/features/settings/useDialectPreference";
import { DefinitionText } from "./DefinitionText";
import { useLexiconEditorTranslation } from "@/features/dictionary/i18n/editor";
import { grammarText } from "./model";
import "./definitions.css";

export function DefinitionRows({
  rows,
  locale,
  label,
  scopeId,
  disabled,
  grammars,
  grammarLocale,
  grammarDisabled,
  remaining,
  registerLeaveGuard,
  onChange
}: {
  rows: NextDefinition[];
  locale: string;
  label: string;
  scopeId: string;
  disabled: boolean;
  grammars?: NextGrammarStructure[];
  grammarLocale: string;
  grammarDisabled: boolean;
  remaining: number;
  registerLeaveGuard?: (guard?: () => Promise<boolean>) => void;
  onChange: (update: (rows: NextDefinition[]) => NextDefinition[]) => void;
}) {
  const { t } = useLexiconEditorTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const english = locale === "en" || locale.startsWith("en-");
  const exact = rows.filter((row) => row.locale === locale);
  const visible =
    english && !exact.length
      ? rows.filter((row) => row.locale === "en")
      : exact;
  const update = (next: NextDefinition) =>
    onChange((current) =>
      current.map((row) => (row.id === next.id ? next : row))
    );
  const sorting = useSortableRows({
    items: disabled ? [] : visible,
    scopeId,
    dragType: "application/x-tsz-next-definition",
    onChange: (next) => onChange((current) => reorderVisibleRows(current, next))
  });
  const content = (
    <SenseSection
      headerAction={
        <SectionAI
          section="definitions"
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
      {visible.length > 0 && (
        <div className="lexicon-next-definition-scroll">
          <table className="lexicon-next-definition-table" aria-label={label}>
            <thead>
              <tr>
                <th scope="col">排序</th>
                <th scope="col">等级</th>
                <th scope="col">方式</th>
                <th scope="col">正文{english && "与配音"}</th>
                <th scope="col">语法结构</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row, index) => {
                const name = `${label} ${index + 1}`;
                const invalidGrammar =
                  !!row.grammar_structure_id &&
                  !grammars?.some((g) => g.id === row.grammar_structure_id);
                return (
                  <tr
                    key={row.id}
                    data-v3-node-id={row.id}
                    className={sortableRowClass(
                      "lexicon-next-definition-row",
                      sorting,
                      index
                    )}
                    onDragLeave={sorting.handleDragLeave}
                    onDragOver={(event) => sorting.handleDragOver(event, index)}
                    onDrop={(event) => sorting.handleDrop(event, index)}
                  >
                    <td>
                      <SortableDragHandle
                        index={index}
                        label={`拖动${name}`}
                        singleItemTitle="至少两条释义才能排序"
                        sorting={sorting}
                        dragImageSelector=".lexicon-next-definition-row"
                      />
                    </td>
                    <td>
                      <Select
                        aria-label={`${name} 等级`}
                        data-v3-field="level"
                        value={row.level ?? ""}
                        disabled={disabled}
                        options={[
                          { value: "", label: "未评估" },
                          ...["A1", "A2", "B1", "B2", "C1", "C2"].map(
                            (value) => ({ value, label: value })
                          )
                        ]}
                        onChange={(level) => {
                          const next = { ...row };
                          if (level)
                            next.level = level as NextDefinition["level"];
                          else delete next.level;
                          update(next);
                        }}
                      />
                    </td>
                    <td>
                      <Select
                        aria-label={`${name} 方式`}
                        value={row.style}
                        disabled={disabled}
                        options={[
                          { value: "definition", label: "定义" },
                          { value: "sentence", label: "整句" }
                        ]}
                        onChange={(style) => update({ ...row, style })}
                      />
                    </td>
                    <td>
                      {english ? (
                        <DefinitionText
                          definition={row}
                          label={name}
                          placeholder={`输入${label}`}
                          disabled={disabled}
                          registerLeaveGuard={registerLeaveGuard}
                          onChange={(next) =>
                            onChange((current) =>
                              current.map((item) =>
                                item.id === row.id
                                  ? {
                                      ...item,
                                      text: next.text,
                                      content: next.content,
                                      voice_profile: next.voice_profile,
                                      audio_assets: next.audio_assets
                                    }
                                  : item
                              )
                            )
                          }
                        />
                      ) : (
                        <Input.TextArea
                          aria-label={name}
                          placeholder={`输入${label}`}
                          value={row.text}
                          disabled={disabled}
                          autoSize={{ maxRows: 8 }}
                          onChange={(event) =>
                            update({ ...row, text: event.target.value })
                          }
                        />
                      )}
                    </td>
                    <td>
                      {grammars !== undefined ? (
                        <>
                          <Select
                            aria-label={`${name} 语法结构`}
                            data-v3-field="grammar_structure_id"
                            value={
                              row.grammar_unbound
                                ? "unbound"
                                : (row.grammar_structure_id ?? "")
                            }
                            status={invalidGrammar ? "error" : undefined}
                            disabled={disabled || grammarDisabled}
                            options={[
                              { value: "", label: "未选择" },
                              { value: "unbound", label: "不绑定" },
                              ...(invalidGrammar
                                ? [
                                    {
                                      value: row.grammar_structure_id!,
                                      label: "语法引用失效，请重新选择",
                                      disabled: true
                                    }
                                  ]
                                : []),
                              ...grammars.map((g, i) => ({
                                value: g.id,
                                label: `${i + 1}. ${grammarText(g, grammarLocale) || "未填写当前方言内容"}`
                              }))
                            ]}
                            onChange={(id) => {
                              const next = { ...row };
                              delete next.grammar_structure_id;
                              delete next.grammar_unbound;
                              if (id === "unbound") next.grammar_unbound = true;
                              else if (id) next.grammar_structure_id = id;
                              update(next);
                            }}
                          />
                          {invalidGrammar && (
                            <span role="alert">语法引用失效，请重新选择</span>
                          )}
                        </>
                      ) : (
                        <span className="lexicon-next-muted">
                          语法选择暂不可用
                        </span>
                      )}
                    </td>
                    <td>
                      <Button
                        type="link"
                        size="small"
                        danger
                        icon={<Trash2 aria-hidden />}
                        aria-label={`删除${name}`}
                        disabled={disabled}
                        onClick={() =>
                          onChange((current) =>
                            current.filter((item) => item.id !== row.id)
                          )
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!visible.length && (
        <SenseEmptyState
          icon={BookOpen}
          description={
            !disabled && remaining <= 0
              ? t("definition_add_limit")
              : t("panel_no_yet", { p0: label })
          }
        />
      )}
      <Button
        block
        type="dashed"
        className="word-section-add-button"
        data-v3-field="definitions"
        icon={<Plus aria-hidden />}
        disabled={disabled || remaining <= 0}
        onClick={() =>
          onChange((current) => [
            ...current,
            { id: crypto.randomUUID(), locale, text: "", style: "definition" }
          ])
        }
      >
        添加{label}
      </Button>
    </SenseSection>
  );
  return english ? (
    <EntryDialectContext.Provider
      value={locale === "en-US" ? "en-US" : "en-GB"}
    >
      <PronunciationPreviewProvider readOnly={disabled}>
        {content}
      </PronunciationPreviewProvider>
    </EntryDialectContext.Provider>
  ) : (
    content
  );
}
