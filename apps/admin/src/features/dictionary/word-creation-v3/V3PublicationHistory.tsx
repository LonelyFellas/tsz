import { HttpError } from "@tsz/api-client";
import type {
  AdminWordPublicationAny,
  AdminWordPublicationEnvelope,
  AdminWordPublicationListResponse,
  AdminWordV3,
  SurfaceMatchPageAny,
  WordDefinitionV2,
  WordDefinitionV3,
  WordHeadwordsV2
} from "@tsz/types";
import { Alert, Button, Card, Flex, Modal, Spin, Tag, Typography } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { LifecycleSurfaceConfirmation } from "../LifecycleSurfaceConfirmation";
import {
  canAcknowledgeSurfaceSnapshot,
  isSurfaceMatchPageAny,
  requiresNewIdempotencyKey
} from "../surfaceSnapshot";
import {
  type FetchSurfaceMatchPage,
  useSurfaceSnapshotAny
} from "../useSurfaceSnapshot";
import { createV3WordRequests, type V3WordRequests } from "./api";

type PublicationRequests = Pick<
  V3WordRequests,
  "get" | "listPublications" | "getPublication" | "activatePublication"
>;

type RecoveryStatus = 409 | 410;

interface RecoveryState {
  status: RecoveryStatus;
  phase: "refreshing" | "error";
}

interface Props {
  activationBlockedByUnsavedChanges?: boolean;
  currentWord: AdminWordV3;
  requests?: PublicationRequests;
  onActivated: (word: AdminWordV3) => void;
  onCanonicalRefreshed?: (word: AdminWordV3) => void;
  idempotencyKeyFactory?: () => string;
  fetchSurfacePage?: FetchSurfaceMatchPage<SurfaceMatchPageAny>;
}

const defaultRequests = createV3WordRequests();

function v2Headword(headwords: WordHeadwordsV2): string {
  return headwords.mode === "unified"
    ? headwords.common
    : `UK ${headwords.uk} / US ${headwords.us}`;
}

function publicationLabel(publication: AdminWordPublicationAny): string {
  return publication.schema_version === 2
    ? v2Headword(publication.word.headwords)
    : publication.word.presentation.label;
}

interface SnapshotFormLine {
  id: string;
  pos: string;
  formType: string;
  dialect: string;
  spelling: string;
  pronunciations: Array<{
    id: string;
    dictPhonetic: string;
    actualPron: string;
    style?: string;
  }>;
}

interface SnapshotMeaningLine {
  id: string;
  pos: string;
  mode: string;
  text: string;
}

function v2DefinitionTexts(definition: WordDefinitionV2): string[] {
  if ("content_id" in definition) {
    return [definition.content.text];
  }
  if (definition.content.mode === "unified") {
    return [definition.content.common.value.text];
  }
  return [definition.content.uk, definition.content.us].flatMap((slot) =>
    slot.state === "ready" ? [slot.variant.value.text] : []
  );
}

function v3DefinitionTexts(definition: WordDefinitionV3): string[] {
  if ("content_id" in definition) {
    return [definition.content.text];
  }
  if (definition.content.mode === "unified") {
    return [definition.content.common.value.text];
  }
  return [definition.content.uk, definition.content.us].flatMap((slot) =>
    slot.state === "ready" ? [slot.variant.value.text] : []
  );
}

