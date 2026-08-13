import {
  CheckCircleFilled,
  CloseCircleFilled,
  InfoCircleOutlined,
  LeftOutlined,
  SafetyCertificateOutlined,
  SearchOutlined
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Input,
  Row,
  Select,
  Space,
  Switch,
  Tag,
  Typography
} from "antd";
import type {
  AdminWordV2,
  DetectWordResponseV2,
  WordHeadwordsV2
} from "@tsz/types";
import { HttpError } from "@tsz/api-client/http";
import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  createPartOfSpeechLookup,
  partOfSpeechLabel,
  type PartOfSpeechLookup
} from "../part-of-speech/catalog";
import { usePartOfSpeechCatalog } from "../part-of-speech/api";
import { newWordNodeId } from "../word-model/primitives";
import { useCreateWordV2, useDetectWordV2 } from "./api";
import { useUnsavedWordChanges } from "./useUnsavedWordChanges";
import { STATUS_LABEL } from "../labels";

interface Props {
  onHeadwordsChange: (headwords?: WordHeadwordsV2) => void;
  onCreated: (word: AdminWordV2) => void;
}

interface BasicsFormValues {
  language: "en";
  headword: string;
}

function StepHeading() {
  return (
    <div className="word-step-heading">
      <span className="word-step-number">STEP 01</span>
      <Typography.Title level={2} style={{ margin: 0 }}>
        创建新词条
      </Typography.Title>
      <Typography.Paragraph className="word-step-description">
        录入词条后，系统将判断词条类型、检查智能词库重复项，并从内置词典带出英美主词、基本词性、词形和音标建议。
      </Typography.Paragraph>
    </div>
  );
}

