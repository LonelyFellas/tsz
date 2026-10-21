import { EditOutlined } from "@ant-design/icons";
import { Button, Select, Space, Table, Tooltip, Typography } from "antd";
import type {
  WordConcreteFormV3,
  WordFormGroupV3,
  V3DraftValidationIssue
} from "@tsz/types";
import { RichTextReadOnly } from "@tsz/voice-editor/reader";
import {
  pronunciationSynthesisContent,
  pronunciationSynthesisSpeech,
  synthesisForLocale
} from "@tsz/shared";
import { useFormTypeLabel } from "../../part-of-speech/FormTypeLabels";
import {
  PronunciationPreviewControls,
  PronunciationPreviewVoiceSummary
} from "../../word-creation/PronunciationPreview";
import { pronunciationStyleLabel } from "../presentation";
import type { V3DialectSeparatedFormRow } from "./V3ConcreteFormRow";

function PronunciationCell({
  form,
  dialect,
  settings
}: {
  form: WordConcreteFormV3;
  dialect: "uk" | "us";
  settings?: "voice" | "rate";
}) {
  const variant =
    form.regional_variants.mode === "common"
      ? form.regional_variants.common
      : form.regional_variants[dialect];
  const locale = dialect === "uk" ? "en-GB" : "en-US";
  return (
    <div
      className={`v3-overview-readings${settings ? " v3-overview-settings" : ""}`}
    >
      {variant.pronunciations.length === 0 ? (
        <Typography.Text type="secondary">未填写</Typography.Text>
      ) : (
        variant.pronunciations.map((row, index) => {
          const synthesis = row.synthesis
            ? synthesisForLocale(row.synthesis, locale, variant.dialect)
            : undefined;
          const content = pronunciationSynthesisContent(
            variant.spelling,
            synthesis,
            locale
          );
          const profile =
            pronunciationSynthesisSpeech(synthesis, locale)?.voice_profile ??
            row.voice_profile;
          const actualPron = row.actual_pron_rich ?? {
            version: 2 as const,
            text: row.actual_pron,
            annotations: []
          };
          const addSlashes =
            actualPron.text.trim() && !actualPron.text.trim().startsWith("/");
          return (
            <div className="v3-overview-reading" key={row.id}>
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
                  title={`读法 ${index + 1}${row.style ? ` · ${pronunciationStyleLabel(row.style)}` : ""}`}
                >
                  <div className="v3-overview-pronunciation">
                    <PronunciationPreviewControls
                      pronunciationId={row.id}
                      dialect={dialect}
                      content={content}
                      voiceProfile={profile}
                      spelling={variant.spelling}
                      disabled={!content}
                      disabledReason="请先填写当前口音的 Azure IPA/UPS 或选择拼写来源"
                      ariaLabelPrefix={`读法 ${index + 1}${dialect === "uk" ? "英式" : "美式"}`}
                      playbackOnly
                    />
                    <span
                      className="v3-overview-phonetic tsz-phonetics"
                      title={actualPron.text}
                    >
                      {addSlashes ? "/" : null}
                      <RichTextReadOnly value={actualPron} emptyText="未填写" />
                      {addSlashes ? "/" : null}
                    </span>
                  </div>
                </Tooltip>
              )}
            </div>
          );
        })
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
  return (
    <div className="v3-form-overview">
      <Table
        size="small"
        pagination={false}
        rowKey="membershipId"
        scroll={{ x: 1140 }}
        dataSource={[...rows]}
        columns={[
          {
            title: "词形名称",
            key: "label",
            width: 150,
            fixed: "left",
            render: (_, row) => (
              <div data-v3-node-id={row.membershipId} data-group-id={group.id}>
                <Tooltip
                  title={row.formTypeDisabledReason ?? row.formTypeChangeHint}
                >
                  <div data-v3-node-id={row.form.id} data-v3-field="form_type">
                    <Select
                      className="v3-overview-form-type"
                      variant="borderless"
                      aria-label={row.formTypeAriaLabel}
                      value={row.form.form_type}
                      disabled={row.formTypeDisabled}
                      options={row.formTypeOptions.map((type) => ({
                        value: type,
                        label: label(type)
                      }))}
                      onChange={(type) => onFormTypeChange(row.form.id, type)}
                    />
                  </div>
                </Tooltip>
                {row.referenceBadge}
                {row.actions}
              </div>
            )
          },
          {
            title: "词形变化",
            key: "spelling",
            width: 150,
            render: (_, { form }) => {
              const regions = form.regional_variants;
              const variants =
                regions.mode === "common"
                  ? [regions.common]
                  : [regions.uk, regions.us];
              return (
                <Space orientation="vertical">
                  {variants.map((variant) => (
                    <div key={variant.id}>
                      {regions.mode !== "common" && (
                        <Typography.Text type="secondary">
                          {variant.dialect === "uk" ? "BrE " : "AmE "}
                        </Typography.Text>
                      )}
                      <RichTextReadOnly
                        className="v3-overview-spelling tsz-words"
                        value={
                          variant.spelling_rich ?? {
                            version: 2,
                            text: variant.spelling || "未填写",
                            annotations: []
                          }
                        }
                      />
                    </div>
                  ))}
                </Space>
              );
            }
          },
          {
            title: "英式发音",
            key: "uk",
            width: 180,
            render: (_, row) => (
              <PronunciationCell form={row.form} dialect="uk" />
            )
          },
          {
            title: "音色",
            key: "ukVoice",
            width: 110,
            render: (_, row) => (
              <PronunciationCell
                form={row.form}
                dialect="uk"
                settings="voice"
              />
            )
          },
          {
            title: "语速",
            key: "ukRate",
            width: 80,
            render: (_, row) => (
              <PronunciationCell form={row.form} dialect="uk" settings="rate" />
            )
          },
          {
            title: "美式发音",
            key: "us",
            width: 180,
            render: (_, row) => (
              <PronunciationCell form={row.form} dialect="us" />
            )
          },
          {
            title: "音色",
            key: "usVoice",
            width: 110,
            render: (_, row) => (
              <PronunciationCell
                form={row.form}
                dialect="us"
                settings="voice"
              />
            )
          },
          {
            title: "语速",
            key: "usRate",
            width: 80,
            render: (_, row) => (
              <PronunciationCell form={row.form} dialect="us" settings="rate" />
            )
          },
          {
            title: "",
            key: "edit",
            width: 100,
            fixed: "right",
            render: (_, row) => (
              <Space orientation="vertical">
                <Tooltip title="编辑词形内容">
                  <Button
                    type="text"
                    className="v3-overview-edit"
                    aria-label={`编辑${label(row.form.form_type)}内容`}
                    icon={<EditOutlined />}
                    data-v3-node-id={row.form.id}
                    data-v3-field="form_id"
                    data-v3-open-content={row.form.id}
                    onClick={() => onEdit(row.form.id)}
                  />
                </Tooltip>
                {(sharedCounts.get(row.form.id) ?? 0) > 1 && (
                  <Typography.Text type="secondary">
                    共用于 {sharedCounts.get(row.form.id)} 个标签
                  </Typography.Text>
                )}
                {issues.some(
                  (issue) => issue.node_location.form_id === row.form.id
                ) && (
                  <Typography.Text type="danger">有待填写项</Typography.Text>
                )}
              </Space>
            )
          }
        ]}
      />
    </div>
  );
}
