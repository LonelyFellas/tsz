import { PlayCircleOutlined, ReloadOutlined } from "@ant-design/icons";
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
  Button,
  Card,
  Checkbox,
  Drawer,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
  Result,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography
} from "antd";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { UNSAFE_DataRouterContext, useBlocker } from "react-router-dom";
import { useUnsavedChanges } from "@tsz/shared/recovery";
import { api, useAnyPermission, useAuthStore, usePermission } from "@/lib/auth";
import { DubbingGroups } from "./DubbingGroups";
import { AddRecommendation } from "./AddRecommendation";
import "./voice-library.css";

interface Parameters {
  rate_percent: number;
  pitch_semitones: number;
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
const styleNames: Record<string, string> = {
  cheerful: "愉快",
  sad: "悲伤",
  angry: "生气",
  excited: "兴奋",
  friendly: "友好",
  hopeful: "充满希望",
  calm: "平静",
  chat: "日常交流",
  whispering: "耳语",
  shouting: "高声",
  terrified: "惊恐",
  unfriendly: "冷淡",
  empathetic: "共情",
  newscast: "新闻播报",
  "newscast-casual": "轻松播报",
  "newscast-formal": "正式播报",
  customerservice: "客户服务",
  "narration-professional": "专业叙述"
};

function initialParameters(voice: AdminSpeechVoice): Parameters {
  const c = voice.capabilities;
  return {
    rate_percent: Math.max(c.min_rate_percent, Math.min(0, c.max_rate_percent)),
    pitch_semitones: Math.max(
      c.min_pitch_semitones,
      Math.min(0, c.max_pitch_semitones)
    ),
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
      离开后将丢弃当前参数、听感或介绍的修改。
    </Modal>
  ) : null;
}

export function VoiceLibrary() {
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
  const [tab, setTab] = useState("library");
  const [query, setQuery] = useState("");
  const [locale, setLocale] = useState<string>();
  const [gender, setGender] = useState<string>();
  const [commonOnly, setCommonOnly] = useState(false);
  const [sort, setSort] = useState("recommended");
  const [text, setText] = useState(
    "Please record the interview before the meeting starts."
  );
  const [selected, setSelected] = useState<AdminSpeechVoice | null>(null);
  const [addingRecommendation, setAddingRecommendation] = useState(false);
  const [recommendationPending, setRecommendationPending] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);
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
        (Object.keys(baseline) as (keyof VoiceForm)[]).some(
          (key) => values[key] !== baseline[key]
        )
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
    const saved = metadata.get(voice.alias)?.parameters;
    return saved
      ? { ...saved, style: saved.style ?? "" }
      : initialParameters(voice);
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

