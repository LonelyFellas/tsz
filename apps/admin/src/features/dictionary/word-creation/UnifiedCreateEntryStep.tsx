import { HttpError } from "@tsz/api-client/http";
import type {
  AdminWordV2,
  AdminWordV2Envelope,
  AdminWordV3,
  AdminWordV3Envelope,
  CreateAdminWordV2Input,
  CreateAdminWordV3Input,
  DetectLexiconSurfaceResponseV3,
  DetectLexiconSurfaceV3Input,
  DetectWordInputV2,
  DetectWordResponseV2,
  Dialect,
  DuplicateWordMatchV2,
  PartOfSpeechCatalogResponse,
  PronunciationStyle,
  SurfaceMatchPageAny,
  WordFormTypeV3,
  WordHeadwordsV2
} from "@tsz/types";
import {
  Alert,
  Button,
  Card,
  Collapse,
  Form,
  Input,
  Space,
  Tag,
  Typography
} from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminWordsAnyDataSource, adminWordsDataSource } from "../dataSource";
import { usePartOfSpeechCatalog } from "../part-of-speech/api";
import {
  aggregateLifecycleSurfaceMatchCards,
  canAcknowledgeSurfaceSnapshot,
  isSurfaceMatchPageAny,
  requiresNewIdempotencyKey
} from "../surfaceSnapshot";
import { useSurfaceSnapshotAny } from "../useSurfaceSnapshot";
import { createV3WordRequests } from "../word-creation-v3/api";
import {
  dialectLabel,
  formTypeLabel,
  pronunciationStyleLabel
} from "../word-creation-v3/presentation";
import { newWordNodeId } from "../word-model/primitives";
import { classifyEntryInput } from "./entryClassification";
import type { CreationNavigationState } from "./CreationSourceNotice";
import { headwordIssue } from "./headwordValidation";

export interface UnifiedCreateRequests {
  detectV2: (input: DetectWordInputV2) => Promise<DetectWordResponseV2>;
  createV2: (
    idempotencyKey: string,
    input: CreateAdminWordV2Input
  ) => Promise<AdminWordV2Envelope>;
  detectV3: (
    input: DetectLexiconSurfaceV3Input
  ) => Promise<DetectLexiconSurfaceResponseV3>;
  createV3: (
    idempotencyKey: string,
    input: CreateAdminWordV3Input
  ) => Promise<AdminWordV3Envelope>;
  surfacePage: (
    snapshotId: string,
    cursor: string,
    signal: AbortSignal
  ) => Promise<SurfaceMatchPageAny>;
}

type PendingCreation =
  | {
      kind: "word";
      detection: DetectLexiconSurfaceResponseV3;
      idempotencyKey: string;
    }
  | {
      kind: "phrase";
      detection: DetectWordResponseV2;
      headwords: WordHeadwordsV2;
      idempotencyKey: string;
    };

interface ExactCreationAttempt {
  normalized: string;
  target: PendingCreation;
  confirmedSurfaceToken?: string;
}

interface Props {
  requests?: UnifiedCreateRequests;
  onCreated: (
    word: AdminWordV2 | AdminWordV3,
    navigationState: CreationNavigationState
  ) => void;
}

interface SuggestionPronunciation {
  key: string;
  dictPhonetic: string;
  actualPron?: string;
  style?: PronunciationStyle;
}

interface SuggestionVariant {
  key: string;
  dialect: Dialect;
  spelling: string;
  pronunciations: SuggestionPronunciation[];
}

interface SuggestionForm {
  key: string;
  formType: WordFormTypeV3;
  variants: SuggestionVariant[];
}

interface SuggestionSection {
  key: string;
  posLabel: string;
  forms: SuggestionForm[];
}

interface SuggestionSummary {
  status: "matched" | "not_found";
  headwords: Array<{ label: string; value: string }>;
  sections: SuggestionSection[];
}

class ProductError extends Error {}

const v3Requests = createV3WordRequests();
const defaultRequests: UnifiedCreateRequests = {
  detectV2: (input) => adminWordsDataSource.detect(input),
  createV2: (key, input) => adminWordsDataSource.createV2(key, input),
  detectV3: v3Requests.detect,
  createV3: v3Requests.create,
  surfacePage: (snapshotId, cursor, signal) =>
    adminWordsAnyDataSource.surfaceMatchSnapshotPageAny(
      snapshotId,
      cursor,
      signal
    )
};

const STATUS_LABEL = {
  draft: "草稿",
  published: "已发布",
  archived: "已归档"
} as const;