function DetectionStatus({
  result,
  lookup,
  catalogLoaded,
  catalogUnavailable
}: {
  result: DetectWordResponseV2;
  lookup: PartOfSpeechLookup;
  catalogLoaded: boolean;
  catalogUnavailable: boolean;
}) {
  const builtin = result.builtin_dictionary;
  const smart = result.smart_dictionary;
  const unknownPos =
    catalogLoaded && builtin.status === "matched"
      ? builtin.suggested_forms.pos.filter(
          (item) => !lookup.byCode.has(item.pos)
        )
      : [];
  const dictionaryReady =
    (builtin.status === "matched" &&
      catalogLoaded &&
      unknownPos.length === 0 &&
      !catalogUnavailable) ||
    (result.entry_kind === "phrase" && builtin.status === "not_found");
  const canContinue = dictionaryReady && smart.status === "clear";
  const hasArchivedDuplicate =
    smart.status === "duplicate" &&
    smart.duplicates.some((item) => item.status === "archived");
  const firstArchivedDuplicate =
    smart.status === "duplicate"
      ? smart.duplicates.find((item) => item.status === "archived")
      : undefined;
  const suggestionCoverage =
    builtin.status === "matched"
      ? builtin.suggested_forms.pos.reduce(
          (summary, pos) => {
            const slots = [
              pos.base_form,
              ...pos.form_groups.flatMap((group) => group.slots)
            ];
            for (const slot of slots) {
              summary.forms += slot.variants.filter((variant) =>
                variant.spelling.trim()
              ).length;
              for (const variant of slot.variants) {
                summary.pronunciations += variant.pronunciations.filter(
                  (pronunciation) =>
                    pronunciation.dict_phonetic.trim() &&
                    pronunciation.actual_pron.trim()
                ).length;
              }
            }
            return summary;
          },
          { forms: 0, pronunciations: 0 }
        )
      : undefined;
  return (
    <Card
      className="word-detection-result-card"
      size="small"
      title="词典检测结果"
      extra={
        <Tag color={canContinue ? "success" : "error"}>
          {canContinue
            ? builtin.status === "matched"
              ? "已匹配"
              : "可创建"
            : "不可继续"}
        </Tag>
      }
    >
      <Space orientation="vertical" size={16} style={{ width: "100%" }}>
        <Alert
          type={canContinue ? "success" : "warning"}
          showIcon
          title={
            result.entry_kind === "phrase" && builtin.status === "not_found"
              ? "内置词典没有匹配项，将创建空白短语草稿"
              : builtin.status === "matched"
                ? "内置词典已找到规范词条"
                : builtin.status === "not_found"
                  ? "内置词典没有匹配项"
                  : "内置词典暂时不可用"
          }
          description={
            builtin.status === "matched"
              ? `本次实际带出 ${suggestionCoverage?.forms ?? 0} 个词形、${suggestionCoverage?.pronunciations ?? 0} 组完整读音。释义、例句和词频若未显示，将在后续步骤明确要求人工补充。`
              : undefined
          }
        />
        <Descriptions column={1} size="small">
          <Descriptions.Item label="词条类型">
            {result.entry_kind === "word" ? "单词" : "短语"}
          </Descriptions.Item>
          <Descriptions.Item label="重复检测">
            {smart.status === "clear" ? (
              <Space>
                <CheckCircleFilled style={{ color: "#22a06b" }} />
                未发现
              </Space>
            ) : smart.status === "duplicate" ? (
              <Space orientation="vertical" size={4}>
                <Space>
                  <CloseCircleFilled style={{ color: "#d4380d" }} />
                  已存在重复词条
                </Space>
                {smart.duplicates.map((item) => (
                  <Link
                    key={item.word_id}
                    to={`/words/${item.word_id}/wizard/basics`}
                  >
                    <Space size={4}>
                      <span>
                        {item.headword} ({item.dialect})
                      </span>
                      <Tag
                        color={
                          item.status === "published"
                            ? "success"
                            : item.status === "archived"
                              ? "default"
                              : "processing"
                        }
                      >
                        {STATUS_LABEL[item.status]}
                      </Tag>
                    </Space>
                  </Link>
                ))}
                {hasArchivedDuplicate && (
                  <Alert
                    type="info"
                    showIcon
                    title="归档词条仍占用词头"
                    description="点击上方重复词条可进入详情并恢复，也可以在归档列表中定位。"
                    action={
                      firstArchivedDuplicate && (
                        <Link
                          to={`/words?${new URLSearchParams({
                            keyword: firstArchivedDuplicate.headword,
                            status: "archived"
                          }).toString()}`}
                        >
                          在归档列表查看
                        </Link>
                      )
                    }
                  />
                )}
              </Space>
            ) : (
              "智能词库暂时不可用"
            )}
          </Descriptions.Item>
          {builtin.status === "matched" && (
            <Descriptions.Item label="建议词性">
              <Space size={[4, 4]} wrap>
                {builtin.suggested_forms.pos.map((item) => (
                  <Tag key={item.pos_id} color="blue">
                    {partOfSpeechLabel(lookup, item.pos)}
                  </Tag>
                ))}
              </Space>
            </Descriptions.Item>
          )}
        </Descriptions>
        {catalogUnavailable && builtin.status === "matched" && (
          <Alert
            type="warning"
            showIcon
            title="词性目录暂时不可用"
            description="请重试目录加载后再创建草稿。"
          />
        )}
        {unknownPos.length > 0 && (
          <Alert
            type="error"
            showIcon
            title="检测结果包含未配置词性"
            description={`请先在系统设置中配置：${unknownPos
              .map((item) => item.pos)
              .join("、")}`}
          />
        )}
      </Space>
    </Card>
  );
}

