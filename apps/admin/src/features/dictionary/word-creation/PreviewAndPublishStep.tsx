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
  RichText,
  SurfaceMatchPageV2,
  WordCreationStep,
  WordDefinitionV2
} from "@tsz/types";
import { RichTextReadOnly } from "@tsz/voice-editor/reader";
import "@tsz/voice-editor/styles.css";
import { HttpError } from "@tsz/api-client/http";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DEFINITION_MODE_LABEL, DIALECT_LABEL } from "../editorConstants";
import {
  aggregateSurfaceMatchCards,
  canAcknowledgeSurfaceSnapshot,
  requiresNewIdempotencyKey
} from "../surfaceSnapshot";
import { useSurfaceSnapshot } from "../useSurfaceSnapshot";
import {
  createPartOfSpeechLookup,
  partOfSpeechLabel,
  subPartOfSpeechLabel,
  type PartOfSpeechLookup
} from "../part-of-speech/catalog";
import { usePartOfSpeechCatalog } from "../part-of-speech/api";
import { newWordNodeId } from "../word-model/primitives";
import { usePublishWordV2, useValidateWordV2 } from "./api";
import { useDialectPreference } from "@/features/settings/useDialectPreference";
import { orderedHeadwordSpellings, wordDisplayHeadword } from "./model";
import { renderSharedSentence } from "./meaningsAndExamples/sentenceAssociationModel";
import { sentenceAssociationMeanings } from "./meaningsAndExamples/sentenceAssociationTypes";

