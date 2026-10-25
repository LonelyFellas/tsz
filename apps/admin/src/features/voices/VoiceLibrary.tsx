import {
  PlayCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
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
  Checkbox,
  Collapse,
  Drawer,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
  Popover,
  Result,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  theme
} from "antd";
import {
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
import { GatedButton } from "@/components/GatedButton";
import { TableEmptyState } from "@/components/TableEmptyState";
import { DubbingGroups } from "./DubbingGroups";
import { AddRecommendation } from "./AddRecommendation";
import { SpeechRateInput } from "./SpeechRateInput";
import { SpeechVolumeInput } from "./SpeechVolumeInput";
import { styleNames } from "./voice-labels";
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
  male: "男声"
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
  const { token } = theme.useToken();
  const style = {
    "--voice-fill": token.colorFillAlter,
    "--voice-surface": token.colorBgContainer,
    "--voice-border": token.colorBorderSecondary,
    "--voice-primary-bg": token.colorPrimaryBg,
    "--voice-muted": token.colorTextTertiary,
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
  const [groupsDirty, setGroupsDirty] = useState(false);
  const [tab, setTab] = useState("groups");
  const [query, setQuery] = useState("");
  const [locale, setLocale] = useState<string>();
  const [gender, setGender] = useState<string>();
  const [commonOnly, setCommonOnly] = useState(false);
  const [sort, setSort] = useState("recommended");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
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
  const controller = useRef<AbortController | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const [form] = Form.useForm<VoiceForm>();
  const formValues = Form.useWatch<VoiceForm>([], form);
  const canEditDescription = usePermission("speech.global_dubbing");
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState<"personal" | "description" | null>(null);
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
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (voices.data?.items ?? [])
      .filter(
        (voice) =>
          (!needle ||
            `${voice.display_name} ${voice.alias} ${metadata.get(voice.alias)?.description_zh ?? ""} ${metadata.get(voice.alias)?.notes ?? ""}`
              .toLowerCase()
              .includes(needle)) &&
          (!locale || voice.locale === locale) &&
          (!gender || voice.gender.toLowerCase() === gender) &&
          (!commonOnly || voice.is_common)
      )
      .sort((a, b) => {
        if (sort === "recommended" && a.is_common !== b.is_common)
          return Number(b.is_common) - Number(a.is_common);
        const order = a.display_name.localeCompare(b.display_name, "en", {
          numeric: true
        });
        return (
          (sort === "desc" ? -order : order) || a.alias.localeCompare(b.alias)
        );
      });
  }, [voices.data, metadata, query, locale, gender, commonOnly, sort]);
  const hasFilters =
    !!query || !!locale || !!gender || commonOnly || sort !== "recommended";
  function resetFilters() {
    setQuery("");
    setLocale(undefined);
    setGender(undefined);
    setCommonOnly(false);
    setSort("recommended");
    setPage(1);
  }

  function cancelPreview() {
    controller.current?.abort();
    controller.current = null;
    player.current?.pause();
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
    if (!canGenerate || !validText || (!parameters && library.isPending))
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

  function openParameters(voice: AdminSpeechVoice) {
    if (settingsBusy) return;
    editSession.current += 1;
    cancelPreview();
    setSelected(voice);
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
        {!pendingVoice && !error && !preview && (
          <div className="voice-library-preview-empty">
            <SoundOutlined />
            <Typography.Text type="secondary">
              {selected
                ? "调整参数后，点击试听"
                : "点击音色旁的试听，比较声音效果"}
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
                onPlay={() => {
                  if (Date.parse(preview.expires_at) <= Date.now()) {
                    player.current?.pause();
                    setAudioError(true);
                  }
                }}
                onError={() => setAudioError(true)}
              />
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
      {router && tab === "library" && (
        <VoiceSettingsNavigationGuard
          dirty={settingsDirty}
          busy={settingsBusy}
        />
      )}
      <Breadcrumb items={[{ title: "配音中心" }]} />
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
        <div className="voice-library-heading">
          <Typography.Title level={2}>配音中心</Typography.Title>
          <Typography.Paragraph type="secondary">
            按板块整理推荐配音，也可以到音色库试听和选择声音。
          </Typography.Paragraph>
        </div>
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
            if (groupsDirty) {
              modal.info({
                title: "分组还有未保存的修改",
                content: "请先保存分组，或点击取消编辑后切换。",
                okText: "继续编辑"
              });
              return;
            }
            cancelPreview();
            setTab(value);
          }}
          items={[
            { key: "groups", label: "分组配音" },
            { key: "library", label: "音色库" }
          ]}
        />
        <section className="voice-library-audition" aria-label="音色试听">
          <Form layout="vertical" className="voice-library-audition-text">
            <Form.Item
              label={
                <Space size={8}>
                  <Typography.Text strong>试听文本</Typography.Text>
                  <Typography.Text type="secondary">
                    用同一段话比较音色
                  </Typography.Text>
                </Space>
              }
              validateStatus={!validText ? "error" : undefined}
              help={!validText ? "请输入 1–500 个字符的试听文本。" : undefined}
            >
              <Input.TextArea
                aria-label="共用试听文本"
                value={text}
                autoSize={{ minRows: 2, maxRows: 4 }}
                onChange={(event) => {
                  cancelPreview();
                  setText(event.target.value);
                }}
                count={{
                  show: true,
                  strategy: (value) => Array.from(value).length,
                  max: 500
                }}
              />
            </Form.Item>
          </Form>
          {!selected && previewView()}
        </section>
        {tab === "groups" ? (
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
        ) : (
          <>
            <div className="voice-library-list-heading">
              <Typography.Title level={4}>音色列表</Typography.Title>
              <Typography.Text type="secondary">
                试听比较声音，调整参数后可加入分组推荐。
              </Typography.Text>
            </div>
            <div className="voice-library-filters">
              <Input
                type="search"
                prefix={<SearchOutlined />}
                aria-label="搜索音色"
                placeholder="搜索名称、介绍或听感"
                value={query}
                allowClear
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
              />
              <Select
                aria-label="口音"
                placeholder="全部口音"
                value={locale}
                allowClear
                onChange={(value) => {
                  setLocale(value);
                  setPage(1);
                }}
                options={[
                  { value: "en-GB", label: "英式英语" },
                  { value: "en-US", label: "美式英语" }
                ]}
              />
              <Select
                aria-label="性别"
                placeholder="全部性别"
                value={gender}
                allowClear
                onChange={(value) => {
                  setGender(value);
                  setPage(1);
                }}
                options={[
                  { value: "female", label: "女声" },
                  { value: "male", label: "男声" }
                ]}
              />
              <Select
                aria-label="排序"
                value={sort}
                onChange={(value) => {
                  setSort(value);
                  setPage(1);
                }}
                options={[
                  { value: "recommended", label: "常用优先" },
                  { value: "asc", label: "名称升序" },
                  { value: "desc", label: "名称倒序" }
                ]}
              />
              <Checkbox
                checked={commonOnly}
                onChange={(event) => {
                  setCommonOnly(event.target.checked);
                  setPage(1);
                }}
              >
                只看常用
              </Checkbox>
              <Button type="link" disabled={!hasFilters} onClick={resetFilters}>
                清除筛选
              </Button>
            </div>
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
              <>
                <Table<AdminSpeechVoice>
                  aria-label="音色列表"
                  size="middle"
                  rowKey="alias"
                  dataSource={rows}
                  loading={voices.isPending}
                  scroll={{ x: 1055 }}
                  rowClassName={(voice) =>
                    voice.alias === (pendingVoice ?? preview?.voice.alias)
                      ? "voice-library-row-active"
                      : ""
                  }
                  pagination={{
                    current: page,
                    pageSize,
                    onChange: (nextPage, nextPageSize) => {
                      setPage(nextPageSize === pageSize ? nextPage : 1);
                      setPageSize(nextPageSize);
                    },
                    showSizeChanger: true,
                    pageSizeOptions: [10, 20, 50],
                    showTotal: (total) => `共 ${total} 个音色`
                  }}
                  locale={{
                    emptyText: (
                      <TableEmptyState
                        filtered={hasFilters && !!voices.data?.items.length}
                        onResetFilters={resetFilters}
                        message="暂无可用音色，请联系管理员检查语音服务配置。"
                      />
                    )
                  }}
                  columns={[
                    {
                      title: "音色",
                      key: "voice",
                      width: 320,
                      render: (_, voice) => (
                        <Flex align="center" gap={12}>
                          <GatedButton
                            shape="circle"
                            icon={<PlayCircleOutlined />}
                            aria-label={`试听 ${voice.display_name}`}
                            disabled={
                              !canGenerate || !validText || library.isPending
                            }
                            reason={
                              !canGenerate
                                ? "需要词库查看和语音生成权限"
                                : library.isPending
                                  ? "正在加载个人音色设置"
                                  : "请输入 1–500 个字符的试听文本"
                            }
                            loading={pendingVoice === voice.alias}
                            onClick={() => void audition(voice)}
                          />
                          <Space size={8} wrap>
                            <Tooltip title={voice.alias}>
                              <Typography.Text strong>
                                {voice.display_name}
                              </Typography.Text>
                            </Tooltip>
                            {voice.is_common && <Tag color="blue">常用</Tag>}
                          </Space>
                        </Flex>
                      )
                    },
                    {
                      title: "口音",
                      dataIndex: "locale",
                      width: 110,
                      render: (value: string) => localeNames[value] ?? value
                    },
                    {
                      title: "性别",
                      dataIndex: "gender",
                      width: 75,
                      render: (value: string) =>
                        genderNames[value.toLowerCase()] ?? "未标注"
                    },
                    {
                      title: "介绍与听感",
                      key: "description",
                      width: 300,
                      render: (_, voice) => {
                        const info = metadata.get(voice.alias);
                        return (
                          <Flex vertical gap={4}>
                            {(info?.description_zh || !info?.notes) && (
                              <Typography.Paragraph
                                className="voice-library-description"
                                type={
                                  info?.description_zh ? undefined : "secondary"
                                }
                                ellipsis={{
                                  rows: 2,
                                  tooltip: info?.description_zh
                                }}
                              >
                                {info?.description_zh || "暂无介绍"}
                              </Typography.Paragraph>
                            )}
                            {info?.notes && (
                              <Typography.Paragraph
                                className="voice-library-description"
                                type="secondary"
                                ellipsis={{ rows: 1, tooltip: info.notes }}
                              >
                                我的听感：{info.notes}
                              </Typography.Paragraph>
                            )}
                          </Flex>
                        );
                      }
                    },
                    {
                      title: "支持的风格",
                      key: "styles",
                      width: 160,
                      render: (_, voice) =>
                        voice.capabilities.styles.length ? (
                          <Popover
                            trigger="click"
                            title={`${voice.display_name} 支持的风格`}
                            content={
                              <div className="voice-library-style-options">
                                <Space size={[4, 8]} wrap>
                                  <Tag>自然</Tag>
                                  {voice.capabilities.styles.map((value) => (
                                    <Tag key={value}>
                                      {styleNames[value] ?? value}
                                    </Tag>
                                  ))}
                                </Space>
                                <Typography.Paragraph type="secondary">
                                  在音色设置中选择试听风格。
                                </Typography.Paragraph>
                              </div>
                            }
                          >
                            <Button
                              type="link"
                              size="small"
                              aria-label={`查看 ${voice.display_name} 支持的风格`}
                            >
                              {voice.capabilities.styles.length + 1} 种风格
                            </Button>
                          </Popover>
                        ) : (
                          <Typography.Text type="secondary">
                            仅自然
                          </Typography.Text>
                        )
                    },
                    {
                      title: "操作",
                      key: "actions",
                      width: 90,
                      fixed: "right",
                      render: (_, voice) => (
                        <Button
                          type="link"
                          size="small"
                          aria-label={`调整 ${voice.display_name} 参数`}
                          disabled={library.isPending}
                          onClick={() => openParameters(voice)}
                        >
                          设置
                        </Button>
                      )
                    }
                  ]}
                />
              </>
            )}
          </>
        )}
      </Card>
      <Drawer
        className="voice-library-settings"
        style={style}
        title={selected ? `${selected.display_name} 音色设置` : "音色设置"}
        open={!!selected}
        onClose={closeSettings}
        size={520}
        destroyOnHidden
        footer={
          <Flex justify="space-between" align="center" wrap gap={12}>
            <Typography.Text type="secondary">
              {settingsDirty ? "有未保存的修改" : "个人设置仅你可见"}
            </Typography.Text>
            <Space>
              <Button disabled={settingsBusy} onClick={closeSettings}>
                关闭
              </Button>
              <Button
                type="primary"
                loading={saving === "personal"}
                disabled={!library.isSuccess || settingsBusy}
                onClick={() => void save("personal")}
              >
                保存听感
              </Button>
            </Space>
          </Flex>
        }
      >
        {selected && capabilities && (
          <Flex vertical gap={16}>
            <Flex vertical gap={8}>
              <Space>
                <Tag>{localeNames[selected.locale] ?? selected.locale}</Tag>
                <Tag>
                  {genderNames[selected.gender.toLowerCase()] ?? "未标注"}
                </Tag>
                {selected.is_common && <Tag color="blue">常用</Tag>}
              </Space>
              <Typography.Text
                type="secondary"
                className="voice-library-id"
                copyable
              >
                {selected.alias}
              </Typography.Text>
            </Flex>
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
              <section
                className="voice-library-settings-section"
                aria-label="个人设置"
              >
                <Typography.Title level={5}>调节声音</Typography.Title>
                <Typography.Paragraph
                  className="voice-library-settings-intro"
                  type="secondary"
                >
                  参数仅用于本次试听，刷新后恢复默认；加入分组推荐时保存当前参数。
                </Typography.Paragraph>
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
                        min: 0,
                        max: 100,
                        message: "请输入 0 至 100 的整数"
                      }
                    ]}
                  >
                    <SpeechVolumeInput disabled={settingsBusy} />
                  </Form.Item>
                  <div className="voice-library-parameter-grid">
                    <Form.Item
                      name="rate_percent"
                      label="语速"
                      rules={[
                        {
                          required: true,
                          type: "integer",
                          min: capabilities.min_rate_percent,
                          max: capabilities.max_rate_percent,
                          message: `请输入 ${((100 + capabilities.min_rate_percent) / 100).toFixed(2)} 至 ${((100 + capabilities.max_rate_percent) / 100).toFixed(2)} 倍速`
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
                      type="primary"
                      aria-label="试听当前参数"
                      icon={<PlayCircleOutlined />}
                      disabled={settingsBusy || !canGenerate || !validText}
                      loading={pendingVoice === selected.alias}
                      onClick={() => void auditionDraft()}
                    >
                      试听当前参数
                    </Button>
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
                </div>
                {canEditDescription && (
                  <Button
                    className="voice-library-recommend-action"
                    disabled={settingsBusy}
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
                          : Promise.reject(new Error("听感最多 3000 个字符"))
                    }
                  ]}
                >
                  <Input.TextArea
                    aria-label="我的听感"
                    rows={3}
                    placeholder="记录适合的语速、发音特点和使用场景，仅你可见"
                  />
                </Form.Item>
              </section>
              <Collapse
                className="voice-library-shared-description"
                items={[
                  {
                    key: "description",
                    label: "共享介绍",
                    extra: (
                      <Typography.Text type="secondary">
                        所有管理员可见
                      </Typography.Text>
                    ),
                    forceRender: true,
                    children: (
                      <>
                        <Form.Item
                          name="description_zh"
                          label="中文介绍"
                          extra="单独保存，不影响个人参数与听感。"
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
                            loading={saving === "description"}
                            disabled={!library.isSuccess || settingsBusy}
                            onClick={() => void save("description")}
                          >
                            保存共享介绍
                          </Button>
                        )}
                      </>
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
