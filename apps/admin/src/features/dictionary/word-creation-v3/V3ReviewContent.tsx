import {
  CheckCircleFilled,
  ReadOutlined,
  SoundOutlined
} from "@ant-design/icons";
import { Card, Collapse, Empty, Flex, Tag, Typography } from "antd";
import type { AdminWordV3 } from "@tsz/types";
import type { ReactNode } from "react";
import {
  dialectLabel,
  formTypeLabel,
  partOfSpeechLabel,
  pronunciationStyleLabel
} from "./presentation";
import { buildV3ReviewModel } from "./reviewModel";
import { V3MeaningsPreview } from "./V3MeaningsPreview";
import "./v3-preview.css";

interface Props {
  word: AdminWordV3;
  actions?: ReactNode;
  readiness?: ReactNode;
}

function FormsReview({ word }: { word: AdminWordV3 }) {
  if (word.forms.pos.length === 0) {
    return <Empty description="暂无词形与发音" />;
  }
  return (
    <Flex vertical gap="middle">
      {word.forms.pos.map((pos) => (
        <section className="v3-review-pos" key={pos.pos_id}>
          <Flex align="center" justify="space-between" wrap gap="small">
            <Typography.Title level={4} style={{ margin: 0 }}>
              {partOfSpeechLabel(pos.pos)}
            </Typography.Title>
            <Tag>{pos.form_groups.length} 个变化组</Tag>
          </Flex>
          <Typography.Text strong className="v3-review-section-label">
            词形变化组
          </Typography.Text>
          {pos.form_groups.length > 0 ? (
            <ul className="v3-review-group-list">
              {pos.form_groups.map((group, groupIndex) => (
                <li
                  className="v3-review-group"
                  data-testid={`preview-group-${group.id}`}
                  key={group.id}
                >
                  <Flex gap="small" wrap>
                    <Tag>变化组 {groupIndex + 1}</Tag>
                    <Typography.Text type="secondary">
                      {group.is_regular ? "规则组" : "非规则组"}
                    </Typography.Text>
                    {group.members.map((member, memberIndex) => {
                      const form = pos.forms.find(
                        (candidate) => candidate.id === member.form_id
                      );
                      const variant =
                        form?.regional_variants.mode === "common"
                          ? form.regional_variants.common
                          : form?.regional_variants.uk;
                      return (
                        <Tag
                          data-testid={`preview-membership-${member.id}`}
                          key={member.id}
                        >
                          {memberIndex + 1}.{" "}
                          {form ? formTypeLabel(form.form_type) : "未知词形"}
                          {variant ? ` · ${variant.spelling}` : ""}
                        </Tag>
                      );
                    })}
                  </Flex>
                </li>
              ))}
            </ul>
          ) : (
            <Typography.Text type="secondary">暂无变化组</Typography.Text>
          )}
          <Typography.Text strong className="v3-review-section-label">
            词形与发音
          </Typography.Text>
          <ul className="v3-review-list">
            {pos.forms.map((form) => {
              const variants =
                form.regional_variants.mode === "common"
                  ? [form.regional_variants.common]
                  : [form.regional_variants.uk, form.regional_variants.us];
              return (
                <li
                  className="v3-review-form"
                  data-testid={`preview-form-${form.id}`}
                  key={form.id}
                >
                  <div className="v3-review-form-type">
                    {formTypeLabel(form.form_type)}
                  </div>
                  <div className="v3-review-form-variants">
                    {variants.map((variant) => (
                      <div className="v3-review-variant" key={variant.id}>
                        <Flex align="center" gap="small" wrap>
                          <Tag color="blue">
                            {dialectLabel(variant.dialect)}
                          </Tag>
                          <Typography.Text strong>
                            {variant.spelling || "待填写拼写"}
                          </Typography.Text>
                        </Flex>
                        <Flex
                          vertical
                          gap={2}
                          className="v3-review-pronunciations"
                        >
                          {variant.pronunciations.length > 0 ? (
                            variant.pronunciations.map((pronunciation) => (
                              <Typography.Text
                                data-testid={`preview-pronunciation-${pronunciation.id}`}
                                key={pronunciation.id}
                                type="secondary"
                              >
                                {pronunciation.style
                                  ? pronunciationStyleLabel(pronunciation.style)
                                  : "未选择发音方式"}
                                {pronunciation.dict_phonetic
                                  ? ` · 词典音标 ${pronunciation.dict_phonetic}`
                                  : ""}
                                {pronunciation.actual_pron
                                  ? ` · 实际发音 ${pronunciation.actual_pron}`
                                  : ""}
                              </Typography.Text>
                            ))
                          ) : (
                            <Typography.Text type="secondary">
                              暂无发音
                            </Typography.Text>
                          )}
                        </Flex>
                      </div>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </Flex>
  );
}

export function V3ReviewContent({ word, actions, readiness }: Props) {
  const model = buildV3ReviewModel(word);
  const statusColor =
    model.state.status === "published"
      ? "success"
      : model.state.status === "archived"
        ? "warning"
        : "processing";
  const summaryItems = [
    ["基本词性", model.summary.posCount],
    ["原形数", model.summary.baseCount],
    ["全部词形", model.summary.formCount],
    ["发音", model.summary.pronunciationCount],
    ["词义", model.summary.senseCount],
    ["例句", model.summary.sentenceCount],
    ["关系词", model.summary.relationCount]
  ] as const;

  return (
    <section className="v3-review" aria-label="预览并生效">
      <Card className="v3-review-header">
        <Flex align="flex-start" justify="space-between" gap="large" wrap>
          <div>
            <Typography.Text className="v3-review-kicker">
              当前词条
            </Typography.Text>
            <Typography.Title level={2}>
              {model.identity.label}
            </Typography.Title>
            <Flex gap="small" wrap>
              <Tag>{model.identity.kindLabel}</Tag>
              <Tag>{model.identity.languageLabel}</Tag>
            </Flex>
            {model.state.status === "published" ||
            model.state.status === "archived" ? (
              <Typography.Text type="secondary">
                当前词条为只读查看
              </Typography.Text>
            ) : null}
          </div>
          <Flex vertical align="flex-end" gap="small">
            <Tag className="v3-review-status" color={statusColor}>
              {model.state.statusLabel}
            </Tag>
            {actions}
          </Flex>
        </Flex>
      </Card>

      <div className="v3-review-overview">
        <Card
          className="v3-review-readiness"
          title={
            <Flex align="center" gap="small">
              <CheckCircleFilled />
              发布就绪
            </Flex>
          }
        >
          {readiness ?? (
            <Typography.Text type="secondary">
              当前内容已保存，可查看内容或发布历史。
            </Typography.Text>
          )}
        </Card>
        <Card className="v3-review-summary" title="内容概览">
          <div className="v3-review-summary-grid">
            {summaryItems.map(([label, value]) => (
              <div className="v3-review-summary-item" key={label}>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="v3-review-content" title="内容核对">
        <Collapse
          defaultActiveKey={["forms", "meanings"]}
          items={[
            {
              key: "forms",
              label: (
                <Flex align="center" gap="small">
                  <SoundOutlined />
                  词形与发音
                </Flex>
              ),
              children: <FormsReview word={word} />
            },
            {
              key: "meanings",
              label: (
                <Flex align="center" gap="small">
                  <ReadOutlined />
                  词义结构
                </Flex>
              ),
              extra: (
                <Typography.Text type="secondary">
                  释义、例句与关系
                </Typography.Text>
              ),
              children: <V3MeaningsPreview embedded word={word} />
            }
          ]}
        />
      </Card>
    </section>
  );
}
