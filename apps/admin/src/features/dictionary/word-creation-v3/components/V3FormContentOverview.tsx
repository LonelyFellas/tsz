import { useContext, type DragEvent } from "react";
import { useAdminDisabled } from "@tsz/ui/admin/context";
import { Switch } from "@tsz/ui/admin/forms";
import { FormQuestionContext } from "./formQuestionContext";
import { useLexiconEditorTranslation } from "@/features/dictionary/i18n/editor";
import { regionalVariants } from "@tsz/shared";
import { AdminTable as Table } from "@/components/AdminTable";
import { useColumnSettings } from "@/components/useColumnSettings";
import { PencilIcon } from "lucide-react";
import {
  V3FormCopyHandle,
  V3FormCopyHelp,
  useV3FormCopy
} from "./V3FormCopyProvider";
import { Button, Space, Typography } from "@tsz/ui/admin/display";
import { Dropdown, Tooltip } from "@tsz/ui/admin/overlays";
import type {
  WordConcreteFormV3,
  WordCommonFormVariantV3,
  WordUkFormVariantV3,
  WordUsFormVariantV3,
  WordFormGroupV3,
  WordPronunciationV3,
  V3DraftValidationIssue
} from "@tsz/types";
import { RichTextReadOnly } from "@tsz/voice-editor/reader";
import { pronunciationPlaybackSource, synthesisForLocale } from "@tsz/shared";
import { useFormTypeLabel } from "../../part-of-speech/FormTypeLabels";
import { PronunciationPreviewVoiceList } from "../../word-creation/PronunciationPreview";
import type { V3DialectSeparatedFormRow } from "./V3ConcreteFormRow";
import { v3FormIssueMessages } from "../presentationErrors";
import { sortableRowClass, useSortableRows } from "../sortableRows";
import { SortableDragHandle } from "./SortableDragHandle";

export const formOverviewTableId = "form-content-overview";
const DEFAULT_OVERVIEW_COLUMN_LABELS = {
  edit: "操作",
  label: "词形名称",
  spelling: "词形拼写",
  style: "读法",
  pronunciation: "实际发音",
  voice: "配音",
  rate: "语速",
  volume: "音量"
};
export const formOverviewColumnMessages = {
  edit: "actions",
  label: "form_name",
  spelling: "spelling",
  style: "reading",
  pronunciation: "actual_pronunciation",
  voice: "voice_source",
  rate: "rate",
  volume: "volume"
} as const;
export const formOverviewColumnSettings = Object.entries(
  DEFAULT_OVERVIEW_COLUMN_LABELS
).map(([key, label]) => ({
  key,
  label,
  visible: true,
  fixed:
    key === "edit" || key === "label" ? ("left" as const) : (false as const)
}));

type OverviewReading = V3DialectSeparatedFormRow & {
  key: string;
  baseSortIndex: number | undefined;
  dialect: "uk" | "us";
  variant: WordCommonFormVariantV3 | WordUkFormVariantV3 | WordUsFormVariantV3;
  pronunciation?: WordPronunciationV3;
  pronunciationIndex: number;
  formRowSpan: number;
  lastFormRow: boolean;
  spellingRowSpan: number;
  spellingDialect: "common" | "uk" | "us";
};

function ActualPronunciation({ reading }: { reading: OverviewReading }) {
  const { t } = useLexiconEditorTranslation();
  const { dialect, pronunciation } = reading;
  if (!pronunciation) {
    return (
      <Typography.Text type="secondary">
        {t("blank_label", {
          label: dialect === "uk" ? t("dialect_uk") : t("dialect_us")
        })}
      </Typography.Text>
    );
  }
  const actualPron = pronunciation.actual_pron_rich ?? {
    version: 2 as const,
    text: pronunciation.actual_pron,
    annotations: []
  };
  const text = actualPron.text.trim();
  if (!text)
    return <Typography.Text type="secondary">{t("blank")}</Typography.Text>;
  return (
    <span
      className={`v3-overview-phonetic tsz-phonetics${text.startsWith("/") ? "" : " has-slashes"}`}
      title={actualPron.text}
    >
      <RichTextReadOnly value={actualPron} />
    </span>
  );
}

