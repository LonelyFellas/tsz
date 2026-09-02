import {
  AimOutlined,
  EyeOutlined,
  FileSearchOutlined,
  LinkOutlined,
  PlusOutlined,
  SearchOutlined
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Empty,
  Flex,
  Radio,
  Space,
  Tag,
  Typography
} from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PhraseComponentUsageV3 } from "@tsz/types";
import { sentenceTokens, type SentenceToken } from "../tokens";
import "./V3SentenceTargetDiscovery.css";

export type V3SentenceTargetDiscoveryDialect = "common" | "uk" | "us";

export interface V3SentenceTargetDiscoverySegment {
  start: number;
  end: number;
  surface: string;
}

export interface V3SentenceTargetDiscoverySense {
  id: string;
  gloss: string;
}

export type V3SentenceTargetDiscoveryCandidateState =
  "published" | "published_with_draft" | "draft";

export interface V3SentenceTargetDiscoveryCandidate {
  id: string;
  entryId: string;
  publicationId?: string;
  headword: string;
  baseForm: string;
  matchedForm: string;
  posLabel: string;
  formTypeLabel?: string;
  state: V3SentenceTargetDiscoveryCandidateState;
  senses: V3SentenceTargetDiscoverySense[];
  senseTotal: number;
  componentUsages?: PhraseComponentUsageV3[];
  matchedDialect?: V3SentenceTargetDiscoveryDialect;
  matchedFormId?: string;
  matchedVariantId?: string;
}

export type V3SentenceTargetDiscoveryKind =
  "word" | "phrase" | "separable_phrase";

export interface V3SentenceTargetDiscoveryOccurrence {
  id: string;
  kind: V3SentenceTargetDiscoveryKind;
  surface: string;
  segments: V3SentenceTargetDiscoverySegment[];
  candidates: V3SentenceTargetDiscoveryCandidate[];
  publishedTotal?: number;
  nextCursor?: string;
  componentWords?: string[];
  coveredByPhrase?: string;
}

export interface V3SentenceTargetDiscoveryResult {
  complete: boolean;
  overloaded: boolean;
  message?: string;
  occurrences: V3SentenceTargetDiscoveryOccurrence[];
}

export type V3SentenceTargetDiscoveryRequest =
  | {
      mode: "all_published_targets";
      sentenceText: string;
      dialect: V3SentenceTargetDiscoveryDialect;
    }
  | {
      mode: "selected_segments";
      scope: "published_and_draft";
      sentenceText: string;
      dialect: V3SentenceTargetDiscoveryDialect;
      segments: V3SentenceTargetDiscoverySegment[];
      cursor?: string;
    };

interface Props {
  sentenceText: string;
  dialect: V3SentenceTargetDiscoveryDialect;
  onDiscover: (
    request: V3SentenceTargetDiscoveryRequest,
    signal: AbortSignal
  ) => Promise<V3SentenceTargetDiscoveryResult>;
  onResultAccepted?: (
    result: V3SentenceTargetDiscoveryResult,
    request: V3SentenceTargetDiscoveryRequest
  ) => V3SentenceTargetDiscoveryResult;
  onSelectSense?: (
    occurrence: V3SentenceTargetDiscoveryOccurrence,
    candidate: V3SentenceTargetDiscoveryCandidate,
    sense: V3SentenceTargetDiscoverySense
  ) => void;
  onViewDraft?: (
    occurrence: V3SentenceTargetDiscoveryOccurrence,
    candidate: V3SentenceTargetDiscoveryCandidate
  ) => void;
  onConvertDraftToPending?: (
    occurrence: V3SentenceTargetDiscoveryOccurrence,
    candidate: V3SentenceTargetDiscoveryCandidate
  ) => void;
  onCreatePending?: (occurrence: V3SentenceTargetDiscoveryOccurrence) => void;
}

type DiscoveryMode = "automatic" | "manual";

