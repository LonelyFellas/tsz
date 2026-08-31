import { HttpError } from "@tsz/api-client/http";
import type {
  AdminWordAnyEnvelope,
  AdminWordV3,
  AdminWordV3Envelope,
  CreateAdminWordV3Input,
  DetectLexiconSurfaceResponseV3,
  DetectLexiconSurfaceV3Input,
  PartOfSpeechCatalogResponse,
  SurfaceMatchPageAny,
  WordHeadwordsV2
} from "@tsz/types";
import {
  CheckCircleFilled,
  ExclamationCircleOutlined,
  PlusOutlined,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminWordsAnyDataSource } from "../dataSource";
import { usePartOfSpeechCatalog } from "../part-of-speech/api";
import {
  aggregateLifecycleSurfaceMatchCards,
  canAcknowledgeSurfaceSnapshot,
  isSurfaceMatchPageAny,
  requiresNewIdempotencyKey
} from "../surfaceSnapshot";
import { useSurfaceSnapshotAny } from "../useSurfaceSnapshot";
import { createV3WordRequests } from "../word-creation-v3/api";
import type { PendingSentenceTargetNavigation } from "../word-creation-v3/pendingSentenceTargetNavigation";
import { newWordNodeId } from "../word-model/primitives";
import { useDialectPreference } from "../../settings/useDialectPreference";
import {
  extractDetectedBaseForms,
  resolveDetectedBaseForm,
  type DetectedBaseForm
} from "./baseFormDetection";
import { validateEntryInput } from "./entryClassification";
import { hasHeadwordsIssue, headwordsIssues } from "./headwordValidation";
import type { CreationNavigationState } from "./CreationSourceNotice";
import "./word-creation.css";

export interface UnifiedCreateRequests {
  detectV3: (
    input: DetectLexiconSurfaceV3Input
  ) => Promise<DetectLexiconSurfaceResponseV3>;
  createV3: (
    idempotencyKey: string,
    input: CreateAdminWordV3Input
  ) => Promise<AdminWordV3Envelope>;
  getWord: (wordId: string) => Promise<AdminWordAnyEnvelope>;
  surfacePage: (
    snapshotId: string,
    cursor: string,
    signal: AbortSignal
  ) => Promise<SurfaceMatchPageAny>;
}

type PendingCreation = {
  kind: "word" | "phrase";
  detection: DetectLexiconSurfaceResponseV3;
  idempotencyKey: string;
};

type CreateAttempt = {
  target: PendingCreation;
  input: CreateAdminWordV3Input;
};

interface Props {
  requests?: UnifiedCreateRequests;
  initialPendingTarget?: PendingSentenceTargetNavigation;
  onCreated: (
    word: AdminWordV3,
    navigationState: CreationNavigationState
  ) => void;
}

type RegionalDisplayState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      source: "database" | "builtin" | "input";
      value: WordHeadwordsV2;
    };

class ProductError extends Error {}

const v3Requests = createV3WordRequests();
const defaultRequests: UnifiedCreateRequests = {
  detectV3: v3Requests.detect,
  createV3: v3Requests.create,
  getWord: (wordId) => adminWordsAnyDataSource.getAny(wordId),
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
  archived: "垃圾桶"
} as const;

const KIND_LABEL = {
  word: "单词",
  phrase: "短语"
} as const;

function initialSurfacePage(pending?: PendingCreation) {
  return pending?.detection.surface_match_page;
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

function createErrorMessage(error: unknown): string {
  if (error instanceof TypeError) {
    return "网络异常，创建结果未知。请原样重试。";
  }
  if (!(error instanceof HttpError)) {
    return "响应异常，创建结果未知。请原样重试。";
  }
  return errorMessage(error);
}

function partOfSpeechLabel(
  code: string,
  catalog?: PartOfSpeechCatalogResponse
): string {
  return (
    catalog?.items.find((item) => item.code === code)?.name_zh ?? "未识别词性"
  );
}

function dictionaryCoverageLabel(
  category: "词形" | "发音",
  state: "complete" | "partial" | "missing"
) {
  const status = {
    complete: "完整覆盖",
    partial: "部分覆盖",
    missing: "词典未提供"
  }[state];
  return `${category}：${status}`;
}

function assertFreshDetection(expiresAt: string) {
  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(expiry) || expiry <= Date.now()) {
    throw new ProductError("检查结果已过期，请重新提交。");
  }
}

