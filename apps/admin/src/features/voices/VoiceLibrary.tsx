import { speechAccentGroup, speechRegionLabel } from "@tsz/shared";
import {
  PlayCircleOutlined,
  ReloadOutlined,
  SoundOutlined
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
  Drawer,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
  Result,
  Select,
  Space,
  Tabs,
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
  language,
  accentNames,
  voiceAccent,
  VoiceCatalogDetails,
  VoiceCatalogTable
} from "./VoiceCatalogTable";
import { DubbingGroups } from "./DubbingGroups";
import { DubbingDrafts } from "./DubbingDrafts";
import { AddRecommendation } from "./AddRecommendation";
import { SpeechRateInput } from "./SpeechRateInput";
import { SpeechVolumeInput } from "./SpeechVolumeInput";
import { styleNames } from "./voice-labels";
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
  description_zh: string;
}

interface Preview extends AdminSpeechPreviewResponse {
  voice: AdminSpeechVoice;
  parameters: Parameters;
}

const localeNames: Record<string, string> = {
  "en-GB": "英式英语",
  "en-US": "美式英语"
};
const genderNames: Record<string, string> = {
  female: "女声",
  male: "男声",
  neutral: "中性"
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
      离开后将丢弃尚未保存的听感或介绍。
    </Modal>
  ) : null;
}

export function VoiceLibrary() {
  const accountId = useAuthStore((state) => state.profile?.id);
  return (
    <DubbingDrafts key={accountId}>
      <VoiceLibraryContent />
    </DubbingDrafts>
  );
}