function VoiceSettingsCell({
  reading,
  column
}: {
  reading: OverviewReading;
  column: "voice" | "rate" | "volume";
}) {
  const { t } = useLexiconEditorTranslation();
  const { dialect, pronunciation: row, pronunciationIndex, variant } = reading;
  if (!row) {
    return (
      <div className="v3-overview-reading">
        <Typography.Text type="secondary">—</Typography.Text>
      </div>
    );
  }
  const locale = dialect === "uk" ? "en-GB" : "en-US";
  const {
    content,
    profile: activeProfile,
    assetId
  } = pronunciationPlaybackSource(
    variant.spelling,
    row,
    variant.spelling_speech,
    locale,
    variant.dialect
  );
  const source = row.synthesis
    ? synthesisForLocale(row.synthesis, locale, variant.dialect).source
    : undefined;
  const profile = source ? activeProfile : (activeProfile ?? row.voice_profile);
  const recommendationArea =
    source === "spelling" || (!source && row.synthesis?.use_spelling)
      ? "word"
      : "azure";
  return (
    <div className="v3-overview-settings">
      <PronunciationPreviewVoiceList
        recommendationArea={recommendationArea}
        dialect={dialect}
        voiceProfile={profile}
        content={content}
        source={source}
        audioAssets={row.audio_assets}
        audioAssetId={assetId}
        column={column}
        playback={
          column === "voice"
            ? {
                pronunciationId: row.id,
                label: t("reading_index", {
                  index: pronunciationIndex + 1,
                  details: dialect === "uk" ? t("dialect_uk") : t("dialect_us")
                })
              }
            : undefined
        }
      />
    </div>
  );
}

