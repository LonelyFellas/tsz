import { speechAccentGroup } from "@tsz/shared";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  EditOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  SaveOutlined
} from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HttpError } from "@tsz/api-client";
import type {
  AdminDubbingGroup,
  AdminDubbingRecommendation,
  AdminSpeechVoice
} from "@tsz/types";
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Collapse,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
  Segmented,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography
} from "antd";
import { useEffect, useState } from "react";
import { useDubbingDrafts } from "./DubbingDrafts";
import {
  DubbingAudioUpdates,
  DubbingAudioUpdateSettings
} from "./DubbingAudioUpdates";
import { useUnsavedChanges } from "@tsz/shared/recovery";
import { useBlocker } from "react-router-dom";
import { api, useAuthStore, usePermission } from "@/lib/auth";
import { newWordNodeId } from "@/features/dictionary/word-model/primitives";
import { SpeechRateInput } from "./SpeechRateInput";
import { styleNames } from "./voice-labels";
import "./dubbing-groups.css";

const areas = [
  { value: "word", label: "词形拼写" },
  { value: "azure", label: "Azure IPA／UPS" },
  { value: "grammar", label: "词性的语法结构" },
  { value: "meaning", label: "英文释义语句" },
  { value: "example", label: "多维例句" }
];

function recommendation(voice: AdminSpeechVoice): AdminDubbingRecommendation {
  const c = voice.capabilities;
  return {
    id: newWordNodeId(),
    name: voice.display_name,
    voice_alias: voice.alias,
    selected: true,
    parameters: {
      rate_percent: Math.max(
        c.min_rate_percent,
        Math.min(0, c.max_rate_percent)
      ),
      pitch_semitones: Math.max(
        c.min_pitch_semitones,
        Math.min(0, c.max_pitch_semitones)
      ),
      style: null
    }
  };
}

function recommendationError(
  groupName: string,
  locale: "uk" | "us",
  item: AdminDubbingRecommendation,
  voice: AdminSpeechVoice | undefined
): string | null {
  const accent = locale === "uk" ? "英式" : "美式";
  const location = `${groupName || "未命名分组"} / ${accent} / ${item.name || "未命名推荐"}`;
  if (!voice) return `${location}：音色已不可用，请重新选择${accent}音色。`;
  if (speechAccentGroup(voice.locale, voice.accent) !== locale) {
    return `${location}：音色口音与${accent}推荐不符，请重新选择${accent}音色。`;
  }
  if (!item.name.trim()) return `${location}：请填写推荐名称。`;
  const caps = voice.capabilities;
  const {
    rate_percent,
    pitch_semitones,
    volume_percent = 100,
    style
  } = item.parameters;
  if (caps.supports_volume_percent === false && volume_percent !== 100)
    return `${location}：该模型仅支持原音量，请明确恢复原音量。`;
  if (
    !Number.isInteger(volume_percent) ||
    volume_percent < 0 ||
    volume_percent > 100
  ) {
    return `${location}：音量需为 0 到 100 之间的整数，请调整音量。`;
  }
  if (
    !Number.isInteger(rate_percent) ||
    rate_percent < caps.min_rate_percent ||
    rate_percent > caps.max_rate_percent
  ) {
    return `${location}：语速需在 ${((caps.min_rate_percent + 100) / 100).toFixed(2)}×–${((caps.max_rate_percent + 100) / 100).toFixed(2)}× 之间，最多两位小数，请调整语速。`;
  }
  if (
    !Number.isInteger(pitch_semitones) ||
    pitch_semitones < caps.min_pitch_semitones ||
    pitch_semitones > caps.max_pitch_semitones
  ) {
    return `${location}：音调需为 ${caps.min_pitch_semitones} 到 ${caps.max_pitch_semitones} 之间的整数半音，请调整音调。`;
  }
  if (style != null && !caps.styles.includes(style)) {
    return `${location}：当前风格不支持，请选择“自然”或该音色支持的风格。`;
  }
  return null;
}

