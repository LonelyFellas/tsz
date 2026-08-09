import {
  CheckCircleFilled,
  CloseCircleFilled,
  ReloadOutlined,
  SendOutlined,
  SoundOutlined
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  Collapse,
  Descriptions,
  Divider,
  Empty,
  Flex,
  List,
  Space,
  Tag,
  Typography
} from "antd";
import type {
  AdminWordV2,
  DraftValidationResponse,
  EnglishTextV2,
  WordCreationStep,
  WordDefinitionV2
} from "@tsz/types";
import { HttpError } from "@tsz/api-client/http";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DIALECT_LABEL } from "../editorConstants";
import {
  createPartOfSpeechLookup,
  partOfSpeechLabel,
  subPartOfSpeechLabel,
  type PartOfSpeechLookup
} from "../part-of-speech/catalog";
import { usePartOfSpeechCatalog } from "../part-of-speech/api";
import { newWordNodeId } from "../word-model/primitives";
import { usePublishWordV2, useValidateWordV2 } from "./api";
import { wordDisplayHeadword } from "./model";

interface Props {
  word: AdminWordV2;
  onPublished: (word: AdminWordV2) => void;
}

function formatPublishedAt(value: string | undefined): string {
  if (!value) return "—";
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

function englishPreview(value: EnglishTextV2): string[] {
  if (value.mode === "unified") return [value.common.value.text];
  return (["uk", "us"] as const).map((dialect) => {
    const slot = value[dialect];
    return `${DIALECT_LABEL[dialect]}：${slot.state === "ready" ? slot.variant.value.text : "未填写"}`;
  });
}

function definitionPreview(definition: WordDefinitionV2): string[] {
  return definition.definition_mode.startsWith("en_")
    ? englishPreview(definition.content as EnglishTextV2)
    : [(definition.content as { text: string }).text];
}

function FormsPreview({
  word,
  partOfSpeechLookup
}: {
  word: AdminWordV2;
  partOfSpeechLookup: PartOfSpeechLookup;
}) {
  return (
    <Collapse
      className="word-preview-collapse"
      items={word.forms.pos.map((pos) => ({
        key: pos.pos_id,
        label: (
          <Space>
            <strong>{partOfSpeechLabel(partOfSpeechLookup, pos.pos)}</strong>
            <Typography.Text type="secondary">
              {pos.form_groups.length} 组词形变化
            </Typography.Text>
          </Space>
        ),
        children: (
          <Space orientation="vertical" style={{ width: "100%" }}>
            <Card
              className="word-preview-inner-card"
              size="small"
              title="共享原形"
            >
              {pos.base_form.variants.map((variant) => (
                <Flex
                  key={variant.id}
                  justify="space-between"
                  gap={16}
                  wrap
                  style={{ marginBottom: 8 }}
                >
                  <Space>
                    <Tag>{DIALECT_LABEL[variant.dialect]}</Tag>
                    <strong>{variant.spelling || "未填写"}</strong>
                  </Space>
                  <Space split={<Divider type="vertical" />} wrap>
                    {variant.pronunciations.map((pronunciation) => (
                      <Typography.Text key={pronunciation.id}>
                        <SoundOutlined /> {pronunciation.dict_phonetic || "—"} /{" "}
                        {pronunciation.actual_pron || "—"}
                      </Typography.Text>
                    ))}
                  </Space>
                </Flex>
              ))}
            </Card>
            {pos.form_groups.map((group, groupIndex) => (
              <Card
                className="word-preview-inner-card"
                size="small"
                key={group.id}
                title={`第 ${groupIndex + 1} 组 · ${group.is_regular ? "规则变化" : "不规则变化"}`}
              >
                {group.slots.length === 0 ? (
                  <Typography.Text type="secondary">
                    没有派生词形
                  </Typography.Text>
                ) : (
                  <List
                    size="small"
                    dataSource={group.slots}
                    renderItem={(slot) => (
                      <List.Item>
                        <Space orientation="vertical" style={{ width: "100%" }}>
                          <Typography.Text strong>
                            {slot.form_type}
                          </Typography.Text>
                          <Space wrap>
                            {slot.variants.map((variant) => (
                              <Tag key={variant.id}>
                                {DIALECT_LABEL[variant.dialect]} ·{" "}
                                {variant.spelling || "未填写"}
                              </Tag>
                            ))}
                          </Space>
                        </Space>
                      </List.Item>
                    )}
                  />
                )}
              </Card>
            ))}
          </Space>
        )
      }))}
    />
  );
}

function MeaningsPreview({
  word,
  partOfSpeechLookup
}: {
  word: AdminWordV2;
  partOfSpeechLookup: PartOfSpeechLookup;
}) {
  const formsById = new Map(word.forms.pos.map((pos) => [pos.pos_id, pos]));
  return (
    <Collapse
      className="word-preview-collapse"
      items={word.meanings.pos.map((pos) => {
        const forms = formsById.get(pos.pos_id);
        return {
          key: pos.pos_id,
          label: (
            <Space>
              <strong>
                {forms
                  ? partOfSpeechLabel(partOfSpeechLookup, forms.pos)
                  : "未知词性"}
              </strong>
              <Tag color="green">{pos.senses.length} 个词义</Tag>
              <Tag>{pos.grammar_structures.length} 条语法结构</Tag>
            </Space>
          ),
          children: (
            <Space orientation="vertical" size={14} style={{ width: "100%" }}>
              <Card
                className="word-preview-inner-card"
                size="small"
                title="语法结构"
              >
                <List
                  size="small"
                  dataSource={pos.grammar_structures}
                  locale={{ emptyText: "暂无语法结构" }}
                  renderItem={(grammar, index) => (
                    <List.Item>
                      <Space wrap>
                        <Typography.Text strong>{index + 1}.</Typography.Text>
                        {grammar.variants.map((variant) => (
                          <Tag key={variant.id}>
                            {DIALECT_LABEL[variant.dialect]} ·{" "}
                            {variant.content.text || "未填写"}
                          </Tag>
                        ))}
                      </Space>
                    </List.Item>
                  )}
                />
              </Card>
              {pos.senses.map((sense, senseIndex) => (
                <Card
                  className="word-preview-sense-card"
                  size="small"
                  key={sense.id}
                  title={
                    <Space>
                      <Tag color="blue">{sense.level}</Tag>
                      <span>词义 {senseIndex + 1}</span>
                      {sense.sub_pos && (
                        <Tag color="green">
                          {subPartOfSpeechLabel(
                            partOfSpeechLookup,
                            sense.sub_pos
                          )}
                        </Tag>
                      )}
                    </Space>
                  }
                >
                  <Descriptions size="small" column={2}>
                    <Descriptions.Item label="词频">
                      {sense.frequency ? `${sense.frequency}%` : "—"}
                    </Descriptions.Item>
                    <Descriptions.Item label="依赖语境">
                      {sense.depends_on_context ? "是" : "否"}
                    </Descriptions.Item>
                  </Descriptions>
                  <Divider titlePlacement="start">释义</Divider>
                  <List
                    size="small"
                    dataSource={sense.definitions}
                    locale={{ emptyText: "暂无释义" }}
                    renderItem={(definition) => (
                      <List.Item>
                        <Space orientation="vertical" size={2}>
                          <Space>
                            <Tag>{definition.level}</Tag>
                            <Typography.Text type="secondary">
                              {definition.definition_mode}
                            </Typography.Text>
                          </Space>
                          {definitionPreview(definition).map((text, index) => (
                            <Typography.Text key={index}>
                              {text || "未填写"}
                            </Typography.Text>
                          ))}
                        </Space>
                      </List.Item>
                    )}
                  />
                  <Divider titlePlacement="start">例句</Divider>
                  <List
                    size="small"
                    dataSource={sense.sentences}
                    locale={{ emptyText: "暂无例句" }}
                    renderItem={(sentence) => (
                      <List.Item>
                        <Space
                          orientation="vertical"
                          size={2}
                          style={{ width: "100%" }}
                        >
                          <Space>
                            <Tag>{sentence.level}</Tag>
                            {englishPreview(sentence.en_text).map(
                              (text, index) => (
                                <Typography.Text key={index}>
                                  {text || "未填写"}
                                </Typography.Text>
                              )
                            )}
                          </Space>
                          <Typography.Text type="secondary">
                            {sentence.zh_text.text || "未填写汉语译文"}
                          </Typography.Text>
                          <Typography.Text
                            type="secondary"
                            style={{ fontSize: 12 }}
                          >
                            主关联{" "}
                            {
                              sentence.links.filter(
                                (link) => link.role === "focus"
                              ).length
                            }{" "}
                            条；上下文关联{" "}
                            {
                              sentence.links.filter(
                                (link) => link.role === "context"
                              ).length
                            }{" "}
                            条
                          </Typography.Text>
                        </Space>
                      </List.Item>
                    )}
                  />
                  {sense.relations.length > 0 && (
                    <>
                      <Divider titlePlacement="start">关联词</Divider>
                      <Space wrap>
                        {sense.relations.map((relation) => (
                          <Tag key={relation.id}>
                            {relation.relation} ·{" "}
                            {relation.target_headword ||
                              relation.target_word_id ||
                              "未选择"}{" "}
                            · {relation.score}%
                          </Tag>
                        ))}
                      </Space>
                    </>
                  )}
                </Card>
              ))}
            </Space>
          )
        };
      })}
    />
  );
}

const ISSUE_STEP_LABEL: Record<Exclude<WordCreationStep, "preview">, string> = {
  basics: "创建新词条",
  forms: "词形与发音",
  meanings: "词义与例句"
};

export function PreviewAndPublishStep({ word, onPublished }: Props) {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const partOfSpeechCatalog = usePartOfSpeechCatalog();
  const partOfSpeechLookup = useMemo(
    () => createPartOfSpeechLookup(partOfSpeechCatalog.data),
    [partOfSpeechCatalog.data]
  );
  const validateWord = useValidateWordV2(word.id);
  const publishWord = usePublishWordV2(word.id);
  const [validation, setValidation] = useState<DraftValidationResponse>();
  const [validationError, setValidationError] = useState<string>();
  const publishKey = useRef(newWordNodeId());
  const readOnly = word.status === "published";

  const handleRequestError = (
    error: unknown,
    fallback: string,
    showFallbackMessage = true
  ): boolean => {
    if (error instanceof HttpError && error.field_issues.length > 0) {
      setValidation({
        validated_revision: word.revision,
        valid: false,
        issues: error.field_issues
      });
      message.warning("完整性检查发现待处理问题");
      return true;
    }
    if (error instanceof HttpError && error.status === 409) {
      modal.confirm({
        title: "草稿版本已更新",
        content:
          "该词条已在其他位置保存。为避免基于旧版本发布，请重新加载最新草稿。",
        okText: "重新加载",
        cancelText: "留在本页",
        onOk: () => navigate(0)
      });
      return true;
    }
    if (showFallbackMessage) {
      message.error(error instanceof Error ? error.message : fallback);
    }
    return false;
  };

  const validate = async () => {
    setValidation(undefined);
    setValidationError(undefined);
    try {
      const result = await validateWord.mutateAsync({
        base_revision: word.revision
      });
      setValidation(result);
      return result;
    } catch (error) {
      const hasFieldIssues =
        error instanceof HttpError && error.field_issues.length > 0;
      handleRequestError(error, "完整性检查失败", false);
      if (!hasFieldIssues) {
        setValidationError(
          error instanceof Error ? error.message : "完整性检查失败"
        );
      }
      return undefined;
    }
  };

  useEffect(() => {
    setValidation(undefined);
    setValidationError(undefined);
    if (!readOnly) void validate();
    // validate 使用当前 revision；仅 revision/status 改变时重跑。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word.revision, readOnly]);

  const publish = async () => {
    const result =
      validation?.validated_revision === word.revision
        ? validation
        : await validate();
    if (!result?.valid) {
      message.warning("请先处理完整性检查中的问题");
      return;
    }
    try {
      const { word: published } = await publishWord.mutateAsync({
        base_revision: word.revision,
        idempotency_key: publishKey.current
      });
      onPublished(published);
      message.success(`「${wordDisplayHeadword(published)}」已提交生效`);
      navigate("/words", { replace: true });
    } catch (error) {
      handleRequestError(error, "发布失败");
    }
  };

  return (
    <>
      <div className="word-step-heading">
        <span className="word-step-number">STEP 04</span>
        <Typography.Title level={2} style={{ margin: 0 }}>
          {readOnly ? "词条详情" : "预览并生效"}
        </Typography.Title>
        <Typography.Paragraph className="word-step-description">
          {readOnly
            ? "该 V2 词条已发布，本轮提供与创建预览一致的只读查看。"
            : "查看结构化字典预览和发布完整性结果。所有问题处理完成后可直接提交生效。"}
        </Typography.Paragraph>
      </div>

      {partOfSpeechCatalog.isError && (
        <Alert
          type="warning"
          showIcon
          title="词性配置加载失败，预览暂以词性编码显示"
          style={{ marginBottom: 18 }}
        />
      )}

      {readOnly ? (
        <Alert
          className="word-preview-status"
          type="success"
          showIcon
          icon={<CheckCircleFilled />}
          title="词条已发布"
          description={`发布于 ${formatPublishedAt(word.published_at)}`}
          style={{ marginBottom: 18 }}
        />
      ) : validationError ? (
        <Alert
          className="word-preview-status"
          type="error"
          showIcon
          icon={<CloseCircleFilled />}
          title="完整性检查失败"
          description={validationError}
          action={
            <Button
              size="small"
              icon={<ReloadOutlined />}
              loading={validateWord.isPending}
              aria-label="重新检查发布完整性"
              onClick={() => void validate()}
            >
              重新检查
            </Button>
          }
          style={{ marginBottom: 18 }}
        />
      ) : validation ? (
        <Alert
          className="word-preview-status"
          type={validation.valid ? "success" : "error"}
          showIcon
          icon={
            validation.valid ? <CheckCircleFilled /> : <CloseCircleFilled />
          }
          title={
            validation.valid
              ? "完整性检查通过，可以提交生效"
              : `发现 ${validation.issues.length} 个待处理问题`
          }
          action={
            <Button
              size="small"
              icon={<ReloadOutlined />}
              loading={validateWord.isPending}
              onClick={() => void validate()}
            >
              重新检查
            </Button>
          }
          style={{ marginBottom: 18 }}
        />
      ) : (
        <Alert
          className="word-preview-status"
          type="info"
          showIcon
          title="正在检查发布完整性"
          style={{ marginBottom: 18 }}
        />
      )}

      {!readOnly && validation && !validation.valid && (
        <Card
          className="word-preview-issues-card"
          size="small"
          title="待处理问题"
        >
          <List
            dataSource={validation.issues}
            locale={{ emptyText: <Empty description="没有问题" /> }}
            renderItem={(issue) => (
              <List.Item
                actions={[
                  <Button
                    type="link"
                    key="locate"
                    onClick={() =>
                      navigate(`/words/${word.id}/wizard/${issue.step}`, {
                        state: { nodeId: issue.node_id, field: issue.field }
                      })
                    }
                  >
                    去处理
                  </Button>
                ]}
              >
                <List.Item.Meta
                  title={`${ISSUE_STEP_LABEL[issue.step]} · ${issue.message}`}
                  description={`${issue.code} · ${issue.node_id} · ${issue.field}`}
                />
              </List.Item>
            )}
          />
        </Card>
      )}

      <Space
        className="word-preview-stack"
        orientation="vertical"
        size={14}
        style={{ width: "100%" }}
      >
        <Card
          className="word-preview-section word-preview-overview"
          title="词条概要"
          extra={<Tag color="blue">结构化预览</Tag>}
        >
          <Descriptions bordered size="small" column={{ xs: 1, md: 2 }}>
            <Descriptions.Item label="主词">
              {word.headwords.mode === "unified"
                ? word.headwords.common
                : `${word.headwords.uk} / ${word.headwords.us}`}
            </Descriptions.Item>
            <Descriptions.Item label="语言">English 英语</Descriptions.Item>
            <Descriptions.Item label="状态">
              {word.status === "published" ? "已发布" : "草稿"}
            </Descriptions.Item>
            <Descriptions.Item label="Revision">
              {word.revision}
            </Descriptions.Item>
            <Descriptions.Item label="检测输入">
              {word.detection_snapshot.request.headword}
            </Descriptions.Item>
            <Descriptions.Item label="原建议基本词性">
              <Space wrap>
                {word.detection_snapshot.suggested_pos.map((pos) => (
                  <Tag key={pos}>
                    {partOfSpeechLabel(partOfSpeechLookup, pos)}
                  </Tag>
                ))}
              </Space>
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card
          className="word-preview-section"
          title="词形与发音"
          extra={<Tag>{word.forms.pos.length} 个基本词性</Tag>}
        >
          <FormsPreview word={word} partOfSpeechLookup={partOfSpeechLookup} />
        </Card>

        <Card
          className="word-preview-section"
          title="词义与例句"
          extra={
            <Tag>
              {word.meanings.pos.reduce(
                (count, pos) => count + pos.senses.length,
                0
              )}{" "}
              个词义
            </Tag>
          }
        >
          <MeaningsPreview
            word={word}
            partOfSpeechLookup={partOfSpeechLookup}
          />
        </Card>
      </Space>

      <div className="word-step-actions">
        {!readOnly && (
          <Button onClick={() => navigate(`/words/${word.id}/wizard/meanings`)}>
            上一步
          </Button>
        )}
        {readOnly ? (
          <Button type="primary" onClick={() => navigate("/words")}>
            返回智能词库
          </Button>
        ) : (
          <Button
            type="primary"
            icon={<SendOutlined />}
            disabled={!validation?.valid}
            loading={publishWord.isPending || validateWord.isPending}
            onClick={() => void publish()}
          >
            提交生效
          </Button>
        )}
      </div>
    </>
  );
}