  async function audition(
    voice: AdminSpeechVoice,
    parameters = voiceParameters(voice)
  ) {
    if (!canGenerate || !validText) return;
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
        "style"
      ]);
      if (session !== editSession.current) return;
      await audition(selected, parameters);
    } catch {
      // Form keeps invalid values visible beside the corresponding fields.
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
        kind === "personal"
          ? ["rate_percent", "pitch_semitones", "style", "notes"]
          : ["description_zh"]
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
              parameters: {
                rate_percent: values.rate_percent,
                pitch_semitones: values.pitch_semitones,
                style: values.style || null
              },
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
      queryClient.setQueryData<AdminVoiceLibraryResponse>(
        ["admin-speech-library", accountId],
        (current) => ({
          items: current?.items.map((item) =>
            item.voice_alias === saved.voice_alias ? saved : item
          ) ?? [saved]
        })
      );
      if (kind === "personal") {
        setBasePersonalRevision(saved.personal_revision);
        settingsBaseline.current = {
          ...settingsBaseline.current!,
          rate_percent: values.rate_percent,
          pitch_semitones: values.pitch_semitones,
          style: values.style,
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
          ? "个人参数与听感已保存，仅你可见。"
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
      setBaseDescriptionRevision(item?.description_revision ?? 0);
      const values = {
        ...(item?.parameters
          ? { ...item.parameters, style: item.parameters.style ?? "" }
          : initialParameters(selected)),
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
      content: "关闭会丢弃当前参数、听感或介绍的修改。",
      okText: "放弃修改",
      cancelText: "继续编辑",
      onOk: close
    });
  }

  function previewView() {
    return (
      <div aria-live="polite">
        {pendingVoice && (
          <Typography.Paragraph type="secondary">
            正在生成试听…
          </Typography.Paragraph>
        )}
        {error && <Alert type="error" showIcon title={error} />}
        {preview && (
          <Card size="small" className="voice-library-player">
            <Flex vertical gap={8}>
              <Space wrap>
                <Typography.Text strong>
                  {preview.voice.display_name}
                </Typography.Text>
                <Tag>
                  {localeNames[preview.voice.locale] ?? preview.voice.locale}
                </Tag>
                <Typography.Text type="secondary">
                  语速{" "}
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
                试听音频未保存到词条。若未自动播放，请点击播放按钮。
              </Typography.Text>
            </Flex>
          </Card>
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
  return (
    <div className="voice-library">
      {router && tab === "library" && (
        <VoiceSettingsNavigationGuard
          dirty={settingsDirty}
          busy={settingsBusy}
        />
      )}
      <Flex justify="space-between" align="center" wrap gap={12}>
        <div>
          <Typography.Title level={2} style={{ margin: 0 }}>
            音色库
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ margin: "8px 0 0" }}>
            用同一段文本比较英式与美式声音，选择适合内容的音色。
          </Typography.Paragraph>
        </div>
        <Button
          icon={<ReloadOutlined />}
          loading={voices.isFetching}
          onClick={() => {
            cancelPreview();
            void voices.refetch();
            void library.refetch();
          }}
        >
          刷新音色
        </Button>
      </Flex>
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
      <Card size="small">
        <Form layout="vertical">
          <Form.Item
            label="共用试听文本"
            validateStatus={!validText ? "error" : undefined}
            help={!validText ? "请输入 1–500 个字符的试听文本。" : undefined}
          >
            <Input.TextArea
              aria-label="共用试听文本"
              value={text}
              rows={3}
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
      </Card>
      <Tabs
        activeKey={tab}
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
          { key: "library", label: "全部音色" },
          { key: "groups", label: "分组配音" }
        ]}
      />
      {tab === "groups" ? (
        <DubbingGroups
          onDirtyChange={setGroupsDirty}
          onInvalidatePreview={cancelPreview}
          voices={voices.data?.items ?? []}
          canAudition={canGenerate && validText}
          onAudition={(voice, item) =>
            void audition(voice, {
              ...item.parameters,
              style: item.parameters.style ?? ""
            })
          }
        />
      ) : (
        <Card size="small">
          <div className="voice-library-filters">
            <Input.Search
              type="search"
              aria-label="搜索音色"
              placeholder="搜索音色名称"
              value={query}
              allowClear
              onChange={(event) => setQuery(event.target.value)}
            />
            <Select
              aria-label="口音"
              placeholder="全部口音"
              value={locale}
              allowClear
              onChange={setLocale}
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
              onChange={setGender}
              options={[
                { value: "female", label: "女声" },
                { value: "male", label: "男声" }
              ]}
            />
            <Select
              aria-label="排序"
              value={sort}
              onChange={setSort}
              options={[
                { value: "recommended", label: "常用优先" },
                { value: "asc", label: "名称升序" },
                { value: "desc", label: "名称倒序" }
              ]}
            />
            <Checkbox
              checked={commonOnly}
              onChange={(event) => setCommonOnly(event.target.checked)}
            >
              只看常用
            </Checkbox>
            <Button
              type="link"
              onClick={() => {
                setQuery("");
                setLocale(undefined);
                setGender(undefined);
                setCommonOnly(false);
                setSort("recommended");
              }}
            >
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
              <Typography.Paragraph type="secondary">
                共 {rows.length} 个音色
              </Typography.Paragraph>
              {voices.isPending && <Card loading aria-label="正在加载音色" />}
              {!rows.length && !voices.isPending && (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    voices.data?.items.length
                      ? "没有匹配的音色，请调整筛选条件。"
                      : "暂无可用音色，请联系管理员检查语音服务配置。"
                  }
                />
              )}
              {["female", "male", "other"].map((group) => {
                const items = rows.filter((voice) =>
                  group === "other"
                    ? !["female", "male"].includes(voice.gender.toLowerCase())
                    : voice.gender.toLowerCase() === group
                );
                if (!items.length) return null;
                return (
                  <section
                    key={group}
                    aria-label={`${genderNames[group] ?? "未标注"}音色`}
                  >
                    <Typography.Title level={4}>
                      {genderNames[group] ?? "未标注"}（{items.length}）
                    </Typography.Title>
                    <Table<AdminSpeechVoice>
                      rowKey="alias"
                      dataSource={items}
                      loading={voices.isPending}
                      scroll={{ x: 760 }}
                      pagination={{
                        defaultPageSize: 10,
                        showSizeChanger: true,
                        pageSizeOptions: [10, 20, 50],
                        hideOnSinglePage: true
                      }}
                      locale={{
                        emptyText: (
                          <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description={
                              voices.data?.items.length
                                ? "没有匹配的音色，请调整筛选条件。"
                                : "暂无可用音色，请联系管理员检查语音服务配置。"
                            }
                          />
                        )
                      }}
                      columns={[
                        {
                          title: "音色",
                          key: "voice",
                          width: 200,
                          render: (_, voice) => (
                            <Flex vertical gap={4}>
                              <Space wrap>
                                <Typography.Text strong>
                                  {voice.display_name}
                                </Typography.Text>
                                {voice.is_common && (
                                  <Tag color="blue">常用</Tag>
                                )}
                              </Space>
                              <Typography.Text
                                type="secondary"
                                className="voice-library-id"
                              >
                                {voice.alias}
                              </Typography.Text>
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
                          width: 230,
                          render: (_, voice) => (
                            <Flex vertical gap={4}>
                              <Typography.Text>
                                {metadata.get(voice.alias)?.description_zh ||
                                  "暂无中文介绍"}
                              </Typography.Text>
                              {metadata.get(voice.alias)?.description_zh && (
                                <Typography.Text type="secondary">
                                  管理员维护
                                </Typography.Text>
                              )}
                              {metadata.get(voice.alias)?.notes && (
                                <Typography.Text type="secondary">
                                  我的听感：{metadata.get(voice.alias)?.notes}
                                </Typography.Text>
                              )}
                            </Flex>
                          )
                        },
                        {
                          title: "说话风格",
                          key: "styles",
                          render: (_, voice) => (
                            <Space size={[0, 4]} wrap>
                              <Tag>自然</Tag>
                              {voice.capabilities.styles.map((style) => (
                                <Tag key={style}>
                                  {styleNames[style] ?? style}
                                </Tag>
                              ))}
                            </Space>
                          )
                        },
                        {
                          title: "操作",
                          key: "actions",
                          width: 180,
                          render: (_, voice) => (
                            <Space>
                              <Button
                                icon={<PlayCircleOutlined />}
                                aria-label={`试听 ${voice.display_name}`}
                                disabled={!canGenerate || !validText}
                                loading={pendingVoice === voice.alias}
                                onClick={() => void audition(voice)}
                              >
                                试听
                              </Button>
                              <Button
                                aria-label={`调整 ${voice.display_name} 参数`}
                                disabled={library.isPending}
                                onClick={() => openParameters(voice)}
                              >
                                参数
                              </Button>
                            </Space>
                          )
                        }
                      ]}
                    />
                  </section>
                );
              })}
            </>
          )}
        </Card>
      )}
      {!selected && previewView()}
      <Drawer
        title={selected ? `${selected.display_name} · 声音参数` : "声音参数"}
        open={!!selected}
        onClose={closeSettings}
        size={480}
        destroyOnHidden
      >
        {selected && capabilities && (
          <Flex vertical gap={20}>
            <Typography.Paragraph type="secondary">
              保存个人设置后，下次选用此音色会载入你的参数。不会修改分组推荐或已有文本。
            </Typography.Paragraph>
            <Form
              form={form}
              layout="vertical"
              disabled={settingsBusy}
              onValuesChange={(_, values: VoiceForm) => {
                cancelPreview();
                updateDirty(values);
                setSaveMessage(null);
              }}
            >
              <Form.Item
                name="rate_percent"
                label="合成语速（相对标准语速 %）"
                rules={[
                  {
                    required: true,
                    type: "integer",
                    min: capabilities.min_rate_percent,
                    max: capabilities.max_rate_percent,
                    message: `请输入 ${capabilities.min_rate_percent} 至 ${capabilities.max_rate_percent} 的整数`
                  }
                ]}
                extra={
                  capabilities.min_rate_percent ===
                  capabilities.max_rate_percent
                    ? "该音色使用固定语速。"
                    : "0 为标准语速，-25 为 0.75 倍，25 为 1.25 倍。"
                }
              >
                <InputNumber
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
                label="音调（半音）"
                rules={[
                  {
                    required: true,
                    type: "integer",
                    min: capabilities.min_pitch_semitones,
                    max: capabilities.max_pitch_semitones,
                    message: `请输入 ${capabilities.min_pitch_semitones} 至 ${capabilities.max_pitch_semitones} 的整数`
                  }
                ]}
                extra={
                  capabilities.min_pitch_semitones ===
                  capabilities.max_pitch_semitones
                    ? "该音色使用固定音调。"
                    : "0 保持原音调，正数升高，负数降低。"
                }
              >
                <InputNumber
                  aria-label="音调"
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
              <Space wrap>
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
                  onClick={() => {
                    cancelPreview();
                    const defaults = initialParameters(selected);
                    form.setFieldsValue(defaults);
                    updateDirty(form.getFieldsValue());
                    setSaveMessage(null);
                  }}
                >
                  恢复默认参数
                </Button>
              </Space>
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
              <Button
                loading={saving === "personal"}
                disabled={!library.isSuccess || settingsBusy}
                onClick={() => void save("personal")}
              >
                保存个人参数与听感
              </Button>
              <Form.Item
                name="description_zh"
                label="中文介绍"
                style={{ marginTop: 24 }}
                extra="由管理员共享维护，不代表官方原文。"
                rules={[
                  {
                    validator: (_, value: string) =>
                      Array.from(value ?? "").length <= 3000
                        ? Promise.resolve()
                        : Promise.reject(new Error("介绍最多 3000 个字符"))
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
            </Form>
            {canEditDescription &&
              (addingRecommendation ? (
                <AddRecommendation
                  onBusyChange={setRecommendationPending}
                  voice={selected}
                  onClose={() => setAddingRecommendation(false)}
                  readParameters={async () => {
                    const values = await form.validateFields([
                      "rate_percent",
                      "pitch_semitones",
                      "style"
                    ]);
                    return {
                      rate_percent: values.rate_percent,
                      pitch_semitones: values.pitch_semitones,
                      style: values.style || null
                    };
                  }}
                />
              ) : (
                <Button
                  disabled={settingsBusy}
                  onClick={() => setAddingRecommendation(true)}
                >
                  加入分组推荐
                </Button>
              ))}
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
            {previewView()}
          </Flex>
        )}
      </Drawer>
    </div>
  );
}
