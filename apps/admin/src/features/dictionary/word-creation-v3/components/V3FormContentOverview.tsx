import { regionalVariants } from "@tsz/shared";
import { AdminTable as Table } from "@/components/AdminTable";
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
import { pronunciationPlaybackSource } from "@tsz/shared";
import { useFormTypeLabel } from "../../part-of-speech/FormTypeLabels";
import {
  PronunciationPreviewControls,
  PronunciationPreviewVoiceSummary
} from "../../word-creation/PronunciationPreview";
import { pronunciationStyleLabel } from "../presentation";
import type { V3DialectSeparatedFormRow } from "./V3ConcreteFormRow";

export const formOverviewTableId = "form-content-overview";
const overviewColumnLabels = {
  edit: "操作",
  label: "词形名称",
  spelling: "词形拼写",
  style: "读法",
  pronunciation: "实际发音",
  voice: "音色",
  rate: "语速",
  volume: "音量"
};
export const formOverviewColumnSettings = Object.entries(
  overviewColumnLabels
).map(([key, label]) => ({
  key,
  label,
  visible: true,
  fixed:
    key === "edit" || key === "label" ? ("left" as const) : (false as const)
}));

type OverviewReading = V3DialectSeparatedFormRow & {
  key: string;
  dialect: "uk" | "us";
  variant: WordCommonFormVariantV3 | WordUkFormVariantV3 | WordUsFormVariantV3;
  pronunciation?: WordPronunciationV3;
  pronunciationIndex: number;
  formRowSpan: number;
  spellingRowSpan: number;
  spellingDialect: "common" | "uk" | "us";
};

function PronunciationCell({
  reading,
  settings
}: {
  reading: OverviewReading;
  settings?: "voice" | "rate" | "volume";
}) {
  const { dialect, pronunciation: row, pronunciationIndex } = reading;
  if (!row) {
    return (
      <div className="v3-overview-reading">
        <Typography.Text type="secondary">
          {settings ? "—" : `${dialect === "uk" ? "英式" : "美式"}未填写`}
        </Typography.Text>
      </div>
    );
  }
  const variant = reading.variant;
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
  const profile = activeProfile ?? row.voice_profile;
  const actualPron = row.actual_pron_rich ?? {
    version: 2 as const,
    text: row.actual_pron,
    annotations: []
  };
  const addSlashes =
    actualPron.text.trim() && !actualPron.text.trim().startsWith("/");
  return (
    <div
      className={`v3-overview-reading${settings ? " v3-overview-settings" : ""}`}
    >
      {settings ? (
        <PronunciationPreviewVoiceSummary
          dialect={dialect}
          voiceProfile={profile}
          pronunciationId={row.id}
          content={content}
          column={settings}
        />
      ) : (
        <div className="v3-overview-pronunciation">
          <PronunciationPreviewControls
            pronunciationId={row.id}
            dialect={dialect}
            content={content}
            voiceProfile={profile}
            spelling={variant.spelling}
            audioAssetId={assetId}
            disabled={!content && !assetId}
            disabledReason={
              content || !row.synthesis
                ? "尚未保存正式音频，请返回编辑补齐"
                : "请先填写当前口音的 Azure IPA/UPS 或选择拼写来源"
            }
            ariaLabelPrefix={`读法 ${pronunciationIndex + 1}${dialect === "uk" ? "英式" : "美式"}`}
            playbackOnly
          />
          {actualPron.text.trim() ? (
            <span
              className={`v3-overview-phonetic tsz-phonetics${addSlashes ? " has-slashes" : ""}`}
              title={actualPron.text}
            >
              <RichTextReadOnly value={actualPron} />
            </span>
          ) : (
            <Typography.Text type="secondary">未填写</Typography.Text>
          )}
        </div>
      )}
    </div>
  );
}