function HeadwordConfirmation({
  value,
  matchedDialect,
  preservedDistinguish,
  allowDistinguish,
  onChange
}: {
  value: WordHeadwordsV2;
  matchedDialect?: "common" | "uk" | "us";
  preservedDistinguish?: Extract<WordHeadwordsV2, { mode: "distinguish" }>;
  allowDistinguish: boolean;
  onChange: (next: WordHeadwordsV2) => void;
}) {
  const source =
    value.mode === "distinguish" ? value.source_dialect : undefined;
  const uk = value.mode === "distinguish" ? value.uk : value.common;
  const us = value.mode === "distinguish" ? value.us : value.common;
  return (
    <Card
      className="word-headword-confirmation-card"
      size="small"
      title="确认英美主词"
    >
      <div className="word-dialect-detection-row">
        <div>
          <Typography.Text strong>区分英美词形</Typography.Text>
          <Typography.Text type="secondary">
            命中侧作为检测基准，另一侧可按实际情况调整
          </Typography.Text>
        </div>
        <Switch
          aria-label="区分英美词形"
          checked={value.mode === "distinguish"}
          disabled={!allowDistinguish}
          onChange={(checked) => {
            if (checked && value.mode === "unified") {
              onChange(
                preservedDistinguish ?? {
                  mode: "distinguish",
                  uk: value.common,
                  us: value.common,
                  source_dialect:
                    matchedDialect === "uk" || matchedDialect === "us"
                      ? matchedDialect
                      : "us"
                }
              );
            } else if (!checked && value.mode === "distinguish") {
              onChange({
                mode: "unified",
                common: value[value.source_dialect]
              });
            }
          }}
          title="手动选择是否区分英美词形"
        />
      </div>
      {source && (
        <Alert
          type="info"
          showIcon
          icon={<SafetyCertificateOutlined />}
          title={`${source === "uk" ? "英式" : "美式"}是本次输入命中的检测基准，已锁定；请确认另一侧词形。`}
          style={{ marginBottom: 16 }}
        />
      )}
      <Row gutter={16}>
        <Col xs={24} md={12}>
          <div className="dialect-panel dialect-panel-uk">
            <Typography.Text strong>英式英语 · BrE</Typography.Text>
            <Input
              aria-label="英式主词"
              value={uk}
              disabled={value.mode === "unified" || source === "uk"}
              onChange={(event) => {
                if (value.mode === "distinguish") {
                  onChange({ ...value, uk: event.target.value });
                }
              }}
              style={{ marginTop: 10 }}
            />
          </div>
        </Col>
        <Col xs={24} md={12}>
          <div className="dialect-panel dialect-panel-us">
            <Typography.Text strong>美式英语 · AmE</Typography.Text>
            <Input
              aria-label="美式主词"
              value={us}
              disabled={value.mode === "unified" || source === "us"}
              onChange={(event) => {
                if (value.mode === "distinguish") {
                  onChange({ ...value, us: event.target.value });
                }
              }}
              style={{ marginTop: 10 }}
            />
          </div>
        </Col>
      </Row>
    </Card>
  );
}