export function V3FormContentOverview({
  rows,
  group,
  sharedCounts,
  onEdit,
  onFormTypeChange,
  onBaseFormOrderChange,
  issues,
  showColumnSettings = true,
  onFixedOverflowChange
}: {
  rows: readonly V3DialectSeparatedFormRow[];
  group: WordFormGroupV3;
  sharedCounts: ReadonlyMap<string, number>;
  onEdit: (formId: string) => void;
  onFormTypeChange: (
    formId: string,
    type: WordConcreteFormV3["form_type"]
  ) => void;
  onBaseFormOrderChange?: (orderedIds: readonly string[]) => void;
  issues: readonly V3DraftValidationIssue[];
  showColumnSettings?: boolean;
  onFixedOverflowChange?: (overflow: boolean) => void;
}) {
  const { t } = useLexiconEditorTranslation();
  const disabled = useAdminDisabled();
  const copy = useV3FormCopy();
  const baseRows = rows.filter((row) => row.form.form_type === "base");
  const showBaseSorting = !!onBaseFormOrderChange && baseRows.length > 1;
  const baseIndexes = new Map(
    baseRows.map((row, index) => [row.membershipId, index])
  );
  const sorting = useSortableRows({
    items:
      !disabled && !copy?.source && !copy?.busy && showBaseSorting
        ? baseRows
        : [],
    scopeId: group.id,
    dragType: "application/x-tsz-v3-base-form",
    onChange: (next) =>
      onBaseFormOrderChange?.(next.map((row) => row.membershipId))
  });
  const questions = useContext(FormQuestionContext);
  const overviewColumnLabels = {
    edit: t("actions"),
    label: t("form_name"),
    spelling: t("spelling"),
    style: t("reading"),
    pronunciation: t("actual_pronunciation"),
    voice: t("voice_source"),
    rate: t("rate"),
    volume: t("volume")
  };
  const label = useFormTypeLabel();
  const { columns } = useColumnSettings(
    formOverviewTableId,
    formOverviewColumnSettings
  );
  const copyPhoneticsInReading = columns.some(
    ({ key, visible }) => key === "style" && visible
  );
  const readings = rows.flatMap((row): OverviewReading[] => {
    const baseSortIndex = baseIndexes.get(row.membershipId);
    const regions = row.form.regional_variants;
    const uk = regionalVariants(regions, "uk");
    const us = regionalVariants(regions, "us");
    const sameSpelling =
      uk.length === 1 &&
      us.length === 1 &&
      (regions.mode === "common" ||
        (uk[0]!.spelling.trim().length > 0 &&
          uk[0]!.spelling === us[0]!.spelling));
    const total = [...uk, ...us].reduce(
      (sum, variant) => sum + Math.max(1, variant.pronunciations.length),
      0
    );
    let emitted = 0;
    return (["uk", "us"] as const).flatMap((dialect) =>
      regionalVariants(regions, dialect).flatMap((variant) => {
        const pronunciations = variant.pronunciations.length
          ? variant.pronunciations
          : [undefined];
        return pronunciations.map((pronunciation, pronunciationIndex) => {
          const first = emitted++ === 0;
          return {
            ...row,
            key: `${row.membershipId}:${dialect}:${variant.id}:${pronunciation?.id ?? "empty"}`,
            baseSortIndex,
            dialect,
            variant,
            pronunciation,
            pronunciationIndex,
            formRowSpan: first ? total : 0,
            lastFormRow: emitted === total,
            spellingRowSpan: sameSpelling
              ? first
                ? total
                : 0
              : pronunciationIndex === 0
                ? pronunciations.length
                : 0,
            spellingDialect: sameSpelling ? "common" : dialect
          };
        });
      })
    );
  });

  return (
    <div className="v3-form-overview">
      <Table<OverviewReading>
        tableId={formOverviewTableId}
        showColumnSettings={showColumnSettings}
        onFixedOverflowChange={onFixedOverflowChange}
        size="small"
        pagination={false}
        rowKey="key"
        tableLayout="fixed"
        scroll={{ x: 1080 }}
        rowHoverable={false}
        dataSource={readings}
        onRow={(row) => {
          const index = row.baseSortIndex;
          const startClass = row.formRowSpan ? "v3-overview-form-start" : "";
          const droppingAfter =
            sorting.draggingIndex !== undefined &&
            index !== undefined &&
            sorting.dragOverIndex === index &&
            sorting.draggingIndex < index;
          const onSortableEdge = droppingAfter
            ? row.lastFormRow
            : row.formRowSpan > 0;
          const sortingClass =
            onSortableEdge && sorting.canReorder && index !== undefined
              ? sortableRowClass("word-sortable-row", sorting, index)
              : "";
          return {
            className: [startClass, sortingClass].filter(Boolean).join(" "),
            "data-overview-form-id": row.form.id,
            "data-overview-dialect": row.dialect,
            ...(sorting.canReorder &&
            sorting.draggingIndex !== undefined &&
            index !== undefined
              ? {
                  onDragOver: (event: DragEvent<HTMLElement>) =>
                    sorting.handleDragOver(event, index),
                  onDragLeave: sorting.handleDragLeave,
                  onDrop: (event: DragEvent<HTMLElement>) =>
                    sorting.handleDrop(event, index)
                }
              : {})
          };
        }}
        columns={[
          {
            title: overviewColumnLabels.edit,
            key: "edit",
            className: "v3-overview-action-cell",
            width: showBaseSorting ? 108 : 80,
            fixed: "left",
            onCell: (row) => ({ rowSpan: row.formRowSpan }),
            render: (_, row) => (
              <div className="v3-overview-actions word-sort-leading">
                {showBaseSorting && row.baseSortIndex !== undefined && (
                  <SortableDragHandle
                    index={row.baseSortIndex}
                    label={t("drag_item", { label: row.formLabel })}
                    sorting={sorting}
                    dragImageSelector=".ui-table-row"
                  />
                )}
                {row.actions}
                <Tooltip title={t("edit_content")}>
                  <Button
                    type="text"
                    size="small"
                    className="v3-overview-edit"
                    aria-label={t("edit_content_label", {
                      label: label(row.form.form_type)
                    })}
                    icon={<PencilIcon />}
                    data-v3-node-id={row.form.id}
                    data-v3-field="form_id"
                    data-v3-open-content={row.form.id}
                    onClick={() => onEdit(row.form.id)}
                  />
                </Tooltip>
              </div>
            )
          },
          {
            title: overviewColumnLabels.label,
            key: "label",
            width: 104,
            fixed: "left",
            onCell: (row) => ({ rowSpan: row.formRowSpan }),
            render: (_, row) => {
              const peers = rows.filter(
                (item) => item.form.form_type === row.form.form_type
              );
              const issueMessages = v3FormIssueMessages(issues, row.form.id, t);
              return (
                <div
                  data-v3-node-id={row.membershipId}
                  data-group-id={group.id}
                >
                  <Typography.Text
                    className="v3-overview-form-type"
                    strong
                    data-v3-node-id={row.form.id}
                    data-v3-field="form_type"
                    tabIndex={-1}
                  >
                    {label(row.form.form_type)}
                    {peers.length > 1 && (
                      <sup>
                        {peers.findIndex(
                          (peer) => peer.membershipId === row.membershipId
                        ) + 1}
                      </sup>
                    )}
                  </Typography.Text>
                  {issues.some(
                    (issue) =>
                      issue.field === "form_type" &&
                      (issue.node_location.form_id === row.form.id ||
                        issue.node_id === row.form.id)
                  ) && (
                    <Dropdown
                      trigger={["click"]}
                      menu={{
                        items: row.formTypeOptions.map((type) => ({
                          key: type,
                          label: label(type)
                        })),
                        onClick: ({ key }) => onFormTypeChange(row.form.id, key)
                      }}
                    >
                      <Button
                        type="link"
                        size="small"
                        className="v3-overview-type-fix"
                        disabled={row.formTypeDisabled}
                        aria-label={t("adjust_type_label", {
                          label: label(row.form.form_type)
                        })}
                      >
                        {t("adjust_form_type")}
                      </Button>
                    </Dropdown>
                  )}
                  {row.referenceBadge}
                  <Space
                    orientation="vertical"
                    size={4}
                    className="v3-overview-notes"
                  >
                    {(sharedCounts.get(row.form.id) ?? 0) > 1 && (
                      <Typography.Text type="secondary">
                        {t("shared_label_count", {
                          count: sharedCounts.get(row.form.id) ?? 0
                        })}
                      </Typography.Text>
                    )}
                    {issueMessages.map((message) => (
                      <Typography.Text type="danger" key={message}>
                        {`${t("pending_fields")}：${message}`}
                      </Typography.Text>
                    ))}
                  </Space>
                </div>
              );
            }
          },
          {
            title: overviewColumnLabels.spelling,
            key: "spelling",
            width: 160,
            onCell: (row) => ({ rowSpan: row.spellingRowSpan }),
            render: (_, { form, variant, spellingDialect }) => {
              const dialectLabel =
                spellingDialect === "common"
                  ? t("common_spelling")
                  : spellingDialect === "uk"
                    ? t("british_spelling")
                    : t("american_spelling");
              return (
                <div
                  aria-label={t("panel_open_editor", {
                    p0: label(form.form_type)
                  })}
                  className="v3-overview-spellings"
                  onClick={() => onEdit(form.id)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    onEdit(form.id);
                  }}
                  role="button"
                  tabIndex={0}
                  title={variant.spelling || undefined}
                >
                  <Tooltip title={dialectLabel}>
                    <span
                      className={`dialect-dot dialect-dot-${spellingDialect} v3-overview-dialect-dot`}
                      data-spelling-dialect={spellingDialect}
                      role="img"
                      aria-label={dialectLabel}
                    />
                  </Tooltip>
                  {variant.spelling.trim() ? (
                    <RichTextReadOnly
                      className="v3-overview-spelling tsz-words"
                      value={
                        variant.spelling_rich ?? {
                          version: 2,
                          text: variant.spelling,
                          annotations: []
                        }
                      }
                    />
                  ) : (
                    <Typography.Text type="secondary">
                      {t("blank")}
                    </Typography.Text>
                  )}
                </div>
              );
            }
          },
          {
            title: overviewColumnLabels.style,
            key: "style",
            width: 148,
            onCell: (row) => copy?.cell(row.form.id, "phonetics") ?? {},
            render: (_, row) => (
              <div
                className={`v3-overview-reading${copy ? " v3-overview-copy-source" : ""}`}
              >
                {copy && row.formRowSpan > 0 && (
                  <V3FormCopyHandle formId={row.form.id} kind="phonetics" />
                )}
                {row.pronunciation?.style ? (
                  <span title={t(`reading_${row.pronunciation.style}`)}>
                    {t(`reading_${row.pronunciation.style}`)}
                  </span>
                ) : (
                  <Typography.Text type="secondary">
                    {row.pronunciation ? t("blank") : "—"}
                  </Typography.Text>
                )}
              </div>
            )
          },
          {
            title: (
              <Space>
                {overviewColumnLabels.pronunciation}
                {copy && <V3FormCopyHelp />}
              </Space>
            ),
            key: "pronunciation",
            width: 204,
            onCell: (row) => copy?.cell(row.form.id, "phonetics") ?? {},
            render: (_, row) => (
              <div
                className={`v3-overview-reading${copy && !copyPhoneticsInReading ? " v3-overview-copy-source" : ""}`}
              >
                {copy && !copyPhoneticsInReading && row.formRowSpan > 0 && (
                  <V3FormCopyHandle formId={row.form.id} kind="phonetics" />
                )}
                <ActualPronunciation reading={row} />
              </div>
            )
          },
          {
            title: overviewColumnLabels.voice,
            key: "voice",
            width: 208,
            onCell: (row) => copy?.cell(row.form.id, "voices") ?? {},
            render: (_, row) => (
              <div
                className={`v3-overview-voice${copy ? " v3-overview-copy-source" : ""}`}
              >
                {copy && row.formRowSpan > 0 && (
                  <V3FormCopyHandle formId={row.form.id} kind="voices" />
                )}
                <VoiceSettingsCell reading={row} column="voice" />
              </div>
            )
          },
          {
            title: overviewColumnLabels.rate,
            key: "rate",
            width: 88,
            align: "center",
            className: "v3-overview-numeric-cell",
            onCell: (row) => copy?.cell(row.form.id, "voices") ?? {},
            render: (_, row) => (
              <VoiceSettingsCell reading={row} column="rate" />
            )
          },
          {
            title: overviewColumnLabels.volume,
            key: "volume",
            width: 88,
            align: "center",
            className: "v3-overview-numeric-cell",
            onCell: (row) => copy?.cell(row.form.id, "voices") ?? {},
            render: (_, row) => (
              <VoiceSettingsCell reading={row} column="volume" />
            )
          },
          ...(questions
            ? [
                {
                  title: t("question_eligible"),
                  key: "question_eligible",
                  width: 92,
                  onCell: (row: OverviewReading) => ({
                    rowSpan: row.formRowSpan
                  }),
                  render: (_: unknown, row: OverviewReading) => (
                    <Switch
                      checked={questions.settings.get(row.form.id) ?? true}
                      disabled={questions.disabled}
                      aria-label={t("question_eligible_for", {
                        form: label(row.form.form_type)
                      })}
                      onChange={(enabled) =>
                        questions.change(row.form.id, enabled)
                      }
                    />
                  )
                }
              ]
            : [])
        ]}
      />
    </div>
  );
}