function selectedSegments(
  text: string,
  tokens: SentenceToken[],
  selectedIndexes: ReadonlySet<number>
): V3SentenceTargetDiscoverySegment[] {
  const selected = tokens.filter((token) =>
    selectedIndexes.has(token.wordIndex)
  );
  if (selected.length === 0) return [];
  const codePoints = Array.from(text);
  const segments: V3SentenceTargetDiscoverySegment[] = [];

  for (const token of selected) {
    const previous = segments.at(-1);
    const previousToken = selected[selected.indexOf(token) - 1];
    const gap = previous
      ? codePoints.slice(previous.end, token.start).join("")
      : "";
    if (
      previous &&
      previousToken &&
      previousToken.wordIndex + 1 === token.wordIndex &&
      /^\s*$/u.test(gap)
    ) {
      previous.end = token.end;
      previous.surface = codePoints.slice(previous.start, token.end).join("");
    } else {
      segments.push({
        start: token.start,
        end: token.end,
        surface: token.text
      });
    }
  }
  return segments;
}

function occurrenceKindLabel(kind: V3SentenceTargetDiscoveryKind): string {
  if (kind === "word") return "单词";
  if (kind === "phrase") return "连续短语";
  return "可分离短语";
}

function candidateStateLabel(
  state: V3SentenceTargetDiscoveryCandidateState
): string {
  if (state === "draft") return "草稿候选";
  if (state === "published_with_draft") return "有未发布修改";
  return "已发布";
}

function componentWords(
  occurrence: V3SentenceTargetDiscoveryOccurrence
): string[] {
  if (occurrence.kind === "word") return [];
  if (occurrence.componentWords) return occurrence.componentWords;
  return occurrence.segments.flatMap((segment) =>
    Array.from(
      segment.surface.matchAll(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu),
      (match) => match[0]
    )
  );
}