const KIND_LABEL = {
  word: "单词",
  phrase: "短语"
} as const;

const MATCH_REASON_LABEL = {
  ordinary: "词面或词形相似",
  visibility: "公开范围存在同名词条",
  composite: "词面相似且公开范围存在同名词条"
} as const;

function initialSurfacePage(pending?: PendingCreation) {
  if (!pending) return undefined;
  if (pending.kind === "word") {
    return pending.detection.surface_match_page;
  }
  return pending.detection.smart_dictionary.status === "warning"
    ? pending.detection.smart_dictionary.surface_match_page
    : undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.status === 401) return "登录状态已失效，请重新登录。";
    if (error.status === 403) return "当前账号没有创建词条的权限。";
    if (error.status === 503) return "词条服务暂时不可用，请稍后重试。";
    if (error.status === 410) return "检查结果已过期，请重新提交。";
  }
  if (error instanceof TypeError) {
    return "网络异常，创建结果未知。请原样重试。";
  }
  return error instanceof ProductError
    ? error.message
    : "创建失败，请稍后重试。";
}

function partOfSpeechLabel(
  code: string,
  catalog?: PartOfSpeechCatalogResponse
): string {
  return (
    catalog?.items.find((item) => item.code === code)?.name_zh ?? "未识别词性"
  );
}

function assertFreshDetection(expiresAt: string) {
  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(expiry) || expiry <= Date.now()) {
    throw new ProductError("检查结果已过期，请重新提交。");
  }
}

function v2SuggestionSummary(
  pending: Extract<PendingCreation, { kind: "phrase" }>,
  catalog?: PartOfSpeechCatalogResponse
): SuggestionSummary {
  const builtin = pending.detection.builtin_dictionary;
  if (builtin.status !== "matched") {
    return { status: "not_found", headwords: [], sections: [] };
  }
  const headwords =
    builtin.headwords.mode === "unified"
      ? [{ label: "通用主词", value: builtin.headwords.common }]
      : [
          { label: "英式主词", value: builtin.headwords.uk },
          { label: "美式主词", value: builtin.headwords.us }
        ];
  return {
    status: "matched",
    headwords,
    sections: builtin.suggested_forms.pos.map((pos) => ({
      key: pos.pos_id,
      posLabel: partOfSpeechLabel(pos.pos, catalog),
      forms: [
        pos.base_form,
        ...pos.form_groups.flatMap((group) => group.slots)
      ].map((form) => ({
        key: form.id,
        formType: form.form_type,
        variants: form.variants.map((variant) => ({
          key: variant.id,
          dialect: variant.dialect,
          spelling: variant.spelling,
          pronunciations: variant.pronunciations.map((pronunciation) => ({
            key: pronunciation.id,
            dictPhonetic: pronunciation.dict_phonetic,
            actualPron: pronunciation.actual_pron,
            style: pronunciation.style
          }))
        }))
      }))
    }))
  };
}

function v3SuggestionSummary(
  pending: Extract<PendingCreation, { kind: "word" }>,
  catalog?: PartOfSpeechCatalogResponse
): SuggestionSummary {
  const builtin = pending.detection.builtin_dictionary;
  if (builtin.status !== "matched") {
    return { status: "not_found", headwords: [], sections: [] };
  }
  const sections = new Map<string, SuggestionSection>();
  for (const pos of builtin.suggested_pos) {
    sections.set(pos, {
      key: pos,
      posLabel: partOfSpeechLabel(pos, catalog),
      forms: []
    });
  }
  for (const form of builtin.suggested_forms) {
    const section = sections.get(form.pos) ?? {
      key: form.pos,
      posLabel: partOfSpeechLabel(form.pos, catalog),
      forms: []
    };
    const variants =
      form.regional_variants.mode === "common"
        ? [form.regional_variants.common]
        : [form.regional_variants.uk, form.regional_variants.us];
    section.forms.push({
      key: `${form.pos}:${form.form_type}:${section.forms.length}`,
      formType: form.form_type,
      variants: variants.map((variant, variantIndex) => ({
        key: `${form.pos}:${form.form_type}:${variant.dialect}:${variantIndex}`,
        dialect: variant.dialect,
        spelling: variant.spelling,
        pronunciations: variant.pronunciations.map(
          (pronunciation, pronunciationIndex) => ({
            key: `${form.pos}:${form.form_type}:${variant.dialect}:${pronunciationIndex}`,
            dictPhonetic: pronunciation.dict_phonetic,
            ...(pronunciation.actual_pron
              ? { actualPron: pronunciation.actual_pron }
              : {}),
            ...(pronunciation.style ? { style: pronunciation.style } : {})
          })
        )
      }))
    });
    sections.set(form.pos, section);
  }
  return {
    status: "matched",
    headwords: [],
    sections: [...sections.values()]
  };
}

