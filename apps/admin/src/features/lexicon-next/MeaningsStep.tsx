import { useState, type Dispatch, type SetStateAction } from "react";
import {
  Button,
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
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import type { NextDefinition, NextDraft, NextSense } from "@tsz/types";
import { partOfSpeechLabel } from "@/features/dictionary/word-creation-v3/presentation";
import { useLexiconEditorTranslation } from "@/features/dictionary/i18n/editor";
import { ContentRows } from "./ContentRows";
import { localeLabels } from "./model";
import "@/features/dictionary/word-creation-v3/posTabs.css";

export function MeaningsStep({
  value,
  target,
  medium,
  partOfSpeechCodes,
  disabled,
  senseGroupsAvailable = false,
  onChange
}: {
  value: NextDraft;
  target: string;
  medium: string;
  partOfSpeechCodes: string[];
  disabled: boolean;
  senseGroupsAvailable?: boolean;
  onChange: Dispatch<SetStateAction<NextDraft>>;
}) {
  const { modal } = App.useApp();
  const { t } = useLexiconEditorTranslation();
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
      ...value.senses.map((sense) => sense.part_of_speech ?? "")
    ])
  ];
  if (!codes.length) codes.push("");
  const activePos = codes.includes(selectedPos ?? "")
    ? (selectedPos ?? "")
    : codes[0]!;
  const label = (code: string) =>
    code ? partOfSpeechLabel(code, t) : "未指定词性";
  function updateSense(id: string, patch: Partial<NextSense>) {
    onChange({
      ...value,
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
        items={codes.map((code) => {
          const senses = value.senses.filter(
            (sense) => (sense.part_of_speech ?? "") === code
          );
          const expandedId =
            expanded[code] === undefined ? senses[0]?.id : expanded[code];
          return {
            key: code,
            label: (
              <span className="word-pos-tab-content">
                <strong>{label(code)}</strong>
              </span>
            ),
            children: (
              <Flex vertical gap={12}>
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
