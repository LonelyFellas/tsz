import { HttpError } from "@tsz/api-client";
import type {
  AdminWordPublicationAny,
  AdminWordPublicationEnvelope,
  AdminWordPublicationListResponse,
  AdminWordV3,
  EnglishTextV2,
  EnglishTextV3,
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
import {
  definitionModeLabel,
  dialectLabel,
  formTypeLabel,
  partOfSpeechLabel,
  pronunciationStyleLabel,
  relationLabel,
  sentenceLinkRoleLabel
} from "./presentation";

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
    : `英式 ${headwords.uk} / 美式 ${headwords.us}`;
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

interface SnapshotGrammarLine {
  id: string;
  pos: string;
  dialect: string;
  text: string;
}

interface SnapshotSentenceLine {
  id: string;
  pos: string;
  level: string;
  english: Array<{ id: string; dialect: string; text: string }>;
  chinese: string;
  roles: string[];
  associations: Array<{ id: string; target: string; gloss?: string }>;
}

interface SnapshotRelationLine {
  id: string;
  pos: string;
  relation: string;
  target: string;
  gloss?: string;
}

interface SnapshotSenseGroupLine {
  id: string;
  label: string;
}

function v2EnglishRows(value: EnglishTextV2) {
  if (value.mode === "unified") {
    return [
      {
        id: value.common.id,
        dialect: "common",
        text: value.common.value.text
      }
    ];
  }
  return (["uk", "us"] as const).flatMap((dialect) => {
    const slot = value[dialect];
    return slot.state === "ready"
      ? [
          {
            id: slot.variant.id,
            dialect,
            text: slot.variant.value.text
          }
        ]
      : [];
  });
}

function v3EnglishRows(value: EnglishTextV3) {
  if (value.mode === "unified") {
    return [
      {
        id: value.common.id,
        dialect: "common",
        text: value.common.value.text
      }
    ];
  }
  return (["uk", "us"] as const).flatMap((dialect) => {
    const slot = value[dialect];
    return slot.state === "ready"
      ? [
          {
            id: slot.variant.id,
            dialect,
            text: slot.variant.value.text
          }
        ]
      : [];
  });
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
  senseGroups: SnapshotSenseGroupLine[];
  grammar: SnapshotGrammarLine[];
  sentences: SnapshotSentenceLine[];
  relations: SnapshotRelationLine[];
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
      ),
      senseGroups: publication.word.meanings.sense_groups.map((group) => ({
        id: group.id,
        label: [group.name_zh, group.name_en].filter(Boolean).join(" / ")
      })),
      grammar: publication.word.meanings.pos.flatMap((pos) =>
        pos.grammar_structures.flatMap((structure) =>
          structure.variants.map((variant) => ({
            id: variant.id,
            pos: posById.get(pos.pos_id) ?? pos.pos_id,
            dialect: variant.dialect,
            text: variant.content.text
          }))
        )
      ),
      sentences: publication.word.meanings.pos.flatMap((pos) =>
        pos.senses.flatMap((sense) =>
          sense.sentences.map((sentence) => ({
            id: sentence.id,
            pos: posById.get(pos.pos_id) ?? pos.pos_id,
            level: sentence.level,
            english: v2EnglishRows(sentence.en_text),
            chinese: sentence.zh_text.text,
            roles: sentence.links.map((link) =>
              sentenceLinkRoleLabel(link.role)
            ),
            associations: []
          }))
        )
      ),
      relations: publication.word.meanings.pos.flatMap((pos) =>
        pos.senses.flatMap((sense) =>
          sense.relations.map((relation) => ({
            id: relation.id,
            pos: posById.get(pos.pos_id) ?? pos.pos_id,
            relation: relation.relation,
            target:
              relation.target_headword ??
              relation.pending_target_headword ??
              "待补充目标词条",
            ...(relation.target_gloss ? { gloss: relation.target_gloss } : {})
          }))
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
    ),
    senseGroups: publication.word.meanings.sense_groups.map((group) => ({
      id: group.id,
      label: [group.name_zh, group.name_en].filter(Boolean).join(" / ")
    })),
    grammar: publication.word.meanings.pos.flatMap((pos) =>
      pos.grammar_structures.flatMap((structure) =>
        structure.variants.map((variant) => ({
          id: variant.id,
          pos: posById.get(pos.pos_id) ?? pos.pos_id,
          dialect: variant.dialect,
          text: variant.content.text
        }))
      )
    ),
    sentences: publication.word.meanings.pos.flatMap((pos) =>
      pos.senses.flatMap((sense) =>
        sense.sentences.map((sentence) => ({
          id: sentence.id,
          pos: posById.get(pos.pos_id) ?? pos.pos_id,
          level: sentence.level,
          english: v3EnglishRows(sentence.en_text),
          chinese: sentence.zh_text.text,
          roles: sentence.links.map((link) => sentenceLinkRoleLabel(link.role)),
          associations: sentence.associations.map((association) => ({
            id: association.id,
            target: association.target_headword,
            ...(association.target_gloss
              ? { gloss: association.target_gloss }
              : {})
          }))
        }))
      )
    ),
    relations: publication.word.meanings.pos.flatMap((pos) =>
      pos.senses.flatMap((sense) =>
        sense.relations.map((relation) => ({
          id: relation.id,
          pos: posById.get(pos.pos_id) ?? pos.pos_id,
          relation: relation.relation,
          target:
            relation.target_headword ??
            relation.pending_target_headword ??
            "待补充目标词条",
          ...(relation.target_gloss ? { gloss: relation.target_gloss } : {})
        }))
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
                  <Tag>{partOfSpeechLabel(form.pos)}</Tag>
                  <Tag>{formTypeLabel(form.formType as never)}</Tag>
                  <Tag>{dialectLabel(form.dialect as never)}</Tag>
                  <Typography.Text>{form.spelling}</Typography.Text>
                </Flex>
                {form.pronunciations.length === 0 ? (
                  <Typography.Text type="secondary">无发音</Typography.Text>
                ) : (
                  form.pronunciations.map((pronunciation) => (
                    <Typography.Text key={pronunciation.id} type="secondary">
                      词典音标 {pronunciation.dictPhonetic} · 实际发音{" "}
                      {pronunciation.actualPron}
                      {pronunciation.style
                        ? ` · ${pronunciationStyleLabel(pronunciation.style as never)}`
                        : ""}
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
                <Tag>{partOfSpeechLabel(meaning.pos)}</Tag>
                <Tag>{definitionModeLabel(meaning.mode)}</Tag>
                <Typography.Text>{meaning.text}</Typography.Text>
              </Flex>
            ))
          )}
        </Flex>
        {snapshot.senseGroups.length > 0 ? (
          <Flex vertical gap="small">
            <Typography.Text strong>释义组</Typography.Text>
            <Flex gap="small" wrap>
              {snapshot.senseGroups.map((group, index) => (
                <Tag key={group.id}>
                  释义组 {index + 1}：{group.label}
                </Tag>
              ))}
            </Flex>
          </Flex>
        ) : null}
        {snapshot.grammar.length > 0 ? (
          <Flex vertical gap="small">
            <Typography.Text strong>语法结构</Typography.Text>
            {snapshot.grammar.map((grammar) => (
              <Flex key={grammar.id} gap="small" wrap>
                <Tag>{partOfSpeechLabel(grammar.pos)}</Tag>
                <Tag>{dialectLabel(grammar.dialect as never)}</Tag>
                <Typography.Text>{grammar.text}</Typography.Text>
              </Flex>
            ))}
          </Flex>
        ) : null}
        <Flex vertical gap="small">
          <Typography.Text strong>例句</Typography.Text>
          {snapshot.sentences.length === 0 ? (
            <Typography.Text type="secondary">无例句快照</Typography.Text>
          ) : (
            snapshot.sentences.map((sentence) => (
              <Card key={sentence.id} size="small">
                <Flex vertical gap={4}>
                  <Flex gap="small" wrap>
                    <Tag>{partOfSpeechLabel(sentence.pos)}</Tag>
                    {sentence.level ? <Tag>{sentence.level}</Tag> : null}
                    {sentence.roles.map((role, index) => (
                      <Tag key={`${sentence.id}-role-${index}`}>{role}</Tag>
                    ))}
                  </Flex>
                  {sentence.english.map((row) => (
                    <Typography.Text key={row.id}>
                      {dialectLabel(row.dialect as never)}：{row.text}
                    </Typography.Text>
                  ))}
                  <Typography.Text>中文：{sentence.chinese}</Typography.Text>
                  {sentence.associations.map((association) => (
                    <Typography.Text key={association.id}>
                      上下文关联：{association.target}
                      {association.gloss ? ` · ${association.gloss}` : ""}
                    </Typography.Text>
                  ))}
                </Flex>
              </Card>
            ))
          )}
        </Flex>
        <Flex vertical gap="small">
          <Typography.Text strong>关系词</Typography.Text>
          {snapshot.relations.length === 0 ? (
            <Typography.Text type="secondary">无关系词快照</Typography.Text>
          ) : (
            snapshot.relations.map((relation) => (
              <Flex key={relation.id} gap="small" wrap>
                <Tag>{partOfSpeechLabel(relation.pos)}</Tag>
                <Tag>{relationLabel(relation.relation)}</Tag>
                <Typography.Text>
                  {relation.target}
                  {relation.gloss ? ` · ${relation.gloss}` : ""}
                </Typography.Text>
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
    <Card size="small" title="发布信息" data-testid="publication-metadata">
      <Flex vertical gap={2}>
        <Typography.Text>
          发布批次：第 {publication.publication_number} 次
        </Typography.Text>
        <Typography.Text>发布时间：{publication.published_at}</Typography.Text>
        <Typography.Text>
          当前状态：{publication.is_current ? "当前线上版本" : "历史版本"}
        </Typography.Text>
      </Flex>
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
        return "发布服务暂不可用，请稍后重试。";
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
              : "旧发布详情与确认已失效，正在获取最新词条和发布历史。"
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
                    <Typography.Text strong>
                      {publicationLabel(publication)}
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      第 {publication.publication_number} 次发布
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
                  aria-label={`查看第 ${publication.publication_number} 次发布`}
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
        title="发布详情"
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
                <Typography.Title level={5} style={{ margin: 0 }}>
                  {publicationLabel(detail)}
                </Typography.Title>
                <Typography.Text type="secondary">
                  第 {detail.publication_number} 次发布
                </Typography.Text>
              </Flex>
              <Alert showIcon type="info" title="正在查看只读的历史发布快照" />
              <PublicationMetadata publication={detail} />
              <PublicationSnapshotBody publication={detail} />
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