export function CreateEntryStep({ onHeadwordsChange, onCreated }: Props) {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm<BasicsFormValues>();
  const detectWord = useDetectWordV2();
  const createWord = useCreateWordV2();
  const partOfSpeechCatalog = usePartOfSpeechCatalog();
  const partOfSpeechLookup = useMemo(
    () => createPartOfSpeechLookup(partOfSpeechCatalog.data),
    [partOfSpeechCatalog.data]
  );
  const [result, setResult] = useState<DetectWordResponseV2>();
  const [headwords, setHeadwords] = useState<WordHeadwordsV2>();
  const [dirty, setDirty] = useState(false);
  const [creating, setCreating] = useState(false);
  const requestVersion = useRef(0);
  const createKey = useRef(newWordNodeId());
  const preservedDistinguish = useRef<
    Extract<WordHeadwordsV2, { mode: "distinguish" }> | undefined
  >(undefined);
  const allowSavedNavigation = useUnsavedWordChanges(dirty);

  const resetDetection = () => {
    requestVersion.current += 1;
    setResult(undefined);
    setHeadwords(undefined);
    preservedDistinguish.current = undefined;
    onHeadwordsChange(undefined);
    createKey.current = newWordNodeId();
    detectWord.reset();
  };

  const runDetection = async () => {
    let values: BasicsFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const headword = values.headword.trim();
    const version = ++requestVersion.current;
    createKey.current = newWordNodeId();
    setResult(undefined);
    setHeadwords(undefined);
    onHeadwordsChange(undefined);
    detectWord.reset();
    try {
      const next = await detectWord.mutateAsync({
        language: "en",
        headword
      });
      const currentHeadword = String(
        form.getFieldValue("headword") ?? ""
      ).trim();
      if (
        version !== requestVersion.current ||
        currentHeadword !== headword ||
        next.request.language !== values.language
      ) {
        return;
      }
      const expiresAt = Date.parse(next.expires_at);
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        message.warning("检测结果已过期，请重新检测");
        return;
      }
      setResult(next);
      const matched = next.builtin_dictionary;
      const nextHeadwords =
        matched.status === "matched"
          ? matched.headwords
          : next.entry_kind === "phrase" && matched.status === "not_found"
            ? ({ mode: "unified", common: next.request.headword } as const)
            : undefined;
      setHeadwords(nextHeadwords);
      preservedDistinguish.current =
        nextHeadwords?.mode === "distinguish" ? nextHeadwords : undefined;
      onHeadwordsChange(nextHeadwords);
    } catch (error) {
      if (version === requestVersion.current) {
        message.error(error instanceof Error ? error.message : "词典检测失败");
      }
    }
  };

  const matchedDictionaryReady =
    result?.builtin_dictionary.status === "matched" &&
    partOfSpeechCatalog.data !== undefined &&
    result.builtin_dictionary.suggested_forms.pos.every((item) =>
      partOfSpeechLookup.byCode.has(item.pos)
    );
  const unmatchedPhraseReady =
    result?.entry_kind === "phrase" &&
    result.builtin_dictionary.status === "not_found";
  const canCreate =
    (matchedDictionaryReady || unmatchedPhraseReady) &&
    result.smart_dictionary.status === "clear" &&
    headwords !== undefined &&
    (headwords.mode === "unified"
      ? headwords.common.trim() !== ""
      : headwords.uk.trim() !== "" && headwords.us.trim() !== "");

  const updateHeadwords = (next: WordHeadwordsV2) => {
    createKey.current = newWordNodeId();
    if (next.mode === "distinguish") {
      preservedDistinguish.current = next;
    }
    setDirty(true);
    setHeadwords(next);
    onHeadwordsChange(next);
  };

  const createDraft = async () => {
    if (!result || !headwords || !canCreate || creating) return;
    setCreating(true);
    try {
      const { word } = await createWord.mutateAsync({
        schema_version: 2,
        idempotency_key: createKey.current,
        detection_id: result.detection_id,
        headwords
      });
      message.success(
        `已创建「${word.headwords.mode === "unified" ? word.headwords.common : word.headwords[word.headwords.source_dialect]}」草稿`
      );
      setDirty(false);
      allowSavedNavigation();
      onCreated(word);
    } catch (error) {
      if (error instanceof HttpError && error.status === 410) {
        resetDetection();
        message.warning("检测结果已过期，请重新检测");
        return;
      }
      message.error(error instanceof Error ? error.message : "创建草稿失败");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={`word-basics-workflow${result ? " is-detected" : ""}`}>
      <Button
        type="text"
        icon={<LeftOutlined />}
        onClick={() => navigate("/words")}
        className="word-entry-back"
      >
        返回智能词库
      </Button>
      <StepHeading />
      <fieldset
        className="word-request-lock"
        disabled={creating}
        aria-busy={creating}
      >
        <Card
          className="word-basics-input-card"
          size="small"
          title="录入与检测"
          extra={<Tag color="blue">仅支持英文词条</Tag>}
        >
          <Form
            form={form}
            layout="vertical"
            initialValues={{ language: "en" }}
            onValuesChange={() => {
              setDirty(true);
              resetDetection();
            }}
          >
            <Form.Item label="所属语言" name="language">
              <Select
                options={[{ value: "en", label: "English  英语" }]}
                disabled
              />
            </Form.Item>
            <Form.Item
              label="录入词条"
              name="headword"
              rules={[
                { required: true, whitespace: true, message: "请输入词条" },
                { max: 200, message: "词条不能超过 200 个字符" }
              ]}
            >
              <Input.Search
                size="large"
                placeholder="例如 center"
                autoComplete="off"
                enterButton={
                  <Space size={6}>
                    <SearchOutlined />
                    词典检测
                  </Space>
                }
                loading={detectWord.isPending}
                onSearch={() => void runDetection()}
              />
            </Form.Item>
            <Typography.Text type="secondary" className="word-field-help">
              按 Enter 或点击检测，系统只查询词典，不会立即创建草稿。
            </Typography.Text>
          </Form>
        </Card>

        {result ? (
          <div className="word-basics-result-grid">
            <DetectionStatus
              result={result}
              lookup={partOfSpeechLookup}
              catalogLoaded={partOfSpeechCatalog.data !== undefined}
              catalogUnavailable={partOfSpeechCatalog.isError}
            />
            {headwords && (
              <div className="word-headword-confirmation-wrap">
                <HeadwordConfirmation
                  value={headwords}
                  matchedDialect={result.matched_dialect}
                  preservedDistinguish={preservedDistinguish.current}
                  allowDistinguish={
                    result.builtin_dictionary.status === "matched"
                  }
                  onChange={updateHeadwords}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="word-detection-empty-state">
            <InfoCircleOutlined />
            <div>
              <Typography.Text strong>等待检测</Typography.Text>
              <Typography.Text type="secondary">
                输入词条后开始检测，检测不会立即创建草稿。
              </Typography.Text>
            </div>
          </div>
        )}

        {result?.smart_dictionary.status === "clear" && (
          <div className="word-entry-actions">
            <Button onClick={resetDetection}>重新检测</Button>
            <Button
              type="primary"
              disabled={!canCreate}
              loading={creating}
              onClick={() => void createDraft()}
            >
              确认并进入词形与发音
            </Button>
          </div>
        )}
      </fieldset>
    </div>
  );
}