function snapshotBody(publication: AdminWordPublicationAny): {
  forms: SnapshotFormLine[];
  meanings: SnapshotMeaningLine[];
} {
  if (publication.schema_version === 2) {
    const posById = new Map(
      publication.word.forms.pos.map((pos) => [pos.pos_id, pos.pos])
    );
    return {
      forms: publication.word.forms.pos.flatMap((pos) =>
        [
          pos.base_form,
          ...pos.form_groups.flatMap((group) => group.slots)
        ].flatMap((form) =>
          form.variants.map((variant) => ({
            id: variant.id,
            pos: pos.pos,
            formType: form.form_type,
            dialect: variant.dialect,
            spelling: variant.spelling,
            pronunciations: variant.pronunciations.map((pronunciation) => ({
              id: pronunciation.id,
              dictPhonetic: pronunciation.dict_phonetic,
              actualPron: pronunciation.actual_pron,
              style: pronunciation.style
            }))
          }))
        )
      ),
      meanings: publication.word.meanings.pos.flatMap((pos) =>
        pos.senses.flatMap((sense) =>
          sense.definitions.flatMap((definition) =>
            v2DefinitionTexts(definition).map((text, index) => ({
              id: `${definition.id}-${index}`,
              pos: posById.get(pos.pos_id) ?? pos.pos_id,
              mode: definition.definition_mode,
              text
            }))
          )
        )
      )
    };
  }

  const posById = new Map(
    publication.word.forms.pos.map((pos) => [pos.pos_id, pos.pos])
  );
  return {
    forms: publication.word.forms.pos.flatMap((pos) =>
      pos.forms.flatMap((form) => {
        const variants =
          form.regional_variants.mode === "common"
            ? [form.regional_variants.common]
            : [form.regional_variants.uk, form.regional_variants.us];
        return variants.map((variant) => ({
          id: variant.id,
          pos: pos.pos,
          formType: form.form_type,
          dialect: variant.dialect,
          spelling: variant.spelling,
          pronunciations: variant.pronunciations.map((pronunciation) => ({
            id: pronunciation.id,
            dictPhonetic: pronunciation.dict_phonetic,
            actualPron: pronunciation.actual_pron,
            style: pronunciation.style
          }))
        }));
      })
    ),
    meanings: publication.word.meanings.pos.flatMap((pos) =>
      pos.senses.flatMap((sense) =>
        sense.definitions.flatMap((definition) =>
          v3DefinitionTexts(definition).map((text, index) => ({
            id: `${definition.id}-${index}`,
            pos: posById.get(pos.pos_id) ?? pos.pos_id,
            mode: definition.definition_mode,
            text
          }))
        )
      )
    )
  };
}

function PublicationSnapshotBody({
  publication
}: {
  publication: AdminWordPublicationAny;
}) {
  const snapshot = snapshotBody(publication);
  return (
    <Card size="small" title="快照正文" data-testid="publication-snapshot-body">
      <Flex vertical gap="middle">
        <Flex vertical gap="small">
          <Typography.Text strong>词形与发音</Typography.Text>
          {snapshot.forms.length === 0 ? (
            <Typography.Text type="secondary">无词形快照</Typography.Text>
          ) : (
            snapshot.forms.map((form) => (
              <Flex key={form.id} vertical gap={2}>
                <Flex align="center" gap="small" wrap>
                  <Tag>{form.pos}</Tag>
                  <Tag>{form.formType}</Tag>
                  <Tag>{form.dialect}</Tag>
                  <Typography.Text>{form.spelling}</Typography.Text>
                </Flex>
                {form.pronunciations.length === 0 ? (
                  <Typography.Text type="secondary">无发音</Typography.Text>
                ) : (
                  form.pronunciations.map((pronunciation) => (
                    <Typography.Text key={pronunciation.id} type="secondary">
                      {pronunciation.dictPhonetic} → {pronunciation.actualPron}{" "}
                      · {pronunciation.style ?? "未标注"}
                    </Typography.Text>
                  ))
                )}
              </Flex>
            ))
          )}
        </Flex>
        <Flex vertical gap="small">
          <Typography.Text strong>释义</Typography.Text>
          {snapshot.meanings.length === 0 ? (
            <Typography.Text type="secondary">无释义快照</Typography.Text>
          ) : (
            snapshot.meanings.map((meaning) => (
              <Flex key={meaning.id} align="center" gap="small" wrap>
                <Tag>{meaning.pos}</Tag>
                <Tag>{meaning.mode}</Tag>
                <Typography.Text>{meaning.text}</Typography.Text>
              </Flex>
            ))
          )}
        </Flex>
      </Flex>
    </Card>
  );
}

function PublicationMetadata({
  publication
}: {
  publication: AdminWordPublicationAny;
}) {
  return (
    <Card size="small" title="发布元数据" data-testid="publication-metadata">
      <Flex vertical gap={2}>
        <Typography.Text>
          schema_version: {publication.schema_version}
        </Typography.Text>
        <Typography.Text>
          publication_id: {publication.publication_id}
        </Typography.Text>
        <Typography.Text>entry_id: {publication.entry_id}</Typography.Text>
        <Typography.Text>
          publication_number: {publication.publication_number}
        </Typography.Text>
        <Typography.Text>
          source_revision: {publication.source_revision}
        </Typography.Text>
        <Typography.Text>
          published_by_admin_id: {publication.published_by_admin_id}
        </Typography.Text>
        <Typography.Text>
          published_at: {publication.published_at}
        </Typography.Text>
        <Typography.Text>
          is_current: {publication.is_current ? "true" : "false"}
        </Typography.Text>
      </Flex>
    </Card>
  );
}