function VoiceLibraryContent() {
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
  const [tab, setTab] = useState("groups");
  const [text, setText] = useState(
    "Please record the interview before the meeting starts."
  );
  const [selected, setSelected] = useState<AdminSpeechVoice | null>(null);
  const [detailTab, setDetailTab] = useState("adjust");
  const [editingDescription, setEditingDescription] = useState(false);
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
  const [outputFormat, setOutputFormat] = useState<"mp3" | "wav">("mp3");
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
  const [saving, setSaving] = useState<
    "personal" | "description" | "accent" | "restore" | null
  >(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [basePersonalRevision, setBasePersonalRevision] = useState(0);
  const [baseDescriptionRevision, setBaseDescriptionRevision] = useState(0);
  const settingsBusy = !!saving || recommendationPending || reloading;
  useUnsavedChanges("voice-library-settings", settingsDirty || settingsBusy);
  function updateDirty(values: VoiceForm) {
    const baseline = settingsBaseline.current;
    setSettingsDirty(
      !baseline ||
        values.notes !== baseline.notes ||
        values.description_zh !== baseline.description_zh
    );
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
    if (
      !canGenerate ||
      !validText ||
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
      const result = await api.speech.preview(
        {
          content: { version: 2, text, annotations: [] },
          voice_alias: voice.alias,
          ...(outputFormat === "wav" ? { output_format: outputFormat } : {}),
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
        setError(previewError(cause));
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
    setDetailTab("adjust");
    setEditingDescription(false);
    setAddingRecommendation(false);
    setSaveError(null);
    setSaveMessage(null);
    const info = metadata.get(voice.alias);
    setBasePersonalRevision(info?.personal_revision ?? 0);
    storedParameters.current = info?.parameters ?? null;
    setBaseDescriptionRevision(info?.description_revision ?? 0);
    const values = {
      ...voiceParameters(voice),
      notes: info?.notes ?? "",
      description_zh: info?.description_zh ?? ""
    };
    form.setFieldsValue(values);
    settingsBaseline.current = values;
    setSettingsDirty(false);
  }

  function editDescription() {
    if (!selected || settingsBusy) return;
    const info = metadata.get(selected.alias);
    const description = info?.description_zh ?? "";
    form.setFieldValue("description_zh", description);
    setBaseDescriptionRevision(info?.description_revision ?? 0);
    settingsBaseline.current = {
      ...settingsBaseline.current!,
      description_zh: description
    };
    updateDirty(form.getFieldsValue());
    setEditingDescription(true);
  }

  async function auditionDraft() {
    if (!selected || settingsBusy) return;
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

  async function saveShared(
    kind: "accent" | "restore",
    accent?: import("@tsz/types").VoiceAccent
  ) {
    if (!selected || settingsBusy || !canEditDescription) return;
    const session = editSession.current;
    const item = metadata.get(selected.alias);
    if (kind === "accent" && item?.accent_revision == null) return;
    setSaving(kind);
    setSaveError(null);
    setSaveMessage(null);
    try {
      const saved =
        kind === "accent"
          ? await api.speech.saveAccent(selected.alias, {
              accent: accent!,
              base_revision: item!.accent_revision!
            })
          : await api.speech.restoreDescription(selected.alias, {
              base_revision: baseDescriptionRevision
            });
      if (
        session !== editSession.current ||
        useAuthStore.getState().profile?.id !== accountId
      )
        return;
      await queryClient.cancelQueries({
        queryKey: ["admin-speech-library", accountId],
        exact: true
      });
      if (
        session !== editSession.current ||
        useAuthStore.getState().profile?.id !== accountId
      )
        return;
      queryClient.setQueryData<AdminVoiceLibraryResponse>(
        ["admin-speech-library", accountId],
        (current) => ({
          items: (current?.items ?? []).map((value) =>
            value.voice_alias === saved.voice_alias ? saved : value
          )
        })
      );
      if (kind === "accent") {
        setSelected(
          (voice) =>
            voice && {
              ...voice,
              accent: saved.accent,
              accent_revision: saved.accent_revision
            }
        );
        await queryClient.invalidateQueries({
          queryKey: ["admin-speech-voices", accountId]
        });
        setSaveMessage(
          "口音归属已保存，官方地区和原始 locale 保持不变。已有配置不会自动换声。"
        );
      } else {
        setBaseDescriptionRevision(saved.description_revision);
        form.setFieldValue("description_zh", saved.description_zh ?? "");
        settingsBaseline.current = {
          ...settingsBaseline.current!,
          description_zh: saved.description_zh ?? ""
        };
        setEditingDescription(false);
        updateDirty(form.getFieldsValue());
        setSaveMessage(
          "已恢复官方介绍；未提供官方中文时显示缺失。个人听感已保留。"
        );
      }
    } catch (cause) {
      setSaveError(
        cause instanceof HttpError && cause.status === 409
          ? "资料已在其他页面修改，当前输入已保留，请重新载入后再试。"
          : "保存失败，当前输入已保留，请重试。"
      );
    } finally {
      setSaving(null);
    }
  }

  async function save(kind: "personal" | "description") {
    if (
      !selected ||
      settingsBusy ||
      !library.isSuccess ||
      (kind === "description" && !canEditDescription)
    )
      return;
    const session = editSession.current;
    let values: VoiceForm;
    try {
      values = await form.validateFields(
        kind === "personal" ? ["notes"] : ["description_zh"]
      );
    } catch {
      return;
    }
    if (session !== editSession.current) return;
    setSaving(kind);
    setSaveError(null);
    setSaveMessage(null);
    try {
      const saved =
        kind === "personal"
          ? await api.speech.saveSettings(selected.alias, {
              parameters: storedParameters.current,
              notes: values.notes,
              base_revision: basePersonalRevision
            })
          : await api.speech.saveDescription(selected.alias, {
              description_zh: values.description_zh,
              base_revision: baseDescriptionRevision
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
                  item.voice_alias === saved.voice_alias ? saved : item
                )
              : [...items, saved]
          };
        }
      );
      if (kind === "personal") {
        setBasePersonalRevision(saved.personal_revision);
        settingsBaseline.current = {
          ...settingsBaseline.current!,
          notes: values.notes
        };
      } else {
        setBaseDescriptionRevision(saved.description_revision);
        settingsBaseline.current = {
          ...settingsBaseline.current!,
          description_zh: values.description_zh
        };
        setEditingDescription(false);
      }
      updateDirty(form.getFieldsValue());
      setSaveMessage(
        kind === "personal"
          ? "听感已保存，仅你可见。"
          : "中文介绍已保存，所有有权查看音色的管理员可见。"
      );
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
      setBaseDescriptionRevision(item?.description_revision ?? 0);
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
        notes: item?.notes ?? "",
        description_zh: item?.description_zh ?? ""
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
      content: "关闭会丢弃尚未保存的听感或介绍。",
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
            <Typography.Text type="secondary">
              调整参数后，点击试听
            </Typography.Text>
          </div>
        )}
        {preview && (
          <div className="voice-library-player">
            <Flex vertical gap={8}>
              <Space wrap>
                <Typography.Text strong>
                  {preview.voice.display_name}
                </Typography.Text>
                <Tag>
                  {localeNames[preview.voice.locale] ?? preview.voice.locale}
                </Tag>
                <Typography.Text type="secondary">
                  本次试听：音量 {preview.parameters.volume_percent}%，
                  {((100 + preview.parameters.rate_percent) / 100).toFixed(2)}×
                  {preview.parameters.style
                    ? `，${styleNames[preview.parameters.style] ?? preview.parameters.style}`
                    : "，自然"}
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
  return (
    <div className="voice-library" style={style}>
      <Breadcrumb items={[{ title: "配音中心" }]} />
      {router && tab === "library" && (
        <VoiceSettingsNavigationGuard
          dirty={settingsDirty}
          busy={settingsBusy}
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
      <Card size="small" className="voice-library-content">
        <Tabs
          activeKey={tab}
          tabBarExtraContent={
            <Button
              type="text"
              icon={<ReloadOutlined />}
              loading={voices.isFetching || library.isFetching}
              onClick={() => {
                cancelPreview();
                void voices.refetch();
                void library.refetch();
              }}
            >
              刷新音色
            </Button>
          }
          onChange={(value) => {
            cancelPreview();
            setTab(value);
          }}
          items={[
            { key: "groups", label: "分组配音" },
            { key: "library", label: "音色库" }
          ]}
        />
        <section
          className={`voice-library-audition${tab === "library" ? " voice-library-audition-dock" : ""}`}
          aria-label="音色试听"
        >
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
          {!selected && (pendingVoice || error || preview) && previewView()}
        </section>
        <div hidden={tab !== "groups"} inert={tab !== "groups"}>
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
        </div>
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
                voices={voices.data?.items ?? []}
                metadata={metadata}
                loading={voices.isPending}
                settingsPending={library.isPending}
                canGenerate={canGenerate}
                validText={validText}
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
          selected ? (
            <Space>
              <span
                className={`voice-accent-dot voice-accent-${voiceAccent(selected)}`}
              />
              <span>{selected.display_name} 音色详情</span>
              <span>· {accentNames[voiceAccent(selected)]}</span>
            </Space>
          ) : (
            "音色详情"
          )
        }
        open={!!selected}
        onClose={closeSettings}
        size={520}
        destroyOnHidden
        footer={
          <Flex justify="space-between" align="center" wrap gap={12}>
            <Typography.Text type="secondary">
              {settingsDirty ? "有未保存的修改" : ""}
            </Typography.Text>
            <Button disabled={settingsBusy} onClick={closeSettings}>
              关闭
            </Button>
          </Flex>
        }
      >
        {selected && capabilities && (
          <Flex vertical gap={16}>
            <Space wrap>
              <Tag>{language(selected)}</Tag>
              <Tag>{speechRegionLabel(selected.locale)}</Tag>
              <Tag>
                {genderNames[selected.gender.toLowerCase()] ?? "未标注"}
              </Tag>
              {selected.is_common && <Tag color="blue">常用</Tag>}
            </Space>
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
              <Tabs
                activeKey={detailTab}
                onChange={setDetailTab}
                items={[
                  {
                    key: "adjust",
                    label: "调节声音",
                    forceRender: true,
                    children: (
                      <section
                        className="voice-library-settings-section"
                        aria-label="调节声音"
                        hidden={detailTab !== "adjust"}
                        inert={detailTab !== "adjust"}
                      >
                        <Typography.Paragraph
                          className="voice-library-settings-intro"
                          type="secondary"
                        >
                          参数仅用于本次试听，刷新后恢复默认；加入分组推荐时保存当前参数。
                        </Typography.Paragraph>
                        {capabilities.supports_volume_percent === false && (
                          <Alert
                            type="info"
                            showIcon
                            title="该模型仅支持原速、原调、原音量自然朗读；不支持停顿或指定音素。已有非默认参数需要明确恢复后再生成。"
                          />
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
                                  {formValues?.volume_percent === 0
                                    ? "已静音"
                                    : ""}
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
                                  min: Math.max(
                                    -70,
                                    capabilities.min_rate_percent
                                  ),
                                  max: Math.min(
                                    70,
                                    capabilities.max_rate_percent
                                  ),
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
                                { value: "", label: "自然" },
                                ...capabilities.styles.map((style) => ({
                                  value: style,
                                  label: styleNames[style] ?? style
                                }))
                              ]}
                            />
                          </Form.Item>
                        </div>
                        <div className="voice-library-settings-preview">
                          <Typography.Paragraph className="voice-library-sample">
                            {text}
                          </Typography.Paragraph>
                          <Flex
                            className="voice-library-preview-actions"
                            align="center"
                            gap={8}
                            wrap
                          >
                            <Button
                              className={`voice-accent-${voiceAccent(selected)}`}
                              color="default"
                              variant="solid"
                              aria-label="试听当前参数"
                              icon={<PlayCircleOutlined />}
                              disabled={
                                settingsBusy ||
                                !canGenerate ||
                                !validText ||
                                selected.synthesis_available === false
                              }
                              loading={pendingVoice === selected.alias}
                              onClick={() => void auditionDraft()}
                            >
                              试听当前参数
                            </Button>
                            <Select
                              aria-label="试听输出格式"
                              value={outputFormat}
                              options={[
                                { value: "mp3", label: "MP3" },
                                { value: "wav", label: "WAV" }
                              ]}
                              onChange={(value) => {
                                cancelPreview();
                                setOutputFormat(value);
                              }}
                            />
                            <Button
                              type="text"
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
                              恢复默认参数
                            </Button>
                          </Flex>
                          {previewView()}
                          {canGenerate && (
                            <SsmlReview
                              key={selected.alias}
                              adapter={adminVoicePreviewAdapter}
                              content={{ version: 2, text, annotations: [] }}
                              settings={[
                                {
                                  voice_id: selected.alias,
                                  version_id:
                                    "00000000-0000-4000-8000-000000000002",
                                  version_name: selected.display_name,
                                  locale: selected.locale as `en-${string}`,
                                  enabled: true,
                                  ...voiceParameters(selected),
                                  style:
                                    voiceParameters(selected).style ||
                                    undefined,
                                  output_format: outputFormat
                                }
                              ]}
                              onPlay={() => {
                                player.current?.pause();
                                stopReference.current?.();
                              }}
                              registerStop={registerSsmlStop}
                            />
                          )}
                          <ReferenceAudio
                            registerStop={registerReferenceStop}
                            onPlay={() => {
                              player.current?.pause();
                              stopSsml.current?.();
                            }}
                          />
                        </div>
                        {canEditDescription && (
                          <Button
                            className="voice-library-recommend-action"
                            disabled={
                              settingsBusy ||
                              selected.synthesis_available === false ||
                              speechAccentGroup(
                                selected.locale,
                                selected.accent
                              ) === "other"
                            }
                            title={
                              speechAccentGroup(
                                selected.locale,
                                selected.accent
                              ) === "other"
                                ? "其他地区仅作文本补充音色，不加入英美默认推荐"
                                : undefined
                            }
                            onClick={() => void openRecommendation()}
                          >
                            加入分组推荐
                          </Button>
                        )}
                        <Form.Item
                          name="notes"
                          label="我的听感"
                          style={{ marginTop: 24 }}
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
                            rows={3}
                            placeholder="记录适合的语速、发音特点和使用场景，仅你可见"
                          />
                        </Form.Item>
                        <Button
                          type="primary"
                          loading={saving === "personal"}
                          disabled={!library.isSuccess || settingsBusy}
                          onClick={() => void save("personal")}
                        >
                          保存听感
                        </Button>
                      </section>
                    )
                  },
                  {
                    key: "info",
                    label: "音色资料",
                    forceRender: true,
                    children: (
                      <section
                        hidden={detailTab !== "info"}
                        inert={detailTab !== "info"}
                      >
                        <Form.Item
                          label="当前口音归属"
                          tooltip="独立于官方地区和原始 locale，保存后供候选、标题和播放按钮使用。"
                        >
                          <Select<import("@tsz/types").VoiceAccent>
                            aria-label="当前口音归属"
                            value={voiceAccent(selected)}
                            disabled={
                              !canEditDescription ||
                              settingsBusy ||
                              metadata.get(selected.alias)?.accent_revision ==
                                null
                            }
                            options={Object.entries(accentNames).map(
                              ([value, label]) => ({ value, label })
                            )}
                            onChange={(value) =>
                              void saveShared("accent", value)
                            }
                          />
                        </Form.Item>
                        {metadata.get(selected.alias)?.accent_revision ==
                          null && (
                          <Typography.Paragraph type="secondary">
                            当前服务未提供可编辑的口音归属，请先升级 API。
                          </Typography.Paragraph>
                        )}
                        <Typography.Paragraph type="secondary">
                          原始 locale：
                          <Typography.Text code>
                            {selected.locale}
                          </Typography.Text>
                        </Typography.Paragraph>
                        <VoiceCatalogDetails
                          voice={selected}
                          description={
                            <>
                              <Flex
                                align="center"
                                justify="space-between"
                                gap={12}
                              >
                                <Typography.Text type="secondary">
                                  所有管理员可见
                                </Typography.Text>
                                {canEditDescription &&
                                  metadata.get(selected.alias)
                                    ?.description_zh != null && (
                                    <Button
                                      type="link"
                                      size="small"
                                      disabled={
                                        !library.isSuccess || settingsBusy
                                      }
                                      loading={saving === "restore"}
                                      onClick={() => void saveShared("restore")}
                                    >
                                      恢复官方介绍
                                    </Button>
                                  )}
                                {canEditDescription && !editingDescription && (
                                  <Button
                                    type="link"
                                    size="small"
                                    disabled={
                                      !library.isSuccess || settingsBusy
                                    }
                                    onClick={editDescription}
                                  >
                                    编辑
                                  </Button>
                                )}
                              </Flex>
                              <div
                                className="voice-library-description-editor"
                                hidden={!editingDescription}
                                inert={!editingDescription}
                              >
                                <Form.Item
                                  name="description_zh"
                                  rules={[
                                    {
                                      validator: (_, value: string) =>
                                        Array.from(value ?? "").length <= 3000
                                          ? Promise.resolve()
                                          : Promise.reject(
                                              new Error("介绍最多 3000 个字符")
                                            )
                                    }
                                  ]}
                                >
                                  <Input.TextArea
                                    aria-label="中文介绍"
                                    rows={3}
                                    readOnly={!canEditDescription}
                                  />
                                </Form.Item>
                                {canEditDescription && (
                                  <Button
                                    type="primary"
                                    loading={saving === "description"}
                                    disabled={
                                      !library.isSuccess || settingsBusy
                                    }
                                    onClick={() => void save("description")}
                                  >
                                    保存介绍
                                  </Button>
                                )}
                              </div>
                              {!editingDescription && (
                                <Typography.Paragraph className="voice-library-description-text">
                                  {metadata.get(selected.alias)
                                    ?.description_zh ?? "官方未提供中文介绍"}
                                </Typography.Paragraph>
                              )}
                            </>
                          }
                        />
                      </section>
                    )
                  }
                ]}
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