function hasV3PrefilledForms(word: AdminWordV3): boolean {
  return word.forms.pos.some(
    (pos) => pos.forms.length > 0 && pos.form_groups.length > 0
  );
}

function builtinRegionalValue(pending: PendingCreation): {
  source: "builtin" | "input";
  value: WordHeadwordsV2;
} {
  const builtin = pending.detection.builtin_dictionary;
  if (builtin.status === "matched") {
    const base = builtin.suggested_forms.find(
      (form) => form.form_type === "base"
    );
    if (base?.regional_variants.mode === "common") {
      return {
        source: "builtin",
        value: {
          mode: "unified",
          common: base.regional_variants.common.spelling
        }
      };
    }
    if (base?.regional_variants.mode === "uk_us") {
      return {
        source: "builtin",
        value: {
          mode: "distinguish",
          uk: base.regional_variants.uk.spelling,
          us: base.regional_variants.us.spelling,
          source_dialect: "us"
        }
      };
    }
  }
  return {
    source: "input",
    value: { mode: "unified", common: pending.detection.normalized_surface }
  };
}

function regionalValueForDetection(
  value: WordHeadwordsV2,
  surface: string,
  preference: "uk" | "us"
): WordHeadwordsV2 {
  if (value.mode === "unified") return value;
  const input = surface.trim().toLowerCase();
  const uk = value.uk.trim().toLowerCase();
  const us = value.us.trim().toLowerCase();
  const sourceDialect =
    uk === us
      ? preference
      : input === uk
        ? "uk"
        : input === us
          ? "us"
          : preference;
  return { ...value, source_dialect: sourceDialect };
}

