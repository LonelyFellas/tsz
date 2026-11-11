import {
  useLexiconEditorTranslation,
  useLexiconEditorMessageState,
  createLexiconEditorMessage as uiMessage
} from "../i18n/editor";
import { regionalVariants } from "@tsz/shared";
import { useAuthStore } from "@/lib/auth";
import { canAdminResourceAction } from "@tsz/shared/auth";
import { expandFormContents } from "@tsz/shared";
import { useFormTypeLabel } from "../part-of-speech/FormTypeLabels";
import { usePartOfSpeechLabel } from "../part-of-speech/PartOfSpeechLabels";
import { HttpError, RequestTimeoutError } from "@tsz/api-client";
import type {
  AdminWordDraftV3Envelope,
  AdminWordPublicationAny,
  AdminWordPublicationEnvelope,
  AdminWordPublicationListResponse,
  AdminWordV3,
  Dialect,
  EnglishTextV3,
  PronunciationSynthesisV3,
  SurfaceMatchPageV3,
  SentenceTranslationBandV3,
  WordDefinitionV3
} from "@tsz/types";
import {
  Alert,
  Button,
  Card,
  Flex,
  Spin,
  Tag,
  Typography
} from "@tsz/ui/admin/display";
import { Modal } from "@tsz/ui/admin/overlays";
import dayjs from "dayjs";
import { useCallback, useEffect, useRef, useState } from "react";
import { LifecycleSurfaceConfirmation } from "../LifecycleSurfaceConfirmation";
import {
  canAcknowledgeSurfaceSnapshot,
  isSurfaceMatchPageAny,
  requiresNewIdempotencyKey
} from "../surfaceSnapshot";
import {
  type FetchSurfaceMatchPage,
  useSurfaceSnapshot
} from "../useSurfaceSnapshot";
import { createV3WordRequests, type V3WordRequests } from "./api";
import { newWordNodeId } from "../word-model/primitives";
import { classifyV3Problem, type V3Problem } from "./problem";
import { v3IssueMessage } from "./presentationErrors";
import { V3ReferenceList } from "./components/V3ReferenceList";
import { sentenceTranslationsV3 } from "./meaningsModel";
import { V3EnglishTextPreview } from "./components/V3EnglishTextPreview";
import {
  dialectLabel,
  reviewSynthesisLabel,
  pronunciationStyleLabel,
  relationLabel,
  sentenceLinkRoleLabel
} from "./presentation";

type PublicationRequests = Pick<
  V3WordRequests,
  | "get"
  | "listPublications"
  | "getPublication"
  | "restoreDraftFromPublication"
  | "surfacePage"
>;

type RecoveryStatus = 409 | 410;

interface RecoveryState {
  status: RecoveryStatus;
  phase: "refreshing" | "error";
}

interface Props {
  restoreBlockedByUnsavedChanges?: boolean;
  restoreBlockedReason?: string;
  onBusyChange?: (busy: boolean) => void;
  currentWord: AdminWordV3;
  requests?: PublicationRequests;
  onRestored: (draft: AdminWordDraftV3Envelope) => void;
  onCanonicalRefreshed?: (draft: AdminWordDraftV3Envelope) => void;
  idempotencyKeyFactory?: () => string;
  fetchSurfacePage?: FetchSurfaceMatchPage<SurfaceMatchPageV3>;
}

const defaultRequests = createV3WordRequests();

function publicationLabel(publication: AdminWordPublicationAny): string {
  return publication.word.presentation.label;
}

interface SnapshotFormLine {
  id: string;
  pos: string;
  formType: string;
  dialect: Dialect;
  spelling: string;
  pronunciations: Array<{
    id: string;
    dictPhonetic: string;
    synthesis?: PronunciationSynthesisV3;
    actualPron: string;
    style?: string;
  }>;
}

interface SnapshotMeaningLine {
  english?: EnglishTextV3;
  id: string;
  pos: string;
  mode: WordDefinitionV3["definition_mode"];
  text: string;
}

