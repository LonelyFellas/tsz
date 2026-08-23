import {
  CheckCircleFilled,
  InfoCircleOutlined,
  SearchOutlined,
  SafetyCertificateOutlined
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
  Modal,
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
  MatchedEntryContextV2,
  SurfaceMatchPageV2,
  WordHeadwordsV2
} from "@tsz/types";
import { HttpError } from "@tsz/api-client/http";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPartOfSpeechLookup,
  partOfSpeechLabel,
  type PartOfSpeechLookup
} from "../part-of-speech/catalog";
import { usePartOfSpeechCatalog } from "../part-of-speech/api";
import { STATUS_LABEL } from "../labels";
import { newWordNodeId } from "../word-model/primitives";
import { useCreateWordV2, useDetectWordV2 } from "./api";
import { useUnsavedWordChanges } from "./useUnsavedWordChanges";
import {
  canAcknowledgeSurfaceSnapshot,
  requiresNewIdempotencyKey,
  type SurfaceSnapshotState
} from "../surfaceSnapshot";
import { useSurfaceSnapshot } from "../useSurfaceSnapshot";
import { adminWordsDataSource } from "../dataSource";

interface Props {
  onHeadwordsChange: (headwords?: WordHeadwordsV2) => void;
  onCreated: (word: AdminWordV2) => void;
}

interface BasicsFormValues {
  language: "en";
  headword: string;
}

function relationTypeLabel(relation: "synonym" | "antonym" | "derivative") {
  return relation === "synonym"
    ? "同义"
    : relation === "antonym"
      ? "反义"
      : "派生";
}

function SmartMatchContext({
  context,
  targetHeadword,
  onPreview
}: {
  context: MatchedEntryContextV2;
  targetHeadword: string;
  onPreview: (wordId: string, title: string) => void;
}) {
  const inbound = context.inbound_relations;
  if (inbound.total === 0) return null;

  return (
    <div className="word-smart-match-context">
      <Space size={[16, 4]} wrap className="word-smart-match-context-meta">
        <Typography.Text type="secondary">
          词性：{context.pos_labels.join("、") || "暂无"}
        </Typography.Text>
        <Typography.Text type="secondary">
          释义：{context.gloss_previews.join("；") || "暂无"}
        </Typography.Text>
      </Space>
      <div className="word-smart-match-context-heading">
        <Typography.Text strong>关联词</Typography.Text>
        <Typography.Text type="secondary">
          共 {inbound.total} 条
        </Typography.Text>
      </div>
      <div className="word-smart-match-relations">
        {inbound.previews.map((relation, index) => (
          <div
            className="word-smart-match-relation-row"
            key={`${relation.source_word_id}:${relation.relation}:${index}`}
          >
            <Space size={8} wrap>
              <Typography.Text strong>
                {relation.source_headword}
              </Typography.Text>
              <Tag color="blue">{relationTypeLabel(relation.relation)}词</Tag>
              <Typography.Text type="secondary">
                关联到 {targetHeadword}
              </Typography.Text>
            </Space>
            <Button
              type="link"
              onClick={() => onPreview(relation.source_word_id, "关联来源详情")}
            >
              查看关联来源
            </Button>
          </div>
        ))}
      </div>
      {inbound.truncated && (
        <Typography.Text type="secondary">仅展示部分关联词</Typography.Text>
      )}
    </div>
  );
}

function wordHeadwordLabel(word: AdminWordV2) {
  return word.headwords.mode === "unified"
    ? word.headwords.common
    : `${word.headwords.uk} / ${word.headwords.us}`;
}

function definitionPreview(
  definition: AdminWordV2["meanings"]["pos"][number]["senses"][number]["definitions"][number]
) {
  if ("content_id" in definition) return definition.content.text.trim();
  if (definition.content.mode === "unified") {
    return definition.content.common.value.text.trim();
  }
  const source = definition.content[definition.content.source_dialect];
  return source.state === "ready" ? source.variant.value.text.trim() : "";
}