export function DubbingGroups({
  voices,
  onAudition,
  canAudition,
  onInvalidatePreview,
  onDirtyChange
}: {
  voices: AdminSpeechVoice[];
  onAudition: (
    voice: AdminSpeechVoice,
    item: AdminDubbingRecommendation
  ) => void;
  canAudition: boolean;
  onInvalidatePreview: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const accountId = useAuthStore((state) => state.profile?.id);
  const preferredLocale = useAuthStore((state) =>
    state.profile?.preferences.dialect === "us" ? "us" : "uk"
  );
  const [groupLocales, setGroupLocales] = useState<Record<string, "uk" | "us">>(
    {}
  );
  const canEdit = usePermission("speech.global_dubbing");
  const client = useQueryClient();
  const { modal } = App.useApp();
  const groups = useQuery({
    queryKey: ["admin-dubbing-groups", accountId],
    queryFn: ({ signal }) => api.speech.groups(signal),
    retry: false
  });
  const [drafts, setDrafts] = useDubbingDrafts();
  const [savingId, setSavingId] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [dragging, setDragging] = useState<{
    group: string;
    locale: "uk" | "us";
    id: string;
  }>();
  const [settingsDirty, setSettingsDirty] = useState(false);
  const dirty = Object.keys(drafts).length > 0 || settingsDirty;
  const saving = !!savingId;
  const blocker = useBlocker(dirty || saving);
  useUnsavedChanges("dubbing-groups", dirty || saving);
  useEffect(() => {
    onDirtyChange(dirty || saving);
    return () => onDirtyChange(false);
  }, [dirty, saving, onDirtyChange]);
  const current = groups.data && {
    ...groups.data,
    groups: [
      ...groups.data.groups.map((group) => drafts[group.id] ?? group),
      ...Object.values(drafts).filter(
        (draft) => !groups.data!.groups.some((group) => group.id === draft.id)
      )
    ]
  };
  const available = (locale: "uk" | "us") =>
    voices.filter(
      (voice) =>
        voice.synthesis_available !== false &&
        speechAccentGroup(voice.locale, voice.accent) === locale
    );
  function change(
    id: string,
    update: (group: AdminDubbingGroup) => AdminDubbingGroup
  ) {
    if (!canEdit || savingId === id) return;
    onInvalidatePreview();
    setDrafts((value) =>
      value[id] ? { ...value, [id]: update(value[id]) } : value
    );
    setSaved(false);
  }
  function updateItem(
    groupId: string,
    locale: "uk" | "us",
    id: string,
    update: (item: AdminDubbingRecommendation) => AdminDubbingRecommendation
  ) {
    change(groupId, (group) => ({
      ...group,
      [locale]: group[locale].map((item) =>
        item.id === id ? update(item) : item
      )
    }));
  }
  function discard(id: string) {
    onInvalidatePreview();
    setDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }
  function addGroup() {
    if (
      !canEdit ||
      !current ||
      current.groups.filter((group) => !group.is_global).length >= 5
    )
      return;
    const group: AdminDubbingGroup = {
      id: newWordNodeId(),
      name: "新分组",
      areas: [],
      uk: [],
      us: [],
      revision: 0,
      is_global: false
    };
    setDrafts((value) => ({ ...value, [group.id]: group }));
    setSaved(false);
  }
  async function save(id: string) {
    const draft = drafts[id];
    if (!draft || !canEdit || saving) return;
    if (!draft.name.trim()) {
      setError("请填写分组名称。");
      return;
    }
    for (const locale of ["uk", "us"] as const) {
      for (const item of draft[locale]) {
        const voice = voices.find((voice) => voice.alias === item.voice_alias);
        const issue = recommendationError(draft.name, locale, item, voice);
        const stored = groups.data?.groups
          .find((group) => group.id === id)
          ?.[locale].find((value) => value.id === item.id);
        if (
          issue &&
          (!stored ||
            JSON.stringify({
              ...stored,
              ...(item.selected === false ? { selected: false } : {})
            }) !== JSON.stringify(item))
        ) {
          setError(issue);
          return;
        }
      }
    }
    setSavingId(id);
    setError(null);
    setSaved(false);
    try {
      const result = await api.speech.saveGroup(
        draft,
        draft.revision ?? 0,
        !groups.data?.groups.some((group) => group.id === id)
      );
      await client.cancelQueries({
        queryKey: ["admin-dubbing-groups", accountId],
        exact: true
      });
      if (useAuthStore.getState().profile?.id !== accountId) return;
      client.setQueryData(["admin-dubbing-groups", accountId], result);
      discard(id);
      setSaved(true);
    } catch (cause) {
      setError(
        cause instanceof HttpError && cause.status === 409
          ? "本组已被修改或板块已被占用，草稿已保留，请取消本组并重新载入。"
          : "保存失败，本组草稿已保留，请重试。"
      );
    } finally {
      setSavingId(undefined);
    }
  }
  function removeGroup(group: AdminDubbingGroup) {
    modal.confirm({
      title: `删除「${group.name}」？`,
      content:
        "删除后板块回退全局常用或合格默认，并安排继承草稿音频更新；已发布音频保持原样。",
      okText: "删除分组",
      cancelText: "取消",
      onOk: async () => {
        if (!groups.data?.groups.some((item) => item.id === group.id)) {
          discard(group.id);
          return;
        }
        setSavingId(group.id);
        try {
          const result = await api.speech.deleteGroup(
            group.id,
            group.revision ?? 0
          );
          if (useAuthStore.getState().profile?.id !== accountId) return;
          await client.cancelQueries({
            queryKey: ["admin-dubbing-groups", accountId],
            exact: true
          });
          if (useAuthStore.getState().profile?.id !== accountId) return;
          client.setQueryData(["admin-dubbing-groups", accountId], result);
          discard(group.id);
        } catch {
          setError("删除失败或分组已更新，当前草稿保留。");
        } finally {
          setSavingId(undefined);
        }
      }
    });
  }

  if (groups.isError && !dirty)
    return (
      <Alert
        type="error"
        showIcon
        title="分组加载失败，请重试。"
        action={<Button onClick={() => void groups.refetch()}>重试</Button>}
      />
    );
  if (!current) return <Card loading />;
  const unassigned = areas.filter(
    (area) => !current.groups.some((group) => group.areas.includes(area.value))
  );

  return (
    <Flex vertical gap={16} className="dubbing-groups">
      {blocker.state === "blocked" && (
        <Modal
          open
          title="分组还有未保存的修改"
          onCancel={() => blocker.reset()}
          footer={
            <Space>
              <Button onClick={() => blocker.reset()}>继续编辑</Button>
              <Button disabled={saving} onClick={() => blocker.proceed()}>
                放弃并离开
              </Button>
            </Space>
          }
        >
          离开后将丢弃当前分组草稿。
        </Modal>
      )}
      <Flex
        className="dubbing-groups-toolbar"
        justify="space-between"
        align="center"
        wrap
        gap={12}
      >
        <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
          每组独立编辑；完成只保存本组，取消只丢弃本组草稿。
        </Typography.Paragraph>
        {canEdit && (
          <Button
            icon={<PlusOutlined aria-hidden />}
            disabled={
              saving ||
              current.groups.filter((group) => !group.is_global).length >= 5
            }
            onClick={addGroup}
          >
            新增分组
          </Button>
        )}
        {error && (
          <Alert
            type="error"
            showIcon
            title={error}
            action={
              <Button onClick={() => void groups.refetch()}>重新载入</Button>
            }
            style={{ width: "100%" }}
          />
        )}
        {saved && (
          <Alert
            type="success"
            showIcon
            title="本组配音已保存。"
            style={{ width: "100%" }}
          />
        )}
      </Flex>
      {current.groups.length === 0 && (
        <Typography.Paragraph type="secondary">
          尚未设置分组推荐
        </Typography.Paragraph>
      )}
      {unassigned.length > 0 && (
        <Typography.Text type="secondary">
          未分组：{unassigned.map((area) => area.label).join("、")}
        </Typography.Text>
      )}
      <Typography.Text type="secondary">
        分组配置保存后，自动更新继承推荐的内容草稿音频；独立配音、上传录音及已发布音频保持不变。
      </Typography.Text>
      {canEdit && (
        <Collapse
          size="small"
          items={[
            {
              key: "settings",
              label: "更新设置",
              children: (
                <DubbingAudioUpdateSettings onDirtyChange={setSettingsDirty} />
              )
            },
            {
              key: "updates",
              label: "音频更新记录（含已删除分组）",
              children: (
                <DubbingAudioUpdates revision={groups.data?.revision ?? 0} />
              )
            }
          ]}
        />
      )}
      <Form component="div" layout="vertical" className="dubbing-group-list">
        {current.groups.map((group) => {
          const draft = drafts[group.id];
          const editable = canEdit && !!draft && savingId !== group.id;
          return (
            <Card
              key={group.id}
              size="small"
              className={`dubbing-group${draft ? " is-editing" : ""}`}
            >
              <Flex
                className="dubbing-group-actions"
                justify="space-between"
                align="center"
                wrap
                gap={8}
              >
                {group.is_global && (
                  <Tag color="blue">全局常用 · 板块无已选推荐时回退</Tag>
                )}
                <Space>
                  {canEdit && !draft && (
                    <Button
                      icon={<EditOutlined aria-hidden />}
                      onClick={() =>
                        setDrafts((value) => ({
                          ...value,
                          [group.id]: structuredClone(group)
                        }))
                      }
                    >
                      编辑{group.name}
                    </Button>
                  )}
                  {draft && (
                    <>
                      <Button
                        disabled={savingId === group.id}
                        onClick={() => {
                          discard(group.id);
                          void groups.refetch();
                        }}
                      >
                        取消
                      </Button>
                      <Button
                        type="primary"
                        icon={<SaveOutlined aria-hidden />}
                        loading={savingId === group.id}
                        disabled={!canEdit || saving}
                        onClick={() => void save(group.id)}
                      >
                        完成
                      </Button>
                    </>
                  )}
                </Space>
              </Flex>
              {canEdit &&
                groups.data?.groups.some((item) => item.id === group.id) && (
                  <DubbingAudioUpdates
                    groupId={group.id}
                    revision={group.revision ?? 0}
                  />
                )}
              <div className="dubbing-group-header">
                <Form.Item label="分组名称" htmlFor={`${group.id}-name`}>
                  {editable && !group.is_global ? (
                    <Input
                      id={`${group.id}-name`}
                      aria-label="分组名称"
                      value={group.name}
                      maxLength={30}
                      onChange={(event) =>
                        change(group.id, (value) => ({
                          ...value,
                          name: event.target.value
                        }))
                      }
                    />
                  ) : (
                    <Typography.Text strong>{group.name}</Typography.Text>
                  )}
                </Form.Item>
                <Form.Item
                  className="dubbing-group-areas"
                  label="适用板块"
                  htmlFor={`${group.id}-areas`}
                >
                  {editable ? (
                    <Select
                      id={`${group.id}-areas`}
                      mode="multiple"
                      aria-label={`${group.name} 使用板块`}
                      value={group.areas}
                      disabled={group.is_global}
                      options={areas.map((area) => ({
                        ...area,
                        disabled: current.groups.some(
                          (other) =>
                            other.id !== group.id &&
                            other.areas.includes(area.value)
                        )
                      }))}
                      onChange={(value: string[]) =>
                        change(group.id, (item) => ({ ...item, areas: value }))
                      }
                      placeholder="选择板块（已归属的板块需先移出）"
                    />
                  ) : (
                    <Space size={[4, 4]} wrap>
                      {group.areas.map((id) => (
                        <Tag key={id}>
                          {areas.find((area) => area.value === id)?.label ?? id}
                        </Tag>
                      ))}
                    </Space>
                  )}
                </Form.Item>
                {editable && !group.is_global && (
                  <Tooltip title="删除分组">
                    <Button
                      className="dubbing-group-delete"
                      danger
                      type="text"
                      aria-label="删除分组"
                      icon={<DeleteOutlined />}
                      onClick={() => removeGroup(group)}
                    />
                  </Tooltip>
                )}
              </div>
              {!draft && (
                <div className="dubbing-group-accent">
                  <Segmented
                    aria-label={`${group.name} 推荐口音`}
                    value={groupLocales[group.id] ?? preferredLocale}
                    options={[
                      { label: "英式", value: "uk" },
                      { label: "美式", value: "us" }
                    ]}
                    onChange={(locale: "uk" | "us") => {
                      onInvalidatePreview();
                      setGroupLocales((value) => ({
                        ...value,
                        [group.id]: locale
                      }));
                    }}
                  />
                  <Typography.Text type="secondary">
                    {group[groupLocales[group.id] ?? preferredLocale].length}{" "}
                    个推荐
                  </Typography.Text>
                </div>
              )}
              <div className="dubbing-group-locales">
                {(["uk", "us"] as const).map((locale) => (
                  <section
                    key={locale}
                    className="dubbing-group-locale"
                    hidden={
                      !draft &&
                      locale !== (groupLocales[group.id] ?? preferredLocale)
                    }
                    aria-hidden={
                      !draft &&
                      locale !== (groupLocales[group.id] ?? preferredLocale)
                    }
                    inert={
                      !draft &&
                      locale !== (groupLocales[group.id] ?? preferredLocale)
                    }
                    aria-label={`${group.name} ${locale === "uk" ? "英式" : "美式"}推荐`}
                  >
                    <Typography.Title level={5}>
                      {locale === "uk" ? "英式推荐" : "美式推荐"}
                    </Typography.Title>
                    <Flex vertical gap={12}>
                      {group[locale]
                        .filter(
                          (item) =>
                            !!draft ||
                            item.selected !== false ||
                            expanded[`${group.id}-${locale}`]
                        )
                        .map((item, index) => {
                          const voice = voices.find(
                            (value) => value.alias === item.voice_alias
                          );
                          const caps = voice?.capabilities;
                          const issue = recommendationError(
                            group.name,
                            locale,
                            item,
                            voice
                          );
                          return (
                            <div
                              key={item.id}
                              className="dubbing-recommendation"
                              draggable={editable}
                              onDragStart={() =>
                                setDragging({
                                  group: group.id,
                                  locale,
                                  id: item.id
                                })
                              }
                              onDragOver={(event) => {
                                if (
                                  editable &&
                                  dragging?.group === group.id &&
                                  dragging.locale === locale
                                )
                                  event.preventDefault();
                              }}
                              onDrop={(event) => {
                                event.preventDefault();
                                if (
                                  !editable ||
                                  !dragging ||
                                  dragging.group !== group.id ||
                                  dragging.locale !== locale
                                )
                                  return;
                                change(group.id, (value) => {
                                  const items = [...value[locale]];
                                  const source = items.findIndex(
                                    (value) => value.id === dragging.id
                                  );
                                  const target = items.findIndex(
                                    (value) => value.id === item.id
                                  );
                                  if (source < 0 || target < 0) return value;
                                  const [moving] = items.splice(source, 1);
                                  items.splice(target, 0, moving!);
                                  return { ...value, [locale]: items };
                                });
                                setDragging(undefined);
                              }}
                              onDragEnd={() => setDragging(undefined)}
                            >
                              <Flex
                                justify="space-between"
                                align="center"
                                gap={8}
                              >
                                <Typography.Text type="secondary">
                                  推荐 {index + 1}
                                  <Checkbox
                                    aria-label={`选用 ${item.name}`}
                                    checked={item.selected !== false}
                                    disabled={!editable}
                                    onChange={(event) =>
                                      updateItem(
                                        group.id,
                                        locale,
                                        item.id,
                                        (value) => ({
                                          ...value,
                                          selected: event.target.checked
                                        })
                                      )
                                    }
                                  >
                                    已选
                                  </Checkbox>
                                </Typography.Text>
                                <Space size={4}>
                                  <Tooltip title="试听">
                                    <Button
                                      color="default"
                                      style={{
                                        color: voice
                                          ? speechAccentGroup(
                                              voice.locale,
                                              voice.accent
                                            ) === "uk"
                                            ? "#2053FF"
                                            : speechAccentGroup(
                                                  voice.locale,
                                                  voice.accent
                                                ) === "us"
                                              ? "#FC007A"
                                              : "#8c8c8c"
                                          : undefined
                                      }}
                                      variant="text"
                                      aria-label="试听"
                                      icon={<PlayCircleOutlined />}
                                      disabled={!canAudition || !!issue}
                                      onClick={() =>
                                        voice &&
                                        !issue &&
                                        canAudition &&
                                        onAudition(voice, item)
                                      }
                                    />
                                  </Tooltip>
                                  {editable && (
                                    <>
                                      {[-1, 1].map((direction) => (
                                        <Tooltip
                                          key={direction}
                                          title={
                                            direction < 0
                                              ? "上移推荐"
                                              : "下移推荐"
                                          }
                                        >
                                          <Button
                                            type="text"
                                            aria-label={
                                              direction < 0
                                                ? "上移推荐"
                                                : "下移推荐"
                                            }
                                            icon={
                                              direction < 0 ? (
                                                <ArrowUpOutlined />
                                              ) : (
                                                <ArrowDownOutlined />
                                              )
                                            }
                                            disabled={
                                              index + direction < 0 ||
                                              index + direction >=
                                                group[locale].length
                                            }
                                            onClick={() =>
                                              change(group.id, (value) => {
                                                const items = [
                                                  ...value[locale]
                                                ];
                                                [
                                                  items[index],
                                                  items[index + direction]
                                                ] = [
                                                  items[index + direction]!,
                                                  items[index]!
                                                ];
                                                return {
                                                  ...value,
                                                  [locale]: items
                                                };
                                              })
                                            }
                                          />
                                        </Tooltip>
                                      ))}
                                      <Tooltip title="移除推荐">
                                        <Button
                                          danger
                                          type="text"
                                          aria-label="移除"
                                          icon={<DeleteOutlined />}
                                          onClick={() =>
                                            change(group.id, (value) => ({
                                              ...value,
                                              [locale]: value[locale].filter(
                                                (entry) => entry.id !== item.id
                                              )
                                            }))
                                          }
                                        />
                                      </Tooltip>
                                    </>
                                  )}
                                </Space>
                              </Flex>
                              <div className="dubbing-recommendation-fields">
                                <Form.Item
                                  label="推荐名称"
                                  htmlFor={`${item.id}-name`}
                                >
                                  {editable ? (
                                    <Input
                                      id={`${item.id}-name`}
                                      aria-label="推荐名称"
                                      value={item.name}
                                      maxLength={40}
                                      onChange={(event) =>
                                        updateItem(
                                          group.id,
                                          locale,
                                          item.id,
                                          (value) => ({
                                            ...value,
                                            name: event.target.value
                                          })
                                        )
                                      }
                                    />
                                  ) : (
                                    <Typography.Text strong>
                                      {item.name}
                                    </Typography.Text>
                                  )}
                                </Form.Item>
                                <Form.Item
                                  label="音色"
                                  htmlFor={`${item.id}-voice`}
                                >
                                  {editable ? (
                                    <Select
                                      id={`${item.id}-voice`}
                                      aria-label="推荐音色"
                                      value={item.voice_alias}
                                      options={available(locale).map(
                                        (value) => ({
                                          value: value.alias,
                                          label: value.display_name
                                        })
                                      )}
                                      onChange={(alias: string) => {
                                        const next = voices.find(
                                          (value) => value.alias === alias
                                        )!;
                                        updateItem(
                                          group.id,
                                          locale,
                                          item.id,
                                          (value) => ({
                                            ...recommendation(next),
                                            id: value.id,
                                            name: value.name
                                          })
                                        );
                                      }}
                                    />
                                  ) : (
                                    <Typography.Text>
                                      {voice?.display_name ?? "音色已不可用"}
                                    </Typography.Text>
                                  )}
                                </Form.Item>
                              </div>
                              {editable ? (
                                caps && (
                                  <div className="dubbing-recommendation-parameters">
                                    {caps.supports_volume_percent === false &&
                                      (item.parameters.volume_percent ??
                                        100) !== 100 && (
                                        <Button
                                          size="small"
                                          onClick={() =>
                                            updateItem(
                                              group.id,
                                              locale,
                                              item.id,
                                              (entry) => ({
                                                ...entry,
                                                parameters: {
                                                  ...entry.parameters,
                                                  volume_percent: 100
                                                }
                                              })
                                            )
                                          }
                                        >
                                          恢复原音量
                                        </Button>
                                      )}
                                    <Form.Item
                                      label="音量"
                                      htmlFor={`${item.id}-volume`}
                                    >
                                      <InputNumber
                                        id={`${item.id}-volume`}
                                        aria-label="推荐音量"
                                        disabled={
                                          caps.supports_volume_percent === false
                                        }
                                        min={0}
                                        max={100}
                                        precision={0}
                                        suffix="%"
                                        value={
                                          item.parameters.volume_percent ?? 100
                                        }
                                        style={{ width: "100%" }}
                                        onChange={(volume) =>
                                          updateItem(
                                            group.id,
                                            locale,
                                            item.id,
                                            (entry) => ({
                                              ...entry,
                                              parameters: {
                                                ...entry.parameters,
                                                volume_percent:
                                                  volume ?? Number.NaN
                                              }
                                            })
                                          )
                                        }
                                      />
                                    </Form.Item>
                                    <Form.Item
                                      label="语速（倍速）"
                                      htmlFor={`${item.id}-rate`}
                                    >
                                      <SpeechRateInput
                                        id={`${item.id}-rate`}
                                        aria-label="推荐语速"
                                        value={item.parameters.rate_percent}
                                        min={caps.min_rate_percent}
                                        max={caps.max_rate_percent}
                                        style={{ width: "100%" }}
                                        disabled={
                                          caps.min_rate_percent ===
                                            caps.max_rate_percent &&
                                          item.parameters.rate_percent ===
                                            caps.min_rate_percent
                                        }
                                        onChange={(value) =>
                                          updateItem(
                                            group.id,
                                            locale,
                                            item.id,
                                            (entry) => ({
                                              ...entry,
                                              parameters: {
                                                ...entry.parameters,
                                                rate_percent:
                                                  value ?? Number.NaN
                                              }
                                            })
                                          )
                                        }
                                      />
                                    </Form.Item>
                                    <Form.Item
                                      label="音调（半音）"
                                      htmlFor={`${item.id}-pitch`}
                                    >
                                      <InputNumber
                                        id={`${item.id}-pitch`}
                                        aria-label="推荐音调"
                                        value={item.parameters.pitch_semitones}
                                        min={caps.min_pitch_semitones}
                                        max={caps.max_pitch_semitones}
                                        style={{ width: "100%" }}
                                        disabled={
                                          caps.min_pitch_semitones ===
                                            caps.max_pitch_semitones &&
                                          item.parameters.pitch_semitones ===
                                            caps.min_pitch_semitones
                                        }
                                        onChange={(value) =>
                                          updateItem(
                                            group.id,
                                            locale,
                                            item.id,
                                            (entry) => ({
                                              ...entry,
                                              parameters: {
                                                ...entry.parameters,
                                                pitch_semitones:
                                                  value ?? Number.NaN
                                              }
                                            })
                                          )
                                        }
                                      />
                                    </Form.Item>
                                    <Form.Item
                                      label="风格"
                                      htmlFor={`${item.id}-style`}
                                    >
                                      <Select
                                        id={`${item.id}-style`}
                                        aria-label="推荐风格"
                                        value={item.parameters.style ?? ""}
                                        options={[
                                          { value: "", label: "自然" },
                                          ...caps.styles.map((style) => ({
                                            value: style,
                                            label: styleNames[style] ?? style
                                          }))
                                        ]}
                                        onChange={(style: string) =>
                                          updateItem(
                                            group.id,
                                            locale,
                                            item.id,
                                            (entry) => ({
                                              ...entry,
                                              parameters: {
                                                ...entry.parameters,
                                                style: style || null
                                              }
                                            })
                                          )
                                        }
                                      />
                                    </Form.Item>
                                  </div>
                                )
                              ) : (
                                <Typography.Text type="secondary">
                                  音量 {item.parameters.volume_percent ?? 100}
                                  %，语速{" "}
                                  {(
                                    (item.parameters.rate_percent + 100) /
                                    100
                                  ).toFixed(2)}
                                  ×，音调 {item.parameters.pitch_semitones}{" "}
                                  半音，
                                  {item.parameters.style
                                    ? (styleNames[item.parameters.style] ??
                                      item.parameters.style)
                                    : "自然"}
                                </Typography.Text>
                              )}
                              {issue && (
                                <Alert
                                  type="error"
                                  showIcon
                                  title={issue}
                                  description={
                                    !editable
                                      ? canEdit
                                        ? "点击“编辑分组”后调整此推荐。"
                                        : "请联系有分组编辑权限的管理员调整此推荐。"
                                      : undefined
                                  }
                                />
                              )}
                            </div>
                          );
                        })}
                      {!draft &&
                        group[locale].some(
                          (item) => item.selected === false
                        ) && (
                          <Button
                            type="link"
                            onClick={() =>
                              setExpanded((value) => ({
                                ...value,
                                [`${group.id}-${locale}`]:
                                  !value[`${group.id}-${locale}`]
                              }))
                            }
                          >
                            {expanded[`${group.id}-${locale}`]
                              ? "收起更多音色"
                              : "更多音色"}
                          </Button>
                        )}
                      {editable && (
                        <Button
                          type="dashed"
                          icon={<PlusOutlined aria-hidden />}
                          disabled={
                            !available(locale).length ||
                            group[locale].length >= 20
                          }
                          onClick={() =>
                            change(group.id, (value) => ({
                              ...value,
                              [locale]: [
                                ...value[locale],
                                recommendation(available(locale)[0]!)
                              ]
                            }))
                          }
                        >
                          添加{locale === "uk" ? "英式" : "美式"}推荐
                        </Button>
                      )}
                    </Flex>
                  </section>
                ))}
              </div>
              {!draft && (
                <Typography.Paragraph
                  type="secondary"
                  className="dubbing-group-footnote"
                >
                  按推荐顺序选用，具体文本仍可单独调整。
                </Typography.Paragraph>
              )}
            </Card>
          );
        })}
      </Form>
    </Flex>
  );
}