interface SnapshotGrammarLine {
  id: string;
  pos: string;
  dialect: string;
  text: string;
}

interface SnapshotSentenceLine {
  richEnglish?: EnglishTextV3;
  id: string;
  pos: string;
  level: string;
  english: Array<{ id: string; dialect: string; text: string }>;
  chinese: Array<{
    id: string;
    label?: SentenceTranslationBandV3;
    text: string;
  }>;
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

function snapshotBody(publication: AdminWordPublicationAny): {
  forms: SnapshotFormLine[];
  meanings: SnapshotMeaningLine[];
  senseGroups: SnapshotSenseGroupLine[];
  grammar: SnapshotGrammarLine[];
  sentences: SnapshotSentenceLine[];
  relations: SnapshotRelationLine[];
} {
  const posById = new Map(
    publication.word.forms.pos.map((pos) => [pos.pos_id, pos.pos])
  );
  return {
    forms: expandFormContents(publication.word.forms).pos.flatMap((pos) =>
      pos.forms.flatMap((form) => {
        const variants = regionalVariants(form.regional_variants);
        return variants.map((variant) => ({
          id: variant.id,
          pos: pos.pos,
          formType: form.form_type,
          dialect: variant.dialect,
          spelling: variant.spelling,
          pronunciations: variant.pronunciations.map((pronunciation) => ({
            id: pronunciation.id,
            dictPhonetic: pronunciation.dict_phonetic,
            ...("synthesis" in pronunciation
              ? { synthesis: pronunciation.synthesis }
              : {}),
            actualPron: pronunciation.actual_pron,
            style: pronunciation.style
          }))
        }));
      })
    ),
    meanings: publication.word.meanings.pos.flatMap((pos) =>
      pos.senses.flatMap((sense) =>
        sense.definitions.map((definition) => ({
          id: definition.id,
          pos: posById.get(pos.pos_id) ?? pos.pos_id,
          mode: definition.definition_mode,
          text: "content_id" in definition ? definition.content.text : "",
          ...("content_id" in definition ? {} : { english: definition.content })
        }))
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
          richEnglish: sentence.en_text,
          chinese: sentenceTranslationsV3(sentence).map((translation) => ({
            id: translation.id,
            label: translation.band,
            text: translation.content.text
          })),
          roles: sentence.links.map((link) => link.role),
          associations: sentence.associations.map((association) => {
            const fallback = association.source_segments
              .map((segment) => segment.surface)
              .join(" … ");
            return association.state === "linked"
              ? {
                  id: association.id,
                  target: association.target_headword || fallback,
                  ...(association.target_gloss
                    ? { gloss: association.target_gloss }
                    : {})
                }
              : {
                  id: association.id,
                  target: association.pending_target_headword || fallback,
                  ...(association.pending_target_gloss
                    ? { gloss: association.pending_target_gloss }
                    : {})
                };
          })
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
            relation.target_headword ?? relation.pending_target_headword ?? "",
          ...((relation.target_gloss ?? relation.pending_target_gloss)
            ? { gloss: relation.target_gloss ?? relation.pending_target_gloss }
            : {})
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
  const { t } = useLexiconEditorTranslation();
  const formTypeLabel = useFormTypeLabel();
  const partOfSpeechLabel = usePartOfSpeechLabel();
  const snapshot = snapshotBody(publication);
  return (
    <Card
      className="v3-publication-modal-content"
      size="small"
      title={t("snapshot_body")}
      data-testid="publication-snapshot-body"
    >
      <Flex vertical gap="middle">
        <Flex vertical gap="small">
          <Typography.Text strong>{t("snapshot_forms")}</Typography.Text>
          {snapshot.forms.length === 0 ? (
            <Typography.Text type="secondary">
              {t("snapshot_no_forms")}
            </Typography.Text>
          ) : (
            snapshot.forms.map((form) => (
              <Flex key={form.id} vertical gap={2}>
                <Flex align="center" gap="small" wrap>
                  <Tag>{partOfSpeechLabel(form.pos)}</Tag>
                  <Tag>{formTypeLabel(form.formType as never)}</Tag>
                  <Tag>{dialectLabel(form.dialect as never, t)}</Tag>
                  <Typography.Text
                    className="tsz-words"
                    style={{ fontWeight: 700 }}
                  >
                    {form.spelling}
                  </Typography.Text>
                </Flex>
                {form.pronunciations.length === 0 ? (
                  <Typography.Text type="secondary">
                    {t("snapshot_no_pronunciation")}
                  </Typography.Text>
                ) : (
                  form.pronunciations.map((pronunciation) => (
                    <Typography.Text key={pronunciation.id} type="secondary">
                      {t("snapshot_dictionary_phonetic")}{" "}
                      <span className="tsz-phonetics">
                        {pronunciation.dictPhonetic}
                      </span>{" "}
                      · {t("snapshot_actual_pronunciation")}{" "}
                      <span className="tsz-phonetics tsz-actual-pronunciation">
                        {pronunciation.actualPron}
                      </span>
                      {pronunciation.synthesis
                        ? ` · ${reviewSynthesisLabel(pronunciation.synthesis, form.dialect, t)}`
                        : ""}
                      {pronunciation.style
                        ? ` · ${pronunciationStyleLabel(pronunciation.style as never, t)}`
                        : ""}
                    </Typography.Text>
                  ))
                )}
              </Flex>
            ))
          )}
        </Flex>
        <Flex vertical gap="small">
          <Typography.Text strong>{t("snapshot_meanings")}</Typography.Text>
          {snapshot.meanings.length === 0 ? (
            <Typography.Text type="secondary">
              {t("snapshot_no_meanings")}
            </Typography.Text>
          ) : (
            snapshot.meanings.map((meaning) => (
              <Flex key={meaning.id} align="center" gap="small" wrap>
                <Tag>{partOfSpeechLabel(meaning.pos)}</Tag>
                <Tag>
                  {t(
                    (
                      {
                        zh_definition: "snapshot_definition_zh",
                        en_definition: "snapshot_definition_en",
                        zh_sentence: "snapshot_sentence_zh",
                        en_sentence: "snapshot_sentence_en"
                      } as const
                    )[meaning.mode] ?? "snapshot_definition_unknown"
                  )}
                </Tag>
                {meaning.english ? (
                  <V3EnglishTextPreview
                    value={meaning.english}
                    textRole="definition"
                  />
                ) : (
                  <Typography.Text>{meaning.text}</Typography.Text>
                )}
              </Flex>
            ))
          )}
        </Flex>
        {snapshot.senseGroups.length > 0 ? (
          <Flex vertical gap="small">
            <Typography.Text strong>
              {t("snapshot_sense_groups")}
            </Typography.Text>
            <Flex gap="small" wrap>
              {snapshot.senseGroups.map((group, index) => (
                <Tag key={group.id}>
                  {t("snapshot_group", {
                    index: index + 1,
                    label: group.label
                  })}
                </Tag>
              ))}
            </Flex>
          </Flex>
        ) : null}
        {snapshot.grammar.length > 0 ? (
          <Flex vertical gap="small">
            <Typography.Text strong>{t("snapshot_grammar")}</Typography.Text>
            {snapshot.grammar.map((grammar) => (
              <Flex key={grammar.id} gap="small" wrap>
                <Tag>{partOfSpeechLabel(grammar.pos)}</Tag>
                <Tag>{dialectLabel(grammar.dialect as never, t)}</Tag>
                <Typography.Text className="tsz-words">
                  {grammar.text}
                </Typography.Text>
              </Flex>
            ))}
          </Flex>
        ) : null}
        <Flex vertical gap="small">
          <Typography.Text strong>{t("snapshot_sentences")}</Typography.Text>
          {snapshot.sentences.length === 0 ? (
            <Typography.Text type="secondary">
              {t("snapshot_no_sentences")}
            </Typography.Text>
          ) : (
            snapshot.sentences.map((sentence) => (
              <Card key={sentence.id} size="small">
                <Flex vertical gap={4}>
                  <Flex gap="small" wrap>
                    <Tag>{partOfSpeechLabel(sentence.pos)}</Tag>
                    {sentence.level ? <Tag>{sentence.level}</Tag> : null}
                    {sentence.roles.map((role, index) => (
                      <Tag key={`${sentence.id}-role-${index}`}>
                        {sentenceLinkRoleLabel(role, t)}
                      </Tag>
                    ))}
                  </Flex>
                  {sentence.richEnglish ? (
                    <V3EnglishTextPreview value={sentence.richEnglish} />
                  ) : (
                    sentence.english.map((row) => (
                      <Typography.Text className="tsz-entry-en" key={row.id}>
                        {dialectLabel(row.dialect as never, t)}：{row.text}
                      </Typography.Text>
                    ))
                  )}
                  {sentence.chinese.map((translation) => (
                    <Typography.Text key={translation.id}>
                      {translation.label ? (
                        <Tag>
                          {t(
                            (
                              {
                                word_for_word: "panel_w",
                                balanced_fluency: "panel_b",
                                adapted_creation: "panel_a"
                              } as const
                            )[translation.label]
                          )}
                        </Tag>
                      ) : (
                        t("snapshot_definition_zh")
                      )}
                      {translation.text}
                    </Typography.Text>
                  ))}
                  {sentence.associations.map((association) => (
                    <Typography.Text
                      className="tsz-entry-en"
                      key={association.id}
                    >
                      {t("snapshot_association", {
                        target: ""
                      })}
                      <span className="tsz-words">{association.target}</span>
                      {association.gloss ? ` · ${association.gloss}` : ""}
                    </Typography.Text>
                  ))}
                </Flex>
              </Card>
            ))
          )}
        </Flex>
        <Flex vertical gap="small">
          <Typography.Text strong>{t("snapshot_relations")}</Typography.Text>
          {snapshot.relations.length === 0 ? (
            <Typography.Text type="secondary">
              {t("snapshot_no_relations")}
            </Typography.Text>
          ) : (
            snapshot.relations.map((relation) => (
              <Flex key={relation.id} gap="small" wrap>
                <Tag>{partOfSpeechLabel(relation.pos)}</Tag>
                <Tag>{relationLabel(relation.relation, t)}</Tag>
                <Typography.Text className="tsz-entry-en">
                  <span className="tsz-words">
                    {relation.target || t("snapshot_target_missing")}
                  </span>
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
  const { t } = useLexiconEditorTranslation();
  return (
    <Card
      className="v3-publication-modal-metadata"
      size="small"
      title={t("publication_metadata")}
      data-testid="publication-metadata"
    >
      <Flex vertical gap={2}>
        <Typography.Text>
          {t("publication_batch", { number: publication.publication_number })}
        </Typography.Text>
        <Typography.Text>
          {t("publication_time", {
            time: dayjs(publication.published_at).format("YYYY-MM-DD HH:mm")
          })}
        </Typography.Text>
        <Typography.Text>
          {t("publication_status", {
            status: publication.is_current
              ? t("publication_current")
              : t("publication_historical")
          })}
        </Typography.Text>
      </Flex>
    </Card>
  );
}

function canRestoreV3Draft(currentWord: AdminWordV3): boolean {
  if (currentWord.status !== "draft") {
    return false;
  }
  return currentWord.capabilities.publication.mode === "native";
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

function surfaceActivationErrorMessage(code: string | undefined) {
  if (
    code === "surface_match_snapshot_expired" ||
    code === "surface_policy_changed"
  ) {
    return uiMessage("publication_surface_expired");
  }
  if (
    code === "exact_headword_creation_temporarily_disabled" ||
    code === "multiple_active_exact_headword_publications_not_enabled"
  ) {
    return uiMessage("publication_surface_unsupported");
  }
  return uiMessage("publication_surface_missing");
}

function activationErrorMessage(error: unknown) {
  if (error instanceof HttpError) {
    switch (error.status) {
      case 403:
        return uiMessage("publication_forbidden");
      case 404:
      case 405:
        return uiMessage("publication_unsupported");
      case 422:
        return uiMessage("publication_invalid");
      case 503:
        return uiMessage("publication_unknown_result");
      default:
        return error.message;
    }
  }
  if (error instanceof TypeError || error instanceof RequestTimeoutError) {
    return uiMessage("publication_network");
  }
  return uiMessage("publication_failed");
}

export function V3PublicationHistory({
  restoreBlockedByUnsavedChanges = false,
  restoreBlockedReason,
  onBusyChange,
  currentWord,
  requests = defaultRequests,
  onRestored,
  onCanonicalRefreshed = onRestored,
  idempotencyKeyFactory = newWordNodeId,
  fetchSurfacePage = requests.surfacePage
}: Props) {
  const { t } = useLexiconEditorTranslation();
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
  useEffect(() => {
    onBusyChange?.(activating);
    return () => onBusyChange?.(false);
  }, [activating, onBusyChange]);
  const profile = useAuthStore((state) => state.profile);
  const allowedToRestore = canAdminResourceAction(
    profile,
    "words",
    "rollback",
    currentWord.created_by
  );
  const [activationError, setActivationError] = useLexiconEditorMessageState();
  const [activationProblem, setActivationProblem] = useState<V3Problem>();
  const [surfacePage, setSurfacePage] = useState<SurfaceMatchPageV3>();
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
  const surfaceSnapshot = useSurfaceSnapshot(
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
    setActivationProblem(undefined);
    setSurfacePage(undefined);
    setSurfaceResetVersion((value) => value + 1);
    setRecovery(undefined);
  }, [
    currentWord.id,
    currentWord.lifecycle_revision,
    currentWord.revision,
    setActivationError
  ]);

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
    setActivationProblem(undefined);
    setSurfacePage(undefined);
    setSurfaceResetVersion((value) => value + 1);
  }, [setActivationError]);

  const closeDetail = useCallback(() => {
    if (activationLock.current) return;
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
            onCanonicalRefreshed(canonical);
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
      if (activationLock.current) return;
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
      setActivationProblem(undefined);
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
    [currentWord.id, requests, setActivationError]
  );

  const activate = useCallback(
    (confirmedSurfaceToken?: string) => {
      if (
        !allowedToRestore ||
        restoreBlockedByUnsavedChanges ||
        activationLock.current ||
        !detail ||
        !canRestoreV3Draft(currentWord)
      ) {
        return;
      }
      const key = (activationKey.current ??= idempotencyKeyFactory());
      activationLock.current = true;
      const generation = ++activationGeneration.current;
      setActivating(true);
      setActivationError(undefined);
      setActivationProblem(undefined);
      void requests
        .restoreDraftFromPublication(
          currentWord.id,
          detail.publication_id,
          key,
          {
            schema_version: 3,
            base_revision: currentWord.revision,
            base_lifecycle_revision: currentWord.lifecycle_revision,
            ...(confirmedSurfaceToken
              ? { confirmed_surface_match_token: confirmedSurfaceToken }
              : {})
          }
        )
        .then(async () => {
          if (!mounted.current || activationGeneration.current !== generation) {
            return;
          }
          const canonical = await requests.get(currentWord.id);
          if (!mounted.current || activationGeneration.current !== generation)
            return;
          activationKey.current = undefined;
          setSurfacePage(undefined);
          setSurfaceResetVersion((value) => value + 1);
          setActivating(false);
          setConfirming(false);
          onRestored(canonical);
          setRetryVersion((value) => value + 1);
        })
        .catch((error: unknown) => {
          if (!mounted.current || activationGeneration.current !== generation) {
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
            setActivationProblem(undefined);
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
          setActivationProblem(classifyV3Problem(error, "activate"));
        })
        .finally(() => {
          if (activationGeneration.current === generation) {
            activationLock.current = false;
          }
        });
    },
    [
      allowedToRestore,
      restoreBlockedByUnsavedChanges,
      currentWord,
      detail,
      idempotencyKeyFactory,
      onRestored,
      refreshAfterConflict,
      requests,
      setActivationError
    ]
  );

  const confirmSurfaceActivation = useCallback(() => {
    if (
      restoreBlockedByUnsavedChanges ||
      !canAcknowledgeSurfaceSnapshot(surfaceSnapshot)
    ) {
      return;
    }
    void activate(surfaceSnapshot.surface_confirmation_token);
  }, [activate, restoreBlockedByUnsavedChanges, surfaceSnapshot]);

  const restartSurfaceActivation = useCallback(() => {
    if (restoreBlockedByUnsavedChanges || activationLock.current) return;
    activationKey.current = undefined;
    setSurfacePage(undefined);
    setSurfaceResetVersion((value) => value + 1);
    setActivationError(undefined);
    setActivationProblem(undefined);
    void activate();
  }, [activate, restoreBlockedByUnsavedChanges, setActivationError]);

  const beginActivation = useCallback(() => {
    if (restoreBlockedByUnsavedChanges) return;
    setConfirming(true);
  }, [restoreBlockedByUnsavedChanges]);

  if (loading) return <Spin aria-label={t("publication_loading")} />;
  if (listError) {
    return (
      <Alert
        showIcon
        type="error"
        title={t("publication_load_failed")}
        action={<Button onClick={retry}>{t("publication_retry")}</Button>}
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
              ? t("publication_refresh_failed")
              : recovery.status === 409
                ? t("publication_revision_changed")
                : t("publication_context_expired")
          }
          description={
            recovery.phase === "error"
              ? t("publication_refresh_failed_help")
              : t("publication_refresh_help")
          }
          action={
            recovery.phase === "error" ? (
              <Button onClick={() => refreshAfterConflict(recovery.status)}>
                {t("publication_refresh")}
              </Button>
            ) : null
          }
        />
      ) : null}
      <Card className="v3-publication-history" title={t("history_title")}>
        {publications.length === 0 ? (
          <Typography.Text type="secondary">
            {t("publication_empty")}
          </Typography.Text>
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
                    <Typography.Text className="tsz-words" strong>
                      {publicationLabel(publication)}
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      {t("publication_number", {
                        number: publication.publication_number
                      })}
                    </Typography.Text>
                    {publication.rollback_of_publication_id ? (
                      <Tag>{t("publication_rollback")}</Tag>
                    ) : null}
                    {publication.is_current ? (
                      <Tag color="green">{t("publication_current_short")}</Tag>
                    ) : null}
                  </Flex>
                  <Typography.Text type="secondary">
                    {dayjs(publication.published_at).format("YYYY-MM-DD HH:mm")}
                  </Typography.Text>
                </Flex>
                <Button
                  aria-label={t("publication_view_number", {
                    number: publication.publication_number
                  })}
                  disabled={recovery !== undefined || activating}
                  onClick={() => openDetail(publication.publication_id)}
                >
                  {t("publication_view")}
                </Button>
              </Flex>
            ))}
          </Flex>
        )}
      </Card>
      <Modal
        className="v3-publication-modal"
        footer={null}
        closable={!activating}
        mask={{ closable: !activating }}
        keyboard={!activating}
        open={selectedPublicationId !== undefined}
        title={t("publication_details")}
        width={920}
        onCancel={closeDetail}
      >
        <Flex vertical gap="middle" data-testid="publication-detail">
          {detailLoading ? (
            <Spin aria-label={t("publication_details_loading")} />
          ) : null}
          {detailError ? (
            <Alert
              showIcon
              type="error"
              title={t("publication_details_failed")}
            />
          ) : null}
          {detail ? (
            <>
              <Flex align="center" gap="small" wrap>
                <Typography.Title
                  className="tsz-words"
                  level={5}
                  style={{ margin: 0 }}
                >
                  {publicationLabel(detail)}
                </Typography.Title>
                <Typography.Text type="secondary">
                  {t("publication_number", {
                    number: detail.publication_number
                  })}
                </Typography.Text>
              </Flex>
              <Alert showIcon type="info" title={t("publication_readonly")} />
              <PublicationMetadata publication={detail} />
              <PublicationSnapshotBody publication={detail} />
              {currentWord.status !== "draft" ? (
                <Alert type="info" title={t("publication_draft_only")} />
              ) : null}
              {!allowedToRestore ? (
                <Alert type="info" title={t("publication_permission_help")} />
              ) : null}
              {surfacePage ? (
                <LifecycleSurfaceConfirmation
                  action="restoreDraft"
                  state={surfaceSnapshot}
                  confirming={activating}
                  onConfirm={confirmSurfaceActivation}
                  onRestart={restartSurfaceActivation}
                />
              ) : null}
              {activationError ? (
                <Alert
                  showIcon
                  type="error"
                  title={activationError}
                  description={
                    activationProblem?.kind === "validation" ? (
                      <ul>
                        {activationProblem.issues.map((issue) => (
                          <li
                            key={`${issue.node_id}:${issue.field}:${issue.code}`}
                          >
                            {v3IssueMessage(issue, t)}
                            <Typography.Text type="secondary">
                              {` · ${t(({ basics: "assistant_step_basics", forms: "assistant_step_forms", meanings: "assistant_step_meanings" } as const)[issue.step])} · ${issue.field} · ${issue.node_id}`}
                            </Typography.Text>
                          </li>
                        ))}
                      </ul>
                    ) : activationProblem?.kind === "inbound_reference" ? (
                      <Flex vertical gap="small">
                        <Typography.Text>
                          {t("publication_references_help")}
                        </Typography.Text>
                        <V3ReferenceList
                          references={activationProblem.references}
                        />
                      </Flex>
                    ) : undefined
                  }
                />
              ) : null}
              {canRestoreV3Draft(currentWord) && !surfacePage ? (
                <>
                  {restoreBlockedByUnsavedChanges ? (
                    <Alert
                      showIcon
                      type="warning"
                      title={restoreBlockedReason ?? t("publication_unsaved")}
                      description={
                        restoreBlockedReason
                          ? t("publication_service_help")
                          : t("publication_unsaved_help")
                      }
                    />
                  ) : null}
                  {confirming ? (
                    <Alert
                      showIcon
                      type="warning"
                      title={t("publication_confirm_title")}
                      description={t("publication_confirm_help")}
                      action={
                        <Button
                          disabled={
                            restoreBlockedByUnsavedChanges || !allowedToRestore
                          }
                          loading={activating}
                          onClick={() => void activate()}
                        >
                          {t("publication_confirm")}
                        </Button>
                      }
                    />
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}
          <Flex
            className="v3-publication-modal-actions"
            justify="flex-end"
            gap="small"
          >
            <Button
              aria-label={t("publication_close_label")}
              disabled={activating}
              onClick={closeDetail}
            >
              {t("publication_close")}
            </Button>
            {detail &&
            canRestoreV3Draft(currentWord) &&
            !surfacePage &&
            !confirming ? (
              <Button
                type="primary"
                disabled={restoreBlockedByUnsavedChanges || !allowedToRestore}
                onClick={() => beginActivation()}
              >
                {t("publication_restore")}
              </Button>
            ) : null}
          </Flex>
        </Flex>
      </Modal>
    </>
  );
}
