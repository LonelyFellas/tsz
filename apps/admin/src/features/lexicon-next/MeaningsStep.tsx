import { Relations } from "./Relations";
import { SenseSentenceExamples } from "./SenseSentenceExamples";
import { EquivalentRows } from "./EquivalentRows";
import { draftNodeCount, ensureMeaningTemplates, newSense } from "./model";
import type { LexiconNextRequests } from "@/pages/LexiconNext";
import {
  useEffect,
  useId,
  useState,
  type Dispatch,
  type SetStateAction
} from "react";
import { useQuery } from "@tanstack/react-query";
import { expandFormContents, isSharedForms } from "@tsz/shared";
import { Button, Alert, Flex, Space, Typography } from "@tsz/ui/admin/display";
import { AdminControls } from "@tsz/ui/admin/context";
import { V3SenseGroupsCard } from "@/features/dictionary/word-creation-v3/components/V3SenseGroupsCard";
import {
  SenseEditorShell,
  SortableRows
} from "@/features/dictionary/word-creation-v3/components/V3SenseEditorShell";
import { V3SenseMetadataFields } from "@/features/dictionary/word-creation-v3/components/V3SenseMetadataFields";
import { Select } from "@tsz/ui/admin/forms";
import { Plus } from "lucide-react";
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
import { grammarSelectMatchesSense } from "./model";
import { DefinitionRows } from "./DefinitionRows";
import { ContentRows } from "./ContentRows";
import { localeLabels, removePosDescription, replaceFormEditor } from "./model";
import { emptyFormEditor } from "./FormsStep";
import { DEFAULT_DEFINITION_PLAN } from "@/features/dictionary/word-creation-v3/meaningsModel";
import { partOfSpeechDataSource } from "@/features/dictionary/dataSource";
import { partOfSpeechKeys } from "@/features/dictionary/part-of-speech/api";
import { localizedCatalogName } from "@/features/dictionary/part-of-speech/catalog";
import { V3AddBasicPosSelect } from "@/features/dictionary/word-creation-v3/components/V3AddBasicPosSelect";
import { V3BasicPosTabs } from "@/features/dictionary/word-creation-v3/components/V3BasicPosTabs";
import {
  addPartOfSpeech,
  deletePartOfSpeech,
  fillFormTypeTemplate,
  reorderPos
} from "@/features/dictionary/word-creation-v3/operations";
import { applyFormsStructure } from "@/features/dictionary/word-creation-v3/sharedFormsModel";
import { applyDefaultFormSharing } from "@/features/dictionary/word-creation-v3/defaultFormSharing";
import { useSortableRows } from "@/features/dictionary/word-creation-v3/sortableRows";

