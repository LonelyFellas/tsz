import {
  CheckCircleFilled,
  CloseCircleFilled,
  InfoCircleOutlined,
  SearchOutlined
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Select,
  Space,
  Tag,
  Typography
} from "antd";
import type {
  AdminWordV2,
  DetectWordResponseV2,
  DictionaryCoverageV2,
  DraftFormsStepContent,
  SurfaceMatchPageV2,
  WordHeadwordsV2
} from "@tsz/types";
import { HttpError } from "@tsz/api-client/http";
import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  createPartOfSpeechLookup,
  partOfSpeechLabel,
  type PartOfSpeechLookup
} from "../part-of-speech/catalog";
import { usePartOfSpeechCatalog } from "../part-of-speech/api";
import { newWordNodeId } from "../word-model/primitives";
import { useCreateWordV2, useDetectWordV2 } from "./api";
import { useDialectPreference } from "@/features/settings/useDialectPreference";
import { useUnsavedWordChanges } from "./useUnsavedWordChanges";
import { STATUS_LABEL } from "../labels";
import {
  aggregateSurfaceMatchCards,
  canAcknowledgeSurfaceSnapshot,
  requiresNewIdempotencyKey,
  type SurfaceSnapshotState
} from "../surfaceSnapshot";
import { useSurfaceSnapshot } from "../useSurfaceSnapshot";

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

function matchCategoryLabel(category: string) {
  switch (category) {
    case "exact_headword":
      return "已存在同名主词";
    case "cross_kind_headword":
      return "另一词条类型已有同名主词";
    case "headword_form":
      return "本次主词已作为已有词条的词形存在";
    case "form_headword":
      return "本次词形已作为已有主词存在";
    default:
      return "已有相同词形";
  }
}

function relationTypeLabel(relation: "synonym" | "antonym" | "derivative") {
  return relation === "synonym"
    ? "同义"
    : relation === "antonym"
      ? "反义"
      : "派生";
}

function SurfaceWarningMatches({
  state,
  onExpired
}: {
  state: SurfaceSnapshotState & { retry: () => void };
  onExpired: () => void;
}) {
  const cards = useMemo(
    () => aggregateSurfaceMatchCards(state.items, state.matched_entry_contexts),
    [state.items, state.matched_entry_contexts]
  );
  return (
    <Space orientation="vertical" size={12} style={{ width: "100%" }}>
      <Alert
        type="warning"
        showIcon
        title="发现同名或同形词条，请确认后再继续"
        description={`已加载 ${state.items.length}/${state.total} 条匹配来源。这是提醒，不会把不同词义强制合并。`}
      />
      {cards.map((card) => (
        <Card
          key={card.key}
          size="small"
          type="inner"
          title={
            <Space wrap>
              <Typography.Text strong>{card.existing.headword}</Typography.Text>
              <Tag
                color={
                  card.matches.some((item) => item.attention_level === "high")
                    ? "error"
                    : "warning"
                }
              >
                {matchCategoryLabel(card.matches[0]!.match_category)}
              </Tag>
              <Tag>{STATUS_LABEL[card.existing.status]}</Tag>
              <Tag>{card.existing.kind === "word" ? "单词" : "短语"}</Tag>
              <Typography.Text code copyable>
                {card.existing.word_id.slice(-8)}
              </Typography.Text>
            </Space>
          }
          extra={
            <Link
              to={`/words/${card.existing.word_id}/wizard/basics`}
              target="_blank"
              rel="noreferrer"
              aria-label={`${card.existing.headword} ${card.existing.word_id}，在新标签页打开`}
            >
              查看已有词条
            </Link>
          }
        >
          <Space orientation="vertical" size={6} style={{ width: "100%" }}>
            {card.matches.map((item) => (
              <Typography.Text key={item.match_id} type="secondary">
                {item.existing.source.source_kind === "headword"
                  ? `主词 · ${item.existing.source.dialect} · ${item.existing.source.content_scope}`
                  : `${item.existing.source.pos} · ${item.existing.source.form_type} · ${item.existing.source.dialect} · ${item.existing.source.content_scope}`}
              </Typography.Text>
            ))}
            {card.context && (
              <Space orientation="vertical" size={2}>
                <Typography.Text type="secondary">
                  词性：{card.context.pos_labels.join("、") || "暂无"}；释义：
                  {card.context.gloss_previews.join("；") || "暂无"}；更新：
                  {card.context.updated_at.slice(0, 10)}
                </Typography.Text>
                <Typography.Text type="secondary">
                  有效入站关联：共 {card.context.inbound_relations.total}{" "}
                  条（同义
                  {card.context.inbound_relations.by_type.synonym}、反义
                  {card.context.inbound_relations.by_type.antonym}、派生
                  {card.context.inbound_relations.by_type.derivative}）
                  {card.context.inbound_relations.truncated
                    ? "，以下仅为摘要"
                    : ""}
                </Typography.Text>
                {card.context.inbound_relations.previews.length > 0 && (
                  <Space size={[8, 4]} wrap>
                    {card.context.inbound_relations.previews.map((preview) => (
                      <Link
                        key={`${preview.source_word_id}:${preview.relation}`}
                        to={`/words/${preview.source_word_id}/wizard/basics`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`${preview.source_headword} ${preview.source_word_id}，在新标签页打开`}
                      >
                        {preview.source_headword} ·{" "}
                        {relationTypeLabel(preview.relation)}
                      </Link>
                    ))}
                  </Space>
                )}
              </Space>
            )}
          </Space>
        </Card>
      ))}
      {state.phase === "loading" && (
        <Alert
          type="info"
          showIcon
          title="正在加载全部匹配项，加载完成前不能继续创建"
        />
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
        <Alert
          type="info"
          showIcon
          title="当前暂不开放创建同名主词"
          description={`匹配项已完整展示；能力开关为 ${state.policy_block_code ?? "temporarily_disabled"}，因此不会签发继续创建 token。`}
        />
      )}
    </Space>
  );
}

