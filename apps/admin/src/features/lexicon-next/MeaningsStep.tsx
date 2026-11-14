import { useState, type Dispatch, type SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";
import { expandFormContents, isSharedForms } from "@tsz/shared";
import {
  Button,
  Alert,
  Collapse,
  Empty,
  Flex,
  Space,
  Tabs,
  Typography
} from "@tsz/ui/admin/display";
import { AdminControls } from "@tsz/ui/admin/context";
import { V3SenseGroupsCard } from "@/features/dictionary/word-creation-v3/components/V3SenseGroupsCard";
import { Select } from "@tsz/ui/admin/forms";
import { App } from "@tsz/ui/admin/overlays";
import {
  ChevronDown,
  ChevronUp,
  CircleMinus,
  Plus,
  Trash2
} from "lucide-react";
import type {
  DraftFormsStepContentV3,
  NextDefinition,
  NextDraft,
  NextSense,
  PartOfSpeechCatalogItem
} from "@tsz/types";
import { partOfSpeechLabel } from "@/features/dictionary/word-creation-v3/presentation";
import { useLexiconEditorTranslation } from "@/features/dictionary/i18n/editor";
import { GrammarStructures } from "./GrammarStructures";
import { grammarMatchesSense } from "./model";
import { ContentRows } from "./ContentRows";
import { localeLabels, removePosDescription, replaceFormEditor } from "./model";
import { emptyFormEditor } from "./FormsStep";
import { partOfSpeechDataSource } from "@/features/dictionary/dataSource";
import { partOfSpeechKeys } from "@/features/dictionary/part-of-speech/api";
import { localizedCatalogName } from "@/features/dictionary/part-of-speech/catalog";
import { V3AddBasicPosSelect } from "@/features/dictionary/word-creation-v3/components/V3AddBasicPosSelect";
import { SortableDragHandle } from "@/features/dictionary/word-creation-v3/components/SortableDragHandle";
import {
  addPartOfSpeech,
  deletePartOfSpeech,
  fillFormTypeTemplate,
  reorderPos
} from "@/features/dictionary/word-creation-v3/operations";
import { applyFormsStructure } from "@/features/dictionary/word-creation-v3/sharedFormsModel";
import { applyDefaultFormSharing } from "@/features/dictionary/word-creation-v3/defaultFormSharing";
import {
  sortableRowClass,
  sortableTabOffset,
  useSortableRows
} from "@/features/dictionary/word-creation-v3/sortableRows";
import "@/features/dictionary/word-creation-v3/posTabs.css";

export function MeaningsStep({
  value,
  kind,
  formEditorAvailable,
  target,
  medium,
  partOfSpeechCodes,
  disabled,
  senseGroupsAvailable = false,
  grammarAvailable = false,
  registerLeaveGuard,
  onChange
}: {
  value: NextDraft;
  kind: "word" | "phrase";
  formEditorAvailable: boolean;
  target: string;
  medium: string;
  partOfSpeechCodes: string[];
  disabled: boolean;
  senseGroupsAvailable?: boolean;
  grammarAvailable?: boolean;
  registerLeaveGuard?: (guard?: () => Promise<boolean>) => void;
  onChange: Dispatch<SetStateAction<NextDraft>>;
}) {
  const { modal } = App.useApp();
  const { t, i18n } = useLexiconEditorTranslation();
  const catalog = useQuery({
    queryKey: partOfSpeechKeys.catalog(),
    queryFn: () => partOfSpeechDataSource.catalog(),
    enabled: formEditorAvailable || grammarAvailable,
    staleTime: 5 * 60 * 1000
  });
  const editor = value.form_editor ?? emptyFormEditor();
  const forms = expandFormContents(editor);
  const [emptyGroup] = useState(() => ({
    id: crypto.randomUUID(),
    name_zh: "",
    name_en: ""
  }));
  const groups = value.sense_groups ?? [emptyGroup];
  const groupOptions = groups.flatMap((group) => {
    const label = group.name_zh.trim() || group.name_en.trim();
    return label ? [{ value: group.id, label }] : [];
  });
  const [selectedPos, setSelectedPos] = useState<string>();
  const [expanded, setExpanded] = useState<Record<string, string | null>>({});
  const codes = [
    ...new Set([
      ...(value.form_editor?.pos.map((pos) => pos.pos) ?? []),
      ...value.senses.map((sense) => sense.part_of_speech ?? ""),
      ...(value.grammar_structures?.map((grammar) => grammar.part_of_speech) ??
        [])
    ])
  ];
  if (!codes.length) codes.push("");
  const activePos = codes.includes(selectedPos ?? "")
    ? (selectedPos ?? "")
    : codes[0]!;
  const label = (code: string) => {
    const item = catalog.data?.items.find((item) => item.code === code);
    return item
      ? localizedCatalogName(item, i18n.language)
      : code
        ? partOfSpeechLabel(code, t)
        : "未指定词性";
  };
  function updateForms(next: DraftFormsStepContentV3) {
    onChange((current) => {
      const updated = applyFormsStructure(
        current.form_editor ?? emptyFormEditor(),
        next
      );
      return isSharedForms(updated)
        ? replaceFormEditor(current, updated)
        : current;
    });
  }
  function addPos(item: PartOfSpeechCatalogItem) {
    const result = addPartOfSpeech(forms, item);
    if (!result.ok) return;
    const added = result.value.pos.at(-1)!;
    const filled = fillFormTypeTemplate(
      result.value,
      catalog.data?.items,
      undefined,
      added.pos_id
    );
    const updated = applyFormsStructure(editor, filled);
    if (!isSharedForms(updated)) return;
    const shared = applyDefaultFormSharing(
      updated,
      catalog.data,
      new Set(filled.pos.at(-1)!.forms.map((form) => form.id))
    );
    onChange((current) => replaceFormEditor(current, shared));
    setSelectedPos(item.code);
  }
  const posSorting = useSortableRows({
    items:
      formEditorAvailable && !disabled && forms.pos.length === codes.length
        ? forms.pos
        : [],
    scopeId: "lexicon-next-meanings-pos-tabs",
    dragType: "application/x-tsz-v3-pos",
    onChange: (next) =>
      updateForms(
        reorderPos(
          forms,
          next.map((pos) => pos.pos_id)
        )
      )
  });
  function updateSense(id: string, patch: Partial<NextSense>) {
    onChange({
      ...value,
      ...(grammarAvailable
        ? { grammar_structures: value.grammar_structures ?? [] }
        : {}),
      senses: value.senses.map((sense) =>
        sense.id === id ? { ...sense, ...patch } : sense
      )
    });
  }
  return (
    <Flex
      vertical
      gap={16}
      className="word-meanings-step v3-meanings-v2 lexicon-next-meanings"
    >
      {formEditorAvailable && catalog.isError && (
        <Alert type="error" title={t("catalog_unavailable")} />
      )}
      {senseGroupsAvailable && (
        <AdminControls componentDisabled={disabled}>
          <V3SenseGroupsCard
            groups={groups}
            idFactory={() => crypto.randomUUID()}
            change={(mutation) => {
              const next = structuredClone(value);
              next.sense_groups ??= structuredClone(groups);
              mutation(next.sense_groups);
              onChange(next);
            }}
            onDelete={(id) => {
              if (groups.length <= 1) return;
              onChange({
                ...value,
                sense_groups: groups.filter((group) => group.id !== id),
                senses: value.senses.map((sense) => {
                  if (sense.sense_group_id !== id) return sense;
                  const next = { ...sense };
                  delete next.sense_group_id;
                  return next;
                })
              });
            }}
          />
        </AdminControls>
      )}
      <Tabs
        className="word-pos-tabs"
        activeKey={activePos}
        onChange={setSelectedPos}
        items={codes.map((code, posIndex) => {
          const formPos = forms.pos.find((pos) => pos.pos === code);
          const senses = value.senses.filter(
            (sense) => (sense.part_of_speech ?? "") === code
          );
          const expandedId =
            expanded[code] === undefined ? senses[0]?.id : expanded[code];
          return {
            key: code,
            label: (
              <span
                className={sortableRowClass(
                  "word-pos-tab-handle",
                  posSorting,
                  posIndex
                )}
                data-pos-id={formPos?.pos_id}
                onDragLeave={posSorting.handleDragLeave}
                onDragOver={(event) =>
                  posSorting.handleDragOver(event, posIndex)
                }
                onDrop={(event) => posSorting.handleDrop(event, posIndex)}
              >
                <span
                  className="word-pos-tab-content"
                  style={{
                    transform: `translateX(${sortableTabOffset(posSorting, posIndex)}px)`
                  }}
                >
                  <SortableDragHandle
                    dragImageSelector=".word-pos-tab-handle"
                    index={posIndex}
                    label={t("drag_item", { label: label(code) })}
                    singleItemTitle={t("two_pos_required")}
                    sorting={posSorting}
                  />
                  <span className="word-pos-tab-label">
                    <strong>{label(code)}</strong>
                  </span>
                  {formEditorAvailable && (
                    <span
                      className="word-pos-tab-actions"
                      onClick={(event) => event.stopPropagation()}
                      onMouseDown={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <AdminControls componentDisabled={disabled}>
                        <V3AddBasicPosSelect
                          compact
                          catalog={catalog.data}
                          forms={forms}
                          entryKind={kind}
                          isError={catalog.isError}
                          isPending={catalog.isPending}
                          onAdd={addPos}
                        />
                      </AdminControls>
                      {formPos && forms.pos.length > 1 && (
                        <Button
                          aria-label={t("delete_item", { label: label(code) })}
                          danger
                          icon={<CircleMinus />}
                          disabled={disabled}
                          onClick={() =>
                            modal.confirm({
                              title: t("delete_pos_title", {
                                label: label(code)
                              }),
                              content: removePosDescription,
                              okText: t("delete"),
                              okButtonProps: { danger: true },
                              onOk: () => {
                                onChange((current) => {
                                  const currentEditor =
                                    current.form_editor ?? emptyFormEditor();
                                  const result = deletePartOfSpeech(
                                    expandFormContents(currentEditor),
                                    formPos.pos_id
                                  );
                                  if (!result.ok) return current;
                                  const updated = applyFormsStructure(
                                    currentEditor,
                                    result.value
                                  );
                                  return isSharedForms(updated)
                                    ? replaceFormEditor(current, updated)
                                    : current;
                                });
                              }
                            })
                          }
                          size="small"
                          type="text"
                        />
                      )}
                    </span>
                  )}
                </span>
              </span>
            ),
            children: (
              <Flex vertical gap={12}>
                {grammarAvailable && (
                  <GrammarStructures
                    rows={value.grammar_structures ?? []}
                    registerLeaveGuard={registerLeaveGuard}
                    pos={code}
                    catalog={catalog.data?.items.find(
                      (item) => item.code === code
                    )}
                    target={target}
                    disabled={disabled}
                    referenceCount={(id) =>
                      value.senses.reduce(
                        (count, sense) =>
                          count +
                          sense.definitions.filter(
                            (d) => d.grammar_structure_id === id
                          ).length,
                        0
                      )
                    }
                    onChange={(update) =>
                      onChange((current) => {
                        const grammar_structures = update(
                          current.grammar_structures ?? []
                        );
                        const removed = new Set(
                          (current.grammar_structures ?? [])
                            .filter(
                              (g) =>
                                !grammar_structures.some(
                                  (row) => row.id === g.id
                                )
                            )
                            .map((g) => g.id)
                        );
                        return {
                          ...current,
                          grammar_structures,
                          senses: current.senses.map((sense) => ({
                            ...sense,
                            definitions: sense.definitions.map((definition) => {
                              if (
                                !definition.grammar_structure_id ||
                                !removed.has(definition.grammar_structure_id)
                              )
                                return definition;
                              const next = { ...definition };
                              delete next.grammar_structure_id;
                              return next;
                            })
                          }))
                        };
                      })
                    }
                  />
                )}
                {!senses.length && <Empty description="尚无义项" />}
                {senses.map((sense, index) => {
                  const summary =
                    sense.equivalents.find(
                      (row) => row.locale === medium && row.text.trim()
                    )?.text ||
                    sense.definitions.find(
                      (row) =>
                        [medium, target].includes(row.locale) && row.text.trim()
                    )?.text ||
                    "未填写释义";
                  const isExpanded = expandedId === sense.id;
                  return (
                    <section key={sense.id} aria-label={`义项 ${index + 1}`}>
                      <Collapse
                        className="word-sense-editor word-sense-editor-v3"
                        activeKey={isExpanded ? [sense.id] : []}
                        onChange={(keys) =>
                          setExpanded((current) => ({
                            ...current,
                            [code]: (Array.isArray(keys)
                              ? keys
                              : [keys]
                            ).includes(sense.id)
                              ? sense.id
                              : null
                          }))
                        }
                        items={[
                          {
                            key: sense.id,
                            showArrow: false,
                            label: (
                              <div className="word-sense-header-label">
                                <Typography.Text className="word-sense-summary">
                                  {index + 1}. {summary}
                                </Typography.Text>
                                <span className="word-form-card-toggle-state">
                                  {isExpanded ? "收起" : "展开"}
                                  {isExpanded ? <ChevronUp /> : <ChevronDown />}
                                </span>
                              </div>
                            ),
                            extra: (
                              <Button
                                aria-label="删除义项"
                                title={`删除义项 ${index + 1}`}
                                danger
                                type="text"
                                size="small"
                                icon={<Trash2 aria-hidden />}
                                disabled={disabled}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  modal.confirm({
                                    title: `删除义项 ${index + 1}？`,
                                    content:
                                      "这将从草稿移除此义项的所有语言内容。保存后生效。",
                                    okText: "删除义项",
                                    cancelText: "取消",
                                    onOk: () =>
                                      onChange((current) => ({
                                        ...current,
                                        senses: current.senses.filter(
                                          (item) => item.id !== sense.id
                                        )
                                      }))
                                  });
                                }}
                              />
                            ),
                            children: (
                              <Flex
                                vertical
                                gap={8}
                                aria-hidden={!isExpanded}
                                inert={!isExpanded}
                              >
                                <Space wrap>
                                  <span>词性</span>
                                  <Select
                                    aria-label={`义项 ${index + 1} 词性`}
                                    placeholder="未指定词性"
                                    allowClear
                                    value={sense.part_of_speech ?? undefined}
                                    disabled={disabled}
                                    options={partOfSpeechCodes.map((value) => ({
                                      value,
                                      label: label(value)
                                    }))}
                                    onChange={(next) => {
                                      updateSense(sense.id, {
                                        part_of_speech: next ?? null
                                      });
                                      setSelectedPos(next ?? "");
                                      setExpanded((current) => ({
                                        ...current,
                                        [next ?? ""]: sense.id
                                      }));
                                    }}
                                  />
                                  {grammarAvailable && (
                                    <>
                                      <span>细分词性</span>
                                      <Select
                                        aria-label={`义项 ${index + 1} 细分词性`}
                                        disabled={disabled}
                                        placeholder="请选择细分词性"
                                        value={sense.sub_pos || undefined}
                                        options={(() => {
                                          const item = catalog.data?.items.find(
                                            (part) =>
                                              part.code === sense.part_of_speech
                                          );
                                          const parts = item?.sub_parts ?? [];
                                          return [
                                            ...(!item?.sub_pos_required
                                              ? [
                                                  {
                                                    value: "",
                                                    label: "不指定细分词性"
                                                  }
                                                ]
                                              : []),
                                            ...(sense.sub_pos &&
                                            !parts.some(
                                              (part) =>
                                                part.code === sense.sub_pos
                                            )
                                              ? [
                                                  {
                                                    value: sense.sub_pos,
                                                    label: "已失效的细分词性",
                                                    disabled: true
                                                  }
                                                ]
                                              : []),
                                            ...parts.map((part) => ({
                                              value: part.code,
                                              label: localizedCatalogName(
                                                part,
                                                i18n.language
                                              )
                                            }))
                                          ];
                                        })()}
                                        onChange={(sub_pos: string) =>
                                          updateSense(sense.id, { sub_pos })
                                        }
                                      />
                                    </>
                                  )}
                                  {senseGroupsAvailable && (
                                    <span>{t("sense_groups")}</span>
                                  )}
                                  {senseGroupsAvailable && (
                                    <Select
                                      aria-label={t("sense_group_label", {
                                        index: index + 1
                                      })}
                                      disabled={disabled}
                                      placeholder={t("select_group")}
                                      value={
                                        sense.sense_group_id &&
                                        !groupOptions.some(
                                          (group) =>
                                            group.value === sense.sense_group_id
                                        )
                                          ? undefined
                                          : (sense.sense_group_id ?? "")
                                      }
                                      options={[
                                        {
                                          value: "",
                                          label: t("no_sense_group")
                                        },
                                        ...groupOptions
                                      ]}
                                      onChange={(id) => {
                                        const next = { ...sense };
                                        if (id) next.sense_group_id = id;
                                        else delete next.sense_group_id;
                                        onChange({
                                          ...value,
                                          sense_groups:
                                            value.sense_groups ?? groups,
                                          senses: value.senses.map((row) =>
                                            row.id === sense.id ? next : row
                                          )
                                        });
                                      }}
                                    />
                                  )}
                                </Space>
                                <ContentRows
                                  grouped
                                  rows={sense.definitions}
                                  locale={target}
                                  label={`${localeLabels[target]}释义`}
                                  definition
                                  grammars={
                                    grammarAvailable
                                      ? (value.grammar_structures ?? []).filter(
                                          (g) => grammarMatchesSense(g, sense)
                                        )
                                      : undefined
                                  }
                                  grammarLocale={target}
                                  textClassName="tsz-words"
                                  disabled={disabled}
                                  onChange={(definitions) =>
                                    updateSense(sense.id, {
                                      definitions:
                                        definitions as NextDefinition[]
                                    })
                                  }
                                />
                                <ContentRows
                                  grouped
                                  rows={sense.definitions}
                                  locale={medium}
                                  label={`${localeLabels[medium]}解释`}
                                  definition
                                  grammars={
                                    grammarAvailable
                                      ? (value.grammar_structures ?? []).filter(
                                          (g) => grammarMatchesSense(g, sense)
                                        )
                                      : undefined
                                  }
                                  grammarLocale={target}
                                  disabled={disabled}
                                  onChange={(definitions) =>
                                    updateSense(sense.id, {
                                      definitions:
                                        definitions as NextDefinition[]
                                    })
                                  }
                                />
                                <ContentRows
                                  grouped
                                  rows={sense.equivalents}
                                  locale={medium}
                                  label={`${localeLabels[medium]}译词`}
                                  disabled={disabled}
                                  onChange={(equivalents) =>
                                    updateSense(sense.id, { equivalents })
                                  }
                                />
                              </Flex>
                            )
                          }
                        ]}
                      />
                    </section>
                  );
                })}
                <Button
                  block
                  type="dashed"
                  size="large"
                  icon={<Plus aria-hidden />}
                  disabled={disabled}
                  onClick={() => {
                    const id = crypto.randomUUID();
                    const inheritedGroup =
                      [...senses]
                        .reverse()
                        .find((sense) => sense.sense_group_id)
                        ?.sense_group_id ?? groups[0]?.id;
                    onChange({
                      ...value,
                      ...(senseGroupsAvailable
                        ? { sense_groups: value.sense_groups ?? groups }
                        : {}),
                      senses: [
                        ...value.senses,
                        {
                          id,
                          ...(senseGroupsAvailable && inheritedGroup
                            ? { sense_group_id: inheritedGroup }
                            : {}),
                          part_of_speech: code || null,
                          definitions: [],
                          equivalents: []
                        }
                      ]
                    });
                    setExpanded((current) => ({ ...current, [code]: id }));
                  }}
                >
                  添加义项
                </Button>
              </Flex>
            )
          };
        })}
      />
    </Flex>
  );
}
