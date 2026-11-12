import {
  useVoiceTranslation,
  VoiceText,
  voiceMessage,
  useVoiceMessageState,
  voiceLabel,
  defaultVoiceTranslation,
  type VoiceTranslation,
  type VoiceMessageValue
} from "./i18n";
import type { SsmlDraft } from "@tsz/voice-editor/types";
import { speechAccentGroup } from "@tsz/shared";
import { RotateCwIcon } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HttpError } from "@tsz/api-client";
import type {
  AdminSpeechVoice,
  AdminSpeechPreviewResponse,
  AdminVoiceLibraryResponse
} from "@tsz/types";
import {
  Alert,
  Breadcrumb,
  PageHeader,
  Button,
  Card,
  Collapse,
  Flex,
  Result,
  Space,
  Tag,
  Typography
} from "@tsz/ui/admin/display";
import { App, Drawer, Modal } from "@tsz/ui/admin/overlays";
import { Form, Input } from "@tsz/ui/admin/forms";
import { adminTokens } from "@tsz/ui/admin/context";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from "react";
import { UNSAFE_DataRouterContext, useBlocker } from "react-router-dom";
import { useUnsavedChanges } from "@tsz/shared/recovery";
import { api, useAnyPermission, useAuthStore, usePermission } from "@/lib/auth";
import {
  accentNames,
  voiceAccent,
  VoiceCatalogTable
} from "./VoiceCatalogTable";
import { DubbingGroups } from "./DubbingGroups";
import { DubbingDrafts, useDubbingDrafts } from "./DubbingDrafts";
import { ADMIN_PAGE_ROUTES } from "@/lib/adminPageRoutes";
import { VoiceName } from "./VoiceDisplay";
import type { MetadataEditorState } from "./VoiceMetadataEditor";
import { AddRecommendation } from "./AddRecommendation";
import {
  VoiceParameterFields,
  defaultVoiceParameters as initialParameters,
  type VoiceParameterValues
} from "./VoiceParameterFields";
import { VoiceAuditionPanel } from "./VoiceAuditionPanel";
import { VoiceConfigurationPanel } from "./VoiceConfigurationPanel";
import { VoicePreviewResult } from "./VoicePreviewResult";
import {
  newVoiceTrial,
  voiceTrialIssue,
  voiceTrialSetting,
  effectiveVoiceParameters,
  type VoiceTrialSource
} from "./voice-trial";
import { useReadingPreviewAdapter } from "@/features/dictionary/word-creation-v3/components/useReadingPreviewAdapter";
import { adminVoicePreviewAdapter } from "@/features/dictionary/voice-editor/dataSource";
import "@tsz/voice-editor/styles.css";
import "./voice-library.css";

interface Parameters extends VoiceParameterValues {
  style_degree?: number;
  role?: string;
}

interface VoiceForm extends Parameters {
  notes: string;
}

interface Preview extends AdminSpeechPreviewResponse {
  voice: AdminSpeechVoice;
  parameters: Parameters;
  comparison?: VoiceMessageValue;
}

function previewError(
  error: unknown,
  t: VoiceTranslation = defaultVoiceTranslation
): string {
  if (error instanceof HttpError) {
    if (error.status === 403)
      return t(
        "you_do_not_have_permission_to_generate_previews_contact_an_admini"
      );
    if (error.status === 404)
      return t("this_voice_is_unavailable_refresh_the_voice_list");
    if (error.status === 409)
      return t("the_same_preview_is_being_generated_try_again_later");
    if (error.status === 429)
      return t("too_many_preview_requests_try_again_later");
    if (error.status === 400 || error.status === 422)
      return t(
        "the_preview_text_or_parameters_are_unsupported_adjust_them_and_tr"
      );
    if (error.status >= 500)
      return t("the_preview_service_is_unavailable_try_again_later");
  }
  return t("preview_failed_check_the_connection_and_try_again");
}

function VoiceSettingsNavigationGuard({
  dirty,
  busy
}: {
  dirty: boolean;
  busy: boolean;
}) {
  const { t } = useVoiceTranslation();
  const [drafts, setDrafts] = useDubbingDrafts();
  const groupsPath = `/${ADMIN_PAGE_ROUTES.voices.path}`;
  const hasGroupDrafts = Object.keys(drafts).length > 0;
  const blocker = useBlocker(
    ({ nextLocation }) =>
      dirty || busy || (hasGroupDrafts && nextLocation.pathname !== groupsPath)
  );
  return blocker.state === "blocked" ? (
    <Modal
      open
      title={t("voice_settings_have_not_been_saved")}
      onCancel={() => blocker.reset()}
      footer={
        <Space>
          <Button onClick={() => blocker.reset()}>
            {t("continue_editing")}
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              if (blocker.location?.pathname !== groupsPath) setDrafts({});
              blocker.proceed();
            }}
          >
            {t("discard_and_leave")}
          </Button>
        </Space>
      }
    >
      {hasGroupDrafts && blocker.location?.pathname === groupsPath
        ? t("unsaved_changes_to_this_voice_will_be_discarded_added_group_draft")
        : t("leaving_discards_unsaved_voice_changes_and_group_drafts")}
    </Modal>
  ) : null;
}