function DictionarySuggestionCard({
  pending,
  catalog
}: {
  pending: PendingCreation;
  catalog?: PartOfSpeechCatalogResponse;
}) {
  const summary =
    pending.kind === "word"
      ? v3SuggestionSummary(pending, catalog)
      : v2SuggestionSummary(pending, catalog);
  if (summary.status === "not_found") {
    return (
      <Alert
        showIcon
        type="info"
        title="未找到内置词典建议"
        description="将创建空白草稿，请在编辑器中补充内容。"
      />
    );
  }
  return (
    <Card
      className="word-detection-result-card word-dictionary-suggestion-card"
      size="small"
      title="已找到内置词典建议"
    >
      <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
        <Alert
          showIcon
          type="success"
          title="正在把以下建议应用到草稿"
          description="进入编辑器后请按平台教学口径核对并完善。"
        />
        {summary.headwords.length > 0 ? (
          <Space wrap>
            {summary.headwords.map((headword) => (
              <Typography.Text key={headword.label} strong>
                {headword.label}：{headword.value}
              </Typography.Text>
            ))}
          </Space>
        ) : null}
        {summary.sections.map((section) => (
          <Card key={section.key} size="small" title={section.posLabel}>
            <Space
              orientation="vertical"
              size="small"
              style={{ width: "100%" }}
            >
              {section.forms.map((form) => (
                <div key={form.key} className="word-dictionary-suggestion-form">
                  <Tag color="blue">{formTypeLabel(form.formType)}</Tag>
                  <Space orientation="vertical" size={4}>
                    {form.variants.map((variant) => (
                      <div key={variant.key}>
                        <Typography.Text>
                          {pending.kind === "word" && form.formType === "base"
                            ? `${dialectLabel(variant.dialect)}建议拼写`
                            : dialectLabel(variant.dialect)}
                          ：{variant.spelling}
                        </Typography.Text>
                        {variant.pronunciations.map((pronunciation) => (
                          <Space key={pronunciation.key} wrap size="small">
                            <Typography.Text type="secondary">
                              词典音标：{pronunciation.dictPhonetic}
                            </Typography.Text>
                            {pronunciation.actualPron ? (
                              <Typography.Text type="secondary">
                                实际发音：{pronunciation.actualPron}
                              </Typography.Text>
                            ) : null}
                            {pronunciation.style ? (
                              <Tag>
                                {pronunciationStyleLabel(pronunciation.style)}
                              </Tag>
                            ) : null}
                          </Space>
                        ))}
                      </div>
                    ))}
                  </Space>
                </div>
              ))}
            </Space>
          </Card>
        ))}
      </Space>
    </Card>
  );
}

function SurfaceCandidateDetails({
  card
}: {
  card: ReturnType<typeof aggregateLifecycleSurfaceMatchCards>[number];
}) {
  return (
    <Card size="small">
      <Space orientation="vertical" size="small" style={{ width: "100%" }}>
        <Space wrap>
          <Typography.Text strong>{card.label}</Typography.Text>
          <Tag>{KIND_LABEL[card.kind]}</Tag>
          <Tag>{STATUS_LABEL[card.status]}</Tag>
          <Typography.Text type="secondary">
            命中 {card.match_count} 处
          </Typography.Text>
        </Space>
        <Collapse
          size="small"
          items={[
            {
              key: "details",
              label: "查看候选详情",
              children: (
                <Space
                  orientation="vertical"
                  size="small"
                  style={{ width: "100%" }}
                >
                  <Typography.Text>
                    命中原因：{MATCH_REASON_LABEL[card.membership]}
                  </Typography.Text>
                  {card.source_labels.map((source) => (
                    <Typography.Text key={source} type="secondary">
                      {source}
                    </Typography.Text>
                  ))}
                  {card.pos_labels.length > 0 ? (
                    <Space wrap aria-label="已有词性">
                      {card.pos_labels.map((label) => (
                        <Tag key={label}>{label}</Tag>
                      ))}
                    </Space>
                  ) : null}
                  {card.gloss_previews.map((gloss) => (
                    <Typography.Text key={gloss}>释义：{gloss}</Typography.Text>
                  ))}
                </Space>
              )
            }
          ]}
        />
      </Space>
    </Card>
  );
}