export function V3FormContentOverview({
  rows,
  group,
  sharedCounts,
  onEdit,
  onFormTypeChange,
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
  issues: readonly V3DraftValidationIssue[];
  showColumnSettings?: boolean;
  onFixedOverflowChange?: (overflow: boolean) => void;
}) {
  const label = useFormTypeLabel();
  const copy = useV3FormCopy();
  const readings = rows.flatMap((row): OverviewReading[] => {
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
            dialect,
            variant,
            pronunciation,
            pronunciationIndex,
            formRowSpan: first ? total : 0,
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
        scroll={{ x: 1000 }}
        rowHoverable={false}
        dataSource={readings}
        onRow={(row) => ({
          className: row.formRowSpan ? "v3-overview-form-start" : "",
          "data-overview-form-id": row.form.id,
          "data-overview-dialect": row.dialect
        })}
        columns={[
          {
            title: overviewColumnLabels.edit,
            key: "edit",
            className: "v3-overview-action-cell",
            width: 80,
            fixed: "left",
            onCell: (row) => ({ rowSpan: row.formRowSpan }),
            render: (_, row) => (
              <div className="v3-overview-actions">
                {row.actions}
                <Tooltip title="编辑词形内容">
                  <Button
                    type="text"
                    size="small"
                    className="v3-overview-edit"
                    aria-label={`编辑${label(row.form.form_type)}内容`}
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
                        aria-label={`调整${label(row.form.form_type)}词形类型`}
                      >
                        调整词形类型
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
                        共用于 {sharedCounts.get(row.form.id)} 个标签
                      </Typography.Text>
                    )}
                    {issues.some(
                      (issue) => issue.node_location.form_id === row.form.id
                    ) && (
                      <Typography.Text type="danger">
                        有待填写项
                      </Typography.Text>
                    )}
                  </Space>
                </div>
              );
            }
          },
          {
            title: overviewColumnLabels.spelling,
            key: "spelling",
            width: "18%",
            onCell: (row) => ({ rowSpan: row.spellingRowSpan }),
            render: (_, { variant, spellingDialect }) => {
              const dialectLabel =
                spellingDialect === "common"
                  ? "英美通用拼写"
                  : spellingDialect === "uk"
                    ? "英式拼写"
                    : "美式拼写";
              return (
                <div className="v3-overview-spellings">
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
                    <Typography.Text type="secondary">未填写</Typography.Text>
                  )}
                </div>
              );
            }
          },
          {
            title: overviewColumnLabels.style,
            key: "style",
            width: 96,
            render: (_, { pronunciation }) => (
              <div className="v3-overview-reading">
                {pronunciation?.style ? (
                  pronunciationStyleLabel(pronunciation.style)
                ) : (
                  <Typography.Text type="secondary">
                    {pronunciation ? "未填写" : "—"}
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
            width: 200,
            onCell: (row) => copy?.cell(row.form.id, "phonetics") ?? {},
            render: (_, row) => (
              <div className="v3-form-copy-content">
                <PronunciationCell reading={row} />
                {row.formRowSpan > 0 && (
                  <V3FormCopyHandle formId={row.form.id} kind="phonetics" />
                )}
              </div>
            )
          },
          {
            title: overviewColumnLabels.voice,
            key: "voice",
            width: 144,
            onCell: (row) => copy?.cell(row.form.id, "voices") ?? {},
            render: (_, row) => (
              <div className="v3-form-copy-content">
                <PronunciationCell reading={row} settings="voice" />
                {row.formRowSpan > 0 && (
                  <V3FormCopyHandle formId={row.form.id} kind="voices" />
                )}
              </div>
            )
          },
          {
            title: overviewColumnLabels.rate,
            key: "rate",
            width: 76,
            onCell: (row) => copy?.cell(row.form.id, "voices") ?? {},
            render: (_, row) => (
              <PronunciationCell reading={row} settings="rate" />
            )
          },
          {
            title: overviewColumnLabels.volume,
            key: "volume",
            width: 76,
            onCell: (row) => copy?.cell(row.form.id, "voices") ?? {},
            render: (_, row) => (
              <PronunciationCell reading={row} settings="volume" />
            )
          }
        ]}
      />
    </div>
  );
}