function PublicationStructureSnapshot({
  publication
}: {
  publication: AdminWordPublicationAny;
}) {
  return (
    <Card size="small" title="完整发布结构快照">
      <pre
        aria-label="完整发布结构快照"
        data-testid="publication-structure-snapshot"
        style={{
          margin: 0,
          maxHeight: 320,
          overflow: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word"
        }}
      >
        {JSON.stringify(publication, null, 2)}
      </pre>
    </Card>
  );
}

function canActivateV3Publication(
  publication: AdminWordPublicationAny,
  currentWord: AdminWordV3
): boolean {
  if (currentWord.status !== "published" || publication.is_current) {
    return false;
  }
  const currentCapability = currentWord.capabilities.publication;
  return (
    currentCapability.mode === "native" ||
    (currentCapability.mode === "migration_canary" &&
      currentCapability.whitelisted)
  );
}

function isCanonicalActivationConflict(error: unknown): error is HttpError {
  return (
    error instanceof HttpError &&
    error.status === 409 &&
    (error.code === "revision_conflict" ||
      error.code === "idempotency_conflict" ||
      error.code === "entry_archived")
  );
}

function surfaceActivationErrorMessage(code: string | undefined): string {
  if (
    code === "surface_match_snapshot_expired" ||
    code === "surface_policy_changed"
  ) {
    return "同名公开范围确认已失效，请重新检查激活条件。";
  }
  if (
    code === "exact_headword_creation_temporarily_disabled" ||
    code === "multiple_active_exact_headword_publications_not_enabled"
  ) {
    return "学习端暂不支持多个同名公开词条。";
  }
  return "激活需要确认同名公开范围，但服务端未返回可确认快照。";
}

function activationErrorMessage(error: unknown): string {
  if (error instanceof HttpError) {
    switch (error.status) {
      case 403:
        return "当前账号没有激活发布版本的权限。";
      case 422:
        return "激活请求校验未通过。";
      case 503:
        return "V3 发布服务暂不可用，请稍后重试。";
      default:
        return "激活发布版本失败，请稍后重试。";
    }
  }
  if (error instanceof TypeError) {
    return "网络异常，激活状态未知，请刷新发布历史后再重试。";
  }
  return "激活发布版本失败，请稍后重试。";
}