function DuplicateCandidateDetails({
  duplicate,
  kind
}: {
  duplicate: DuplicateWordMatchV2;
  kind: "word" | "phrase";
}) {
  return (
    <Card size="small">
      <Space orientation="vertical" size="small" style={{ width: "100%" }}>
        <Space wrap>
          <Typography.Text strong>{duplicate.headword}</Typography.Text>
          <Tag>{KIND_LABEL[kind]}</Tag>
          <Tag>{STATUS_LABEL[duplicate.status]}</Tag>
        </Space>
        <Collapse
          size="small"
          items={[
            {
              key: "details",
              label: "查看候选详情",
              children: (
                <Typography.Text type="secondary">
                  命中原因：已有相同主词 · {dialectLabel(duplicate.dialect)}
                </Typography.Text>
              )
            }
          ]}
        />
      </Space>
    </Card>
  );
}

function phraseHeadwords(
  detection: DetectWordResponseV2,
  normalized: string,
  catalog?: PartOfSpeechCatalogResponse
): WordHeadwordsV2 {
  if (detection.builtin_dictionary.status === "unavailable") {
    throw new ProductError("内置词典暂时不可用，请稍后重试。");
  }
  if (detection.builtin_dictionary.status === "not_found") {
    return { mode: "unified", common: normalized };
  }
  const availablePos = new Set(catalog?.items.map((item) => item.code));
  if (
    !catalog ||
    detection.builtin_dictionary.suggested_forms.pos.some(
      (item) => !availablePos.has(item.pos)
    )
  ) {
    throw new ProductError("词性配置尚未就绪，暂时不能创建该短语。");
  }
  return detection.builtin_dictionary.headwords;
}