export function V3SentenceTargetDiscovery({
  sentenceText,
  dialect,
  onDiscover,
  onResultAccepted,
  onSelectSense,
  onViewDraft,
  onConvertDraftToPending,
  onCreatePending
}: Props) {
  const [mode, setMode] = useState<DiscoveryMode>("automatic");
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(
    () => new Set()
  );
  const [loading, setLoading] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<V3SentenceTargetDiscoveryResult>();
  const [activeOccurrenceId, setActiveOccurrenceId] = useState<string>();
  const [expandedCandidates, setExpandedCandidates] = useState<Set<string>>(
    () => new Set()
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const abortRef = useRef<AbortController | undefined>(undefined);
  const requestIdRef = useRef(0);
  const contextFingerprintRef = useRef("");
  const tokens = useMemo(() => sentenceTokens(sentenceText), [sentenceText]);
  const segments = useMemo(
    () => selectedSegments(sentenceText, tokens, selectedIndexes),
    [selectedIndexes, sentenceText, tokens]
  );
  const segmentsFingerprint = JSON.stringify(segments);
  const contextFingerprint = JSON.stringify({
    dialect,
    mode,
    segments,
    sentenceText
  });
  contextFingerprintRef.current = contextFingerprint;

  useEffect(() => {
    abortRef.current?.abort();
    setLoading(false);
    setLoadingMore(false);
    setAttempted(false);
    setError(undefined);
    setResult(undefined);
    setActiveOccurrenceId(undefined);
    setExpandedCandidates(new Set());
  }, [dialect, mode, segmentsFingerprint, sentenceText]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    []
  );

  useEffect(() => {
    setSelectedIndexes(new Set());
  }, [sentenceText]);

  const runDiscovery = async () => {
    const request: V3SentenceTargetDiscoveryRequest =
      mode === "automatic"
        ? {
            dialect,
            mode: "all_published_targets",
            sentenceText
          }
        : {
            dialect,
            mode: "selected_segments",
            scope: "published_and_draft",
            segments,
            sentenceText
          };
    const requestFingerprint = contextFingerprintRef.current;
    const requestId = ++requestIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setAttempted(true);
    setLoading(true);
    setError(undefined);
    try {
      const nextResult = await onDiscover(request, controller.signal);
      if (
        controller.signal.aborted ||
        requestId !== requestIdRef.current ||
        requestFingerprint !== contextFingerprintRef.current
      )
        return;
      const acceptedResult =
        onResultAccepted?.(nextResult, request) ?? nextResult;
      setResult(acceptedResult);
      setActiveOccurrenceId(acceptedResult.occurrences[0]?.id);
      setExpandedCandidates(new Set());
    } catch (reason) {
      if (controller.signal.aborted || requestId !== requestIdRef.current)
        return;
      setResult(undefined);
      setError(
        reason instanceof Error ? reason.message : "发现失败，请稍后重试"
      );
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  };

  const activeOccurrence =
    result?.occurrences.find(
      (occurrence) => occurrence.id === activeOccurrenceId
    ) ?? result?.occurrences[0];

  const navigateToOccurrence = (occurrenceId: string) => {
    setActiveOccurrenceId(occurrenceId);
    requestAnimationFrame(() => {
      const target = document.getElementById(
        `v3-sentence-discovery-occurrence-${occurrenceId}`
      );
      target?.focus();
      target?.scrollIntoView?.({ block: "nearest" });
    });
  };

  const loadMoreCandidates = async (
    occurrence: V3SentenceTargetDiscoveryOccurrence
  ) => {
    if (!occurrence.nextCursor) return;
    const requestFingerprint = contextFingerprintRef.current;
    const requestId = ++requestIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoadingMore(true);
    setError(undefined);
    try {
      const next = await onDiscover(
        {
          dialect,
          mode: "selected_segments",
          scope: "published_and_draft",
          segments: occurrence.segments,
          sentenceText,
          cursor: occurrence.nextCursor
        },
        controller.signal
      );
      if (
        controller.signal.aborted ||
        requestId !== requestIdRef.current ||
        requestFingerprint !== contextFingerprintRef.current
      )
        return;
      const incoming = next.occurrences[0];
      if (!incoming) return;
      if (
        incoming.id !== occurrence.id ||
        JSON.stringify(incoming.segments) !==
          JSON.stringify(occurrence.segments)
      ) {
        setError("分页结果与当前命中位置不一致，请重新查询");
        return;
      }
      setResult((current) =>
        current
          ? {
              ...current,
              occurrences: current.occurrences.map((item) =>
                item.id === occurrence.id
                  ? {
                      ...item,
                      candidates: Array.from(
                        new Map(
                          [...item.candidates, ...incoming.candidates].map(
                            (candidate) => [candidate.id, candidate]
                          )
                        ).values()
                      ),
                      nextCursor: incoming.nextCursor,
                      publishedTotal: incoming.publishedTotal
                    }
                  : item
              )
            }
          : current
      );
    } catch (reason) {
      if (
        !controller.signal.aborted &&
        requestId === requestIdRef.current &&
        requestFingerprint === contextFingerprintRef.current
      ) {
        setError(reason instanceof Error ? reason.message : "加载更多候选失败");
      }
    } finally {
      if (requestId === requestIdRef.current) setLoadingMore(false);
    }
  };

  const statusText = loading
    ? "正在发现句中的已发布单词和连续短语"
    : error
      ? `发现失败：${error}`
      : result?.overloaded
        ? "发现范围过大，请缩小范围"
        : attempted && result?.occurrences.length === 0
          ? "暂未发现已发布词条"
          : result?.occurrences.length
            ? `已发现 ${result.occurrences.length} 个命中位置`
            : "尚未开始发现";

  return (
    <Card
      className="v3-sentence-target-discovery"
      size="small"
      title={
        <Space size={8}>
          <AimOutlined aria-hidden />
          <span>发现并关联词条</span>
        </Space>
      }
    >
      <Flex align="flex-start" gap={16} justify="space-between" wrap>
        <div className="v3-sentence-target-discovery-intro">
          <Typography.Text strong>从例句中发现已有词条</Typography.Text>
          <Typography.Paragraph type="secondary">
            自动发现当前匹配已发布单词和连续短语；手动选择支持不连续成分并可同时查看草稿。保存抽屉后才会写入数据库。
          </Typography.Paragraph>
        </div>
        <Radio.Group
          aria-label="发现方式"
          buttonStyle="solid"
          onChange={(event) => setMode(event.target.value as DiscoveryMode)}
          optionType="button"
          size="small"
          value={mode}
        >
          <Radio.Button aria-label="自动发现" value="automatic">
            自动发现
          </Radio.Button>
          <Radio.Button aria-label="手动选择" value="manual">
            手动选择
          </Radio.Button>
        </Radio.Group>
      </Flex>

      {mode === "automatic" ? (
        <div className="v3-sentence-target-discovery-action">
          <Flex align="center" gap={12} justify="space-between" wrap>
            <Typography.Text type="secondary">
              一次查询句中的单词和连续短语；重叠时优先加入最长短语，多词义结果仍由你确认。
            </Typography.Text>
            <Button
              disabled={!sentenceText.trim()}
              icon={<SearchOutlined aria-hidden />}
              loading={loading}
              onClick={() => void runDiscovery()}
              type="primary"
            >
              一键发现
            </Button>
          </Flex>
        </div>
      ) : (
        <div className="v3-sentence-target-discovery-manual">
          <Flex align="center" gap={8} justify="space-between" wrap>
            <div>
              <Typography.Text strong>选择句中的单词</Typography.Text>
              <Typography.Paragraph type="secondary">
                可选择多个连续或不连续单词；只有点击查询按钮后才会检索。
              </Typography.Paragraph>
            </div>
            <Button
              disabled={segments.length === 0}
              icon={<FileSearchOutlined aria-hidden />}
              loading={loading}
              onClick={() => void runDiscovery()}
              type="primary"
            >
              查询所选单词或短语
            </Button>
          </Flex>
          {tokens.length > 0 ? (
            <div
              aria-label="例句单词选择区"
              className="v3-sentence-target-discovery-tokens"
            >
              {tokens.map((token) => {
                const selected = selectedIndexes.has(token.wordIndex);
                return (
                  <button
                    aria-label={`选择第 ${token.wordIndex + 1} 个词 ${token.text}`}
                    aria-pressed={selected}
                    className={selected ? "is-selected" : undefined}
                    key={token.key}
                    onClick={() =>
                      setSelectedIndexes((current) => {
                        const next = new Set(current);
                        if (next.has(token.wordIndex))
                          next.delete(token.wordIndex);
                        else next.add(token.wordIndex);
                        return next;
                      })
                    }
                    type="button"
                  >
                    {token.text}
                  </button>
                );
              })}
            </div>
          ) : (
            <Empty
              description="请先填写英文例句"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          )}
          <Flex
            align="center"
            className="v3-sentence-target-discovery-selection"
            gap={8}
          >
            <Typography.Text type="secondary">当前选择</Typography.Text>
            <Typography.Text strong>
              {segments.length > 0
                ? segments.map((segment) => segment.surface).join(" … ")
                : "尚未选择"}
            </Typography.Text>
          </Flex>
        </div>
      )}

      <div
        aria-atomic="true"
        aria-live="polite"
        className="v3-sentence-target-discovery-status"
        role="status"
      >
        {statusText}
      </div>

      {error ? (
        <Alert showIcon title="发现失败" description={error} type="error" />
      ) : null}
      {result?.overloaded ? (
        <Alert
          showIcon
          title="结果较多，暂未完整返回"
          description={result.message ?? "请改用手动选择，缩小查询范围后重试。"}
          type="warning"
        />
      ) : null}

      {result && result.occurrences.length > 0 ? (
        <div className="v3-sentence-target-discovery-results">
          <div
            aria-label="命中位置"
            className="v3-sentence-target-discovery-occurrences"
            role="navigation"
          >
            {result.occurrences.map((occurrence) => (
              <button
                aria-current={
                  occurrence.id === activeOccurrence?.id ? "true" : undefined
                }
                aria-label={`查看命中位置：${occurrence.surface}`}
                key={occurrence.id}
                onClick={() => navigateToOccurrence(occurrence.id)}
                type="button"
              >
                <span>{occurrence.surface}</span>
                <small>
                  {occurrence.coveredByPhrase
                    ? "成分用词"
                    : occurrenceKindLabel(occurrence.kind)}
                </small>
              </button>
            ))}
          </div>

          {activeOccurrence ? (
            <section
              aria-label={`命中详情：${activeOccurrence.surface}`}
              className="v3-sentence-target-discovery-occurrence-detail"
              id={`v3-sentence-discovery-occurrence-${activeOccurrence.id}`}
              tabIndex={-1}
            >
              <Flex align="center" gap={8} justify="space-between" wrap>
                <Space size={8}>
                  <Typography.Text strong>
                    {activeOccurrence.surface}
                  </Typography.Text>
                  <Tag color="blue">
                    {occurrenceKindLabel(activeOccurrence.kind)}
                  </Tag>
                </Space>
                <Typography.Text type="secondary">
                  {activeOccurrence.publishedTotal !== undefined &&
                  activeOccurrence.publishedTotal >
                    activeOccurrence.candidates.filter(
                      (candidate) => candidate.state !== "draft"
                    ).length
                    ? `已显示 ${activeOccurrence.candidates.filter((candidate) => candidate.state !== "draft").length} / ${activeOccurrence.publishedTotal} 个已发布候选，请缩小手动选择范围查看其余结果`
                    : `${activeOccurrence.candidates.length} 个候选词条`}
                </Typography.Text>
              </Flex>

              {activeOccurrence.coveredByPhrase ? (
                <Alert
                  showIcon
                  title={`已作为「${activeOccurrence.coveredByPhrase}」的成分用词`}
                  description="该单词随最长短语进入本次关联，不再生成一条重叠关联。"
                  type="info"
                />
              ) : null}

              {componentWords(activeOccurrence).length > 0 ? (
                <Flex
                  align="center"
                  className="v3-sentence-target-discovery-components"
                  gap={6}
                  wrap
                >
                  <Typography.Text type="secondary">成分用词</Typography.Text>
                  {componentWords(activeOccurrence).map((word, index) => (
                    <Tag key={`${activeOccurrence.id}:${index}:${word}`}>
                      {word}
                    </Tag>
                  ))}
                </Flex>
              ) : null}

              {activeOccurrence.candidates.length > 0 ? (
                <Space
                  orientation="vertical"
                  size={10}
                  style={{ width: "100%" }}
                >
                  {activeOccurrence.candidates.map((candidate) => {
                    const candidateKey = `${activeOccurrence.id}:${candidate.id}`;
                    const expanded = expandedCandidates.has(candidateKey);
                    const draft = candidate.state === "draft";
                    return (
                      <article
                        className="v3-sentence-target-discovery-candidate"
                        key={candidate.id}
                      >
                        <Flex
                          align="flex-start"
                          gap={12}
                          justify="space-between"
                          wrap
                        >
                          <div className="v3-sentence-target-discovery-candidate-main">
                            <Flex align="center" gap={8} wrap>
                              <Typography.Text strong>
                                {candidate.headword}
                              </Typography.Text>
                              <Tag>{candidate.posLabel}</Tag>
                              <Tag color={draft ? "orange" : "green"}>
                                {candidateStateLabel(candidate.state)}
                              </Tag>
                            </Flex>
                            <Typography.Text type="secondary">
                              命中词形 {candidate.matchedForm} → 原形{" "}
                              {candidate.baseForm}
                              {candidate.formTypeLabel
                                ? ` · ${candidate.formTypeLabel}`
                                : ""}
                            </Typography.Text>
                            {candidate.componentUsages?.length ? (
                              <Flex gap={6} style={{ marginTop: 8 }} vertical>
                                <Typography.Text type="secondary">
                                  当前词形的成分用词
                                </Typography.Text>
                                {candidate.componentUsages.map((component) => (
                                  <Flex
                                    align="center"
                                    gap={6}
                                    key={component.id}
                                    wrap
                                  >
                                    <Tag>{component.literal}</Tag>
                                    <Tag
                                      color={
                                        component.state === "resolved"
                                          ? "green"
                                          : "gold"
                                      }
                                    >
                                      {component.state === "resolved"
                                        ? "已关联词义"
                                        : "待选择词义"}
                                    </Tag>
                                    {component.state === "resolved" ? (
                                      <Typography.Text type="secondary">
                                        {component.target_headword} ·{" "}
                                        {component.target_gloss}
                                      </Typography.Text>
                                    ) : null}
                                  </Flex>
                                ))}
                              </Flex>
                            ) : null}
                          </div>
                          {draft ? (
                            <Space size={6}>
                              <Button
                                icon={<EyeOutlined aria-hidden />}
                                onClick={() =>
                                  onViewDraft?.(activeOccurrence, candidate)
                                }
                                size="small"
                              >
                                查看草稿
                              </Button>
                              <Button
                                icon={<PlusOutlined aria-hidden />}
                                onClick={() =>
                                  onConvertDraftToPending?.(
                                    activeOccurrence,
                                    candidate
                                  )
                                }
                                size="small"
                                type="primary"
                              >
                                转为待关联词条
                              </Button>
                            </Space>
                          ) : (
                            <Button
                              onClick={() =>
                                setExpandedCandidates((current) => {
                                  const next = new Set(current);
                                  if (next.has(candidateKey))
                                    next.delete(candidateKey);
                                  else next.add(candidateKey);
                                  return next;
                                })
                              }
                              size="small"
                              type="link"
                            >
                              {expanded
                                ? "收起词义"
                                : `查看 ${candidate.senseTotal} 个词义`}
                            </Button>
                          )}
                        </Flex>

                        {draft && candidate.senses[0] ? (
                          <div className="v3-sentence-target-discovery-draft-gloss">
                            <Typography.Text type="secondary">
                              预填词义
                            </Typography.Text>
                            <Typography.Text>
                              {candidate.senses[0].gloss}
                            </Typography.Text>
                          </div>
                        ) : null}

                        {!draft && expanded ? (
                          <div className="v3-sentence-target-discovery-senses">
                            {candidate.senses.map((sense) => (
                              <Flex
                                align="center"
                                gap={12}
                                justify="space-between"
                                key={sense.id}
                              >
                                <Typography.Text>
                                  {sense.gloss || "未填写释义"}
                                </Typography.Text>
                                {activeOccurrence.coveredByPhrase ? (
                                  <Typography.Text type="secondary">
                                    随短语关联
                                  </Typography.Text>
                                ) : (
                                  <Button
                                    aria-label={`关联词义：${sense.gloss || "未填写释义"}`}
                                    icon={<LinkOutlined aria-hidden />}
                                    onClick={() =>
                                      onSelectSense?.(
                                        activeOccurrence,
                                        candidate,
                                        sense
                                      )
                                    }
                                    size="small"
                                    type="primary"
                                  >
                                    关联此词义
                                  </Button>
                                )}
                              </Flex>
                            ))}
                            {candidate.senseTotal > candidate.senses.length ? (
                              <Typography.Text type="secondary">
                                还有{" "}
                                {candidate.senseTotal - candidate.senses.length}{" "}
                                个词义，请继续加载后选择。
                              </Typography.Text>
                            ) : null}
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </Space>
              ) : (
                <Empty
                  description="该位置暂无可用候选，可先保存为待关联词条"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                >
                  <Button
                    icon={<PlusOutlined aria-hidden />}
                    onClick={() => onCreatePending?.(activeOccurrence)}
                    type="primary"
                  >
                    添加待关联词条
                  </Button>
                </Empty>
              )}
              {activeOccurrence.nextCursor ? (
                <Button
                  block
                  loading={loadingMore}
                  onClick={() => void loadMoreCandidates(activeOccurrence)}
                >
                  加载更多候选
                </Button>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