type VoiceView = "groups" | "library";

export function VoiceLibrary({ view = "groups" }: { view?: VoiceView }) {
  const accountId = useAuthStore((state) => state.profile?.id);
  return (
    <div className="voice-library-scroll" tabIndex={0}>
      <DubbingDrafts key={accountId}>
        <VoiceLibraryContent key={view} view={view} />
      </DubbingDrafts>
    </div>
  );
}

function VoiceLibraryContent({ view: tab }: { view: VoiceView }) {
  const { t } = useVoiceTranslation();
  const token = adminTokens;
  const style = {
    "--voice-fill": token.colorFillAlter,
    "--voice-surface": token.colorBgContainer,
    "--voice-border": token.colorBorderSecondary,
    "--voice-primary-bg": token.colorPrimaryBg,
    "--voice-muted": token.colorTextSecondary,
    "--voice-radius": token.borderRadius
  } as CSSProperties;
  const canView = useAnyPermission([
    "words.access",
    "sentences.access",
    "speech.global_dubbing"
  ]);
  const canViewWords = usePermission("words.access");
  const canGenerateSpeech = usePermission("speech.generate");
  const canGenerate = canViewWords && canGenerateSpeech;
  const accountId = useAuthStore((s) => s.profile?.id);
  const { modal } = App.useApp();
  const [, setGroupsDirty] = useState(false);
  const [groupDrafts] = useDubbingDrafts();
  const [text, setText] = useState(
    "Please record the interview before the meeting starts."
  );
  const [selected, setSelected] = useState<AdminSpeechVoice | null>(null);
  const [addingRecommendation, setAddingRecommendation] = useState(false);
  const [recommendationPending, setRecommendationPending] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [trialParameters, setTrialParameters] = useState<
    Record<string, Parameters>
  >({});
  const storedParameters =
    useRef<AdminVoiceLibraryResponse["items"][number]["parameters"]>(null);
  const [reloading, setReloading] = useState(false);
  const settingsBaseline = useRef<VoiceForm | null>(null);
  const editSession = useRef(0);
  const router = useContext(UNSAFE_DataRouterContext);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pendingVoice, setPendingVoice] = useState<string | null>(null);
  const [error, setError] = useVoiceMessageState(null);
  const [trialSources, setTrialSources] = useState<
    Record<string, VoiceTrialSource>
  >({});
  const [ssmlDrafts, setSsmlDrafts] = useState<Record<string, SsmlDraft>>({});
  const [trialReady, setTrialReady] = useState(true);
  const createReadingAdapter = useReadingPreviewAdapter(undefined, undefined, {
    preserveDirectPhonemes: true
  });
  function voiceTrial(voice: AdminSpeechVoice) {
    return trialSources[voice.alias] ?? newVoiceTrial(text);
  }
  const selectedTrial = selected ? voiceTrial(selected) : null;
  const outputFormat = selectedTrial?.output_format ?? "mp3";
  const readingLinks = selectedTrial?.reading_links;
  const selectedTrialAdapter = useMemo(
    () =>
      readingLinks?.length
        ? createReadingAdapter(readingLinks)
        : adminVoicePreviewAdapter,
    [readingLinks, createReadingAdapter]
  );
  const trialVoiceAliases = useMemo(
    () =>
      new Set([...Object.keys(trialSources), ...Object.keys(trialParameters)]),
    [trialSources, trialParameters]
  );
  const stopTrialTools = useRef<(() => void) | undefined>(undefined);
  const registerTrialToolsStop = useCallback((stop: () => void) => {
    stopTrialTools.current = stop;
    return () => {
      if (stopTrialTools.current === stop) stopTrialTools.current = undefined;
    };
  }, []);
  const controller = useRef<AbortController | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const [form] = Form.useForm<VoiceForm>();
  const formValues = Form.useWatch<VoiceForm>([], form);
  const canEditDescription = usePermission("speech.global_dubbing");
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState<"personal" | null>(null);
  const [saveMessage, setSaveMessage] = useVoiceMessageState(null);
  const [saveError, setSaveError] = useVoiceMessageState(null);
  const [basePersonalRevision, setBasePersonalRevision] = useState(0);
  const settingsBusy = !!saving || recommendationPending || reloading;
  const [metadataEditors, setMetadataEditors] = useState<
    Record<string, MetadataEditorState>
  >({});
  const onMetadataEditorChange = useCallback(
    (id: string, state: MetadataEditorState | null) => {
      setMetadataEditors((current) => {
        if (state === null) {
          if (!(id in current)) return current;
          const next = { ...current };
          delete next[id];
          return next;
        }
        if (
          current[id]?.dirty === state.dirty &&
          current[id]?.busy === state.busy
        )
          return current;
        return { ...current, [id]: state };
      });
    },
    []
  );
  const metadataEditing = Object.keys(metadataEditors).length > 0;
  const metadataDirty = Object.values(metadataEditors).some(
    (state) => state.dirty
  );
  const metadataBusy = Object.values(metadataEditors).some(
    (state) => state.busy
  );
  useUnsavedChanges(
    "voice-library-settings",
    settingsDirty ||
      settingsBusy ||
      metadataDirty ||
      metadataBusy ||
      Object.keys(groupDrafts).length > 0
  );
  function updateDirty(values: VoiceForm) {
    const baseline = settingsBaseline.current;
    setSettingsDirty(!baseline || values.notes !== baseline.notes);
  }
  const library = useQuery({
    queryKey: ["admin-speech-library", accountId],
    queryFn: ({ signal }) => api.speech.library(signal),
    enabled: canView,
    retry: false
  });
  const metadata = useMemo(
    () =>
      new Map(
        library.data?.items.map((item) => [item.voice_alias, item]) ?? []
      ),
    [library.data]
  );
  function voiceParameters(voice: AdminSpeechVoice): Parameters {
    return trialParameters[voice.alias] ?? initialParameters(voice);
  }

  const voices = useQuery({
    queryKey: ["admin-speech-voices", accountId],
    queryFn: ({ signal }) => api.speech.voices(signal),
    enabled: canView,
    retry: false
  });
  const textLength = Array.from(text).length;
  const validText = text.trim().length > 0 && textLength <= 500;
  function cancelPreview() {
    controller.current?.abort();
    controller.current = null;
    player.current?.pause();
    stopTrialTools.current?.();
    setPendingVoice(null);
    setPreview(null);
    setError(null);
  }

  useEffect(() => {
    return () => {
      controller.current?.abort();
      controller.current = null;
      editSession.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!canGenerate) {
      controller.current?.abort();
      controller.current = null;
      player.current?.pause();
      setPendingVoice(null);
      setPreview(null);
      setError(null);
    }
  }, [canGenerate, setError]);

  async function audition(
    voice: AdminSpeechVoice,
    parameters?: Parameters,
    comparison?: VoiceMessageValue
  ) {
    const source = voiceTrial(voice);
    if (
      !canGenerate ||
      !!voiceTrialIssue(voice, source) ||
      voice.synthesis_available === false ||
      (!parameters && library.isPending)
    )
      return;
    const effective = effectiveVoiceParameters(
      voice,
      parameters ?? voiceParameters(voice)
    );
    parameters = {
      ...effective,
      volume_percent: effective.volume_percent ?? 100,
      style: effective.style ?? "",
      style_degree: effective.style_degree ?? undefined,
      role: effective.role ?? undefined
    };
    cancelPreview();
    const request = new AbortController();
    controller.current = request;
    setPendingVoice(voice.alias);
    try {
      const result = source.reading_links.length
        ? await (async () => {
            const adapter = createReadingAdapter(source.reading_links);
            const ssml = await adapter.renderSsml!(
              {
                content: source.content,
                setting: voiceTrialSetting(
                  voice,
                  parameters!,
                  source.output_format
                )
              },
              { signal: request.signal }
            );
            request.signal.throwIfAborted();
            return api.speech.manualPreview(
              {
                voice_alias: voice.alias,
                ssml,
                output_format: source.output_format
              },
              request.signal
            );
          })()
        : await api.speech.preview(
            {
              content: source.content,
              voice_alias: voice.alias,
              ...(source.output_format === "wav"
                ? { output_format: source.output_format }
                : {}),
              rate_percent: parameters.rate_percent,
              pitch_semitones: parameters.pitch_semitones,
              ...(parameters.volume_percent === 100
                ? {}
                : { volume_percent: parameters.volume_percent }),
              ...(parameters.style ? { style: parameters.style } : {}),
              ...(parameters.style_degree != null
                ? { style_degree: parameters.style_degree }
                : {}),
              ...(parameters.role ? { role: parameters.role } : {})
            },
            request.signal
          );
      if (controller.current !== request || request.signal.aborted) return;
      setPreview({ ...result, voice, parameters, comparison });
    } catch (cause) {
      if (controller.current === request && !request.signal.aborted)
        setError(
          source.reading_links.length &&
            cause instanceof HttpError &&
            cause.status === 400
            ? voiceMessage(
                "linked_readings_or_annotations_are_no_longer_valid_confirm_the_fo"
              )
            : { format: (t) => previewError(cause, t) }
        );
    } finally {
      if (controller.current === request) {
        controller.current = null;
        setPendingVoice(null);
      }
    }
  }

  function openDetails(voice: AdminSpeechVoice) {
    if (settingsBusy) return;
    editSession.current += 1;
    cancelPreview();
    setSelected(voice);
    setTrialReady(false);
    setAddingRecommendation(false);
    setSaveError(null);
    setSaveMessage(null);
    const info = metadata.get(voice.alias);
    setBasePersonalRevision(info?.personal_revision ?? 0);
    storedParameters.current = info?.parameters ?? null;
    const values = {
      ...voiceParameters(voice),
      notes: info?.notes ?? ""
    };
    form.setFieldsValue(values);
    settingsBaseline.current = values;
    setSettingsDirty(false);
  }

  async function auditionDraft() {
    if (
      !selected ||
      settingsBusy ||
      !trialReady ||
      voiceTrialIssue(selected, voiceTrial(selected))
    )
      return;
    const session = editSession.current;
    try {
      const parameters = await form.validateFields([
        "rate_percent",
        "pitch_semitones",
        "volume_percent",
        "style",
        "style_degree",
        "role"
      ]);
      if (session !== editSession.current) return;
      await audition(selected, parameters, voiceMessage("current_parameters"));
    } catch {
      // Form keeps invalid values visible beside the corresponding fields.
    }
  }

  async function retainTrial() {
    if (
      !selected ||
      settingsBusy ||
      !trialReady ||
      voiceTrialIssue(selected, voiceTrial(selected))
    )
      return;
    const session = editSession.current;
    try {
      await form.validateFields([
        "rate_percent",
        "pitch_semitones",
        "volume_percent",
        "style",
        "style_degree",
        "role"
      ]);
      if (session === editSession.current) closeSettings();
    } catch {
      // Invalid parameters remain visible for correction.
    }
  }

  function restoreCommonText() {
    if (!selected || settingsBusy) return;
    const voice = selected;
    const source = voiceTrial(voice);
    const restore = () => {
      cancelPreview();
      setTrialSources((current) => ({
        ...current,
        [voice.alias]: {
          ...newVoiceTrial(text),
          output_format: source.output_format
        }
      }));
    };
    if (
      source.content.text !== text ||
      source.content.annotations.length ||
      source.reading_links.length
    ) {
      modal.confirm({
        title: <VoiceText message="restore_shared_preview_text" />,
        content: (
          <VoiceText message="this_clears_text_annotations_and_linked_readings_for_this_voice_v" />
        ),
        okText: <VoiceText message="restore_shared_text" />,
        cancelText: <VoiceText message="keep_draft" />,
        onOk: restore
      });
    } else restore();
  }

  async function openRecommendation() {
    const session = editSession.current;
    try {
      await form.validateFields([
        "rate_percent",
        "pitch_semitones",
        "volume_percent",
        "style",
        "style_degree",
        "role"
      ]);
      if (session === editSession.current) {
        cancelPreview();
        setAddingRecommendation(true);
      }
    } catch {
      // Keep parameter validation visible in the drawer before opening the dialog.
    }
  }

  async function save() {
    if (!selected || settingsBusy || !library.isSuccess) return;
    const session = editSession.current;
    let values: VoiceForm;
    try {
      values = await form.validateFields(["notes"]);
    } catch {
      return;
    }
    if (session !== editSession.current) return;
    setSaving("personal");
    setSaveError(null);
    setSaveMessage(null);
    try {
      const saved = await api.speech.saveSettings(selected.alias, {
        parameters: storedParameters.current,
        notes: values.notes,
        base_revision: basePersonalRevision
      });
      if (
        useAuthStore.getState().profile?.id !== accountId ||
        session !== editSession.current
      )
        return;
      await queryClient.cancelQueries({
        queryKey: ["admin-speech-library", accountId],
        exact: true
      });
      if (
        useAuthStore.getState().profile?.id !== accountId ||
        session !== editSession.current
      )
        return;
      queryClient.setQueryData<AdminVoiceLibraryResponse>(
        ["admin-speech-library", accountId],
        (current) => {
          const items = current?.items ?? [];
          return {
            items: items.some((item) => item.voice_alias === saved.voice_alias)
              ? items.map((item) =>
                  item.voice_alias === saved.voice_alias &&
                  saved.personal_revision >= item.personal_revision
                    ? {
                        ...item,
                        parameters: saved.parameters,
                        notes: saved.notes,
                        personal_revision: saved.personal_revision
                      }
                    : item
                )
              : [...items, saved]
          };
        }
      );
      setBasePersonalRevision(saved.personal_revision);
      settingsBaseline.current = {
        ...settingsBaseline.current!,
        notes: values.notes
      };
      updateDirty(form.getFieldsValue());
      setSaveMessage(
        voiceMessage("listening_notes_saved_only_you_can_view_them")
      );
    } catch (cause) {
      setSaveError(
        cause instanceof HttpError && cause.status === 409
          ? voiceMessage(
              "settings_changed_in_another_page_your_input_has_been_kept_reload_"
            )
          : cause instanceof HttpError && cause.status === 403
            ? voiceMessage(
                "you_do_not_have_permission_to_save_your_input_has_been_kept"
              )
            : voiceMessage("could_not_save_your_input_has_been_kept_try_again")
      );
    } finally {
      setSaving(null);
    }
  }

  async function reloadSettings() {
    if (!selected || settingsBusy) return;
    const session = editSession.current;
    setReloading(true);
    try {
      const latest = await library.refetch();
      if (
        session !== editSession.current ||
        useAuthStore.getState().profile?.id !== accountId
      )
        return;
      if (latest.isError || !latest.data) return;
      const item = latest.data.items.find(
        (entry) => entry.voice_alias === selected.alias
      );
      setBasePersonalRevision(item?.personal_revision ?? 0);
      storedParameters.current = item?.parameters ?? null;
      setSelected(
        (voice) =>
          voice && {
            ...voice,
            accent: item?.accent,
            accent_revision: item?.accent_revision
          }
      );
      const values = {
        ...voiceParameters(selected),
        notes: item?.notes ?? ""
      };
      form.setFieldsValue(values);
      settingsBaseline.current = values;
      setSettingsDirty(false);
      cancelPreview();
      setSaveError(null);
      setSaveMessage(null);
    } finally {
      if (session === editSession.current) setReloading(false);
    }
  }

  function closeSettings() {
    if (settingsBusy) return;
    const close = () => {
      editSession.current += 1;
      cancelPreview();
      setSettingsDirty(false);
      setSelected(null);
    };
    if (!settingsDirty) {
      close();
      return;
    }
    modal.confirm({
      title: <VoiceText message="voice_settings_have_not_been_saved" />,
      content: <VoiceText message="closing_discards_unsaved_listening_notes" />,
      okText: <VoiceText message="discard_changes_9b7824" />,
      cancelText: <VoiceText message="continue_editing" />,
      onOk: close
    });
  }

  function previewView() {
    return (
      <VoicePreviewResult
        preview={
          preview
            ? {
                result: preview,
                voice: preview.voice,
                parameters: preview.parameters,
                comparison: preview.comparison
              }
            : null
        }
        pending={!!pendingVoice}
        error={error}
        onCancel={cancelPreview}
        player={player}
        onPlay={() => stopTrialTools.current?.()}
      />
    );
  }

  if (!canView)
    return (
      <Result
        status="403"
        title={t("access_denied")}
        subTitle={t(
          "lexicon_or_sentence_viewing_permission_is_required_to_browse_the_"
        )}
      />
    );

  const capabilities = selected?.capabilities;
  const defaults = selected ? initialParameters(selected) : null;
  const parametersAreDefault =
    !!defaults &&
    !!formValues &&
    (Object.keys(defaults) as (keyof VoiceParameterValues)[]).every(
      (key) => formValues[key] === defaults[key]
    );
  const refreshButton = (
    <Button
      icon={<RotateCwIcon />}
      loading={voices.isFetching || library.isFetching}
      disabled={metadataEditing}
      onClick={() => {
        cancelPreview();
        void voices.refetch();
        void library.refetch();
      }}
    >
      {t("refresh_voices")}
    </Button>
  );
  const auditionPanel = (
    <section className="voice-library-audition" aria-label={t("voice_preview")}>
      <div className="voice-library-audition-row">
        <Form
          layout="vertical"
          className="voice-library-audition-text"
          colon={false}
        >
          <Form.Item
            label={
              <span className="voice-library-audition-label">
                <Typography.Text strong>{t("preview_text")}</Typography.Text>
                <Typography.Text
                  type="secondary"
                  className="voice-library-audition-count"
                >
                  {textLength} / 500
                </Typography.Text>
              </span>
            }
            validateStatus={!validText ? "error" : undefined}
            help={
              !validText
                ? t("enter_1_500_characters_of_preview_text_4dc82c")
                : undefined
            }
          >
            <div className="voice-library-audition-input">
              <Input.TextArea
                aria-label={t("shared_preview_text")}
                value={text}
                autoSize={{ minRows: 1, maxRows: 4 }}
                onChange={(event) => {
                  cancelPreview();
                  setText(event.target.value);
                }}
              />
            </div>
          </Form.Item>
        </Form>
      </div>
      {!selected && (pendingVoice || error || preview) && previewView()}
    </section>
  );
  return (
    <div
      className={`voice-library${tab === "library" ? " voice-library-catalog" : ""}`}
      style={style}
    >
      {tab === "library" ? (
        <PageHeader
          title={t("voice_library")}
          breadcrumb={<Breadcrumb items={[{ title: t("dubbing_centre") }]} />}
          actions={refreshButton}
        />
      ) : (
        <Breadcrumb items={[{ title: t("dubbing_centre") }]} />
      )}
      {router && tab === "library" && (
        <VoiceSettingsNavigationGuard
          dirty={settingsDirty || metadataDirty}
          busy={settingsBusy || metadataBusy}
        />
      )}
      {!canGenerate && (
        <Alert
          type="info"
          showIcon
          title={t(
            "you_can_browse_voices_generating_previews_requires_lexicon_viewin"
          )}
        />
      )}
      {library.isError && (
        <Alert
          type="warning"
          showIcon
          title={t(
            "voice_information_and_personal_settings_could_not_be_loaded_you_c"
          )}
          action={
            <Button onClick={() => void library.refetch()}>
              {t("retry_loading_information")}
            </Button>
          }
        />
      )}
      {tab === "library" && (
        <Card size="small" className="voice-library-controls">
          {auditionPanel}
        </Card>
      )}
      <Card
        size="small"
        className={`voice-library-content${tab === "groups" ? " voice-library-group-content" : ""}`}
      >
        {tab === "groups" &&
          !selected &&
          (pendingVoice || error || preview) &&
          previewView()}
        {tab === "groups" && (
          <DubbingGroups
            onDirtyChange={setGroupsDirty}
            onInvalidatePreview={cancelPreview}
            voices={voices.data?.items ?? []}
            canAudition={canGenerate && validText}
            onAudition={(voice, item) =>
              void audition(voice, {
                ...item.parameters,
                volume_percent: item.parameters.volume_percent ?? 100,
                style: item.parameters.style ?? ""
              })
            }
          />
        )}
        {tab === "library" && (
          <>
            {voices.isError ? (
              <Alert
                type="error"
                showIcon
                title={t("could_not_load_voices_try_again")}
                action={
                  <Button onClick={() => void voices.refetch()}>
                    {t("try_again")}
                  </Button>
                }
              />
            ) : (
              <VoiceCatalogTable
                canEditMetadata={canEditDescription}
                metadataEditing={metadataEditing}
                onMetadataEditorChange={onMetadataEditorChange}
                voices={voices.data?.items ?? []}
                metadata={metadata}
                loading={voices.isPending}
                settingsPending={library.isPending}
                canGenerate={canGenerate}
                validText={validText}
                isVoiceTextValid={(voice) =>
                  !voiceTrialIssue(voice, voiceTrial(voice))
                }
                trialVoiceAliases={trialVoiceAliases}
                activeVoice={pendingVoice ?? preview?.voice.alias}
                pendingVoice={pendingVoice}
                onAudition={(voice) => void audition(voice)}
                onDetails={openDetails}
              />
            )}
          </>
        )}
      </Card>
      <Drawer
        className="voice-library-settings"
        style={style}
        title={
          <div className="voice-library-settings-title">
            <span>{t("adjust_voice_label")}</span>
            {selected && (
              <div className="voice-library-settings-voice">
                <VoiceName voice={selected} />
                <Tag
                  color={
                    voiceAccent(selected) === "us"
                      ? "magenta"
                      : voiceAccent(selected) === "gb"
                        ? "blue"
                        : "default"
                  }
                >
                  {voiceLabel(accentNames[voiceAccent(selected)], t)}
                </Tag>
              </div>
            )}
          </div>
        }
        open={!!selected}
        onClose={closeSettings}
        size={1120}
        destroyOnHidden
        footer={
          selected && (
            <div className="voice-library-settings-footer">
              {settingsDirty && (
                <Typography.Text
                  type="secondary"
                  className="voice-library-footer-status"
                >
                  {t("listening_notes_are_unsaved")}
                </Typography.Text>
              )}
              <div className="voice-library-footer-actions">
                <Button
                  title={t("applies_to_this_page_only_resets_on_refresh")}
                  disabled={
                    settingsBusy ||
                    !trialReady ||
                    !!voiceTrialIssue(selected, voiceTrial(selected))
                  }
                  onClick={() => void retainTrial()}
                >
                  {t("keep_current_preview")}
                </Button>
                {canEditDescription && (
                  <Button
                    className="voice-trial-recommend"
                    disabled={
                      settingsBusy ||
                      selected.synthesis_available === false ||
                      speechAccentGroup(selected.locale, selected.accent) ===
                        "other"
                    }
                    title={
                      speechAccentGroup(selected.locale, selected.accent) ===
                      "other"
                        ? t(
                            "other_regions_are_supplementary_text_voices_and_are_not_added_to_"
                          )
                        : undefined
                    }
                    onClick={() => void openRecommendation()}
                  >
                    {t("add_to_group_recommendations")}
                  </Button>
                )}
              </div>
            </div>
          )
        }
      >
        {selected && capabilities && (
          <Flex vertical gap={16}>
            {saveError && (
              <Alert
                type="error"
                showIcon
                title={saveError}
                action={
                  <Button
                    disabled={settingsBusy}
                    loading={reloading}
                    onClick={() => void reloadSettings()}
                  >
                    {t("reload_settings")}
                  </Button>
                }
              />
            )}
            {saveMessage && (
              <Alert type="success" showIcon title={saveMessage} />
            )}
            <Form
              form={form}
              layout="vertical"
              requiredMark={false}
              disabled={settingsBusy}
              onValuesChange={(
                changed: Partial<VoiceForm>,
                values: VoiceForm
              ) => {
                if (
                  "rate_percent" in changed ||
                  "pitch_semitones" in changed ||
                  "volume_percent" in changed ||
                  "style" in changed ||
                  "style_degree" in changed ||
                  "role" in changed
                ) {
                  cancelPreview();
                  if (
                    Number.isInteger(values.rate_percent) &&
                    values.rate_percent >= capabilities.min_rate_percent &&
                    values.rate_percent <= capabilities.max_rate_percent &&
                    Number.isInteger(values.pitch_semitones) &&
                    values.pitch_semitones >=
                      capabilities.min_pitch_semitones &&
                    values.pitch_semitones <=
                      capabilities.max_pitch_semitones &&
                    Number.isInteger(values.volume_percent) &&
                    values.volume_percent >= 0 &&
                    values.volume_percent <= 100 &&
                    (values.style_degree == null ||
                      (Number.isFinite(values.style_degree) &&
                        values.style_degree >= 0.01 &&
                        values.style_degree <= 2)) &&
                    (!values.style ||
                      capabilities.styles.includes(values.style))
                  )
                    setTrialParameters((current) => ({
                      ...current,
                      [selected.alias]: {
                        rate_percent: values.rate_percent,
                        pitch_semitones: values.pitch_semitones,
                        volume_percent: values.volume_percent,
                        style: values.style,
                        style_degree: values.style_degree,
                        role: values.role
                      }
                    }));
                }
                updateDirty(values);
                setSaveMessage(null);
              }}
            >
              <VoiceConfigurationPanel
                parameters={
                  <VoiceParameterFields
                    voice={selected}
                    disabled={settingsBusy}
                    volume={formValues?.volume_percent}
                    style={formValues?.style}
                    resetDisabled={parametersAreDefault}
                    onReset={() => {
                      cancelPreview();
                      const defaults = initialParameters(selected);
                      form.setFieldsValue(defaults);
                      setTrialParameters((current) => ({
                        ...current,
                        [selected.alias]: defaults
                      }));
                      updateDirty(form.getFieldsValue());
                      setSaveMessage(null);
                    }}
                  />
                }
                personal={
                  <Collapse
                    ghost
                    className="voice-library-notes"
                    items={[
                      {
                        key: "notes",
                        label: t("my_listening_notes"),
                        extra: (
                          <Typography.Text
                            type={settingsDirty ? "warning" : "secondary"}
                          >
                            {settingsDirty
                              ? t("unsaved")
                              : t("visible_only_to_you")}
                          </Typography.Text>
                        ),
                        forceRender: true,
                        children: (
                          <>
                            <Form.Item
                              name="notes"
                              className="voice-library-notes-field"
                              rules={[
                                {
                                  message: (
                                    <VoiceText message="listening_notes_must_be_at_most_3000_characters" />
                                  ),

                                  validator: (_, value: string) =>
                                    Array.from(value ?? "").length <= 3000
                                      ? Promise.resolve()
                                      : Promise.reject(
                                          new Error(
                                            "listening_notes_must_be_at_most_3000_characters"
                                          )
                                        )
                                }
                              ]}
                            >
                              <Input.TextArea
                                aria-label={t("my_listening_notes")}
                                rows={2}
                                placeholder={t("record_your_listening_notes")}
                              />
                            </Form.Item>
                            <Button
                              loading={saving === "personal"}
                              disabled={!library.isSuccess || settingsBusy}
                              onClick={() => void save()}
                            >
                              {t("save_listening_notes")}
                            </Button>
                          </>
                        )
                      }
                    ]}
                  />
                }
                audition={
                  <VoiceAuditionPanel
                    key={selected.alias}
                    voice={selected}
                    source={selectedTrial!}
                    canReadWords={canViewWords}
                    readOnly={settingsBusy}
                    onValidationChange={setTrialReady}
                    onSourceChange={(source) => {
                      cancelPreview();
                      setTrialSources((current) => ({
                        ...current,
                        [selected.alias]: source
                      }));
                    }}
                    canGenerate={canGenerate}
                    canAudition={
                      canGenerate &&
                      trialReady &&
                      selected.synthesis_available !== false
                    }
                    pending={pendingVoice === selected.alias}
                    onAudition={() => void auditionDraft()}
                    onCancelPreview={cancelPreview}
                    preview={
                      preview
                        ? {
                            result: preview,
                            voice: preview.voice,
                            parameters: preview.parameters,
                            comparison: preview.comparison
                          }
                        : null
                    }
                    error={error}
                    player={player}
                    adapter={selectedTrialAdapter}
                    setting={voiceTrialSetting(
                      selected,
                      voiceParameters(selected),
                      outputFormat
                    )}
                    registerStop={registerTrialToolsStop}
                    ssmlDraft={ssmlDrafts[selected.alias]}
                    onSsmlDraftChange={(draft) =>
                      setSsmlDrafts((current) => ({
                        ...current,
                        [selected.alias]: draft
                      }))
                    }
                    comparisonAction={
                      <Button
                        disabled={
                          settingsBusy ||
                          !canGenerate ||
                          !trialReady ||
                          !!voiceTrialIssue(selected, selectedTrial!) ||
                          selected.synthesis_available === false
                        }
                        onClick={() =>
                          void audition(
                            selected,
                            settingsBaseline.current ??
                              initialParameters(selected),
                            voiceMessage("original_parameters")
                          )
                        }
                      >
                        {t("preview_original_parameters")}
                      </Button>
                    }
                    sourceAction={
                      trialSources[selected.alias] && (
                        <Button
                          type="link"
                          size="small"
                          disabled={settingsBusy}
                          onClick={restoreCommonText}
                        >
                          {t("restore_shared_text")}
                        </Button>
                      )
                    }
                  />
                }
              />
            </Form>
            {canEditDescription && (
              <Modal
                title={t("add_voice_recommendation", {
                  name: selected.display_name
                })}
                open={addingRecommendation}
                onCancel={() =>
                  !recommendationPending && setAddingRecommendation(false)
                }
                closable={!recommendationPending}
                mask={{ closable: !recommendationPending }}
                keyboard={!recommendationPending}
                footer={null}
                destroyOnHidden
              >
                <Typography.Paragraph type="secondary">
                  {t(
                    "create_a_recommendation_using_the_current_volume_rate_pitch_and_s"
                  )}
                </Typography.Paragraph>
                <AddRecommendation
                  onBusyChange={setRecommendationPending}
                  voice={selected}
                  voices={voices.data?.items ?? []}
                  onClose={() => setAddingRecommendation(false)}
                  readParameters={async () => {
                    const values = await form.validateFields([
                      "rate_percent",
                      "pitch_semitones",
                      "volume_percent",
                      "style",
                      "style_degree",
                      "role"
                    ]);
                    return {
                      rate_percent: values.rate_percent,
                      pitch_semitones: values.pitch_semitones,
                      ...(values.volume_percent === 100
                        ? {}
                        : { volume_percent: values.volume_percent }),
                      style: values.style || null,
                      ...(values.style_degree != null
                        ? { style_degree: values.style_degree }
                        : {}),
                      ...(values.role ? { role: values.role } : {})
                    };
                  }}
                />
              </Modal>
            )}
          </Flex>
        )}
      </Drawer>
    </div>
  );
}
