import { useLexiconEditorTranslation } from "../i18n/editor";
import {
  defaultLexiconEditorTranslation as creationDefaultT,
  type LexiconEditorTranslation as CreationTranslation,
  type LexiconEditorKey as CreationKey,
  useLexiconEditorMessageState as useCreationMessageState,
  createLexiconEditorMessage as creationMessage,
  LexiconEditorText as CreationText
} from "../i18n/editor";
import { useFormTypeLabel } from "../part-of-speech/FormTypeLabels";
import { HttpError, RequestTimeoutError } from "@tsz/api-client/http";
import type {
  AdminWordV3Envelope,
  EntryAnnotationConflict,
  AdminWordV3,
  CreateAdminWordV3Input,
  DetectLexiconSurfaceResponseV3,
  DetectLexiconSurfaceV3Input,
  PartOfSpeechCatalogResponse,
  SurfaceMatchPageV3,
  WordHeadwordsV2
} from "@tsz/types";
import {
  CircleCheckIcon,
  CircleAlertIcon,
  PlusIcon,
  SearchIcon
} from "lucide-react";
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Row,
  Space,
  Tag,
  Typography
} from "@tsz/ui/admin/display";
import { App } from "@tsz/ui/admin/overlays";
import { Form, Input, Select, Switch } from "@tsz/ui/admin/forms";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentProps
} from "react";
import { RequiredFieldFeedback } from "../RequiredFieldFeedback";
import { adminWordsDataSource } from "../dataSource";
import { usePartOfSpeechCatalog } from "../part-of-speech/api";
import {
  aggregateLifecycleSurfaceMatchCards,
  canAcknowledgeSurfaceSnapshot,
  isSurfaceMatchPageAny,
  requiresNewIdempotencyKey
} from "../surfaceSnapshot";
import { useSurfaceSnapshot } from "../useSurfaceSnapshot";
import { createV3WordRequests } from "../word-creation-v3/api";
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
import { EntryAnnotationModal } from "../EntryAnnotationModal";
import {
  canEditConflictEntry,
  isAnnotationOwnershipError
} from "../annotationPermission";
import { useAuthStore } from "@/lib/auth";
import "./word-creation.css";