function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function V3PublicationHistory({
  activationBlockedByUnsavedChanges = false,
  currentWord,
  requests = defaultRequests,
  onActivated,
  onCanonicalRefreshed = onActivated,
  idempotencyKeyFactory = newIdempotencyKey,
  fetchSurfacePage
}: Props) {
  const [publications, setPublications] = useState<AdminWordPublicationAny[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const [selectedPublicationId, setSelectedPublicationId] = useState<string>();
  const [detail, setDetail] = useState<AdminWordPublicationAny>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activationError, setActivationError] = useState<string>();
  const [surfacePage, setSurfacePage] = useState<SurfaceMatchPageAny>();
  const [surfaceResetVersion, setSurfaceResetVersion] = useState(0);
  const [recovery, setRecovery] = useState<RecoveryState>();
  const mounted = useRef(true);
  const listGeneration = useRef(0);
  const detailGeneration = useRef(0);
  const activationGeneration = useRef(0);
  const activationLock = useRef(false);
  const activationKey = useRef<string | undefined>(undefined);
  const recoveryGeneration = useRef(0);
  const recoveryLock = useRef(false);
  const surfaceSnapshot = useSurfaceSnapshotAny(
    surfacePage,
    `${currentWord.id}:${selectedPublicationId ?? "none"}:${surfacePage?.schema_version ?? "none"}:${surfacePage?.snapshot_id ?? "none"}:${surfaceResetVersion}`,
    fetchSurfacePage
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      listGeneration.current += 1;
      detailGeneration.current += 1;
      activationGeneration.current += 1;
      recoveryGeneration.current += 1;
      activationLock.current = false;
      recoveryLock.current = false;
    };
  }, []);

  useEffect(() => {
    const generation = ++listGeneration.current;
    setLoading(true);
    setListError(false);
    void requests.listPublications(currentWord.id).then(
      (response: AdminWordPublicationListResponse) => {
        if (!mounted.current || listGeneration.current !== generation) return;
        setPublications(response.publications);
        setLoading(false);
      },
      () => {
        if (!mounted.current || listGeneration.current !== generation) return;
        setListError(true);
        setLoading(false);
      }
    );
  }, [
    currentWord.id,
    currentWord.lifecycle_revision,
    currentWord.revision,
    requests,
    retryVersion
  ]);

  useEffect(() => {
    detailGeneration.current += 1;
    activationGeneration.current += 1;
    activationLock.current = false;
    activationKey.current = undefined;
    recoveryGeneration.current += 1;
    recoveryLock.current = false;
    setSelectedPublicationId(undefined);
    setDetail(undefined);
    setConfirming(false);
    setActivating(false);
    setActivationError(undefined);
    setSurfacePage(undefined);
    setSurfaceResetVersion((value) => value + 1);
    setRecovery(undefined);
  }, [currentWord.id, currentWord.lifecycle_revision, currentWord.revision]);

  const retry = useCallback(() => setRetryVersion((value) => value + 1), []);

  const invalidateDetail = useCallback(() => {
    detailGeneration.current += 1;
    activationGeneration.current += 1;
    activationLock.current = false;
    activationKey.current = undefined;
    setSelectedPublicationId(undefined);
    setDetail(undefined);
    setDetailLoading(false);
    setDetailError(false);
    setConfirming(false);
    setActivating(false);
    setActivationError(undefined);
    setSurfacePage(undefined);
    setSurfaceResetVersion((value) => value + 1);
  }, []);

  const closeDetail = useCallback(() => {
    invalidateDetail();
  }, [invalidateDetail]);

  const refreshAfterConflict = useCallback(
    (status: RecoveryStatus) => {
      invalidateDetail();
      if (recoveryLock.current) return;
      recoveryLock.current = true;
      const generation = ++recoveryGeneration.current;
      setRecovery({ status, phase: "refreshing" });
      void Promise.all([
        requests.get(currentWord.id),
        requests.listPublications(currentWord.id)
      ])
        .then(
          ([canonical, history]) => {
            if (!mounted.current || recoveryGeneration.current !== generation) {
              return;
            }
            setPublications(history.publications);
            setLoading(false);
            setListError(false);
            setRecovery(undefined);
            onCanonicalRefreshed(canonical.word);
          },
          () => {
            if (!mounted.current || recoveryGeneration.current !== generation) {
              return;
            }
            setRecovery({ status, phase: "error" });
          }
        )
        .finally(() => {
          if (recoveryGeneration.current === generation) {
            recoveryLock.current = false;
          }
        });
    },
    [currentWord.id, invalidateDetail, onCanonicalRefreshed, requests]
  );

  const openDetail = useCallback(
    (publicationId: string) => {
      const generation = ++detailGeneration.current;
      activationGeneration.current += 1;
      activationLock.current = false;
      activationKey.current = undefined;
      setSelectedPublicationId(publicationId);
      setDetail(undefined);
      setDetailLoading(true);
      setDetailError(false);
      setConfirming(false);
      setActivationError(undefined);
      setSurfacePage(undefined);
      setSurfaceResetVersion((value) => value + 1);
      void requests.getPublication(currentWord.id, publicationId).then(
        (response: AdminWordPublicationEnvelope) => {
          if (!mounted.current || detailGeneration.current !== generation) {
            return;
          }
          if (
            response.publication.publication_id !== publicationId ||
            response.publication.entry_id !== currentWord.id
          ) {
            setDetailError(true);
          } else {
            setDetail(response.publication);
          }
          setDetailLoading(false);
        },
        () => {
          if (!mounted.current || detailGeneration.current !== generation) {
            return;
          }
          setDetailError(true);
          setDetailLoading(false);
        }
      );
    },
    [currentWord.id, requests]
  );

  const activate = useCallback(
    (confirmedSurfaceToken?: string) => {
      if (
        activationBlockedByUnsavedChanges ||
        activationLock.current ||
        !detail ||
        !canActivateV3Publication(detail, currentWord)
      ) {
        return;
      }
      activationLock.current = true;
      const generation = ++activationGeneration.current;
      const key = (activationKey.current ??= idempotencyKeyFactory());
      setActivating(true);
      setActivationError(undefined);
      void requests
        .activatePublication(currentWord.id, detail.publication_id, key, {
          schema_version: 3,
          base_revision: currentWord.revision,
          base_lifecycle_revision: currentWord.lifecycle_revision,
          ...(confirmedSurfaceToken
            ? { confirmed_surface_match_token: confirmedSurfaceToken }
            : {})
        })
        .then(
          (response) => {
            if (
              !mounted.current ||
              activationGeneration.current !== generation
            ) {
              return;
            }
            activationKey.current = undefined;
            setSurfacePage(undefined);
            setSurfaceResetVersion((value) => value + 1);
            setActivating(false);
            setConfirming(false);
            onActivated(response.word);
            setRetryVersion((value) => value + 1);
          },
          (error: unknown) => {
            if (
              !mounted.current ||
              activationGeneration.current !== generation
            ) {
              return;
            }
            if (isCanonicalActivationConflict(error)) {
              refreshAfterConflict(409);
              return;
            }
            if (
              error instanceof HttpError &&
              requiresNewIdempotencyKey(error.status, error.code)
            ) {
              activationKey.current = undefined;
              setActivating(false);
              setConfirming(false);
              setActivationError(undefined);
              const candidatePage = error.meta?.surface_match_page;
              if (isSurfaceMatchPageAny(candidatePage)) {
                setSurfacePage(candidatePage);
                setSurfaceResetVersion((value) => value + 1);
              } else {
                setSurfacePage(undefined);
                setActivationError(surfaceActivationErrorMessage(error.code));
              }
              return;
            }
            setActivating(false);
            setActivationError(activationErrorMessage(error));
          }
        )
        .finally(() => {
          if (activationGeneration.current === generation) {
            activationLock.current = false;
          }
        });
    },
    [
      activationBlockedByUnsavedChanges,
      currentWord,
      detail,
      idempotencyKeyFactory,
      onActivated,
      refreshAfterConflict,
      requests
    ]
  );

  const confirmSurfaceActivation = useCallback(() => {
    if (
      activationBlockedByUnsavedChanges ||
      !canAcknowledgeSurfaceSnapshot(surfaceSnapshot)
    ) {
      return;
    }
    void activate(surfaceSnapshot.surface_confirmation_token);
  }, [activate, activationBlockedByUnsavedChanges, surfaceSnapshot]);

  const restartSurfaceActivation = useCallback(() => {
    if (activationBlockedByUnsavedChanges || activationLock.current) return;
    activationKey.current = undefined;
    setSurfacePage(undefined);
    setSurfaceResetVersion((value) => value + 1);
    setActivationError(undefined);
    void activate();
  }, [activate, activationBlockedByUnsavedChanges]);

  const beginActivation = useCallback(() => {
    if (activationBlockedByUnsavedChanges) return;
    setConfirming(true);
  }, [activationBlockedByUnsavedChanges]);

  if (loading) return <Spin aria-label="加载发布历史" />;
  if (listError) {
    return (
      <Alert
        showIcon
        type="error"
        title="发布历史加载失败"
        action={<Button onClick={retry}>重 试</Button>}
      />
    );
  }

  return (
    <>
      {recovery ? (
        <Alert
          showIcon
          type={recovery.phase === "error" ? "error" : "warning"}
          title={
            recovery.phase === "error"
              ? "刷新最新词条与发布历史失败"
              : recovery.status === 409
                ? "词条版本已变化，正在刷新最新词条与发布历史"
                : "确认上下文已失效，正在刷新最新词条与发布历史"
          }
          description={
            recovery.phase === "error"
              ? "旧发布详情与确认已失效。刷新成功并重新打开发布详情前，不会再次发送激活请求。"
              : "旧发布详情与确认已失效，正在获取最新 canonical revision 和发布历史。"
          }
          action={
            recovery.phase === "error" ? (
              <Button onClick={() => refreshAfterConflict(recovery.status)}>
                重新刷新词条与发布历史
              </Button>
            ) : null
          }
        />
      ) : null}
      <Card title="发布历史">
        {publications.length === 0 ? (
          <Typography.Text type="secondary">暂无发布记录</Typography.Text>
        ) : (
          <Flex vertical gap="small">
            {publications.map((publication) => (
              <Flex
                key={publication.publication_id}
                align="center"
                justify="space-between"
                gap="small"
                wrap
              >
                <Flex vertical gap={2}>
                  <Flex align="center" gap="small" wrap>
                    <Tag
                      color={
                        publication.schema_version === 3 ? "blue" : undefined
                      }
                    >
                      V{publication.schema_version}
                    </Tag>
                    <Typography.Text strong>
                      {publicationLabel(publication)}
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      #{publication.publication_number} · revision{" "}
                      {publication.source_revision}
                    </Typography.Text>
                    {publication.is_current ? (
                      <Tag color="green">当前</Tag>
                    ) : null}
                  </Flex>
                  <Typography.Text type="secondary">
                    {publication.published_at}
                  </Typography.Text>
                </Flex>
                <Button
                  aria-label={`查看发布 #${publication.publication_number}`}
                  disabled={recovery !== undefined}
                  onClick={() => openDetail(publication.publication_id)}
                >
                  查看详情
                </Button>
              </Flex>
            ))}
          </Flex>
        )}
      </Card>
      <Modal
        footer={null}
        open={selectedPublicationId !== undefined}
        title="不可变发布详情"
        onCancel={closeDetail}
      >
        <Flex vertical gap="middle" data-testid="publication-detail">
          {detailLoading ? <Spin aria-label="加载发布详情" /> : null}
          {detailError ? (
            <Alert showIcon type="error" title="发布详情加载失败" />
          ) : null}
          {detail ? (
            <>
              <Flex align="center" gap="small" wrap>
                <Tag color={detail.schema_version === 3 ? "blue" : undefined}>
                  V{detail.schema_version}
                </Tag>
                <Typography.Title level={5} style={{ margin: 0 }}>
                  {publicationLabel(detail)}
                </Typography.Title>
                <Typography.Text type="secondary">
                  revision {detail.source_revision}
                </Typography.Text>
              </Flex>
              <Alert
                showIcon
                type="info"
                title={
                  detail.schema_version === 2
                    ? "历史 V2 快照永久只读"
                    : "正在查看不可变 V3 发布快照"
                }
              />
              <PublicationMetadata publication={detail} />
              <PublicationSnapshotBody publication={detail} />
              <PublicationStructureSnapshot publication={detail} />
              {surfacePage ? (
                <LifecycleSurfaceConfirmation
                  action="activate"
                  state={surfaceSnapshot}
                  confirming={activating}
                  onConfirm={confirmSurfaceActivation}
                  onRestart={restartSurfaceActivation}
                />
              ) : null}
              {activationError ? (
                <Alert showIcon type="error" title={activationError} />
              ) : null}
              {canActivateV3Publication(detail, currentWord) && !surfacePage ? (
                <>
                  {activationBlockedByUnsavedChanges ? (
                    <Alert
                      showIcon
                      type="warning"
                      title="请先保存或放弃未保存的草稿"
                      description="当前有未保存的词形或释义草稿。请先保存或主动放弃草稿，再激活历史发布；查看历史详情不受影响。"
                    />
                  ) : null}
                  {confirming ? (
                    <Alert
                      showIcon
                      type="warning"
                      title="确认激活历史发布"
                      description="激活会把该不可变快照设为当前线上版本。"
                      action={
                        <Button
                          disabled={activationBlockedByUnsavedChanges}
                          loading={activating}
                          onClick={() => void activate()}
                        >
                          确认激活
                        </Button>
                      }
                    />
                  ) : (
                    <Button
                      type="primary"
                      disabled={activationBlockedByUnsavedChanges}
                      onClick={() => beginActivation()}
                    >
                      激活此发布版本
                    </Button>
                  )}
                </>
              ) : null}
            </>
          ) : null}
          <Button aria-label="关闭发布详情" onClick={closeDetail}>
            关 闭
          </Button>
        </Flex>
      </Modal>
    </>
  );
}