export function UnifiedCreateEntryStep({
  requests = defaultRequests,
  onCreated
}: Props) {
  const catalog = usePartOfSpeechCatalog();
  const [value, setValue] = useState("");
  const [fieldError, setFieldError] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<"checking" | "creating">();
  const [pending, setPending] = useState<PendingCreation>();
  const [prepared, setPrepared] = useState<PendingCreation>();
  const [blockedDuplicates, setBlockedDuplicates] = useState<
    DuplicateWordMatchV2[]
  >([]);
  const generation = useRef(0);
  const mounted = useRef(true);
  const locked = useRef(false);
  const retryKey = useRef<{ normalized: string; key: string } | undefined>(
    undefined
  );
  const exactRetry = useRef<ExactCreationAttempt | undefined>(undefined);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      locked.current = false;
    };
  }, []);

  const page = initialSurfacePage(pending);
  const fetchSurfacePage = useCallback(
    (snapshotId: string, cursor: string, signal: AbortSignal) =>
      requests.surfacePage(snapshotId, cursor, signal),
    [requests]
  );
  const snapshot = useSurfaceSnapshotAny(
    page,
    `${pending?.detection.detection_id ?? "none"}:${page?.snapshot_id ?? "none"}`,
    fetchSurfacePage
  );
  const cards = useMemo(
    () => aggregateLifecycleSurfaceMatchCards(snapshot),
    [snapshot]
  );

  const changeValue = (next: string) => {
    generation.current += 1;
    retryKey.current = undefined;
    exactRetry.current = undefined;
    setValue(next);
    setFieldError(undefined);
    setError(undefined);
    setPending(undefined);
    setPrepared(undefined);
    setBlockedDuplicates([]);
  };

  const createPending = async (
    target: PendingCreation,
    confirmedSurfaceToken?: string
  ) => {
    if (locked.current) return;
    locked.current = true;
    setBusy("creating");
    setError(undefined);
    const attempt: ExactCreationAttempt = {
      normalized: classifyEntryInput(value).normalized,
      target,
      ...(confirmedSurfaceToken ? { confirmedSurfaceToken } : {})
    };
    try {
      const response =
        target.kind === "word"
          ? await requests.createV3(target.idempotencyKey, {
              schema_version: 3,
              detection_id: target.detection.detection_id,
              kind: "word",
              ...(confirmedSurfaceToken
                ? { confirmed_surface_match_token: confirmedSurfaceToken }
                : {})
            })
          : await requests.createV2(target.idempotencyKey, {
              schema_version: 2,
              detection_id: target.detection.detection_id,
              headwords: target.headwords,
              ...(confirmedSurfaceToken
                ? { confirmed_surface_match_token: confirmedSurfaceToken }
                : {})
            });
      if (!mounted.current) return;
      retryKey.current = undefined;
      exactRetry.current = undefined;
      onCreated(response.word, {
        creationSource:
          target.detection.builtin_dictionary.status === "matched"
            ? "dictionary"
            : "blank"
      });
    } catch (requestError) {
      if (!mounted.current) return;
      if (
        requestError instanceof HttpError &&
        requiresNewIdempotencyKey(requestError.status, requestError.code)
      ) {
        exactRetry.current = undefined;
        const replacementPage = requestError.meta?.surface_match_page;
        retryKey.current = {
          normalized: classifyEntryInput(value).normalized,
          key: newWordNodeId()
        };
        if (
          target.kind === "word" &&
          isSurfaceMatchPageAny(replacementPage) &&
          replacementPage.schema_version === 3
        ) {
          setPending({
            ...target,
            idempotencyKey: retryKey.current.key,
            detection: {
              ...target.detection,
              requires_acknowledgement: true,
              surface_match_page: replacementPage
            }
          });
          setPrepared({
            ...target,
            idempotencyKey: retryKey.current.key,
            detection: {
              ...target.detection,
              requires_acknowledgement: true,
              surface_match_page: replacementPage
            }
          });
          setError("匹配结果已更新，请重新确认后继续创建。");
        } else {
          setPending(undefined);
          setError("检查结果已变化，请重新提交。");
        }
      } else {
        exactRetry.current =
          requestError instanceof TypeError ? attempt : undefined;
        setError(errorMessage(requestError));
      }
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(undefined);
    }
  };

  const submit = async () => {
    if (locked.current) return;
    const { normalized, kind } = classifyEntryInput(value);
    if (!normalized) {
      setFieldError("请输入词条");
      return;
    }
    const issue = headwordIssue(normalized);
    if (issue) {
      setFieldError(issue);
      return;
    }
    if (normalized.length > 200) {
      setFieldError("词条不能超过 200 个字符");
      return;
    }

    if (exactRetry.current?.normalized === normalized) {
      const attempt = exactRetry.current;
      await createPending(attempt.target, attempt.confirmedSurfaceToken);
      return;
    }

    const currentGeneration = ++generation.current;
    const keyState =
      retryKey.current?.normalized === normalized
        ? retryKey.current
        : { normalized, key: newWordNodeId() };
    retryKey.current = keyState;
    locked.current = true;
    setValue(normalized);
    setPending(undefined);
    setPrepared(undefined);
    setBlockedDuplicates([]);
    setError(undefined);
    setFieldError(undefined);
    setBusy("checking");
    try {
      if (kind === "word") {
        const detection = await requests.detectV3({
          schema_version: 3,
          language: "en",
          kind: "word",
          surface: normalized
        });
        if (!mounted.current || generation.current !== currentGeneration) {
          return;
        }
        if (
          detection.request.language !== "en" ||
          detection.request.kind !== "word" ||
          detection.request.surface !== normalized
        ) {
          throw new ProductError("词条检查结果不一致，请刷新后重试。");
        }
        assertFreshDetection(detection.expires_at);
        if (detection.builtin_dictionary.status === "unavailable") {
          throw new ProductError("内置词典暂时不可用，请稍后重试。");
        }
        if (detection.builtin_dictionary.status === "matched") {
          const configuredPos = new Set(
            catalog.data?.items.map((item) => item.code)
          );
          const suggestedPos = new Set([
            ...detection.builtin_dictionary.suggested_pos,
            ...detection.builtin_dictionary.suggested_forms.map(
              (form) => form.pos
            )
          ]);
          if (
            !catalog.data ||
            [...suggestedPos].some((pos) => !configuredPos.has(pos))
          ) {
            throw new ProductError("词性配置尚未就绪，暂时不能创建该单词。");
          }
        }
        const target: PendingCreation = {
          kind: "word",
          detection,
          idempotencyKey: keyState.key
        };
        setPrepared(target);
        if (detection.requires_acknowledgement) {
          if (!detection.surface_match_page) {
            throw new ProductError("匹配信息不完整，已停止创建。");
          }
          setPending(target);
          return;
        }
        locked.current = false;
        await createPending(target);
        return;
      }

      const detection = await requests.detectV2({
        language: "en",
        headword: normalized
      });
      if (!mounted.current || generation.current !== currentGeneration) return;
      if (
        detection.request.language !== "en" ||
        detection.request.headword !== normalized ||
        detection.entry_kind !== "phrase"
      ) {
        throw new ProductError("词条检查结果不一致，请刷新后重试。");
      }
      assertFreshDetection(detection.expires_at);
      if (detection.smart_dictionary.status === "unavailable") {
        throw new ProductError("智能词库检查暂时不可用，请稍后重试。");
      }
      const target: PendingCreation = {
        kind: "phrase",
        detection,
        headwords: phraseHeadwords(detection, normalized, catalog.data),
        idempotencyKey: keyState.key
      };
      setPrepared(target);
      if (detection.smart_dictionary.status === "duplicate") {
        setBlockedDuplicates(detection.smart_dictionary.duplicates);
        return;
      }
      if (detection.smart_dictionary.status === "warning") {
        setPending(target);
        return;
      }
      locked.current = false;
      await createPending(target);
    } catch (requestError) {
      if (mounted.current && generation.current === currentGeneration) {
        setError(errorMessage(requestError));
      }
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(undefined);
    }
  };

  const confirm = () => {
    if (!pending || !canAcknowledgeSurfaceSnapshot(snapshot)) return;
    void createPending(pending, snapshot.surface_confirmation_token);
  };

  return (
    <div className="word-basics-workflow unified-entry-creation">
      <div className="word-step-heading">
        <span className="word-step-number">创建词条</span>
        <Typography.Title level={2} style={{ margin: 0 }}>
          输入要创建的英文词条
        </Typography.Title>
        <Typography.Paragraph className="word-step-description">
          系统会自动识别单词或短语，并检查词典与现有词条。
        </Typography.Paragraph>
      </div>

      <Card
        className="word-basics-input-card"
        size="small"
        title="词条信息"
        extra={<Tag color="blue">仅支持英文词条</Tag>}
      >
        <Form layout="vertical" onFinish={() => void submit()}>
          <Form.Item
            label="词条"
            validateStatus={fieldError ? "error" : undefined}
            help={fieldError}
          >
            <Input
              autoComplete="off"
              autoFocus
              disabled={busy === "creating"}
              placeholder="例如 center 或 give up"
              size="large"
              value={value}
              onChange={(event) => changeValue(event.target.value)}
              onPressEnter={(event) => {
                event.preventDefault();
                void submit();
              }}
            />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            loading={busy !== undefined}
            disabled={busy !== undefined || pending !== undefined}
          >
            {busy ? "正在检查并创建" : "继续创建"}
          </Button>
        </Form>
      </Card>

      {prepared ? (
        <div aria-live="polite">
          <DictionarySuggestionCard pending={prepared} catalog={catalog.data} />
        </div>
      ) : null}

      {pending ? (
        <Card className="word-detection-result-card" title="发现可能重复的词条">
          <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
            <Alert
              showIcon
              type="warning"
              title={`已加载 ${snapshot.items.length}/${snapshot.total} 条匹配`}
              description="继续创建只会新增草稿，不会修改已有词条。请查看完整结果后确认。"
            />
            {cards.map((card) => (
              <SurfaceCandidateDetails key={card.key} card={card} />
            ))}
            {snapshot.phase === "error" || snapshot.phase === "expired" ? (
              <Alert
                showIcon
                type="error"
                title="匹配结果已失效，请返回修改后重新提交。"
              />
            ) : null}
            {snapshot.phase === "disabled" ? (
              <Alert
                showIcon
                type="error"
                title="当前策略暂不允许继续创建该词条。"
              />
            ) : null}
            <Space wrap>
              <Button onClick={() => changeValue(value)}>返回修改</Button>
              <Button
                type="primary"
                loading={busy === "creating"}
                disabled={!canAcknowledgeSurfaceSnapshot(snapshot)}
                onClick={confirm}
              >
                确认并继续创建
              </Button>
            </Space>
          </Space>
        </Card>
      ) : null}

      {blockedDuplicates.length > 0 ? (
        <Card
          className="word-detection-result-card"
          title="智能词库中已有相同词条"
        >
          <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
            <Alert
              showIcon
              type="error"
              title="不能重复创建"
              description="请查看现有词条，或返回修改本次输入。"
            />
            {blockedDuplicates.map((duplicate) => (
              <DuplicateCandidateDetails
                key={duplicate.word_id}
                duplicate={duplicate}
                kind="phrase"
              />
            ))}
            <Button onClick={() => changeValue(value)}>返回修改</Button>
          </Space>
        </Card>
      ) : null}

      {error ? <Alert showIcon type="error" title={error} /> : null}
    </div>
  );
}