export interface UnifiedCreateRequests {
  detectV3: (
    input: DetectLexiconSurfaceV3Input
  ) => Promise<DetectLexiconSurfaceResponseV3>;
  createV3: (
    idempotencyKey: string,
    input: CreateAdminWordV3Input
  ) => Promise<AdminWordV3Envelope>;
  getWord: (wordId: string) => Promise<AdminWordV3Envelope>;
  surfacePage: (
    snapshotId: string,
    cursor: string,
    signal: AbortSignal
  ) => Promise<SurfaceMatchPageV3>;
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

class ProductError extends Error {
  constructor(readonly key: CreationKey) {
    super(creationDefaultT(key));
  }
}

const v3Requests = createV3WordRequests();
const defaultRequests: UnifiedCreateRequests = {
  detectV3: v3Requests.detect,
  createV3: v3Requests.create,
  getWord: (wordId) => adminWordsDataSource.get(wordId),
  surfacePage: (snapshotId, cursor, signal) =>
    adminWordsDataSource.surfaceMatchSnapshotPage(snapshotId, cursor, signal)
};

const STATUS_LABEL = {
  draft: "panel_draft",
  published: "panel_published",
  archived: "creation_trash"
} as const;

function initialSurfacePage(pending?: PendingCreation) {
  return pending?.detection.surface_match_page;
}

function errorMessage(error: unknown) {
  if (error instanceof HttpError) {
    if (error.status === 409 && error.code === "duplicate_word")
      return creationMessage(
        "creation_the_service_rejected_this_creation_request_run_detection_again"
      );
    if (error.status === 401)
      return creationMessage("creation_your_session_has_expired_sign_in_again");
    // 403 分两种：改了别人的标注 vs. 压根没有建条权限。前者刷新重试也没用，
    // 得让管理员知道是哪一行越界了。
    if (error.status === 403)
      return isAnnotationOwnershipError(error.code)
        ? creationMessage(
            "creation_you_can_only_change_annotations_on_entries_you_created"
          )
        : creationMessage("creation_this_account_cannot_create_entries");
    if (error.status === 503)
      return creationMessage(
        "creation_the_entry_service_is_unavailable_try_again_later"
      );
    if (error.status === 410)
      return creationMessage(
        "creation_the_detection_result_has_expired_submit_it_again"
      );
  }
  if (error instanceof TypeError || error instanceof RequestTimeoutError) {
    return creationMessage(
      "creation_a_network_error_left_the_creation_result_unknown_retry_the_same_request"
    );
  }
  return error instanceof HttpError
    ? error.message
    : error instanceof ProductError
      ? creationMessage(error.key)
      : creationMessage("creation_could_not_create_the_entry_try_again_later");
}

function createErrorMessage(error: unknown) {
  if (error instanceof TypeError || error instanceof RequestTimeoutError) {
    return creationMessage(
      "creation_a_network_error_left_the_creation_result_unknown_retry_the_same_request"
    );
  }
  if (!(error instanceof HttpError)) {
    return creationMessage(
      "creation_the_response_is_invalid_and_the_creation_result_is_unknown_retry_the_same_request"
    );
  }
  return errorMessage(error);
}

function partOfSpeechLabel(
  code: string,
  catalog?: PartOfSpeechCatalogResponse,
  t: CreationTranslation = creationDefaultT,
  interfaceLocale = "zh-Hans"
): string {
  return (
    ((item) =>
      item
        ? interfaceLocale.startsWith("en")
          ? item.name_en || item.name_zh
          : item.name_zh || item.name_en
        : undefined)(catalog?.items.find((item) => item.code === code)) ??
    t("creation_unrecognised_part_of_speech")
  );
}

function dictionaryCoverageLabel(
  category: "forms" | "pronunciations",
  state: "complete" | "partial" | "missing",
  t: CreationTranslation = creationDefaultT
) {
  const status = {
    complete: t("creation_complete_coverage"),
    partial: t("creation_partial_coverage"),
    missing: t("creation_not_provided_by_the_dictionary")
  }[state];
  return t(
    category === "forms"
      ? "creation_coverage_forms"
      : "creation_coverage_pronunciations",
    { state: status }
  );
}

function assertFreshDetection(expiresAt: string) {
  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(expiry) || expiry <= Date.now()) {
    throw new ProductError(
      "creation_the_detection_result_has_expired_submit_it_again"
    );
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
    value: { mode: "unified", common: pending.detection.request.surface }
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
  snapshot,
  existingDraftId
}: {
  pending: PendingCreation;
  catalog?: PartOfSpeechCatalogResponse;
  baseCandidates: DetectedBaseForm[];
  surfaceCards: ReturnType<typeof aggregateLifecycleSurfaceMatchCards>;
  snapshot: ReturnType<typeof useSurfaceSnapshot>;
  existingDraftId?: string;
}) {
  const { t, i18n } = useLexiconEditorTranslation();
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
  const annotations = new Map(
    snapshot.matched_entry_contexts.map((context) => [
      context.entry_id,
      context.annotation?.trim()
    ])
  );
  const displayEntries = [
    ...baseCandidates.map((candidate) => ({
      key: candidate.key,
      entryId: candidate.entryId,
      schemaVersion: 3 as const,
      label: candidate.spellings.join(" / ") || candidate.label,
      status: candidate.status,
      baseSpellings: candidate.spellings,
      otherMatches: [] as string[],
      posLabels: candidate.posLabels.map((pos) =>
        partOfSpeechLabel(pos, catalog, t, i18n.language)
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
      [...builtinPosCodes].map((pos) =>
        partOfSpeechLabel(pos, catalog, t, i18n.language)
      )
    )
  ];
  const smartPosLabels = [
    ...new Set(displayEntries.flatMap((entry) => entry.posLabels))
  ];
  const preferredPosLabels =
    smartPosLabels.length > 0 ? smartPosLabels : builtinPosLabels;
  const preferredPosSource =
    smartPosLabels.length > 0
      ? t("creation_smart_lexicon")
      : t("creation_built_in_dictionary");

  return (
    <Card
      className="word-detection-result-card"
      size="small"
      title={t("creation_detection_results")}
      extra={
        <Tag color={builtinStatus === "matched" ? "success" : "default"}>
          {t("creation_builtin_status", {
            status: t(
              builtinStatus === "matched"
                ? "creation_matched"
                : "creation_not_matched"
            )
          })}
        </Tag>
      }
    >
      <Space orientation="vertical" size={16} style={{ width: "100%" }}>
        <Descriptions column={1} size="small">
          <Descriptions.Item label={t("creation_entry_type")}>
            {t(
              pending.kind === "word"
                ? "creation_word_entry"
                : "creation_phrase_entry"
            )}
          </Descriptions.Item>
          <Descriptions.Item label={t("creation_lexicon_detection")}>
            {hasMatches ? (
              t("creation_found")
            ) : existingDraftId ? (
              t("creation_draft_with_the_same_headword")
            ) : (
              <Space>
                <CircleCheckIcon style={{ color: "var(--ui-color-success)" }} />
                {t("creation_not_found")}
              </Space>
            )}
          </Descriptions.Item>
          {preferredPosLabels.length > 0 ? (
            <Descriptions.Item label={t("creation_suggested_parts_of_speech")}>
              <Space size={[6, 6]} wrap>
                {preferredPosLabels.map((label) => (
                  <Tag key={label} color="blue">
                    {label}
                  </Tag>
                ))}
                <Typography.Text type="secondary">
                  {t("creation_source_label", { source: preferredPosSource })}
                </Typography.Text>
              </Space>
            </Descriptions.Item>
          ) : null}
          {builtinCoverage ? (
            <Descriptions.Item label={t("creation_dictionary_coverage")}>
              <Space size={[4, 4]} wrap>
                <Tag
                  color={
                    builtinCoverage.forms === "missing" ? "default" : "blue"
                  }
                >
                  {dictionaryCoverageLabel("forms", builtinCoverage.forms, t)}
                </Tag>
                <Tag
                  color={
                    builtinCoverage.pronunciations === "missing"
                      ? "default"
                      : "cyan"
                  }
                >
                  {dictionaryCoverageLabel(
                    "pronunciations",
                    builtinCoverage.pronunciations,
                    t
                  )}
                </Tag>
              </Space>
            </Descriptions.Item>
          ) : null}
        </Descriptions>

        {displayEntries.length > 0 || existingDraftId ? (
          <div className="word-smart-match-summary">
            {displayEntries.map((entry) => (
              <div className="word-smart-match-summary-entry" key={entry.key}>
                <div className="word-smart-match-summary-row">
                  <Space size={8} wrap>
                    <span>
                      <Typography.Text className="tsz-words" strong>
                        {entry.label}
                      </Typography.Text>
                      {annotations.get(entry.entryId) ? (
                        <sup
                          title={t("creation_annotation_label", {
                            value: annotations.get(entry.entryId) ?? ""
                          })}
                          style={{
                            display: "inline-block",
                            position: "relative",
                            top: "-0.4em",
                            marginInlineStart: 2,
                            color: "var(--ui-color-text-secondary)",
                            fontSize: 11,
                            fontWeight: 600,
                            lineHeight: 1,
                            verticalAlign: "baseline"
                          }}
                        >
                          {annotations.get(entry.entryId)}
                        </sup>
                      ) : null}
                    </span>
                    <Tag
                      color={
                        entry.status === "published"
                          ? "success"
                          : entry.status === "draft"
                            ? "processing"
                            : "default"
                      }
                    >
                      {t(STATUS_LABEL[entry.status])}
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
                      {t("creation_continue_creating")}
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
                      {t("creation_view_existing_base_forms")}
                    </Button>
                  )}
                </div>
                {expanded === entry.key ? (
                  <div className="word-smart-match-context-meta">
                    {entry.baseSpellings.map((spelling) => (
                      <div
                        className="tsz-words"
                        key={spelling}
                        style={{ fontWeight: 700 }}
                      >
                        {t("creation_base_label", { text: spelling })}
                      </div>
                    ))}
                    {entry.baseSpellings.length === 0
                      ? entry.otherMatches.map((match) => (
                          <div
                            className="tsz-words"
                            key={match}
                            style={{ fontWeight: 700 }}
                          >
                            {t("creation_match_label", { text: match })}
                          </div>
                        ))
                      : null}
                    {entry.posLabels.length > 0 ? (
                      <Space size={[4, 4]} wrap>
                        <span className="word-smart-match-context-meta-label">
                          {t("pos")}：
                        </span>
                        {entry.posLabels.map((label) => (
                          <Tag key={label}>{label}</Tag>
                        ))}
                      </Space>
                    ) : null}
                    {entry.glossPreviews.map((gloss) => (
                      <div key={gloss}>
                        {t("creation_gloss_label", { text: gloss })}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {existingDraftId &&
            !displayEntries.some(
              (entry) => entry.entryId === existingDraftId
            ) ? (
              <div className="word-smart-match-summary-entry">
                <div className="word-smart-match-summary-row">
                  <Space size={8} wrap>
                    <Typography.Text className="tsz-words" strong>
                      {pending.detection.normalized_surface}
                    </Typography.Text>
                    <Tag color="processing">
                      {t("creation_incomplete_draft")}
                    </Tag>
                  </Space>
                  <Button
                    type="link"
                    href={`/words/${existingDraftId}/v3/wizard/forms`}
                  >
                    {t("creation_open_draft")}
                  </Button>
                </div>
                <Typography.Text type="secondary">
                  {t("creation_continue_editing_the_draft_or_create_an_entry")}
                </Typography.Text>
              </div>
            ) : null}
          </div>
        ) : null}

        {snapshot.phase === "error" || snapshot.phase === "expired" ? (
          <Alert
            showIcon
            type="error"
            title={t(
              "creation_the_match_results_have_expired_go_back_make_changes_and_submit_again"
            )}
          />
        ) : null}
        {snapshot.phase === "disabled" ? (
          <Alert
            showIcon
            type="error"
            title={t(
              "creation_the_current_policy_does_not_allow_this_entry_to_be_created"
            )}
          />
        ) : null}
      </Space>
    </Card>
  );
}

function HeadwordInput({
  label,
  value,
  disabled,
  error,
  onChange,
  id,
  "aria-required": required,
  "aria-describedby": describedBy
}: {
  label: string;
  value: string;
  disabled?: boolean;
  error?: string;
  onChange: (value: string) => void;
} & Pick<
  ComponentProps<typeof Input>,
  "id" | "aria-required" | "aria-describedby"
>) {
  const messageId = useId();
  const requiredError = !value.trim() ? error : undefined;
  return (
    <RequiredFieldFeedback message={requiredError} messageId={messageId}>
      <Input
        id={id}
        aria-label={label}
        aria-invalid={Boolean(error)}
        aria-required={required}
        aria-describedby={
          [requiredError ? messageId : undefined, describedBy]
            .filter(Boolean)
            .join(" ") || undefined
        }
        status={error ? "error" : undefined}
        className="tsz-words"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </RequiredFieldFeedback>
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
  const { t } = useLexiconEditorTranslation();
  if (state.status === "loading" || state.status === "idle") {
    return (
      <Card
        className="word-headword-confirmation-card"
        size="small"
        title={t("creation_confirm_british_and_american_headwords")}
      >
        <Typography.Text type="secondary">
          {t("creation_loading_base_forms")}
        </Typography.Text>
      </Card>
    );
  }
  if (state.status === "error") {
    return (
      <Card
        className="word-headword-confirmation-card"
        size="small"
        title={t("creation_confirm_british_and_american_headwords")}
      >
        <Alert
          showIcon
          type="error"
          title={t("creation_could_not_load_base_form_details")}
          description={t(
            "creation_the_first_database_base_form_could_not_be_confirmed_creation_has_stopped"
          )}
          action={<Button onClick={onRetry}>{t("panel_reload")}</Button>}
        />
      </Card>
    );
  }
  const value = state.value;
  const issues = headwordsIssues(value, t);
  const lockedLabel =
    preference === "uk" ? t("candidate_uk") : t("candidate_us");
  return (
    <Card
      className="word-headword-confirmation-card"
      size="small"
      title={t("creation_confirm_british_and_american_headwords")}
    >
      <div className="word-dialect-detection-row">
        <div>
          <Typography.Text strong>
            {t("creation_separate_british_and_american_spellings")}
          </Typography.Text>
          <Typography.Text type="secondary">
            {t("creation_enable_when_british_and_american_spellings_differ")}
          </Typography.Text>
        </div>
        <Switch
          aria-label={t("creation_separate_british_and_american_spellings")}
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
            label={t("creation_common_headword")}
            required
            validateStatus={
              value.common.trim() === "" || issues.uk ? "error" : undefined
            }
            help={value.common.trim() ? issues.uk : undefined}
          >
            <HeadwordInput
              label={t("creation_common_headword")}
              error={
                !value.common.trim()
                  ? t("creation_enter_the_common_headword")
                  : issues.uk
              }
              disabled={disabled}
              value={value.common}
              onChange={(common) => onChange({ mode: "unified", common })}
            />
          </Form.Item>
        </div>
      ) : (
        <>
          <Typography.Text
            type="secondary"
            className="word-field-help word-headword-lock-note"
          >
            {t("creation_locked_spelling", { side: lockedLabel })}
          </Typography.Text>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <div className="dialect-panel dialect-panel-uk">
                <Typography.Text strong>
                  {t("creation_british_english_bre")}
                </Typography.Text>
                <Form.Item
                  required
                  validateStatus={
                    value.uk.trim() === "" || issues.uk ? "error" : undefined
                  }
                  help={value.uk.trim() ? issues.uk : undefined}
                >
                  <HeadwordInput
                    label={t("creation_british_headword")}
                    error={
                      !value.uk.trim()
                        ? t("creation_enter_the_british_headword")
                        : issues.uk
                    }
                    value={value.uk}
                    disabled={disabled || preference === "uk"}
                    onChange={(uk) => onChange({ ...value, uk })}
                  />
                </Form.Item>
              </div>
            </Col>
            <Col xs={24} md={12}>
              <div className="dialect-panel dialect-panel-us">
                <Typography.Text strong>
                  {t("creation_american_english_ame")}
                </Typography.Text>
                <Form.Item
                  required
                  validateStatus={
                    value.us.trim() === "" || issues.us ? "error" : undefined
                  }
                  help={value.us.trim() ? issues.us : undefined}
                >
                  <HeadwordInput
                    label={t("creation_american_headword")}
                    error={
                      !value.us.trim()
                        ? t("creation_enter_the_american_headword")
                        : issues.us
                    }
                    value={value.us}
                    disabled={disabled || preference === "us"}
                    onChange={(us) => onChange({ ...value, us })}
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
        {t("creation_source_label", {
          source: t(
            state.source === "database"
              ? "creation_smart_lexicon_base_form"
              : state.source === "builtin"
                ? "creation_built_in_dictionary"
                : "creation_current_input"
          )
        })}
      </Typography.Text>
    </Card>
  );
}

export function UnifiedCreateEntryStep({
  requests = defaultRequests,
  onCreated
}: Props) {
  const { t } = useLexiconEditorTranslation();
  const { modal } = App.useApp();
  // 冲突弹窗里哪几行能改由归属决定；门禁保证受保护页内 profile 必有值。
  const profile = useAuthStore((s) => s.profile);
  const annotationActor = profile ?? undefined;
  const catalog = usePartOfSpeechCatalog();
  const { preference } = useDialectPreference();
  const [value, setValue] = useState("");
  const entryInputId = useId();
  const [fieldErrorValue, setFieldError] = useState<string>();
  const fieldError =
    fieldErrorValue === undefined
      ? undefined
      : validateEntryInput(fieldErrorValue, t).issue;
  const [error, setError] = useCreationMessageState();
  const [preparationBlocked, setPreparationBlocked] = useState(false);
  const [duplicateWord, setDuplicateWord] = useState<{ wordId?: string }>();
  const [busy, setBusy] = useState<"checking" | "creating">();
  const [pending, setPending] = useState<PendingCreation>();
  const [prepared, setPrepared] = useState<PendingCreation>();
  const [createAttempt, setCreateAttempt] = useState<CreateAttempt>();
  const existingDraftId =
    duplicateWord?.wordId ?? prepared?.detection.existing_draft_id;
  const [annotationSession, setAnnotationSession] = useState<{
    conflict: EntryAnnotationConflict;
    attempt: CreateAttempt;
    version: number;
  }>();
  const annotationDraft = useRef<
    Pick<CreateAdminWordV3Input, "annotation" | "annotation_updates">
  >({});
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
  const snapshot = useSurfaceSnapshot(
    page,
    `${pending?.detection.detection_id ?? "none"}:${page?.snapshot_id ?? "none"}`,
    fetchSurfacePage
  );
  const formTypeLabel = useFormTypeLabel();
  const cards = useMemo(
    () => aggregateLifecycleSurfaceMatchCards(snapshot, formTypeLabel, t),
    [snapshot, formTypeLabel, t]
  );
  const baseCandidates = useMemo(() => {
    if (!prepared) return [];
    if (page) {
      if (!snapshot.schema_version) return [];
      return extractDetectedBaseForms(
        snapshot.items,
        snapshot.matched_entry_contexts
      );
    }
    return extractDetectedBaseForms(prepared.detection.matches, []);
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
    const first = baseCandidates.find(
      (candidate) => candidate.status !== "archived"
    );
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
    setAnnotationSession(undefined);
    annotationDraft.current = {};
    retryKey.current = undefined;
    preservedRegionalDisplay.current = undefined;
    setValue(next);
    setFieldError(undefined);
    setDuplicateWord(undefined);
    setPreparationBlocked(false);
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
      setAnnotationSession(undefined);
      onCreated(response.word, {
        creationSource:
          target.detection.builtin_dictionary.status === "matched"
            ? !hasV3PrefilledForms(response.word)
              ? "dictionary-empty"
              : "dictionary"
            : "blank"
      });
    } catch (requestError) {
      if (!mounted.current) return;
      if (
        requestError instanceof HttpError &&
        requestError.status === 409 &&
        requestError.code === "duplicate_word"
      ) {
        setCreateAttempt(undefined);
        setAnnotationSession(undefined);
        setPending(undefined);
        setDuplicateWord({ wordId: requestError.meta?.word_id });
        setError(errorMessage(requestError));
      } else if (
        requestError instanceof HttpError &&
        requestError.status === 409 &&
        requestError.code === "annotation_conflict" &&
        requestError.meta?.annotation_conflict
      ) {
        setCreateAttempt(undefined);
        setAnnotationSession((current) => ({
          conflict: requestError.meta!.annotation_conflict!,
          attempt,
          version: (current?.version ?? 0) + 1
        }));
        setError(
          requestError.meta.annotation_conflict.reason ===
            "revision_conflict" ||
            requestError.meta.annotation_conflict.reason === "group_changed"
            ? creationMessage(
                "creation_entry_annotations_or_base_form_groups_have_changed_confirm_again"
              )
            : requestError.meta.annotation_conflict.reason === "duplicate"
              ? creationMessage(
                  "creation_this_annotation_duplicates_another_entry_in_the_base_form_group_change_it_existing_entries"
                )
              : undefined
        );
      } else if (
        requestError instanceof HttpError &&
        requiresNewIdempotencyKey(requestError.status, requestError.code)
      ) {
        setAnnotationSession(undefined);
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
          setError(
            creationMessage(
              "creation_the_match_results_have_changed_confirm_them_again_before_creating_the_entry"
            )
          );
        } else {
          setPending(undefined);
          setPrepared(undefined);
          setError(
            creationMessage(
              "creation_the_detection_results_have_changed_submit_again"
            )
          );
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
      setFieldError(value);
      document.getElementById(entryInputId)?.focus();
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
    setDuplicateWord(undefined);
    setPreparationBlocked(false);
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
        throw new ProductError(
          "creation_the_entry_detection_result_does_not_match_refresh_and_try_again"
        );
      }
      assertFreshDetection(detection.expires_at);
      const target: PendingCreation = {
        kind,
        detection,
        idempotencyKey: keyState.key
      };
      setPrepared(target);
      if (detection.builtin_dictionary.status === "unavailable") {
        setPreparationBlocked(true);
        throw new ProductError(
          "creation_the_built_in_dictionary_is_unavailable_try_again_later"
        );
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
          setPreparationBlocked(true);
          throw new ProductError(
            kind === "word"
              ? "creation_pos_config_word"
              : "creation_pos_config_phrase"
          );
        }
      }
      if (detection.requires_acknowledgement) {
        if (!detection.surface_match_page) {
          throw new ProductError(
            "creation_match_information_is_incomplete_creation_has_stopped"
          );
        }
        setPending(target);
      }
    } catch (requestError) {
      if (mounted.current && generation.current === currentGeneration) {
        setPreparationBlocked(true);
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
    if (preparationBlocked) return;
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
      setError(
        creationMessage(
          "creation_confirm_the_base_forms_before_creating_the_entry"
        )
      );
      return;
    }
    const headwords = regionalDisplay.value;
    preservedRegionalDisplay.current = regionalDisplay;
    const hasEmptyHeadword =
      headwords.mode === "unified"
        ? headwords.common.trim() === ""
        : headwords.uk.trim() === "" || headwords.us.trim() === "";
    if (hasEmptyHeadword || hasHeadwordsIssue(headwords)) {
      setError(
        creationMessage(
          "creation_enter_valid_english_headwords_before_creating_the_entry"
        )
      );
      return;
    }
    try {
      assertFreshDetection(target.detection.expires_at);
    } catch {
      setPending(undefined);
      setPrepared(undefined);
      setError(
        creationMessage(
          "creation_the_detection_result_has_expired_run_detection_again"
        )
      );
      return;
    }
    const attempt: CreateAttempt = {
      target,
      input: {
        ...annotationDraft.current,
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
    // 检测已经摆出了「已有原形」，这一步是让管理员显式承认「我要另建一条」。
    // 后端的 409 annotation_conflict 只覆盖真正同原型组的情况；词面命中但分属
    // 不同原型组时后端不拦，删掉这道确认就等于静默建重名条。
    modal.confirm({
      title: <CreationText message="creation_create_a_separate_entry" />,
      icon: <CircleAlertIcon />,
      content: (
        <CreationText message="creation_the_smart_lexicon_already_contains_the_same_base_form_continuing_creates_a_separate_entry" />
      ),
      okText: <CreationText message="creation_continue_creating" />,
      cancelText: <CreationText message="batch_cancel" />,
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
          {t("assistant_step_basics")}
        </Typography.Title>
        <Typography.Paragraph className="word-step-description">
          {t(
            "creation_check_a_word_or_phrase_against_the_built_in_dictionary_then_confirm_the_headwords_to_creat"
          )}
        </Typography.Paragraph>
      </div>

      <Card
        className="word-basics-input-card"
        size="small"
        title={t("creation_input_and_detection")}
      >
        <Form layout="vertical" initialValues={{ language: "en" }}>
          <Form.Item label={t("creation_entry_language")} name="language">
            <Select
              options={[{ value: "en", label: t("creation_english") }]}
              disabled
            />
          </Form.Item>
          <Form.Item
            label={t("creation_entry_text")}
            htmlFor={entryInputId}
            validateStatus={fieldError ? "error" : undefined}
            help={value.trim() ? fieldError : undefined}
          >
            <RequiredFieldFeedback
              message={!value.trim() ? fieldError : undefined}
              messageId={`${entryInputId}-required`}
            >
              <Input.Search
                id={entryInputId}
                aria-label={t("creation_entry_text")}
                aria-invalid={Boolean(fieldError)}
                aria-describedby={
                  fieldError
                    ? !value.trim()
                      ? `${entryInputId}-required`
                      : `${entryInputId}-help`
                    : undefined
                }
                status={fieldError ? "error" : undefined}
                autoComplete="off"
                className="tsz-words"
                autoFocus
                disabled={
                  busy !== undefined ||
                  (pending !== undefined && !existingDraftId) ||
                  createAttempt !== undefined
                }
                enterButton={
                  <Space size={6}>
                    <SearchIcon />
                    {t("creation_dictionary_detection")}
                  </Space>
                }
                loading={busy === "checking"}
                placeholder={
                  !value.trim() && fieldError
                    ? undefined
                    : t("creation_e_g_center_or_give_up")
                }
                size="large"
                value={value}
                onChange={(event) => changeValue(event.target.value)}
                onSearch={() => void submit()}
              />
            </RequiredFieldFeedback>
          </Form.Item>
          <Typography.Text type="secondary" className="word-field-help">
            {t("creation_press_enter_to_run_detection_then_confirm_to_create")}
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
            existingDraftId={existingDraftId}
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
          <Button onClick={() => changeValue(value)}>
            {t("creation_run_detection_again")}
          </Button>
          <Button
            type="primary"
            icon={<PlusIcon aria-hidden />}
            loading={busy === "creating"}
            disabled={
              preparationBlocked ||
              !canAcknowledgeSurfaceSnapshot(snapshot) ||
              regionalDisplay.status !== "ready"
            }
            onClick={confirm}
          >
            {t("creation_confirm_and_create_then_edit_forms_and_pronunciation")}
          </Button>
        </div>
      ) : null}

      {prepared && !pending ? (
        <div className="word-entry-actions">
          {createAttempt ? (
            <Button onClick={() => changeValue(value)}>
              {t("creation_run_detection_again")}
            </Button>
          ) : null}
          <Button
            type="primary"
            loading={busy === "creating"}
            disabled={
              preparationBlocked ||
              busy !== undefined ||
              regionalDisplay.status !== "ready"
            }
            onClick={() => beginCreation(prepared)}
          >
            {createAttempt && busy !== "creating"
              ? t("creation_retry_the_same_creation_request")
              : t("creation_create_and_edit_forms_and_pronunciation")}
          </Button>
        </div>
      ) : null}

      {annotationSession ? (
        <EntryAnnotationModal
          key={annotationSession.version}
          creating
          busy={busy === "creating"}
          frozen={createAttempt !== undefined && busy !== "creating"}
          error={error}
          groups={annotationSession.conflict.groups}
          rows={[
            ...annotationSession.conflict.entries.map((entry) => {
              // 改不了的行照样列出来：标注要在整组内互不相同，看不见别人的值就没法避重。
              const editable = canEditConflictEntry(
                annotationActor,
                entry.created_by
              );
              return {
                key: entry.entry_id,
                label: entry.presentation.label,
                annotation:
                  annotationSession.conflict.reason === "duplicate" ||
                  annotationSession.conflict.reason === "required"
                    ? (annotationSession.attempt.input.annotation_updates?.find(
                        (update) => update.entry_id === entry.entry_id
                      )?.annotation ?? entry.annotation)
                    : entry.annotation,
                posLabels: entry.pos_labels,
                glossPreviews: entry.gloss_previews,
                createdByName: entry.created_by_name,
                updatedAt: entry.updated_at,
                referenceCount: entry.inbound_relations.total,
                href: `/words/${entry.entry_id}/v3/wizard/forms`,
                readOnly: !editable,
                readOnlyHint: editable
                  ? undefined
                  : t("creation_this_account_has_read_only_access")
              };
            }),
            {
              key: "incoming",
              incoming: true,
              label:
                regionalDisplay.status === "ready"
                  ? regionalDisplay.value.mode === "unified"
                    ? regionalDisplay.value.common
                    : `${regionalDisplay.value.uk} / ${regionalDisplay.value.us}`
                  : value,
              annotation: annotationSession.attempt.input.annotation ?? null
            }
          ]}
          onClose={() => {
            setAnnotationSession(undefined);
            setCreateAttempt(undefined);
            annotationDraft.current = {};
            setError(undefined);
          }}
          onSave={(values) => {
            if (createAttempt) {
              void createPending(createAttempt);
              return;
            }
            const annotations = {
              annotation: values.incoming ?? null,
              // 只提交自己有权改的：非超管带上别人的词条会被后端整单 403 驳回。
              annotation_updates: annotationSession.conflict.entries
                .filter((entry) =>
                  canEditConflictEntry(annotationActor, entry.created_by)
                )
                .map((entry) => ({
                  entry_id: entry.entry_id,
                  annotation: values[entry.entry_id] ?? null,
                  base_annotation_revision: entry.annotation_revision
                }))
            };
            annotationDraft.current = annotations;
            const attempt = {
              ...annotationSession.attempt,
              input: { ...annotationSession.attempt.input, ...annotations }
            };
            setCreateAttempt(attempt);
            setAnnotationSession({ ...annotationSession, attempt });
            void createPending(attempt);
          }}
        />
      ) : error ? (
        <Alert showIcon type="error" title={error} />
      ) : null}
    </div>
  );
}
