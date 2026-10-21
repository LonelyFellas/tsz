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
    <Space orientation="vertical" size={12}>
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
          return (
            <div className="v3-overview-reading" key={row.id}>
              <Typography.Text type="secondary">
                读法 {index + 1}
                {row.style ? ` · ${pronunciationStyleLabel(row.style)}` : ""}
              </Typography.Text>
              {settings ? (
                <PronunciationPreviewVoiceSummary
                  dialect={dialect}
                  voiceProfile={profile}
                  pronunciationId={row.id}
                  content={content}
                  column={settings}
                />
              ) : (
                <>
                  <RichTextReadOnly
                    value={
                      row.actual_pron_rich ?? {
                        version: 2,
                        text: row.actual_pron,
                        annotations: []
                      }
                    }
                  />
                  <PronunciationPreviewControls
                    pronunciationId={row.id}
                    dialect={dialect}
                    content={content}
                    voiceProfile={profile}
                    spelling={variant.spelling}
                    disabled={!content}
                    disabledReason="请先填写当前口音的 Azure IPA/UPS 或选择拼写来源"
                    ariaLabelPrefix={`读法 ${index + 1}${dialect === "uk" ? "英式" : "美式"}`}
                    compact
                  />
                </>
              )}
            </div>
          );
        })
      )}
    </Space>
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
        scroll={{ x: 1420 }}
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
            title: "词形拼写",
            key: "spelling",
            width: 180,
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
            title: "英式实际发音",
            key: "uk",
            width: 180,
            render: (_, row) => (
              <PronunciationCell form={row.form} dialect="uk" />
            )
          },
          {
            title: "英式音色",
            key: "ukVoice",
            width: 180,
            render: (_, row) => (
              <PronunciationCell
                form={row.form}
                dialect="uk"
                settings="voice"
              />
            )
          },
          {
            title: "英式语速",
            key: "ukRate",
            width: 110,
            render: (_, row) => (
              <PronunciationCell form={row.form} dialect="uk" settings="rate" />
            )
          },
          {
            title: "美式实际发音",
            key: "us",
            width: 180,
            render: (_, row) => (
              <PronunciationCell form={row.form} dialect="us" />
            )
          },
          {
            title: "美式音色",
            key: "usVoice",
            width: 180,
            render: (_, row) => (
              <PronunciationCell
                form={row.form}
                dialect="us"
                settings="voice"
              />
            )
          },
          {
            title: "美式语速",
            key: "usRate",
            width: 110,
            render: (_, row) => (
              <PronunciationCell form={row.form} dialect="us" settings="rate" />
            )
          },
          {
            title: "内容设置",
            key: "edit",
            width: 150,
            fixed: "right",
            render: (_, row) => (
              <Space orientation="vertical">
                <Button
                  icon={<EditOutlined />}
                  data-v3-node-id={row.form.id}
                  data-v3-field="form_id"
                  data-v3-open-content={row.form.id}
                  onClick={() => onEdit(row.form.id)}
                >
                  编辑
                </Button>
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