function DetectionPresentationCard({
  pending,
  catalog,
  baseCandidates,
  surfaceCards,
  snapshot
}: {
  pending: PendingCreation;
  catalog?: PartOfSpeechCatalogResponse;
  baseCandidates: DetectedBaseForm[];
  surfaceCards: ReturnType<typeof aggregateLifecycleSurfaceMatchCards>;
  snapshot: ReturnType<typeof useSurfaceSnapshotAny>;
}) {
  const [expanded, setExpanded] = useState<string>();
  const builtinStatus = pending.detection.builtin_dictionary.status;
  const builtinCoverage =
    pending.detection.builtin_dictionary.status === "matched"
      ? pending.detection.builtin_dictionary.coverage
      : undefined;
  let builtinPosCodes = new Set<string>();
  if (pending.detection.builtin_dictionary.status === "matched") {
    builtinPosCodes = new Set([
      ...pending.detection.builtin_dictionary.suggested_pos,
      ...pending.detection.builtin_dictionary.suggested_forms.map(
        (form) => form.pos
      )
    ]);
  }
  const hasMatches = baseCandidates.length > 0 || surfaceCards.length > 0;
  const baseEntryIds = new Set(
    baseCandidates.map((candidate) => candidate.entryId)
  );
  const displayEntries = [
    ...baseCandidates.map((candidate) => ({
      key: candidate.key,
      entryId: candidate.entryId,
      schemaVersion: candidate.schemaVersion,
      label: candidate.spellings.join(" / ") || candidate.label,
      status: candidate.status,
      baseSpellings: candidate.spellings,
      otherMatches: [] as string[],
      posLabels: candidate.posLabels.map((pos) =>
        partOfSpeechLabel(pos, catalog)
      ),
      glossPreviews: candidate.glossPreviews
    })),
    ...surfaceCards
      .filter((card) => !baseEntryIds.has(card.entry_id))
      .map((card) => ({
        key: card.key,
        entryId: card.entry_id,
        schemaVersion: card.schema_version,
        label: card.label,
        status: card.status,
        baseSpellings: [] as string[],
        otherMatches: card.source_labels,
        posLabels: card.pos_labels,
        glossPreviews: card.gloss_previews
      }))
  ];
  const builtinPosLabels = [
    ...new Set(
      [...builtinPosCodes].map((pos) => partOfSpeechLabel(pos, catalog))
    )
  ];
  const smartPosLabels = [
    ...new Set(displayEntries.flatMap((entry) => entry.posLabels))
  ];
  const preferredPosLabels =
    smartPosLabels.length > 0 ? smartPosLabels : builtinPosLabels;
  const preferredPosSource =
    smartPosLabels.length > 0 ? "智能词库" : "内置词典";

  return (
    <Card
      className="word-detection-result-card"
      size="small"
      title="词典检测结果"
      extra={
        <Tag color={builtinStatus === "matched" ? "success" : "default"}>
          {builtinStatus === "matched" ? "已匹配" : "未匹配"}
        </Tag>
      }
    >
      <Space orientation="vertical" size={16} style={{ width: "100%" }}>
        <Descriptions column={1} size="small">
          <Descriptions.Item label="词条类型">
            {KIND_LABEL[pending.kind]}词条
          </Descriptions.Item>
          <Descriptions.Item label="原形检测">
            {hasMatches ? (
              "已发现"
            ) : (
              <Space>
                <CheckCircleFilled style={{ color: "#22a06b" }} />
                未发现
              </Space>
            )}
          </Descriptions.Item>
          {preferredPosLabels.length > 0 ? (
            <Descriptions.Item label="建议词性">
              <Space size={[6, 6]} wrap>
                {preferredPosLabels.map((label) => (
                  <Tag key={label} color="blue">
                    {label}
                  </Tag>
                ))}
                <Typography.Text type="secondary">
                  来源：{preferredPosSource}
                </Typography.Text>
              </Space>
            </Descriptions.Item>
          ) : null}
          {builtinCoverage ? (
            <Descriptions.Item label="词典覆盖">
              <Space size={[4, 4]} wrap>
                <Tag
                  color={
                    builtinCoverage.forms === "missing" ? "default" : "blue"
                  }
                >
                  {dictionaryCoverageLabel("词形", builtinCoverage.forms)}
                </Tag>
                <Tag
                  color={
                    builtinCoverage.pronunciations === "missing"
                      ? "default"
                      : "cyan"
                  }
                >
                  {dictionaryCoverageLabel(
                    "发音",
                    builtinCoverage.pronunciations
                  )}
                </Tag>
              </Space>
            </Descriptions.Item>
          ) : null}
        </Descriptions>

        {displayEntries.length > 0 ? (
          <div className="word-smart-match-summary">
            {displayEntries.map((entry) => (
              <div className="word-smart-match-summary-entry" key={entry.key}>
                <div className="word-smart-match-summary-row">
                  <Space size={8} wrap>
                    <Typography.Text strong>{entry.label}</Typography.Text>
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
                    {entry.posLabels.map((label) => (
                      <Tag key={label}>{label}</Tag>
                    ))}
                  </Space>
                  {entry.status === "draft" ? (
                    <Button
                      type="link"
                      href={
                        entry.schemaVersion === 3
                          ? `/words/${entry.entryId}/v3/wizard/forms`
                          : `/words/${entry.entryId}/wizard/forms`
                      }
                    >
                      继续创建
                    </Button>
                  ) : (
                    <Button
                      type="link"
                      onClick={() =>
                        setExpanded(
                          expanded === entry.key ? undefined : entry.key
                        )
                      }
                    >
                      查看已有原形
                    </Button>
                  )}
                </div>
                {expanded === entry.key ? (
                  <div className="word-smart-match-context-meta">
                    {entry.baseSpellings.map((spelling) => (
                      <div key={spelling}>原形：{spelling}</div>
                    ))}
                    {entry.baseSpellings.length === 0
                      ? entry.otherMatches.map((match) => (
                          <div key={match}>命中：{match}</div>
                        ))
                      : null}
                    {entry.posLabels.length > 0 ? (
                      <Space size={[4, 4]} wrap>
                        <span className="word-smart-match-context-meta-label">
                          基本词性：
                        </span>
                        {entry.posLabels.map((label) => (
                          <Tag key={label}>{label}</Tag>
                        ))}
                      </Space>
                    ) : null}
                    {entry.glossPreviews.map((gloss) => (
                      <div key={gloss}>释义：{gloss}</div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

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
      </Space>
    </Card>
  );
}

function HeadwordConfirmationCard({
  state,
  preference,
  disabled,
  onChange,
  onRetry
}: {
  state: RegionalDisplayState;
  preference: "uk" | "us";
  disabled?: boolean;
  onChange: (value: WordHeadwordsV2) => void;
  onRetry: () => void;
}) {
  if (state.status === "loading" || state.status === "idle") {
    return (
      <Card
        className="word-headword-confirmation-card"
        size="small"
        title="确认英美主词"
      >
        <Typography.Text type="secondary">正在加载原形…</Typography.Text>
      </Card>
    );
  }
  if (state.status === "error") {
    return (
      <Card
        className="word-headword-confirmation-card"
        size="small"
        title="确认英美主词"
      >
        <Alert
          showIcon
          type="error"
          title="原形详情加载失败"
          description="无法确认首个数据库原形，已停止创建。"
          action={<Button onClick={onRetry}>重新加载</Button>}
        />
      </Card>
    );
  }
  const value = state.value;
  const issues = headwordsIssues(value);
  const lockedLabel = preference === "uk" ? "英式" : "美式";
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
            开启后按个人方言偏好锁定一侧，另一侧可编辑
          </Typography.Text>
        </div>
        <Switch
          aria-label="区分英美词形"
          checked={value.mode === "distinguish"}
          disabled={disabled}
          onChange={(checked) => {
            const confirmed =
              value.mode === "distinguish" ? value[preference] : value.common;
            onChange(
              checked
                ? {
                    mode: "distinguish",
                    uk: confirmed,
                    us: confirmed,
                    source_dialect: preference
                  }
                : { mode: "unified", common: confirmed }
            );
          }}
        />
      </div>
      {value.mode === "unified" ? (
        <div className="dialect-panel">
          <Form.Item
            label="统一主词"
            required
            validateStatus={
              value.common.trim() === "" || issues.uk ? "error" : undefined
            }
            help={value.common.trim() === "" ? "请输入统一主词" : issues.uk}
          >
            <Input
              aria-label="统一主词"
              disabled={disabled}
              value={value.common}
              onChange={(event) =>
                onChange({ mode: "unified", common: event.target.value })
              }
            />
          </Form.Item>
        </div>
      ) : (
        <>
          <Typography.Text
            type="secondary"
            className="word-field-help word-headword-lock-note"
          >
            按个人偏好锁定{lockedLabel}
            主词；如需调整锁定侧，请先修改个人方言偏好。
          </Typography.Text>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <div className="dialect-panel dialect-panel-uk">
                <Typography.Text strong>英式英语 · BrE</Typography.Text>
                <Form.Item
                  required
                  validateStatus={
                    value.uk.trim() === "" || issues.uk ? "error" : undefined
                  }
                  help={value.uk.trim() === "" ? "请输入英式主词" : issues.uk}
                >
                  <Input
                    aria-label="英式主词"
                    value={value.uk}
                    disabled={disabled || preference === "uk"}
                    onChange={(event) =>
                      onChange({ ...value, uk: event.target.value })
                    }
                  />
                </Form.Item>
              </div>
            </Col>
            <Col xs={24} md={12}>
              <div className="dialect-panel dialect-panel-us">
                <Typography.Text strong>美式英语 · AmE</Typography.Text>
                <Form.Item
                  required
                  validateStatus={
                    value.us.trim() === "" || issues.us ? "error" : undefined
                  }
                  help={value.us.trim() === "" ? "请输入美式主词" : issues.us}
                >
                  <Input
                    aria-label="美式主词"
                    value={value.us}
                    disabled={disabled || preference === "us"}
                    onChange={(event) =>
                      onChange({ ...value, us: event.target.value })
                    }
                  />
                </Form.Item>
              </div>
            </Col>
          </Row>
        </>
      )}
      <Typography.Text
        type="secondary"
        className="word-field-help word-headword-source"
      >
        来源：
        {state.source === "database"
          ? "智能词库原形"
          : state.source === "builtin"
            ? "内置词典"
            : "本次输入"}
      </Typography.Text>
    </Card>
  );
}

export function UnifiedCreateEntryStep({
  requests = defaultRequests,
  initialPendingTarget,
  onCreated
}: Props) {
  const { modal } = App.useApp();
  const catalog = usePartOfSpeechCatalog();
  const { preference } = useDialectPreference();
  const [value, setValue] = useState(initialPendingTarget?.headword ?? "");
  const [fieldError, setFieldError] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<"checking" | "creating">();
  const [pending, setPending] = useState<PendingCreation>();
  const [prepared, setPrepared] = useState<PendingCreation>();
  const [createAttempt, setCreateAttempt] = useState<CreateAttempt>();
  const [regionalDisplay, setRegionalDisplay] = useState<RegionalDisplayState>({
    status: "idle"
  });
  const [detailRetry, setDetailRetry] = useState(0);
  const generation = useRef(0);
  const mounted = useRef(true);
  const locked = useRef(false);
  const retryKey = useRef<{ normalized: string; key: string } | undefined>(
    undefined
  );
  const preservedRegionalDisplay = useRef<
    Extract<RegionalDisplayState, { status: "ready" }> | undefined
  >(undefined);

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
  const baseCandidates = useMemo(() => {
    if (!prepared) return [];
    if (page) {
      if (!snapshot.schema_version) return [];
      return extractDetectedBaseForms(
        snapshot.schema_version,
        snapshot.items,
        snapshot.matched_entry_contexts
      );
    }
    return extractDetectedBaseForms(3, prepared.detection.matches, []);
  }, [
    page,
    prepared,
    snapshot.items,
    snapshot.matched_entry_contexts,
    snapshot.schema_version
  ]);
  const candidateDiscoveryReady =
    prepared !== undefined && (!page || snapshot.phase === "ready");

  useEffect(() => {
    if (!prepared) {
      setRegionalDisplay({ status: "idle" });
      return;
    }
    if (!candidateDiscoveryReady) {
      setRegionalDisplay(
        snapshot.phase === "disabled"
          ? { status: "idle" }
          : snapshot.phase === "error" || snapshot.phase === "expired"
            ? { status: "error" }
            : { status: "loading" }
      );
      return;
    }
    if (preservedRegionalDisplay.current) {
      setRegionalDisplay(preservedRegionalDisplay.current);
      return;
    }
    const fallback = builtinRegionalValue(prepared);
    const preferredFallback = {
      ...fallback,
      value: regionalValueForDetection(
        fallback.value,
        prepared.detection.normalized_surface,
        preference
      )
    };
    if (fallback.value.mode === "distinguish") {
      setRegionalDisplay({ status: "ready", ...preferredFallback });
      return;
    }
    const first = baseCandidates[0];
    if (!first) {
      setRegionalDisplay({ status: "ready", ...preferredFallback });
      return;
    }
    let active = true;
    setRegionalDisplay({ status: "loading" });
    void Promise.resolve(requests.getWord(first.entryId))
      .then((response) => {
        if (!active) return;
        const value = resolveDetectedBaseForm(response.word, first);
        setRegionalDisplay(
          value
            ? {
                status: "ready",
                source: "database",
                value:
                  value.mode === "distinguish"
                    ? regionalValueForDetection(
                        value,
                        prepared.detection.normalized_surface,
                        preference
                      )
                    : value
              }
            : { status: "error" }
        );
      })
      .catch(() => {
        if (active) setRegionalDisplay({ status: "error" });
      });
    return () => {
      active = false;
    };
  }, [
    baseCandidates,
    candidateDiscoveryReady,
    detailRetry,
    prepared,
    preference,
    requests,
    snapshot.phase
  ]);

  const changeValue = (next: string) => {
    generation.current += 1;
    retryKey.current = undefined;
    preservedRegionalDisplay.current = undefined;
    setValue(next);
    setFieldError(undefined);
    setError(undefined);
    setPending(undefined);
    setPrepared(undefined);
    setCreateAttempt(undefined);
    setRegionalDisplay({ status: "idle" });
  };

  const createPending = async (attempt: CreateAttempt) => {
    if (locked.current) return;
    const { target, input } = attempt;
    locked.current = true;
    setBusy("creating");
    setError(undefined);
    try {
      const response = await requests.createV3(target.idempotencyKey, input);
      if (!mounted.current) return;
      retryKey.current = undefined;
      setCreateAttempt(undefined);
      onCreated(response.word, {
        creationSource:
          target.detection.builtin_dictionary.status === "matched"
            ? !hasV3PrefilledForms(response.word)
              ? "dictionary-empty"
              : "dictionary"
            : "blank",
        ...(initialPendingTarget
          ? { pendingSentenceTarget: initialPendingTarget }
          : {})
      });
    } catch (requestError) {
      if (!mounted.current) return;
      if (
        requestError instanceof HttpError &&
        requiresNewIdempotencyKey(requestError.status, requestError.code)
      ) {
        const replacementPage = requestError.meta?.surface_match_page;
        setCreateAttempt(undefined);
        retryKey.current = {
          normalized: target.detection.normalized_surface,
          key: newWordNodeId()
        };
        if (
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
          setPrepared(undefined);
          setError("检查结果已变化，请重新提交。");
        }
      } else {
        if (requestError instanceof HttpError && requestError.status < 500) {
          setCreateAttempt(undefined);
        }
        setError(createErrorMessage(requestError));
      }
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(undefined);
    }
  };

  const submit = async () => {
    if (locked.current) return;
    const { normalized, kind, issue } = validateEntryInput(value);
    if (issue) {
      setFieldError(issue);
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
    setCreateAttempt(undefined);
    setError(undefined);
    setFieldError(undefined);
    setBusy("checking");
    try {
      const detection = await requests.detectV3({
        schema_version: 3,
        language: "en",
        kind,
        surface: normalized
      });
      if (!mounted.current || generation.current !== currentGeneration) {
        return;
      }
      if (
        detection.request.language !== "en" ||
        detection.request.kind !== kind ||
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
          throw new ProductError(
            `词性配置尚未就绪，暂时不能创建该${KIND_LABEL[kind]}。`
          );
        }
      }
      const target: PendingCreation = {
        kind,
        detection,
        idempotencyKey: keyState.key
      };
      setPrepared(target);
      if (detection.requires_acknowledgement) {
        if (!detection.surface_match_page) {
          throw new ProductError("匹配信息不完整，已停止创建。");
        }
        setPending(target);
      }
    } catch (requestError) {
      if (mounted.current && generation.current === currentGeneration) {
        setError(errorMessage(requestError));
      }
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(undefined);
    }
  };

  const beginCreation = (
    target: PendingCreation,
    confirmedSurfaceToken?: string
  ) => {
    const frozenAttempt =
      createAttempt?.target.idempotencyKey === target.idempotencyKey
        ? createAttempt
        : undefined;
    if (frozenAttempt) {
      setError(undefined);
      void createPending(frozenAttempt);
      return;
    }
    if (regionalDisplay.status !== "ready") {
      setError("请先完成原形确认后再创建。");
      return;
    }
    const headwords = regionalDisplay.value;
    preservedRegionalDisplay.current = regionalDisplay;
    const hasEmptyHeadword =
      headwords.mode === "unified"
        ? headwords.common.trim() === ""
        : headwords.uk.trim() === "" || headwords.us.trim() === "";
    if (hasEmptyHeadword || hasHeadwordsIssue(headwords)) {
      setError("请先填写合法的英文主词后再创建。");
      return;
    }
    try {
      assertFreshDetection(target.detection.expires_at);
    } catch {
      setPending(undefined);
      setPrepared(undefined);
      setError("检查结果已过期，请重新检测。");
      return;
    }
    const attempt: CreateAttempt = {
      target,
      input: {
        schema_version: 3,
        detection_id: target.detection.detection_id,
        kind: target.kind,
        headwords,
        ...(confirmedSurfaceToken
          ? {
              confirmed_surface_match_token: confirmedSurfaceToken
            }
          : {})
      }
    };
    setCreateAttempt(attempt);
    void createPending(attempt);
  };

  const confirm = () => {
    if (!pending || !canAcknowledgeSurfaceSnapshot(snapshot)) return;
    const create = () =>
      beginCreation(pending, snapshot.surface_confirmation_token);
    if (baseCandidates.length === 0) {
      create();
      return;
    }
    modal.confirm({
      title: "确认创建新的独立词条？",
      icon: <ExclamationCircleOutlined />,
      content:
        "检测到智能词库已有相同原形。继续后将创建一个新的独立词条，不会修改已有词条。",
      okText: "继续创建",
      cancelText: "取消",
      onOk: create
    });
  };

  return (
    <div
      className={`word-basics-workflow unified-entry-creation${prepared ? " is-detected" : ""}`}
    >
      <div className="word-step-heading">
        <span className="word-step-number">STEP 01</span>
        <Typography.Title level={2} style={{ margin: 0 }}>
          创建新词条
        </Typography.Title>
        <Typography.Paragraph className="word-step-description">
          录入词条，系统将判断词条类型，检测智能词库中的已有原形，并从内置词典匹配英美词形和建议词性。
        </Typography.Paragraph>
      </div>

      <Card className="word-basics-input-card" size="small" title="录入与检测">
        <Form layout="vertical" initialValues={{ language: "en" }}>
          <Form.Item label="所属语言" name="language">
            <Select
              options={[{ value: "en", label: "English  英语" }]}
              disabled
            />
          </Form.Item>
          <Form.Item
            label="录入词条"
            validateStatus={fieldError ? "error" : undefined}
            help={fieldError}
          >
            <Input.Search
              autoComplete="off"
              autoFocus
              disabled={
                busy !== undefined ||
                pending !== undefined ||
                createAttempt !== undefined
              }
              enterButton={
                <Space size={6}>
                  <SearchOutlined />
                  词典检测
                </Space>
              }
              loading={busy === "checking"}
              placeholder="例如 center 或 give up"
              size="large"
              value={value}
              onChange={(event) => changeValue(event.target.value)}
              onSearch={() => void submit()}
            />
          </Form.Item>
          <Typography.Text type="secondary" className="word-field-help">
            按 Enter 或点击检测，只查询词典；确认结果后再创建并进入下一步。
          </Typography.Text>
        </Form>
      </Card>

      {prepared ? (
        <div className="word-basics-result-grid" aria-live="polite">
          <DetectionPresentationCard
            pending={prepared}
            catalog={catalog.data}
            baseCandidates={baseCandidates}
            surfaceCards={cards}
            snapshot={snapshot}
          />
          {snapshot.phase !== "disabled" ? (
            <div className="word-headword-confirmation-wrap">
              <HeadwordConfirmationCard
                state={regionalDisplay}
                preference={preference}
                disabled={busy === "creating" || createAttempt !== undefined}
                onChange={(next) => {
                  setError(undefined);
                  setRegionalDisplay((current) => {
                    if (current.status !== "ready") return current;
                    const updated = { ...current, value: next };
                    preservedRegionalDisplay.current = updated;
                    return updated;
                  });
                }}
                onRetry={() => setDetailRetry((retry) => retry + 1)}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {pending ? (
        <div className="word-entry-actions">
          <Button onClick={() => changeValue(value)}>重新检测</Button>
          <Button
            type="primary"
            icon={<PlusOutlined aria-hidden />}
            loading={busy === "creating"}
            disabled={
              !canAcknowledgeSurfaceSnapshot(snapshot) ||
              regionalDisplay.status !== "ready"
            }
            onClick={confirm}
          >
            确认并创建，进入词形与发音
          </Button>
        </div>
      ) : null}

      {prepared && !pending ? (
        <div className="word-entry-actions">
          {createAttempt ? (
            <Button onClick={() => changeValue(value)}>重新检测</Button>
          ) : null}
          <Button
            type="primary"
            loading={busy === "creating"}
            disabled={busy !== undefined || regionalDisplay.status !== "ready"}
            onClick={() => beginCreation(prepared)}
          >
            {createAttempt && busy !== "creating"
              ? "原样重试创建"
              : "创建并进入词形与发音"}
          </Button>
        </div>
      ) : null}

      {error ? <Alert showIcon type="error" title={error} /> : null}
    </div>
  );
}
