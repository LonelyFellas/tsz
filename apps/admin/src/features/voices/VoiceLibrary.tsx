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
  comparison?: string;
}

function previewError(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.status === 403) return "没有生成试听的权限，请联系管理员。";
    if (error.status === 404) return "这个音色已不可用，请刷新音色列表。";
    if (error.status === 409) return "相同试听正在生成，请稍后重试。";
    if (error.status === 429) return "试听请求过于频繁，请稍后重试。";
    if (error.status === 400 || error.status === 422)
      return "试听文本或参数不受支持，请调整后重试。";
    if (error.status >= 500) return "试听服务暂时不可用，请稍后重试。";
  }
  return "试听失败，请检查网络后重试。";
}

function VoiceSettingsNavigationGuard({
  dirty,
  busy
}: {
  dirty: boolean;
  busy: boolean;
}) {
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
      title="还有未保存的音色设置"
      onCancel={() => blocker.reset()}
      footer={
        <Space>
          <Button onClick={() => blocker.reset()}>继续编辑</Button>
          <Button
            disabled={busy}
            onClick={() => {
              if (blocker.location?.pathname !== groupsPath) setDrafts({});
              blocker.proceed();
            }}
          >
            放弃并离开
          </Button>
        </Space>
      }
    >
      {hasGroupDrafts && blocker.location?.pathname === groupsPath
        ? "当前音色的未保存修改将丢弃，已添加的分组草稿会保留。"
        : "离开后将丢弃尚未保存的音色修改和分组草稿。"}
    </Modal>
  ) : null;
}

type VoiceView = "groups" | "library";

export function VoiceLibrary({ view = "groups" }: { view?: VoiceView }) {
  const accountId = useAuthStore((state) => state.profile?.id);
  return (
    <DubbingDrafts key={accountId}>
      <VoiceLibraryContent key={view} view={view} />
    </DubbingDrafts>
  );
}

function VoiceLibraryContent({ view: tab }: { view: VoiceView }) {
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
  const [error, setError] = useState<string | null>(null);
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
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
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
  }, [canGenerate]);

  async function audition(
    voice: AdminSpeechVoice,
    parameters?: Parameters,
    comparison?: string
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
            ? "关联读法或标注已失效，请重新确认词形和读法后再试听。草稿已保留。"
            : previewError(cause)
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
      await audition(selected, parameters, "当前参数");
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
        title: "恢复共用试听文本？",
        content: "会清除当前音色的文本标注和关联读法，声音参数保持不变。",
        okText: "恢复共用文本",
        cancelText: "保留草稿",
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
      setSaveMessage("听感已保存，仅你可见。");
    } catch (cause) {
      setSaveError(
        cause instanceof HttpError && cause.status === 409
          ? "设置已在其他页面修改。当前输入已保留，请重新载入最新设置后再编辑。"
          : cause instanceof HttpError && cause.status === 403
            ? "没有保存权限，当前输入已保留。"
            : "保存失败，当前输入已保留，请重试。"
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
      title: "还有未保存的音色设置",
      content: "关闭会丢弃尚未保存的听感。",
      okText: "放弃修改",
      cancelText: "继续编辑",
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
        title="无权限"
        subTitle="需要词库或例句查看权限才能浏览音色库。"
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
      type="text"
      icon={<RotateCwIcon />}
      loading={voices.isFetching || library.isFetching}
      disabled={metadataEditing}
      onClick={() => {
        cancelPreview();
        void voices.refetch();
        void library.refetch();
      }}
    >
      刷新音色
    </Button>
  );
  const auditionPanel = (
    <section className="voice-library-audition" aria-label="音色试听">
      <div className="voice-library-audition-row">
        {tab === "library" && refreshButton}
        <Form
          layout="inline"
          className="voice-library-audition-text"
          colon={false}
        >
          <Form.Item
            label={<Typography.Text strong>试听文本</Typography.Text>}
            validateStatus={!validText ? "error" : undefined}
            help={!validText ? "请输入 1–500 个字符的试听文本。" : undefined}
          >
            <div className="voice-library-audition-input">
              <Input.TextArea
                aria-label="共用试听文本"
                value={text}
                autoSize={{ minRows: 1, maxRows: 3 }}
                onChange={(event) => {
                  cancelPreview();
                  setText(event.target.value);
                }}
              />
              <Typography.Text
                type="secondary"
                className="voice-library-audition-count"
              >
                {textLength} / 500
              </Typography.Text>
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
          title="音色库"
          breadcrumb={<Breadcrumb items={[{ title: "配音中心" }]} />}
        />
      ) : (
        <Breadcrumb items={[{ title: "配音中心" }]} />
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
          title="当前账号可以浏览音色；生成试听需要词库查看和语音生成权限。"
        />
      )}
      {library.isError && (
        <Alert
          type="warning"
          showIcon
          title="音色资料和个人设置未能加载，仍可使用默认参数试听。"
          action={
            <Button onClick={() => void library.refetch()}>重试资料</Button>
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
                title="音色列表加载失败，请重试。"
                action={
                  <Button onClick={() => void voices.refetch()}>重试</Button>
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
            <span>调节声音</span>
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
                  {accentNames[voiceAccent(selected)]}
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
                  听感尚未保存
                </Typography.Text>
              )}
              <div className="voice-library-footer-actions">
                <Button
                  title="仅本页有效，刷新后重置"
                  disabled={
                    settingsBusy ||
                    !trialReady ||
                    !!voiceTrialIssue(selected, voiceTrial(selected))
                  }
                  onClick={() => void retainTrial()}
                >
                  保留本次试听
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
                        ? "其他地区仅作文本补充音色，不加入英美默认推荐"
                        : undefined
                    }
                    onClick={() => void openRecommendation()}
                  >
                    加入分组推荐
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
                    重新载入设置
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
                        label: "我的听感",
                        extra: (
                          <Typography.Text
                            type={settingsDirty ? "warning" : "secondary"}
                          >
                            {settingsDirty ? "未保存" : "仅自己可见"}
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
                                  validator: (_, value: string) =>
                                    Array.from(value ?? "").length <= 3000
                                      ? Promise.resolve()
                                      : Promise.reject(
                                          new Error("听感最多 3000 个字符")
                                        )
                                }
                              ]}
                            >
                              <Input.TextArea
                                aria-label="我的听感"
                                rows={2}
                                placeholder="记录试听感受"
                              />
                            </Form.Item>
                            <Button
                              loading={saving === "personal"}
                              disabled={!library.isSuccess || settingsBusy}
                              onClick={() => void save()}
                            >
                              保存听感
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
                            "原参数"
                          )
                        }
                      >
                        试听原参数
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
                          恢复共用文本
                        </Button>
                      )
                    }
                  />
                }
              />
            </Form>
            {canEditDescription && (
              <Modal
                title={`将 ${selected.display_name} 加入分组推荐`}
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
                  使用当前音量、语速、音调和风格创建推荐。
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