function WordPreviewModal({
  preview,
  onClose,
  lookup
}: {
  preview?: { wordId: string; title: string };
  onClose: () => void;
  lookup: PartOfSpeechLookup;
}) {
  const [word, setWord] = useState<AdminWordV2>();
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!preview) {
      setWord(undefined);
      setError(false);
      return;
    }
    let active = true;
    setWord(undefined);
    setError(false);
    setLoading(true);
    void adminWordsDataSource
      .get(preview.wordId)
      .then((response) => {
        if (active) setWord(response.word);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [preview]);

  const definitions =
    word?.meanings.pos
      .flatMap((pos) => pos.senses)
      .flatMap((sense) => sense.definitions)
      .map(definitionPreview)
      .filter(Boolean)
      .slice(0, 3) ?? [];

  return (
    <Modal
      open={preview !== undefined}
      title={preview?.title ?? "词条详情"}
      footer={null}
      width={640}
      onCancel={onClose}
      destroyOnHidden
    >
      {loading && (
        <Typography.Text type="secondary">正在加载词条详情…</Typography.Text>
      )}
      {error && <Alert type="error" showIcon title="词条详情加载失败" />}
      {word && (
        <Descriptions bordered column={1} size="small">
          <Descriptions.Item label="主词">
            <Typography.Text strong>{wordHeadwordLabel(word)}</Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag
              color={
                word.status === "published"
                  ? "success"
                  : word.status === "draft"
                    ? "processing"
                    : "default"
              }
            >
              {STATUS_LABEL[word.status]}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="词条类型">
            {word.kind === "word" ? "单词" : "短语"}
          </Descriptions.Item>
          <Descriptions.Item label="基本词性">
            <Space size={[4, 4]} wrap>
              {word.forms.pos.length > 0
                ? word.forms.pos.map((item) => (
                    <Tag key={item.pos_id} color="blue">
                      {partOfSpeechLabel(lookup, item.pos)}
                    </Tag>
                  ))
                : "暂无"}
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="释义预览">
            {definitions.length > 0 ? definitions.join("；") : "暂无"}
          </Descriptions.Item>
        </Descriptions>
      )}
    </Modal>
  );
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

function SurfaceWarningState({
  state,
  onExpired
}: {
  state: SurfaceSnapshotState & { retry: () => void };
  onExpired: () => void;
}) {
  return (
    <Space orientation="vertical" size={12} style={{ width: "100%" }}>
      {state.phase === "loading" && (
        <Typography.Text type="secondary">
          正在确认智能词库匹配结果…
        </Typography.Text>
      )}
      {(state.phase === "error" || state.phase === "expired") && (
        <Alert
          type="error"
          showIcon
          title={
            state.phase === "expired" ? "匹配快照已过期" : "匹配项加载失败"
          }
          description="旧确认信息已清除，请重新加载全部匹配项。"
          action={
            <Button
              onClick={state.phase === "expired" ? onExpired : state.retry}
            >
              {state.phase === "expired" ? "重新进行词典检测" : "重新加载"}
            </Button>
          }
        />
      )}
      {state.phase === "disabled" && (
        <Alert type="info" showIcon title="当前暂不开放创建同名主词" />
      )}
    </Space>
  );
}

function DetectionStatus({
  result,
  lookup,
  catalogLoaded,
  catalogUnavailable,
  surfaceState,
  onSurfaceExpired
}: {
  result: DetectWordResponseV2;
  lookup: PartOfSpeechLookup;
  catalogLoaded: boolean;
  catalogUnavailable: boolean;
  surfaceState: SurfaceSnapshotState & { retry: () => void };
  onSurfaceExpired: () => void;
}) {
  const builtin = result.builtin_dictionary;
  const smart = result.smart_dictionary;
  const [preview, setPreview] = useState<{
    wordId: string;
    title: string;
  }>();
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
    builtin.status === "not_found";
  const regularStatus =
    !dictionaryReady || smart.status === "unavailable"
      ? "不可继续"
      : builtin.status === "matched"
        ? "已匹配"
        : "未匹配";
  const smartEntries = useMemo(() => {
    const entries = new Map<
      string,
      {
        status: "draft" | "published" | "archived";
        spellings: Set<string>;
      }
    >();
    const add = (
      wordId: string,
      status: "draft" | "published" | "archived",
      spellings: string[]
    ) => {
      const entry = entries.get(wordId) ?? { status, spellings: new Set() };
      for (const spelling of spellings) {
        const trimmed = spelling.trim();
        if (trimmed) entry.spellings.add(trimmed);
      }
      entries.set(wordId, entry);
    };
    if (smart.status === "duplicate") {
      for (const item of smart.duplicates) {
        add(item.word_id, item.status, [item.headword]);
      }
    }
    if (smart.status === "warning") {
      for (const item of surfaceState.items) {
        add(item.existing.word_id, item.existing.status, [
          item.existing.headword,
          item.existing.source.surface
        ]);
      }
    }
    const input = result.request.headword.toLocaleLowerCase();
    const contexts = new Map(
      surfaceState.matched_entry_contexts.map((item) => [item.word_id, item])
    );
    return [...entries.entries()].map(([wordId, entry]) => ({
      wordId,
      status: entry.status,
      context: contexts.get(wordId),
      spellings: [...entry.spellings].sort((left, right) => {
        const leftIsInput = left.toLocaleLowerCase() === input;
        const rightIsInput = right.toLocaleLowerCase() === input;
        if (leftIsInput !== rightIsInput) return leftIsInput ? -1 : 1;
        return left.localeCompare(right);
      })
    }));
  }, [
    result.request.headword,
    smart,
    surfaceState.items,
    surfaceState.matched_entry_contexts
  ]);
  const issues = (
    <>
      {builtin.status === "matched" &&
        builtin.suggested_forms.pos.length === 0 && (
          <Alert type="warning" showIcon title="未识别到词性" />
        )}
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
    </>
  );

  return (
    <Card
      className="word-detection-result-card"
      size="small"
      title="词典检测结果"
      extra={
        <Tag color={regularStatus === "已匹配" ? "success" : "error"}>
          {regularStatus}
        </Tag>
      }
    >
      <Space orientation="vertical" size={16} style={{ width: "100%" }}>
        <div data-testid="builtin-dictionary-result">
          <Descriptions column={1} size="small">
            <Descriptions.Item label="词条类型">
              {result.entry_kind === "word" ? "单词" : "短语"}
            </Descriptions.Item>
            <Descriptions.Item label="重复检测">
              <span data-testid="smart-dictionary-result">
                {smart.status === "clear" ? (
                  <Space>
                    <CheckCircleFilled style={{ color: "#22a06b" }} />
                    未发现
                  </Space>
                ) : smart.status === "duplicate" ||
                  smart.status === "warning" ? (
                  "已发现"
                ) : (
                  "智能词库暂时不可用"
                )}
              </span>
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
        </div>
        {smartEntries.length > 0 && (
          <div className="word-smart-match-summary">
            {smartEntries.map((entry) => (
              <div
                className="word-smart-match-summary-entry"
                key={entry.wordId}
              >
                <div
                  className="word-smart-match-summary-row"
                  data-testid="smart-dictionary-entry"
                >
                  <Space size={8}>
                    <Typography.Text strong>
                      {entry.spellings.join(" / ")}
                    </Typography.Text>
                    <Tag
                      color={
                        entry.status === "published"
                          ? "success"
                          : entry.status === "draft"
                            ? "processing"
                            : "default"
                      }
                    >
                      {STATUS_LABEL[entry.status]}
                    </Tag>
                  </Space>
                  <Button
                    type="link"
                    aria-label={`${entry.spellings.join(" / ")}，查看重复词条`}
                    onClick={() =>
                      setPreview({
                        wordId: entry.wordId,
                        title: "重复词条详情"
                      })
                    }
                  >
                    查看重复词条
                  </Button>
                </div>
                {entry.context && (
                  <SmartMatchContext
                    context={entry.context}
                    targetHeadword={entry.spellings.join(" / ")}
                    onPreview={(wordId, title) => setPreview({ wordId, title })}
                  />
                )}
              </div>
            ))}
          </div>
        )}
        {smart.status === "warning" && (
          <SurfaceWarningState
            state={surfaceState}
            onExpired={onSurfaceExpired}
          />
        )}
        {issues}
      </Space>
      <WordPreviewModal
        preview={preview}
        onClose={() => setPreview(undefined)}
        lookup={lookup}
      />
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
            开启后可分别确认英式与美式主词
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
          title={`${source === "uk" ? "英式" : "美式"}主词来自本次输入，暂不可修改。请确认${source === "uk" ? "美式" : "英式"}主词；如无差异，保持相同即可。`}
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
  const [surfaceOverridePage, setSurfaceOverridePage] =
    useState<SurfaceMatchPageV2>();
  const requestVersion = useRef(0);
  const createKey = useRef(newWordNodeId());
  const preservedDistinguish = useRef<
    Extract<WordHeadwordsV2, { mode: "distinguish" }> | undefined
  >(undefined);
  const allowSavedNavigation = useUnsavedWordChanges(dirty);
  const surfaceInitialPage =
    result?.smart_dictionary.status === "warning"
      ? (surfaceOverridePage ?? result.smart_dictionary.surface_match_page)
      : undefined;
  const surfaceResetKey = `${result?.detection_id ?? "none"}:${JSON.stringify(headwords)}`;
  const surfaceState = useSurfaceSnapshot(surfaceInitialPage, surfaceResetKey);

  const resetDetection = () => {
    requestVersion.current += 1;
    setResult(undefined);
    setHeadwords(undefined);
    preservedDistinguish.current = undefined;
    setSurfaceOverridePage(undefined);
    onHeadwordsChange(undefined);
    createKey.current = newWordNodeId();
    detectWord.reset();
  };

  const runDetection = useCallback(async () => {
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
    preservedDistinguish.current = undefined;
    setSurfaceOverridePage(undefined);
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
          : matched.status === "not_found"
            ? ({ mode: "unified", common: next.request.headword } as const)
            : undefined;
      preservedDistinguish.current =
        nextHeadwords?.mode === "distinguish" ? nextHeadwords : undefined;
      setHeadwords(nextHeadwords);
      onHeadwordsChange(nextHeadwords);
    } catch (error) {
      if (version === requestVersion.current) {
        message.error(error instanceof Error ? error.message : "词典检测失败");
      }
    }
  }, [detectWord, form, message, onHeadwordsChange]);

  const updateHeadwords = (next: WordHeadwordsV2) => {
    createKey.current = newWordNodeId();
    if (next.mode === "distinguish") {
      preservedDistinguish.current = next;
    }
    setDirty(true);
    setHeadwords(next);
    onHeadwordsChange(next);
  };

  const matchedDictionaryReady =
    result?.builtin_dictionary.status === "matched" &&
    partOfSpeechCatalog.data !== undefined &&
    result.builtin_dictionary.suggested_forms.pos.every((item) =>
      partOfSpeechLookup.byCode.has(item.pos)
    );
  // 未命中时后端以管理员原输入建 Unified 词条,单词与短语走同一条路径:
  // 内置词典是静态快照,新造词、品牌名、缩写和行业术语本来就不该被它挡住。
  const unmatchedDictionaryReady =
    result?.builtin_dictionary.status === "not_found";
  const canCreate =
    (matchedDictionaryReady || unmatchedDictionaryReady) &&
    (result.smart_dictionary.status === "clear" ||
      (result.smart_dictionary.status === "warning" &&
        canAcknowledgeSurfaceSnapshot(surfaceState))) &&
    headwords !== undefined &&
    (headwords.mode === "unified"
      ? headwords.common.trim() !== ""
      : headwords.uk.trim() !== "" && headwords.us.trim() !== "");

  const createDraft = async () => {
    if (!result || !headwords || !canCreate || creating) return;
    setCreating(true);
    try {
      const { word } = await createWord.mutateAsync({
        schema_version: 2,
        idempotency_key: createKey.current,
        detection_id: result.detection_id,
        headwords,
        ...(canAcknowledgeSurfaceSnapshot(surfaceState)
          ? {
              confirmed_surface_match_token:
                surfaceState.surface_confirmation_token
            }
          : {})
      });
      message.success(
        `已创建「${word.headwords.mode === "unified" ? word.headwords.common : word.headwords[word.headwords.source_dialect]}」草稿`
      );
      setDirty(false);
      allowSavedNavigation();
      onCreated(word);
    } catch (error) {
      if (
        error instanceof HttpError &&
        requiresNewIdempotencyKey(error.status, error.code)
      ) {
        createKey.current = newWordNodeId();
      }
      if (
        error instanceof HttpError &&
        [
          "surface_match_acknowledgement_required",
          "surface_matches_changed",
          "surface_policy_changed",
          "exact_headword_creation_temporarily_disabled"
        ].includes(error.code ?? "") &&
        error.meta?.surface_match_page
      ) {
        setSurfaceOverridePage(error.meta.surface_match_page);
        setResult({
          ...result,
          smart_dictionary: {
            status: "warning",
            duplicates: [],
            surface_match_page: error.meta.surface_match_page,
            matched_entry_contexts: []
          }
        });
        message.warning("匹配结果已更新，请查看全部提示后再次确认");
        return;
      }
      if (
        error instanceof HttpError &&
        error.code === "surface_policy_changed"
      ) {
        resetDetection();
        message.warning("同名创建策略已变化，请重新检测");
        return;
      }
      if (
        error instanceof HttpError &&
        (error.code === "surface_match_snapshot_expired" ||
          error.code === "detection_expired" ||
          error.status === 410)
      ) {
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
              surfaceState={surfaceState}
              onSurfaceExpired={resetDetection}
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

        {(result?.smart_dictionary.status === "clear" ||
          result?.smart_dictionary.status === "warning") && (
          <div className="word-entry-actions">
            <Button onClick={resetDetection}>重新检测</Button>
            {!(
              result.smart_dictionary.status === "warning" &&
              surfaceState.phase === "disabled"
            ) && (
              <Button
                type="primary"
                disabled={!canCreate}
                loading={creating}
                onClick={() => void createDraft()}
              >
                {result.smart_dictionary.status === "warning"
                  ? "仍继续创建"
                  : "确认并进入词形与发音"}
              </Button>
            )}
          </div>
        )}
      </fieldset>
    </div>
  );
}
