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
  AdminDubbingGroupsResponse,
  AdminDubbingRecommendation,
  AdminSpeechVoice
} from "@tsz/types";
import {
  Alert,
  App,
  Button,
  Card,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography
} from "antd";
import { useEffect, useState } from "react";
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
  if (voice.locale !== (locale === "uk" ? "en-GB" : "en-US")) {
    return `${location}：音色口音与${accent}推荐不符，请重新选择${accent}音色。`;
  }
  if (!item.name.trim()) return `${location}：请填写推荐名称。`;
  const caps = voice.capabilities;
  const { rate_percent, pitch_semitones, style } = item.parameters;
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
  const canEdit = usePermission("speech.global_dubbing");
  const client = useQueryClient();
  const { modal } = App.useApp();
  const groups = useQuery({
    queryKey: ["admin-dubbing-groups", accountId],
    queryFn: ({ signal }) => api.speech.groups(signal),
    retry: false
  });
  const [draft, setDraft] = useState<AdminDubbingGroupsResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const blocker = useBlocker(!!draft || saving);
  useUnsavedChanges("dubbing-groups", !!draft || saving);
  useEffect(() => {
    onDirtyChange(!!draft || saving);
    return () => onDirtyChange(false);
  }, [draft, saving, onDirtyChange]);
  const current = draft ?? groups.data;
  const editable = canEdit && !!draft && !saving;
  const available = (locale: "uk" | "us") =>
    voices.filter(
      (voice) => voice.locale === (locale === "uk" ? "en-GB" : "en-US")
    );

  function change(
    id: string,
    update: (group: AdminDubbingGroup) => AdminDubbingGroup
  ) {
    if (!editable) return;
    onInvalidatePreview();
    setDraft(
      (value) =>
        value && {
          ...value,
          groups: value.groups.map((group) =>
            group.id === id ? update(group) : group
          )
        }
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

  function addGroup() {
    if (
      !canEdit ||
      saving ||
      !current ||
      !available("uk").length ||
      !available("us").length
    )
      return;
    setDraft({
      ...current,
      groups: [
        ...current.groups,
        {
          id: newWordNodeId(),
          name: "新分组",
          areas: [],
          uk: [recommendation(available("uk")[0]!)],
          us: [recommendation(available("us")[0]!)]
        }
      ]
    });
    setSaved(false);
  }

  function initialGroups() {
    if (
      !canEdit ||
      saving ||
      !current ||
      !available("uk").length ||
      !available("us").length
    )
      return;
    setDraft({
      ...current,
      groups: [
        { name: "词形与发音", areas: ["word", "azure"] },
        { name: "结构与释义", areas: ["grammar", "meaning"] },
        { name: "例句", areas: ["example"] }
      ].map((group) => ({
        ...group,
        id: newWordNodeId(),
        uk: [recommendation(available("uk")[0]!)],
        us: [recommendation(available("us")[0]!)]
      }))
    });
    setSaved(false);
  }

  async function save() {
    if (!draft || !canEdit || saving) return;
    const names = new Set<string>();
    const assigned = new Set<string>();
    for (const group of draft.groups) {
      if (
        !group.name.trim() ||
        names.has(group.name.trim()) ||
        !group.areas.length ||
        !group.uk.length ||
        !group.us.length
      ) {
        setError(
          "每组需要不同的名称、至少一个板块，以及英式和美式各一个推荐。"
        );
        return;
      }
      names.add(group.name.trim());
      for (const area of group.areas) {
        if (assigned.has(area)) {
          setError("一个板块只能属于一个分组，请调整归属。");
          return;
        }
        assigned.add(area);
      }
      for (const locale of ["uk", "us"] as const) {
        for (const item of group[locale]) {
          const issue = recommendationError(
            group.name,
            locale,
            item,
            voices.find((voice) => voice.alias === item.voice_alias)
          );
          if (issue) {
            setError(issue);
            return;
          }
        }
      }
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const result = await api.speech.saveGroups({
        groups: draft.groups.map((group) => ({
          ...group,
          name: group.name.trim()
        })),
        base_revision: draft.revision
      });
      await client.cancelQueries({
        queryKey: ["admin-dubbing-groups", accountId],
        exact: true
      });
      if (useAuthStore.getState().profile?.id !== accountId) return;
      client.setQueryData(["admin-dubbing-groups", accountId], result);
      setDraft(null);
      setSaved(true);
    } catch (cause) {
      setError(
        cause instanceof HttpError && cause.status === 409
          ? "分组已被其他管理员修改。当前草稿已保留，请取消编辑并重新载入后再修改。"
          : "保存失败，草稿已保留。请检查推荐音色、口音和参数后重试。"
      );
    } finally {
      setSaving(false);
    }
  }

  function removeGroup(group: AdminDubbingGroup) {
    modal.confirm({
      title: `删除「${group.name}」？`,
      content: `涉及板块：${group.areas.map((id) => areas.find((a) => a.value === id)?.label).join("、") || "无"}。保存后这些板块回到未分组；已有文本和音频保持不变。`,
      okText: "删除分组",
      cancelText: "取消",
      onOk: () => {
        onInvalidatePreview();
        setDraft(
          (value) =>
            value && {
              ...value,
              groups: value.groups.filter((item) => item.id !== group.id)
            }
        );
      }
    });
  }

  if (groups.isError && !draft)
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
        className={
          draft ? "dubbing-groups-toolbar is-editing" : "dubbing-groups-toolbar"
        }
        justify="space-between"
        align="center"
        wrap
        gap={12}
      >
        <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
          {draft
            ? "正在编辑分组，保存后生效。"
            : "按内容板块分别排列英式与美式推荐，不改写历史音频。"}
        </Typography.Paragraph>
        {(canEdit || draft) && (
          <Space wrap>
            {canEdit && !draft && current.groups.length > 0 && (
              <Button
                icon={<EditOutlined />}
                onClick={() => {
                  setDraft(structuredClone(current));
                  setSaved(false);
                }}
              >
                编辑分组
              </Button>
            )}
            {draft && (
              <>
                <Button
                  icon={<PlusOutlined />}
                  disabled={
                    !canEdit ||
                    saving ||
                    current.groups.length >= 5 ||
                    !available("uk").length ||
                    !available("us").length
                  }
                  onClick={addGroup}
                >
                  新增分组
                </Button>
                <Button
                  disabled={saving}
                  onClick={() =>
                    modal.confirm({
                      title: "放弃当前分组修改？",
                      okText: "放弃并重新载入",
                      cancelText: "继续编辑",
                      onOk: async () => {
                        onInvalidatePreview();
                        await groups.refetch();
                        setDraft(null);
                        setError(null);
                      }
                    })
                  }
                >
                  取消编辑
                </Button>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  disabled={!canEdit}
                  loading={saving}
                  onClick={() => void save()}
                >
                  保存分组配音
                </Button>
              </>
            )}
          </Space>
        )}
        {error && (
          <Alert
            type="error"
            showIcon
            title={error}
            style={{ width: "100%" }}
          />
        )}
        {saved && (
          <Alert
            type="success"
            showIcon
            title="分组配音已保存。"
            style={{ width: "100%" }}
          />
        )}
      </Flex>
      {!current.groups.length && (
        <Empty description="尚未设置分组推荐">
          {canEdit && (
            <Space wrap>
              {!draft && (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  disabled={
                    saving || !available("uk").length || !available("us").length
                  }
                  onClick={addGroup}
                >
                  新增分组
                </Button>
              )}
              <Button
                icon={<PlusOutlined />}
                disabled={
                  saving || !available("uk").length || !available("us").length
                }
                onClick={initialGroups}
              >
                创建三个初始分组
              </Button>
            </Space>
          )}
        </Empty>
      )}
      {unassigned.length > 0 && (
        <Typography.Text type="secondary">
          未分组：{unassigned.map((area) => area.label).join("、")}
        </Typography.Text>
      )}
      <Form component={false} layout="vertical">
        {current.groups.map((group) => (
          <Card key={group.id} size="small" className="dubbing-group">
            <div className="dubbing-group-header">
              <Form.Item label="分组名称" htmlFor={`${group.id}-name`}>
                {editable ? (
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
              {editable && (
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
            <div className="dubbing-group-locales">
              {(["uk", "us"] as const).map((locale) => (
                <section
                  key={locale}
                  className="dubbing-group-locale"
                  aria-label={`${group.name} ${locale === "uk" ? "英式" : "美式"}推荐`}
                >
                  <Typography.Title level={5}>
                    {locale === "uk" ? "英式推荐" : "美式推荐"}
                  </Typography.Title>
                  <Flex vertical gap={12}>
                    {group[locale].map((item, index) => {
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
                        <div key={item.id} className="dubbing-recommendation">
                          <Flex justify="space-between" align="center" gap={8}>
                            <Typography.Text type="secondary">
                              推荐 {index + 1}
                            </Typography.Text>
                            <Space size={4}>
                              <Tooltip title="试听">
                                <Button
                                  type="text"
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
                                        direction < 0 ? "上移推荐" : "下移推荐"
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
                                            const items = [...value[locale]];
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
                                      disabled={group[locale].length <= 1}
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
                                  options={available(locale).map((value) => ({
                                    value: value.alias,
                                    label: value.display_name
                                  }))}
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
                                            rate_percent: value ?? Number.NaN
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
                                            pitch_semitones: value ?? Number.NaN
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
                              语速{" "}
                              {(
                                (item.parameters.rate_percent + 100) /
                                100
                              ).toFixed(2)}
                              ×，音调 {item.parameters.pitch_semitones} 半音，
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
                    {editable && (
                      <Button
                        type="dashed"
                        icon={<PlusOutlined />}
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
          </Card>
        ))}
      </Form>
    </Flex>
  );
}
