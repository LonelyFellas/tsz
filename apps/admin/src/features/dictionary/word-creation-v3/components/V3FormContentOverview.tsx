import { AdminTable as Table } from "@/components/AdminTable";
import { EditOutlined } from "@ant-design/icons";
import {
  V3FormCopyHandle,
  V3FormCopyHelp,
  useV3FormCopy
} from "./V3FormCopyProvider";
import { Button, Dropdown, Space, Tooltip, Typography } from "antd";
import type {
  WordConcreteFormV3,
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

type OverviewReading = V3DialectSeparatedFormRow & {
  key: string;
  dialect: "uk" | "us";
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
  const { form, dialect, pronunciation: row, pronunciationIndex } = reading;
  if (!row) {
    return (
      <div className="v3-overview-reading">
        <Typography.Text type="secondary">
          {settings ? "—" : `${dialect === "uk" ? "英式" : "美式"}未填写`}
        </Typography.Text>
      </div>
    );
  }
  const variant =
    form.regional_variants.mode === "common"
      ? form.regional_variants.common
      : form.regional_variants[dialect];
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
        <Tooltip
          title={`${dialect === "uk" ? "英式" : "美式"} · 读法 ${pronunciationIndex + 1}${row.style ? ` · ${pronunciationStyleLabel(row.style)}` : ""}`}
        >
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
                className="v3-overview-phonetic tsz-phonetics"
                title={actualPron.text}
              >
                {addSlashes ? "/" : null}
                <RichTextReadOnly value={actualPron} />
                {addSlashes ? "/" : null}
              </span>
            ) : (
              <Typography.Text type="secondary">未填写</Typography.Text>
            )}
          </div>
        </Tooltip>
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
  issues
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
}) {
  const label = useFormTypeLabel();
  const copy = useV3FormCopy();
  const readings = rows.flatMap((row): OverviewReading[] => {
    const regions = row.form.regional_variants;
    const uk = regions.mode === "common" ? regions.common : regions.uk;
    const us = regions.mode === "common" ? regions.common : regions.us;
    const sameSpelling =
      regions.mode === "common" ||
      (uk.spelling.trim().length > 0 && uk.spelling === us.spelling);
    const total =
      Math.max(1, uk.pronunciations.length) +
      Math.max(1, us.pronunciations.length);
    return (["uk", "us"] as const).flatMap((dialect) => {
      const variant = dialect === "uk" ? uk : us;
      const pronunciations = variant.pronunciations.length
        ? variant.pronunciations
        : [undefined];
      return pronunciations.map((pronunciation, pronunciationIndex) => {
        const first = dialect === "uk" && pronunciationIndex === 0;
        return {
          ...row,
          key: `${row.membershipId}:${dialect}:${pronunciation?.id ?? "empty"}`,
          dialect,
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
    });
  });
  return (
    <div className="v3-form-overview">
      <Table<OverviewReading>
        tableId="form-content-overview"
        size="small"
        pagination={false}
        rowKey="key"
        tableLayout="fixed"
        scroll={{ x: 840 }}
        rowHoverable={false}
        dataSource={readings}
        onRow={(row) => ({
          className: row.formRowSpan ? "v3-overview-form-start" : "",
          "data-overview-form-id": row.form.id,
          "data-overview-dialect": row.dialect
        })}
        columns={[
          {
            title: "操作",
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
                    icon={<EditOutlined />}
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
            title: "词形名称",
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
            title: "词形拼写",
            key: "spelling",
            width: "18%",
            onCell: (row) => ({ rowSpan: row.spellingRowSpan }),
            render: (_, { form, dialect, spellingDialect }) => {
              const regions = form.regional_variants;
              const variant =
                regions.mode === "common" ? regions.common : regions[dialect];
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
            title: "读法",
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
            title: <Space>实际发音{copy && <V3FormCopyHelp />}</Space>,
            key: "pronunciation",
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
            title: "音色",
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
            title: "语速",
            key: "rate",
            width: 76,
            onCell: (row) => copy?.cell(row.form.id, "voices") ?? {},
            render: (_, row) => (
              <PronunciationCell reading={row} settings="rate" />
            )
          },
          {
            title: "音量",
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