interface Props {
  word: AdminWordV2;
  readOnly?: boolean;
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

function EnglishRichTextPreview({ value }: { value: EnglishTextV2 }) {
  if (value.mode === "unified") {
    return <RichTextReadOnly value={value.common.value} />;
  }
  return (
    <Space orientation="vertical" size={2}>
      {(["uk", "us"] as const).map((dialect) => {
        const slot = value[dialect];
        return (
          <span key={dialect}>
            {DIALECT_LABEL[dialect]}：
            {slot.state === "ready" ? (
              <RichTextReadOnly value={slot.variant.value} />
            ) : (
              "未填写"
            )}
          </span>
        );
      })}
    </Space>
  );
}

function DefinitionRichTextPreview({
  definition
}: {
  definition: WordDefinitionV2;
}) {
  return definition.definition_mode.startsWith("en_") ? (
    <EnglishRichTextPreview value={definition.content as EnglishTextV2} />
  ) : (
    <RichTextReadOnly value={definition.content as RichText} />
  );
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
                            <RichTextReadOnly value={variant.content} />
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
                              {
                                DEFINITION_MODE_LABEL[
                                  definition.definition_mode
                                ]
                              }
                            </Typography.Text>
                          </Space>
                          <DefinitionRichTextPreview definition={definition} />
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
                            <EnglishRichTextPreview value={sentence.en_text} />
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
                        {sense.relations.map((relation) => {
                          const pending = (
                            relation.pending_target_headword ?? ""
                          ).trim();
                          // 待物化的目标此刻还没有词条，只有词面；不标出来会在
                          // 发布前最后一道人眼确认处退化成「未选择」。
                          const isPending =
                            !relation.target_word_id && pending !== "";
                          return (
                            <Tag
                              key={relation.id}
                              color={isPending ? "warning" : undefined}
                            >
                              {relation.relation} ·{" "}
                              {relation.target_headword ||
                                pending ||
                                relation.target_word_id ||
                                "未选择"}{" "}
                              · {relation.score}%
                              {isPending ? " · 发布时新建" : ""}
                            </Tag>
                          );
                        })}
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

function SharedSentencesPreview({
  word,
  preference
}: {
  word: AdminWordV2;
  preference: "uk" | "us";
}) {
  const sentences =
    sentenceAssociationMeanings(word.meanings).shared_sentences ?? [];
  if (sentences.length === 0) return null;
  return (
    <Card
      className="word-preview-inner-card"
      size="small"
      title="多维例句与位置关联"
      style={{ marginBottom: 14 }}
    >
      <List
        size="small"
        dataSource={sentences}
        renderItem={(sentence) => {
          const preview = renderSharedSentence(sentence, preference);
          const linked = sentence.associations.filter(
            (association) => association.state === "linked"
          ).length;
          const pending = sentence.associations.filter(
            (association) => association.state === "pending"
          ).length;
          return (
            <List.Item>
              <Space orientation="vertical" size={2} style={{ width: "100%" }}>
                <Space wrap>
                  <Tag>{sentence.level}</Tag>
                  <Typography.Text>{preview.text}</Typography.Text>
                </Space>
                <Typography.Text type="secondary">
                  {sentence.zh_text.text || "未填写汉语译文"}
                </Typography.Text>
                <Space wrap>
                  <Tag color="green">正式关联 {linked}</Tag>
                  <Tag color="orange">预关联 {pending}</Tag>
                  {preview.missing_association_ids.length > 0 && (
                    <Tag color="red">
                      缺少方言词形 {preview.missing_association_ids.length}
                    </Tag>
                  )}
                </Space>
              </Space>
            </List.Item>
          );
        }}
      />
    </Card>
  );
}

const ISSUE_STEP_LABEL: Record<Exclude<WordCreationStep, "preview">, string> = {
  basics: "创建新词条",
  forms: "词形与发音",
  meanings: "词义与例句"
};

export function PreviewAndPublishStep({
  word,
  readOnly = word.status !== "draft",
  onPublished
}: Props) {
  const { message, modal } = App.useApp();
  const { preference } = useDialectPreference();
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
  const [surfacePage, setSurfacePage] = useState<SurfaceMatchPageV2>();
  const publishKey = useRef(newWordNodeId());
  const publishingRef = useRef(false);
  const editQuery = word.status === "published" ? "?mode=edit" : "";
  const surfaceState = useSurfaceSnapshot(
    surfacePage,
    `${word.id}:${word.revision}:${surfacePage?.snapshot_id ?? "none"}`
  );
  const surfaceCards = useMemo(
    () =>
      aggregateSurfaceMatchCards(
        surfaceState.items,
        surfaceState.matched_entry_contexts
      ),
    [surfaceState.items, surfaceState.matched_entry_contexts]
  );
  const surfaceCardGroups = useMemo(
    () =>
      [
        {
          key: "visibility",
          title: "仅公开可见性",
          cards: surfaceCards.filter((card) => card.membership === "visibility")
        },
        {
          key: "ordinary",
          title: "仅普通同形提示",
          cards: surfaceCards.filter((card) => card.membership === "ordinary")
        },
        {
          key: "composite",
          title: "公开可见性 + 普通同形提示",
          cards: surfaceCards.filter((card) => card.membership === "composite")
        }
      ].filter((group) => group.cards.length > 0),
    [surfaceCards]
  );

  useEffect(() => {
    setSurfacePage(undefined);
    publishKey.current = newWordNodeId();
  }, [word.id, word.revision]);

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
    if (
      error instanceof HttpError &&
      (error.status === 409 || error.status === 410)
    ) {
      publishKey.current = newWordNodeId();
      if (requiresNewIdempotencyKey(error.status, error.code)) {
        setSurfacePage(error.meta?.surface_match_page);
      } else {
        setSurfacePage(undefined);
      }
      if (error.code === "revision_conflict") {
        modal.confirm({
          title: "草稿版本已更新",
          content:
            "该词条已在其他位置保存。为避免基于旧版本发布，请重新加载最新草稿。",
          okText: "重新加载",
          cancelText: "留在本页",
          onOk: () => navigate(0)
        });
      } else if (error.code === "surface_policy_changed") {
        setSurfacePage(undefined);
        message.warning("公开可见性策略已变化，请重新发布以取得当前确认信息");
      } else if (error.code === "surface_match_snapshot_expired") {
        setSurfacePage(undefined);
        message.warning("公开确认已过期，请重新发布并确认最新结果");
      } else if (
        error.code === "multiple_active_exact_headword_publications_not_enabled"
      ) {
        message.warning("学习端暂不支持多个同名公开词条");
      } else {
        message.warning("同名公开范围已变化，请查看最新提示后重新确认");
      }
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
    if (publishingRef.current) return;
    publishingRef.current = true;
    try {
      const result =
        validation?.validated_revision === word.revision
          ? validation
          : await validate();
      if (!result?.valid) {
        message.warning("请先处理完整性检查中的问题");
        return;
      }
      const { word: published } = await publishWord.mutateAsync({
        base_revision: word.revision,
        idempotency_key: publishKey.current,
        ...(canAcknowledgeSurfaceSnapshot(surfaceState)
          ? {
              confirmed_surface_match_token:
                surfaceState.surface_confirmation_token
            }
          : {})
      });
      setSurfacePage(undefined);
      onPublished(published);
      message.success(
        `「${wordDisplayHeadword(published, preference)}」已提交生效`
      );
      navigate("/words", { replace: true });
    } catch (error) {
      handleRequestError(error, "发布失败");
    } finally {
      publishingRef.current = false;
    }
  };

  return (
    <>
      <div className="word-step-heading">
        <span className="word-step-number">STEP 04</span>
        <Typography.Title level={2} style={{ margin: 0 }}>
          {word.status === "archived"
            ? "归档词条详情"
            : readOnly
              ? "词条详情"
              : "预览并生效"}
        </Typography.Title>
        <Typography.Paragraph className="word-step-description">
          {word.status === "archived"
            ? "该词条已归档，当前仅提供结构化只读查看；恢复后才能继续编辑或发布。"
            : readOnly
              ? "该 V2 词条已发布，本轮提供与创建预览一致的只读查看。"
              : "逐项核对结构化内容与发布完整性校验结果；本页不呈现学习端字典卡片样式。所有问题处理完成后可直接提交生效。"}
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

      {surfacePage && (
        <Card
          size="small"
          title={
            surfaceState.phase === "disabled"
              ? "学习端暂不支持多个同名公开词条"
              : "发布前需要确认同名公开范围"
          }
          style={{ marginBottom: 18 }}
        >
          <Alert
            type={surfaceState.phase === "disabled" ? "error" : "warning"}
            showIcon
            title={`已加载 ${surfaceState.items.length}/${surfaceState.total} 条匹配来源`}
            description={
              surfaceState.phase === "disabled"
                ? "当前能力开关关闭，普通同形 warning token 不能绕过此限制。草稿会保持不变。"
                : surfaceState.phase === "loading"
                  ? "正在加载完整且不可变的确认快照，加载完成前不能继续发布。"
                  : "确认将绑定本次发布命令、当前策略 epoch 和完整匹配集合。"
            }
          />
          <Space orientation="vertical" size={12} style={{ width: "100%" }}>
            {surfaceCardGroups.map((group) => (
              <section key={group.key} aria-label={group.title}>
                <Typography.Text strong>{group.title}</Typography.Text>
                <List
                  size="small"
                  dataSource={group.cards}
                  renderItem={(card) => (
                    <List.Item>
                      <List.Item.Meta
                        title={
                          <Space wrap>
                            <Typography.Text strong>
                              {card.existing.headword}
                            </Typography.Text>
                            <Typography.Text code>
                              {card.existing.word_id.slice(-8)}
                            </Typography.Text>
                          </Space>
                        }
                        description={`${card.matches.length} 个来源 · ${card.existing.kind === "word" ? "单词" : "短语"}`}
                      />
                    </List.Item>
                  )}
                />
              </section>
            ))}
          </Space>
          {surfaceState.phase === "error" && (
            <Button onClick={surfaceState.retry}>重新加载确认快照</Button>
          )}
          {surfaceState.phase === "expired" && (
            <Button
              onClick={() => {
                setSurfacePage(undefined);
                publishKey.current = newWordNodeId();
                void publish();
              }}
            >
              重新检查发布条件
            </Button>
          )}
        </Card>
      )}

      {word.status === "archived" ? (
        <Alert
          className="word-preview-status"
          type="warning"
          showIcon
          title="词条已归档"
          description="当前或历史发布记录仍被保留；请先恢复词条，再继续编辑或重新发布。"
          style={{ marginBottom: 18 }}
        />
      ) : readOnly ? (
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
                      navigate(
                        `/words/${word.id}/wizard/${issue.step}${editQuery}`,
                        {
                          state: { nodeId: issue.node_id, field: issue.field }
                        }
                      )
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
              {orderedHeadwordSpellings(word.headwords, preference).join(" / ")}
            </Descriptions.Item>
            <Descriptions.Item label="语言">English 英语</Descriptions.Item>
            <Descriptions.Item label="状态">
              {word.status === "archived"
                ? "已归档"
                : word.status === "published"
                  ? word.has_unpublished_changes
                    ? "已发布（有未发布修改）"
                    : "已发布"
                  : "草稿"}
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
          <SharedSentencesPreview word={word} preference={preference} />
          <MeaningsPreview
            word={word}
            partOfSpeechLookup={partOfSpeechLookup}
          />
        </Card>
      </Space>

      {(!readOnly || word.status === "published") && (
        <div className="word-step-actions">
          {!readOnly && (
            <Button
              onClick={() =>
                navigate(`/words/${word.id}/wizard/meanings${editQuery}`)
              }
            >
              上一步
            </Button>
          )}
          {readOnly ? (
            <Button
              type="primary"
              onClick={() =>
                navigate(`/words/${word.id}/wizard/forms?mode=edit`)
              }
            >
              继续编辑
            </Button>
          ) : (
            <Button
              type="primary"
              icon={<SendOutlined />}
              disabled={
                !validation?.valid ||
                (surfacePage !== undefined &&
                  !canAcknowledgeSurfaceSnapshot(surfaceState))
              }
              loading={publishWord.isPending || validateWord.isPending}
              onClick={() => void publish()}
            >
              {canAcknowledgeSurfaceSnapshot(surfaceState)
                ? "确认同名公开范围并提交生效"
                : "提交生效"}
            </Button>
          )}
        </div>
      )}
    </>
  );
}
