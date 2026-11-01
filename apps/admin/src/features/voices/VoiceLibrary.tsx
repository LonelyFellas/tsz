import { speechAccentGroup } from "@tsz/shared";
import {
  PlayCircleOutlined,
  ReloadOutlined,
  SoundOutlined,
  UndoOutlined
} from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HttpError } from "@tsz/api-client";
import type {
  AdminSpeechVoice,
  AdminSpeechPreviewResponse,
  AdminVoiceLibraryResponse
} from "@tsz/types";
import {
  Alert,
  App,
  Breadcrumb,
  Button,
  Card,
  Collapse,
  Drawer,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
  Result,
  Select,
  Space,
  Tag,
  Typography,
  theme
} from "antd";
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
import { DubbingDrafts } from "./DubbingDrafts";
import { VoiceName, VoiceRate, VoiceVolume } from "./VoiceDisplay";
import type { MetadataEditorState } from "./VoiceMetadataEditor";
import { AddRecommendation } from "./AddRecommendation";
import { SpeechRateInput } from "./SpeechRateInput";
import { SpeechVolumeInput } from "./SpeechVolumeInput";
import { styleNames } from "./voice-labels";
import { VoiceTrialEditor } from "./VoiceTrialEditor";
import {
  newVoiceTrial,
  voiceTrialIssue,
  voiceTrialSetting,
  type VoiceTrialSource
} from "./voice-trial";
import { useReadingPreviewAdapter } from "@/features/dictionary/word-creation-v3/components/useReadingPreviewAdapter";
import {
  AudioReview,
  SsmlReview,
  ReferenceAudio,
  type ReviewAudio
} from "@tsz/voice-editor/editor";
import { adminVoicePreviewAdapter } from "@/features/dictionary/voice-editor/dataSource";
import "@tsz/voice-editor/styles.css";
import "./voice-library.css";

interface Parameters {
  rate_percent: number;
  pitch_semitones: number;
  volume_percent: number;
  style: string;
}

interface VoiceForm extends Parameters {
  notes: string;
}

interface Preview extends AdminSpeechPreviewResponse {
  voice: AdminSpeechVoice;
  parameters: Parameters;
}

const localeNames: Record<string, string> = {
  "en-GB": "英式英语",
  "en-US": "美式英语"
};

function initialParameters(voice: AdminSpeechVoice): Parameters {
  const c = voice.capabilities;
  return {
    rate_percent: Math.max(c.min_rate_percent, Math.min(0, c.max_rate_percent)),
    pitch_semitones: Math.max(
      c.min_pitch_semitones,
      Math.min(0, c.max_pitch_semitones)
    ),
    volume_percent: 100,
    style: ""
  };
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
  const blocker = useBlocker(dirty || busy);
  return blocker.state === "blocked" ? (
    <Modal
      open
      title="还有未保存的音色设置"
      onCancel={() => blocker.reset()}
      footer={
        <Space>
          <Button onClick={() => blocker.reset()}>继续编辑</Button>
          <Button disabled={busy} onClick={() => blocker.proceed()}>
            放弃并离开
          </Button>
        </Space>
      }
    >
      离开后将丢弃尚未保存的音色修改。
    </Modal>
  ) : null;
}

type VoiceView = "groups" | "library";

export function VoiceLibrary({ view = "groups" }: { view?: VoiceView }) {
  const accountId = useAuthStore((state) => state.profile?.id);
  return (
    <DubbingDrafts key={`${accountId}:${view}`}>
      <VoiceLibraryContent view={view} />
    </DubbingDrafts>
  );
}