const COVERAGE_FIELD_LABEL: Record<keyof DictionaryCoverageV2, string> = {
  forms: "词形",
  pronunciations: "读音",
  meanings: "释义",
  examples: "例句",
  frequency: "词频"
};

/**
 * 词典未完全覆盖的部分,用于把 partial/missing 如实说给录入者。
 * coverage 缺失时按无缺口处理:它只是提示信息,不该让整张检测卡崩掉。
 */
function coverageGapSummary(
  coverage?: DictionaryCoverageV2
): string | undefined {
  const partial: string[] = [];
  const missing: string[] = [];
  for (const field of Object.keys(
    COVERAGE_FIELD_LABEL
  ) as (keyof DictionaryCoverageV2)[]) {
    if (coverage?.[field] === "partial")
      partial.push(COVERAGE_FIELD_LABEL[field]);
    if (coverage?.[field] === "missing")
      missing.push(COVERAGE_FIELD_LABEL[field]);
  }
  const clauses = [
    partial.length > 0 ? `${partial.join("、")}仅部分覆盖` : undefined,
    missing.length > 0 ? `${missing.join("、")}缺失` : undefined
  ].filter((clause): clause is string => clause !== undefined);
  return clauses.length > 0 ? clauses.join("；") : undefined;
}

/**
 * 原形拼写就是录入者刚确认的主词本身,必须与词典带回的派生词形分开计数,
 * 否则「6 个词形」会被误读成第 2 步已有 6 个可用词形。
 */
function suggestionCounts(forms: DraftFormsStepContent) {
  const counts = { baseForms: 0, derivedForms: 0, pronunciations: 0 };
  for (const pos of forms.pos) {
    const derivedSlots = pos.form_groups.flatMap((group) => group.slots);
    if (pos.base_form.variants.some((variant) => variant.spelling.trim())) {
      counts.baseForms += 1;
    }
    counts.derivedForms += derivedSlots.filter((slot) =>
      slot.variants.some((variant) => variant.spelling.trim())
    ).length;
    for (const slot of [pos.base_form, ...derivedSlots]) {
      for (const variant of slot.variants) {
        counts.pronunciations += variant.pronunciations.filter(
          (pronunciation) =>
            pronunciation.dict_phonetic.trim() &&
            pronunciation.actual_pron.trim()
        ).length;
      }
    }
  }
  return counts;
}

/**
 * 未命中词典时没有任何建议数据,必须如实说清后续每个字段都要人工录入,
 * 否则「可创建」会被误读成「词典已经带回了内容」。
 */
const NOT_FOUND_SUMMARY =
  "内置词典对该词条没有任何依据：基本词性、词形、字典音标与实际发音、释义和例句都需要在后续步骤按平台教学口径自行录入。";