export function MeaningsStep({
  value,
  renderDialect,
  focusIssue,
  entryId,
  relationsAvailable = false,
  kind,
  formEditorAvailable,
  target,
  medium,
  partOfSpeechCodes,
  disabled,
  senseGroupsAvailable = false,
  senseMetadataAvailable = false,
  equivalentMetadataAvailable = false,
  meaningLabels = false,
  requests,
  grammarAvailable = false,
  grammarAudioAvailable = false,
  grammarFormLinksAvailable = false,
  definitionDetailsAvailable = false,
  sentencesAvailable = false,
  sentenceAssociationsAvailable = false,
  sentenceDetailsAvailable = false,
  registerLeaveGuard,
  selectedPos: sharedSelectedPos,
  onSelectedPosChange,
  onChange
}: {
  value: NextDraft;
  renderDialect?: (id: string) => React.ReactNode;
  focusIssue?: { senseId?: string };
  entryId?: string;
  relationsAvailable?: boolean;
  kind: "word" | "phrase";
  formEditorAvailable: boolean;
  target: string;
  medium: string;
  partOfSpeechCodes: string[];
  disabled: boolean;
  senseGroupsAvailable?: boolean;
  senseMetadataAvailable?: boolean;
  equivalentMetadataAvailable?: boolean;
  meaningLabels?: boolean;
  requests?: LexiconNextRequests;
  grammarAvailable?: boolean;
  grammarAudioAvailable?: boolean;
  grammarFormLinksAvailable?: boolean;
  definitionDetailsAvailable?: boolean;
  sentencesAvailable?: boolean;
  sentenceAssociationsAvailable?: boolean;
  sentenceDetailsAvailable?: boolean;
  registerLeaveGuard?: (guard?: () => Promise<boolean>) => void;
  selectedPos?: string;
  onSelectedPosChange?: (code: string) => void;
  onChange: Dispatch<SetStateAction<NextDraft>>;
}) {
  const { t, i18n } = useLexiconEditorTranslation();
  const catalog = useQuery({
    queryKey: partOfSpeechKeys.catalog(),
    queryFn: () => partOfSpeechDataSource.catalog(),
    enabled: formEditorAvailable || grammarAvailable || senseMetadataAvailable,
    staleTime: 5 * 60 * 1000
  });
  const equivalentCatalog = useQuery({
    queryKey: ["admin-lexicon-next", "equivalent-catalog"],
    queryFn: () => requests!.equivalentCatalog(),
    enabled: equivalentMetadataAvailable && !!requests,
    staleTime: 5 * 60 * 1000,
    retry: false
  });
  const editor = value.form_editor ?? emptyFormEditor();
  const forms = expandFormContents(editor);
  useEffect(() => {
    if (disabled) return;
    onChange((current) =>
      ensureMeaningTemplates(current, {
        grammarAvailable,
        senseGroupsAvailable,
        senseMetadataAvailable
      })
    );
  }, [
    disabled,
    grammarAvailable,
    senseGroupsAvailable,
    senseMetadataAvailable,
    value.form_editor,
    onChange
  ]);
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
  const fallbackPosId = useId();
  const [localSelectedPos, setLocalSelectedPos] = useState<string>();
  const selectedPos = sharedSelectedPos ?? localSelectedPos;
  function setSelectedPos(code: string) {
    setLocalSelectedPos(code);
    onSelectedPosChange?.(code);
  }
  const [expanded, setExpanded] = useState<Record<string, string | null>>({});
  useEffect(() => {
    const sense = value.senses.find((row) => row.id === focusIssue?.senseId);
    if (sense)
      setExpanded((current) => ({
        ...current,
        [sense.part_of_speech ?? ""]: sense.id
      }));
  }, [focusIssue, value.senses]);
  const codes = [
    ...new Set([
      ...(value.form_editor?.pos.map((pos) => pos.pos) ?? []),
      ...(!formEditorAvailable && selectedPos ? [selectedPos] : []),
      ...value.senses.map((sense) => sense.part_of_speech ?? ""),
      ...(value.grammar_structures?.map((grammar) => grammar.part_of_speech) ??
        [])
    ])
  ];
  const showEmptyAddButton = formEditorAvailable && codes.length === 0;
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
  function removePos(posId: string) {
    onChange((current) => {
      const currentEditor = current.form_editor ?? emptyFormEditor();
      const result = deletePartOfSpeech(
        expandFormContents(currentEditor),
        posId
      );
      if (!result.ok) return current;
      const updated = applyFormsStructure(currentEditor, result.value);
      return isSharedForms(updated)
        ? replaceFormEditor(current, updated)
        : current;
    });
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
    onChange((current) => ({
      ...current,
      ...(grammarAvailable
        ? { grammar_structures: current.grammar_structures ?? [] }
        : {}),
      ...(senseGroupsAvailable && patch.sense_group_id
        ? { sense_groups: current.sense_groups ?? groups }
        : {}),
      senses: current.senses.map((sense) =>
        sense.id === id ? { ...sense, ...patch } : sense
      )
    }));
  }
  function updateSensePos(id: string, next: string | undefined) {
    updateSense(id, { part_of_speech: next ?? null });
    setSelectedPos(next ?? "");
    setExpanded((current) => ({ ...current, [next ?? ""]: id }));
  }
  return (
    <Flex
      vertical
      gap={16}
      className="word-meanings-step v3-meanings-v2 lexicon-next-meanings"
    >
      <div className="word-step-heading">
        <Typography.Title level={2}>{t("meanings_title")}</Typography.Title>
      </div>
      {(formEditorAvailable || grammarAvailable) && catalog.isError && (
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
      <V3BasicPosTabs
        activeKey={activePos}
        onChange={setSelectedPos}
        sorting={posSorting}
        deleteDescription={removePosDescription}
        emptyToolbar={showEmptyAddButton}
        addControl={
          formEditorAvailable && (
            <AdminControls componentDisabled={disabled}>
              <V3AddBasicPosSelect
                buttonTrigger={showEmptyAddButton}
                compact={!showEmptyAddButton}
                catalog={catalog.data}
                forms={forms}
                entryKind={kind}
                isError={catalog.isError}
                isPending={catalog.isPending}
                onAdd={addPos}
              />
            </AdminControls>
          )
        }
        items={codes.map((code) => {
          const contentDisabled = disabled || !code;
          const formPos = forms.pos.find((pos) => pos.pos === code);
          const senses = value.senses.filter(
            (sense) => (sense.part_of_speech ?? "") === code
          );
          const expandedId =
            expanded[code] === undefined ? senses[0]?.id : expanded[code];
          return {
            key: code,
            label: label(code),
            posId: formPos?.pos_id,
            fallbackControl:
              !formEditorAvailable && !code ? (
                <Select
                  id={fallbackPosId}
                  aria-label="选择基本词性"
                  placeholder="选择基本词性"
                  disabled={disabled}
                  options={partOfSpeechCodes.map((value) => ({
                    value,
                    label: label(value)
                  }))}
                  onChange={setSelectedPos}
                />
              ) : undefined,
            remove:
              formEditorAvailable && formPos && forms.pos.length > 1
                ? {
                    disabled,
                    onConfirm: () => removePos(formPos.pos_id)
                  }
                : undefined,
            children: (
              <Flex vertical gap={16}>
                {!code && (
                  <Alert type="info" title="请先指定基本词性，再录入内容。" />
                )}
                {grammarAvailable && (
                  <GrammarStructures
                    rows={value.grammar_structures ?? []}
                    registerLeaveGuard={registerLeaveGuard}
                    pos={code}
                    catalog={catalog.data?.items.find(
                      (item) => item.code === code
                    )}
                    audioAvailable={grammarAudioAvailable}
                    formLinksAvailable={grammarFormLinksAvailable}
                    requests={requests}
                    target={target}
                    medium={medium}
                    disabled={disabled || catalog.isPending || catalog.isError}
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
                <div className="word-sense-list">
                  <SortableRows
                    items={disabled ? [] : senses}
                    scopeId={`lexicon-next-senses-${code}`}
                    dragType="application/x-tsz-v3-sense"
                    onChange={(next) =>
                      onChange((current) => {
                        const order = new Map(
                          next.map((sense, index) => [sense.id, index])
                        );
                        const sorted = current.senses
                          .filter((sense) => order.has(sense.id))
                          .sort((a, b) => order.get(a.id)! - order.get(b.id)!);
                        return {
                          ...current,
                          senses: current.senses.map((sense) =>
                            order.has(sense.id) ? sorted.shift()! : sense
                          )
                        };
                      })
                    }
                  >
                    {(senseSorting) =>
                      senses.map((sense, index) => {
                        const definitionPlan =
                          DEFAULT_DEFINITION_PLAN[
                            (sense.level ??
                              "A1") as keyof typeof DEFAULT_DEFINITION_PLAN
                          ] ?? [];
                        const summary =
                          sense.equivalents.find(
                            (row) => row.locale === medium && row.text.trim()
                          )?.text ||
                          sense.definitions.find(
                            (row) =>
                              [medium, target].includes(row.locale) &&
                              row.text.trim()
                          )?.text ||
                          "未填写释义";
                        const senseLabel = meaningLabels ? "义项" : "词义";
                        const isExpanded = expandedId === sense.id;
                        return (
                          <section
                            key={sense.id}
                            aria-label={`${senseLabel} ${index + 1}`}
                          >
                            <SenseEditorShell
                              index={index}
                              nodeId={sense.id}
                              level={sense.level ?? ""}
                              summary={summary}
                              subPosLabel={(() => {
                                const sub = catalog.data?.items
                                  .find(
                                    (part) => part.code === sense.part_of_speech
                                  )
                                  ?.sub_parts.find(
                                    (part) => part.code === sense.sub_pos
                                  );
                                return sub
                                  ? [sub.name_en, sub.name_zh]
                                      .filter(Boolean)
                                      .join(" ")
                                  : undefined;
                              })()}
                              sorting={senseSorting}
                              expanded={isExpanded}
                              onExpandedChange={(open) =>
                                setExpanded((current) => ({
                                  ...current,
                                  [code]: open ? sense.id : null
                                }))
                              }
                              canDelete={
                                !disabled &&
                                ((!senseMetadataAvailable && !formPos) ||
                                  senses.length > 1)
                              }
                              confirmDelete
                              onDelete={() =>
                                onChange((current) => ({
                                  ...current,
                                  senses: current.senses.filter(
                                    (item) => item.id !== sense.id
                                  )
                                }))
                              }
                            >
                              <Flex
                                vertical
                                gap={8}
                                aria-hidden={!isExpanded}
                                inert={!isExpanded}
                              >
                                {renderDialect?.(sense.id)}
                                {senseMetadataAvailable ? (
                                  <AdminControls componentDisabled={disabled}>
                                    {!sense.part_of_speech && (
                                      <Space wrap>
                                        <span>词性</span>
                                        <Select
                                          data-v3-field="part_of_speech"
                                          aria-label={`${senseLabel} ${index + 1} 词性`}
                                          placeholder="未指定词性"
                                          options={partOfSpeechCodes.map(
                                            (value) => ({
                                              value,
                                              label: label(value)
                                            })
                                          )}
                                          onChange={(next: string) =>
                                            updateSensePos(sense.id, next)
                                          }
                                        />
                                      </Space>
                                    )}
                                    <V3SenseMetadataFields
                                      sense={sense}
                                      index={index}
                                      meaningLabels={meaningLabels}
                                      catalogPos={catalog.data?.items.find(
                                        (part) =>
                                          part.code === sense.part_of_speech
                                      )}
                                      groupOptions={groupOptions}
                                      groupsAvailable={senseGroupsAvailable}
                                      subPosAvailable={grammarAvailable}
                                      onChange={(patch) =>
                                        updateSense(sense.id, patch)
                                      }
                                    />
                                  </AdminControls>
                                ) : (
                                  <Space wrap>
                                    <span>词性</span>
                                    <Select
                                      data-v3-field="part_of_speech"
                                      aria-label={`${senseLabel} ${index + 1} 词性`}
                                      placeholder="未指定词性"
                                      allowClear
                                      value={sense.part_of_speech ?? undefined}
                                      disabled={disabled}
                                      options={partOfSpeechCodes.map(
                                        (value) => ({
                                          value,
                                          label: label(value)
                                        })
                                      )}
                                      onChange={(next) => {
                                        updateSensePos(sense.id, next);
                                      }}
                                    />
                                    {grammarAvailable && (
                                      <>
                                        <span>细分词性</span>
                                        <Select
                                          aria-label={`${senseLabel} ${index + 1} 细分词性`}
                                          disabled={disabled}
                                          placeholder="请选择细分词性"
                                          value={sense.sub_pos || undefined}
                                          options={(() => {
                                            const item =
                                              catalog.data?.items.find(
                                                (part) =>
                                                  part.code ===
                                                  sense.part_of_speech
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
                                        aria-label={t(
                                          meaningLabels
                                            ? "meaning_group_label"
                                            : "sense_group_label",
                                          { index: index + 1 }
                                        )}
                                        disabled={disabled}
                                        placeholder={t("select_group")}
                                        value={
                                          sense.sense_group_id &&
                                          !groupOptions.some(
                                            (group) =>
                                              group.value ===
                                              sense.sense_group_id
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
                                )}

                                {definitionDetailsAvailable ? (
                                  <>
                                    {[target, medium].map((locale) => (
                                      <DefinitionRows
                                        key={locale}
                                        scopeId={`${sense.id}:${locale}`}
                                        rows={sense.definitions}
                                        locale={locale}
                                        grammarLocale={target}
                                        label={`${localeLabels[locale]}${locale === target ? "释义" : "解释"}`}
                                        disabled={contentDisabled}
                                        remaining={500 - draftNodeCount(value)}
                                        grammars={
                                          grammarAvailable
                                            ? (
                                                value.grammar_structures ?? []
                                              ).filter((g) =>
                                                grammarSelectMatchesSense(
                                                  g,
                                                  sense
                                                )
                                              )
                                            : undefined
                                        }
                                        grammarDisabled={
                                          catalog.isPending || catalog.isError
                                        }
                                        registerLeaveGuard={registerLeaveGuard}
                                        onChange={(update) =>
                                          onChange((current) => ({
                                            ...current,
                                            senses: current.senses.map((row) =>
                                              row.id === sense.id
                                                ? {
                                                    ...row,
                                                    definitions: update(
                                                      row.definitions
                                                    )
                                                  }
                                                : row
                                            )
                                          }))
                                        }
                                      />
                                    ))}
                                  </>
                                ) : (
                                  <>
                                    <ContentRows
                                      grouped
                                      rows={sense.definitions}
                                      locale={target}
                                      label={`${localeLabels[target]}释义`}
                                      definition
                                      definitionTemplates={definitionPlan.filter(
                                        (plan) => plan.language === "en"
                                      )}
                                      grammars={
                                        grammarAvailable
                                          ? (
                                              value.grammar_structures ?? []
                                            ).filter((g) =>
                                              grammarSelectMatchesSense(
                                                g,
                                                sense
                                              )
                                            )
                                          : undefined
                                      }
                                      grammarLocale={target}
                                      textClassName="tsz-words"
                                      disabled={contentDisabled}
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
                                      definitionTemplates={definitionPlan.filter(
                                        (plan) => plan.language === "zh"
                                      )}
                                      grammars={
                                        grammarAvailable
                                          ? (
                                              value.grammar_structures ?? []
                                            ).filter((g) =>
                                              grammarSelectMatchesSense(
                                                g,
                                                sense
                                              )
                                            )
                                          : undefined
                                      }
                                      grammarLocale={target}
                                      disabled={contentDisabled}
                                      onChange={(definitions) =>
                                        updateSense(sense.id, {
                                          definitions:
                                            definitions as NextDefinition[]
                                        })
                                      }
                                    />
                                  </>
                                )}
                                {sentencesAvailable && requests && (
                                  <SenseSentenceExamples
                                    detailsAvailable={sentenceDetailsAvailable}
                                    associationsAvailable={
                                      sentenceAssociationsAvailable
                                    }
                                    ids={sense.sentence_ids}
                                    target={target}
                                    medium={medium}
                                    disabled={contentDisabled}
                                    requests={requests}
                                    registerLeaveGuard={registerLeaveGuard}
                                    onChange={(sentence_ids) =>
                                      updateSense(sense.id, { sentence_ids })
                                    }
                                  />
                                )}
                                {equivalentMetadataAvailable ? (
                                  <EquivalentRows
                                    key={medium}
                                    sense={sense}
                                    locale={medium}
                                    disabled={contentDisabled}
                                    catalog={equivalentCatalog.data}
                                    loading={equivalentCatalog.isPending}
                                    catalogError={equivalentCatalog.isError}
                                    remaining={500 - draftNodeCount(value)}
                                    onRetry={() => {
                                      void equivalentCatalog.refetch();
                                    }}
                                    onChange={(patch) =>
                                      updateSense(sense.id, patch)
                                    }
                                  />
                                ) : (
                                  <ContentRows
                                    grouped
                                    rows={sense.equivalents}
                                    locale={medium}
                                    label={`${localeLabels[medium]}译词`}
                                    disabled={contentDisabled}
                                    onChange={(equivalents) =>
                                      updateSense(sense.id, { equivalents })
                                    }
                                  />
                                )}
                                {relationsAvailable && requests && entryId && (
                                  <Relations
                                    rows={sense.relations ?? []}
                                    entryId={entryId}
                                    senseId={sense.id}
                                    target={target}
                                    medium={medium}
                                    requests={requests}
                                    disabled={contentDisabled}
                                    onChange={(update) =>
                                      onChange((current) => ({
                                        ...current,
                                        senses: current.senses.map((row) =>
                                          row.id === sense.id
                                            ? {
                                                ...row,
                                                relations: update(
                                                  row.relations ?? []
                                                )
                                              }
                                            : row
                                        )
                                      }))
                                    }
                                  />
                                )}
                              </Flex>
                            </SenseEditorShell>
                          </section>
                        );
                      })
                    }
                  </SortableRows>
                  <Button
                    block
                    className="word-section-add-button"
                    size="large"
                    type="dashed"
                    icon={<Plus aria-hidden />}
                    disabled={contentDisabled}
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
                          newSense(
                            code,
                            senseGroupsAvailable ? inheritedGroup : undefined,
                            senseMetadataAvailable,
                            () => id
                          )
                        ]
                      });
                      setExpanded((current) => ({ ...current, [code]: id }));
                    }}
                  >
                    添加词义
                  </Button>
                </div>
              </Flex>
            )
          };
        })}
      />
    </Flex>
  );
}