function VoiceLibraryContent({ view: tab }: { view: VoiceView }) {
  const { token } = theme.useToken();
  const style = {
    "--voice-fill": token.colorFillAlter,
    "--voice-surface": token.colorBgContainer,
    "--voice-border": token.colorBorderSecondary,
    "--voice-primary-bg": token.colorPrimaryBg,
    "--voice-muted": token.colorTextSecondary,
    "--voice-radius": `${token.borderRadius}px`
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
  const [audioError, setAudioError] = useState(false);
  const [reviewAudio, setReviewAudio] = useState<ReviewAudio>();
  const [trialSources, setTrialSources] = useState<
    Record<string, VoiceTrialSource>
  >({});
  const [trialReady, setTrialReady] = useState(true);
  const [ssmlExpanded, setSsmlExpanded] = useState(false);
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
  const stopSsml = useRef<(() => void) | undefined>(undefined);
  const stopReference = useRef<(() => void) | undefined>(undefined);
  const registerSsmlStop = useCallback((stop: () => void) => {
    stopSsml.current = stop;
    return () => {
      if (stopSsml.current === stop) stopSsml.current = undefined;
    };
  }, []);
  const registerReferenceStop = useCallback((stop: () => void) => {
    stopReference.current = stop;
    return () => {
      if (stopReference.current === stop) stopReference.current = undefined;
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
    settingsDirty || settingsBusy || metadataDirty || metadataBusy
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
    stopSsml.current?.();
    stopReference.current?.();
    setReviewAudio(undefined);
    setPendingVoice(null);
    setPreview(null);
    setError(null);
    setAudioError(false);
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

  async function audition(voice: AdminSpeechVoice, parameters?: Parameters) {
    const source = voiceTrial(voice);
    if (
      !canGenerate ||
      !!voiceTrialIssue(voice, source) ||
      voice.synthesis_available === false ||
      (!parameters && library.isPending)
    )
      return;
    parameters ??= voiceParameters(voice);
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
              ...(parameters.style ? { style: parameters.style } : {})
            },
            request.signal
          );
      if (controller.current !== request || request.signal.aborted) return;
      setPreview({ ...result, voice, parameters });
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
    setSsmlExpanded(false);
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
        "style"
      ]);
      if (session !== editSession.current) return;
      await audition(selected, parameters);
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
        "style"
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
        "style"
      ]);
      if (session === editSession.current) setAddingRecommendation(true);
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
      <div className="voice-library-preview" aria-live="polite">
        {pendingVoice && (
          <Space>
            <SoundOutlined />
            <Typography.Text type="secondary">正在生成试听…</Typography.Text>
            <Button type="link" size="small" onClick={cancelPreview}>
              取消
            </Button>
          </Space>
        )}
        {error && <Alert type="error" showIcon title={error} />}
        {selected && !pendingVoice && !error && !preview && (
          <div className="voice-library-preview-empty">
            <SoundOutlined />
            <Typography.Text type="secondary">暂无试听音频</Typography.Text>
          </div>
        )}
        {preview && (
          <div className="voice-library-player">
            <Flex vertical gap={8}>
              <Space wrap>
                <VoiceName voice={preview.voice} />
                <Tag>
                  {localeNames[preview.voice.locale] ?? preview.voice.locale}
                </Tag>
                <Typography.Text type="secondary">
                  本次试听：音量 <VoiceVolume parameters={preview.parameters} />
                  ，<VoiceRate parameters={preview.parameters} />
                  {preview.parameters.style
                    ? `，${styleNames[preview.parameters.style] ?? preview.parameters.style}`
                    : "，默认"}
                </Typography.Text>
              </Space>
              <audio
                key={preview.audio_url}
                ref={player}
                controls
                autoPlay
                aria-label={`${preview.voice.display_name} 试听播放器`}
                src={preview.audio_url}
                onLoadedMetadata={(event) => {
                  const snapshot = preview;
                  setReviewAudio({
                    audio: event.currentTarget,
                    name: snapshot.voice.display_name,
                    result: {
                      audioUrl: snapshot.audio_url,
                      expiresAt: snapshot.expires_at,
                      cached: snapshot.cache_status === "hit",
                      ...(snapshot.content_path
                        ? {
                            loadAudio: (options?: { signal?: AbortSignal }) =>
                              api.speech.previewContent(
                                snapshot.content_path!,
                                options?.signal
                              )
                          }
                        : {})
                    }
                  });
                }}
                onPlay={() => {
                  stopSsml.current?.();
                  stopReference.current?.();
                  if (Date.parse(preview.expires_at) <= Date.now()) {
                    player.current?.pause();
                    setAudioError(true);
                  }
                }}
                onError={() => setAudioError(true)}
              />
              {reviewAudio && (
                <AudioReview
                  key={reviewAudio.result.audioUrl}
                  media={reviewAudio}
                  onPlay={() => {
                    stopSsml.current?.();
                    stopReference.current?.();
                  }}
                />
              )}
              {audioError && (
                <Alert
                  type="warning"
                  showIcon
                  title="音频加载失败或链接已过期，请重新生成试听。"
                />
              )}
              <Typography.Text type="secondary">
                {audioError
                  ? "请重新点击试听。"
                  : "若未自动播放，请点击播放按钮。"}
              </Typography.Text>
            </Flex>
          </div>
        )}
      </div>
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
    (Object.keys(defaults) as (keyof Parameters)[]).every(
      (key) => formValues[key] === defaults[key]
    );
  const refreshButton = (
    <Button
      type="text"
      icon={<ReloadOutlined />}
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
      <Breadcrumb
        items={[
          { title: "配音中心" },
          { title: tab === "library" ? "音色库" : "分组配音" }
        ]}
      />
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
        className="voice-library-content"
        title={tab === "groups" ? "分组配音" : undefined}
        extra={tab === "groups" ? refreshButton : undefined}
      >
        {tab === "groups" && auditionPanel}
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
                  type="primary"
                  aria-label="试听当前参数"
                  icon={<PlayCircleOutlined />}
                  disabled={
                    settingsBusy ||
                    !canGenerate ||
                    !trialReady ||
                    !!voiceTrialIssue(selected, voiceTrial(selected)) ||
                    selected.synthesis_available === false
                  }
                  loading={pendingVoice === selected.alias}
                  onClick={() => void auditionDraft()}
                >
                  试听当前参数
                </Button>
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
                  "style" in changed
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
                    (!values.style ||
                      capabilities.styles.includes(values.style))
                  )
                    setTrialParameters((current) => ({
                      ...current,
                      [selected.alias]: {
                        rate_percent: values.rate_percent,
                        pitch_semitones: values.pitch_semitones,
                        volume_percent: values.volume_percent,
                        style: values.style
                      }
                    }));
                }
                updateDirty(values);
                setSaveMessage(null);
              }}
            >
              <section
                className="voice-library-settings-section voice-trial-workbench"
                aria-label="调节声音"
              >
                <section
                  className="voice-trial-parameter-column"
                  aria-label="声音参数"
                >
                  <Flex
                    className="voice-library-parameters-heading"
                    justify="space-between"
                    align="center"
                    gap={8}
                  >
                    <Typography.Text strong>声音参数</Typography.Text>
                    <Button
                      type="text"
                      size="small"
                      icon={<UndoOutlined />}
                      aria-label="恢复默认参数"
                      disabled={settingsBusy || parametersAreDefault}
                      onClick={() => {
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
                    >
                      重置
                    </Button>
                  </Flex>
                  {capabilities.supports_volume_percent === false && (
                    <Alert type="info" showIcon title="此音色使用固定参数" />
                  )}
                  <div className="voice-library-parameters">
                    <Form.Item
                      name="volume_percent"
                      label={
                        <span className="voice-library-volume-label">
                          音量
                          <span
                            className="voice-library-muted-status"
                            role="status"
                          >
                            {formValues?.volume_percent === 0 ? "已静音" : ""}
                          </span>
                        </span>
                      }
                      tooltip="100% 为原音量，0% 为静音。"
                      rules={[
                        {
                          required: true,
                          type: "integer",
                          min:
                            capabilities.supports_volume_percent === false
                              ? 100
                              : 0,
                          max: 100,
                          message:
                            capabilities.supports_volume_percent === false
                              ? "该模型仅支持原音量，请明确恢复默认参数"
                              : "请输入 0 至 100 的整数"
                        }
                      ]}
                    >
                      <SpeechVolumeInput
                        disabled={
                          settingsBusy ||
                          capabilities.supports_volume_percent === false
                        }
                      />
                    </Form.Item>
                    <div className="voice-library-parameter-grid">
                      <Form.Item
                        name="rate_percent"
                        label="语速"
                        rules={[
                          {
                            required: true,
                            type: "integer",
                            min: Math.max(-70, capabilities.min_rate_percent),
                            max: Math.min(70, capabilities.max_rate_percent),
                            message: `请输入 ${((100 + Math.max(-70, capabilities.min_rate_percent)) / 100).toFixed(2)} 至 ${((100 + Math.min(70, capabilities.max_rate_percent)) / 100).toFixed(2)} 倍速`
                          }
                        ]}
                        tooltip={
                          capabilities.min_rate_percent ===
                          capabilities.max_rate_percent
                            ? "该音色使用固定语速。"
                            : "1.00× 为标准语速。"
                        }
                      >
                        <SpeechRateInput
                          compact
                          aria-label="合成语速"
                          min={capabilities.min_rate_percent}
                          max={capabilities.max_rate_percent}
                          disabled={
                            settingsBusy ||
                            capabilities.min_rate_percent ===
                              capabilities.max_rate_percent
                          }
                          style={{ width: "100%" }}
                        />
                      </Form.Item>
                      <Form.Item
                        name="pitch_semitones"
                        label="音调"
                        rules={[
                          {
                            required: true,
                            type: "integer",
                            min: capabilities.min_pitch_semitones,
                            max: capabilities.max_pitch_semitones,
                            message: `请输入 ${capabilities.min_pitch_semitones} 至 ${capabilities.max_pitch_semitones} 的整数`
                          }
                        ]}
                        tooltip={
                          capabilities.min_pitch_semitones ===
                          capabilities.max_pitch_semitones
                            ? "该音色使用固定音调。"
                            : "0 保持原音调，正数升高，负数降低。"
                        }
                      >
                        <InputNumber
                          aria-label="音调"
                          suffix="半音"
                          min={capabilities.min_pitch_semitones}
                          max={capabilities.max_pitch_semitones}
                          disabled={
                            settingsBusy ||
                            capabilities.min_pitch_semitones ===
                              capabilities.max_pitch_semitones
                          }
                          style={{ width: "100%" }}
                        />
                      </Form.Item>
                    </div>
                    <Form.Item name="style" label="说话风格">
                      <Select
                        aria-label="说话风格"
                        disabled={settingsBusy}
                        options={[
                          { value: "", label: "默认" },
                          ...capabilities.styles.map((style) => ({
                            value: style,
                            label: styleNames[style] ?? style
                          }))
                        ]}
                      />
                    </Form.Item>
                  </div>
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
                </section>
                <div className="voice-trial-audition-column">
                  <Flex
                    className="voice-trial-editor-heading"
                    align="center"
                    justify="space-between"
                    gap={12}
                  >
                    <Typography.Text strong>发音标注</Typography.Text>
                    {trialSources[selected.alias] && (
                      <Button
                        type="link"
                        size="small"
                        disabled={settingsBusy}
                        onClick={restoreCommonText}
                      >
                        恢复共用文本
                      </Button>
                    )}
                  </Flex>
                  <VoiceTrialEditor
                    key={selected.alias}
                    voice={selected}
                    source={selectedTrial!}
                    canReadWords={canViewWords}
                    readOnly={settingsBusy}
                    onValidationChange={setTrialReady}
                    onChange={(source) => {
                      cancelPreview();
                      setTrialSources((current) => ({
                        ...current,
                        [selected.alias]: source
                      }));
                    }}
                  />
                  {voiceTrialIssue(selected, selectedTrial!) && (
                    <Alert
                      type="warning"
                      showIcon
                      title={voiceTrialIssue(selected, selectedTrial!)}
                    />
                  )}
                  <div className="voice-library-settings-preview">
                    <Flex
                      className="voice-library-preview-heading"
                      align="center"
                      justify="space-between"
                      gap={12}
                    >
                      <Typography.Text strong>音频审听</Typography.Text>
                      <Select
                        className="voice-library-output-format"
                        aria-label="试听输出格式"
                        value={outputFormat}
                        options={[
                          { value: "mp3", label: "MP3" },
                          { value: "wav", label: "WAV" }
                        ]}
                        onChange={(value) => {
                          cancelPreview();
                          setTrialSources((current) => ({
                            ...current,
                            [selected.alias]: {
                              ...voiceTrial(selected),
                              output_format: value
                            }
                          }));
                        }}
                      />
                    </Flex>
                    {previewView()}
                    <ReferenceAudio
                      registerStop={registerReferenceStop}
                      onPlay={() => {
                        player.current?.pause();
                        stopSsml.current?.();
                      }}
                    />
                  </div>
                  <Collapse
                    ghost
                    className="voice-library-tools"
                    styles={{ body: { padding: "0 0 8px" } }}
                    activeKey={ssmlExpanded ? ["tools"] : []}
                    onChange={(keys) => {
                      setSsmlExpanded(keys.includes("tools"));
                      if (!keys.includes("tools")) {
                        stopSsml.current?.();
                      }
                    }}
                    items={[
                      {
                        key: "tools",
                        label: "SSML",
                        forceRender: true,
                        children: (
                          <>
                            {canGenerate && (
                              <SsmlReview
                                key={selected.alias}
                                singleVoice
                                expanded={ssmlExpanded}
                                adapter={selectedTrialAdapter}
                                content={selectedTrial!.content}
                                settings={[
                                  voiceTrialSetting(
                                    selected,
                                    voiceParameters(selected),
                                    outputFormat
                                  )
                                ]}
                                onPlay={() => {
                                  player.current?.pause();
                                  stopReference.current?.();
                                }}
                                registerStop={registerSsmlStop}
                              />
                            )}
                          </>
                        )
                      }
                    ]}
                  />
                </div>
              </section>
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
                      "style"
                    ]);
                    return {
                      rate_percent: values.rate_percent,
                      pitch_semitones: values.pitch_semitones,
                      ...(values.volume_percent === 100
                        ? {}
                        : { volume_percent: values.volume_percent }),
                      style: values.style || null
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