/** 命中词典后的说明文案:先讲派生词形,再交代覆盖缺口。 */
function matchedSummary(
  counts: ReturnType<typeof suggestionCounts>,
  coverageGaps?: string
): string {
  return [
    `词典带回派生词形 ${counts.derivedForms} 个、完整读音 ${counts.pronunciations} 组；另有 ${counts.baseForms} 个词性的原形拼写来自刚确认的主词，不计为新增词形。`,
    counts.derivedForms === 0
      ? "本次没有带回任何派生词形，需要在「词形与发音」步骤手工补录。"
      : "",
    coverageGaps
      ? `词典覆盖不完整：${coverageGaps}，缺口内容需要在后续步骤人工补充。`
      : "释义、例句和词频若未显示，将在后续步骤明确要求人工补充。"
  ].join("");
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
  const unknownPos =
    catalogLoaded && builtin.status === "matched"
      ? builtin.suggested_forms.pos.filter(
          (item) => !lookup.byCode.has(item.pos)
        )
      : [];
  const surfaceWarningReady =
    smart.status === "warning" && canAcknowledgeSurfaceSnapshot(surfaceState);
  const dictionaryReady =
    (builtin.status === "matched" &&
      catalogLoaded &&
      unknownPos.length === 0 &&
      !catalogUnavailable) ||
    builtin.status === "not_found";
  const canContinue =
    dictionaryReady && (smart.status === "clear" || surfaceWarningReady);
  const hasArchivedDuplicate =
    smart.status === "duplicate" &&
    smart.duplicates.some((item) => item.status === "archived");
  const firstArchivedDuplicate =
    smart.status === "duplicate"
      ? smart.duplicates.find((item) => item.status === "archived")
      : undefined;
  const coverageGaps =
    builtin.status === "matched"
      ? coverageGapSummary(builtin.coverage)
      : undefined;
  // 命中但覆盖不全时不能再呈现为「完全成功」,否则 partial 与全匹配毫无区别。
  const dictionaryPartial =
    builtin.status === "matched" && coverageGaps !== undefined;
  return (
    <Card
      className="word-detection-result-card"
      size="small"
      title="词典检测结果"
      extra={
        <Tag
          color={
            !canContinue ? "error" : dictionaryPartial ? "warning" : "success"
          }
        >
          {canContinue
            ? builtin.status === "matched"
              ? dictionaryPartial
                ? "部分匹配"
                : "已匹配"
              : "可创建"
            : "不可继续"}
        </Tag>
      }
    >
      <Space orientation="vertical" size={16} style={{ width: "100%" }}>
        <Alert
          // 未命中虽可继续,但没有任何词典依据,不能用绿色成功态淡化。
          type={
            canContinue && !dictionaryPartial && builtin.status === "matched"
              ? "success"
              : "warning"
          }
          showIcon
          title={
            builtin.status === "matched"
              ? dictionaryPartial
                ? "内置词典只找到部分内容"
                : "内置词典已找到规范词条"
              : builtin.status === "not_found"
                ? `内置词典没有匹配项，将创建空白${result.entry_kind === "phrase" ? "短语" : "单词"}草稿`
                : "内置词典暂时不可用"
          }
          description={
            builtin.status === "matched"
              ? matchedSummary(
                  suggestionCounts(builtin.suggested_forms),
                  coverageGaps
                )
              : builtin.status === "not_found"
                ? NOT_FOUND_SUMMARY
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
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${item.headword} (${item.dialect}) ${STATUS_LABEL[item.status]}，在新标签页打开`}
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
                    description="点击上方重复词条会在新标签页打开详情，也可以在归档列表中定位。"
                    action={
                      firstArchivedDuplicate && (
                        <Link
                          to={`/words?${new URLSearchParams({
                            keyword: firstArchivedDuplicate.headword,
                            status: "archived"
                          }).toString()}`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="在归档列表查看（新标签页打开）"
                        >
                          在归档列表查看
                        </Link>
                      )
                    }
                  />
                )}
              </Space>
            ) : smart.status === "warning" ? (
              <SurfaceWarningMatches
                state={surfaceState}
                onExpired={onSurfaceExpired}
              />
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

/**
 * 第 1 步不再让管理员决定「要不要区分英美」（A1）：双拼写是内置词典给的客观事实，
 * 检测给出什么就照收什么，这里只做只读陈述。主次顺序按管理员的方言偏好排——
 * 原先按输入侧排会让「输入 center 却看到 centre 在前」被读成主词被静默替换（手测 C5）。
 */
function HeadwordFact({
  value,
  dictionaryMatched
}: {
  value: WordHeadwordsV2;
  dictionaryMatched: boolean;
}) {
  const { preference } = useDialectPreference();
  if (value.mode === "unified") {
    return (
      <Card className="word-headword-fact-card" size="small" title="词条主词">
        <div className="word-headword-fact-primary">
          <span className="dialect-dot dialect-dot-common" />
          <Typography.Text strong>{value.common}</Typography.Text>
        </div>
        <Typography.Text type="secondary">
          {dictionaryMatched
            ? "内置词典未发现该词有英式 / 美式拼写差异。"
            : "内置词典未收录该词条，按你输入的拼写建档。"}
        </Typography.Text>
      </Card>
    );
  }

  const sides = (
    preference === "uk" ? (["uk", "us"] as const) : (["us", "uk"] as const)
  ).map((dialect) => ({
    dialect,
    spelling: dialect === "uk" ? value.uk : value.us,
    label: dialect === "uk" ? "英式" : "美式"
  }));

  return (
    <Card className="word-headword-fact-card" size="small" title="词条主词">
      {sides.map(({ dialect, spelling, label }, index) => (
        <div
          key={dialect}
          className={
            index === 0
              ? "word-headword-fact-primary"
              : "word-headword-fact-secondary"
          }
        >
          <span className={`dialect-dot dialect-dot-${dialect}`} />
          {index === 0 ? (
            <Typography.Text strong>{spelling}</Typography.Text>
          ) : (
            <Typography.Text>{spelling}</Typography.Text>
          )}
          <Typography.Text type="secondary">{label}</Typography.Text>
        </div>
      ))}
      <Typography.Text type="secondary">
        内置词典识别到该词有两种地区拼写，两者都会记录在这条词条上。
        词义与例句只维护一份，按你的方言偏好录入。
      </Typography.Text>
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
    setSurfaceOverridePage(undefined);
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
      setHeadwords(nextHeadwords);
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
                <HeadwordFact
                  value={headwords}
                  dictionaryMatched={
                    result.builtin_dictionary.status === "matched"
                  }
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
