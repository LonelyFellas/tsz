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
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Tag,
  Typography
} from "antd";
import { useEffect, useState } from "react";
import { useUnsavedChanges } from "@tsz/shared/recovery";
import { useBlocker } from "react-router-dom";
import { api, useAuthStore, usePermission } from "@/lib/auth";
import { newWordNodeId } from "@/features/dictionary/word-model/primitives";

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
    if (!current || !available("uk").length || !available("us").length) return;
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
    if (!groups.data || !available("uk").length || !available("us").length)
      return;
    setDraft({
      ...groups.data,
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
      for (const item of [...group.uk, ...group.us]) {
        if (
          !item.name.trim() ||
          !Number.isInteger(item.parameters.rate_percent) ||
          !Number.isInteger(item.parameters.pitch_semitones)
        ) {
          setError("请填写推荐名称及有效的语速、音调。");
          return;
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
    <Flex vertical gap={16}>
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
      <Flex justify="space-between" align="center" wrap gap={12}>
        <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
          按内容板块分别排列英式与美式推荐。保存后供文本选用，不改写历史音频。
        </Typography.Paragraph>
        {canEdit && (
          <Space wrap>
            {!draft && (
              <Button
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
                  disabled={
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
                  loading={saving}
                  onClick={() => void save()}
                >
                  保存分组配音
                </Button>
              </>
            )}
          </Space>
        )}
      </Flex>
      {error && <Alert type="error" showIcon title={error} />}
      {saved && <Alert type="success" showIcon title="分组配音已保存。" />}
      {!current.groups.length && (
        <Empty description="尚未设置分组推荐">
          {canEdit && (
            <Button
              disabled={
                saving || !available("uk").length || !available("us").length
              }
              onClick={initialGroups}
            >
              创建三个初始分组
            </Button>
          )}
        </Empty>
      )}
      {unassigned.length > 0 && (
        <Typography.Text type="secondary">
          未分组：{unassigned.map((area) => area.label).join("、")}
        </Typography.Text>
      )}
      {current.groups.map((group) => (
        <Card
          key={group.id}
          title={
            editable ? (
              <Input
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
              group.name
            )
          }
          extra={
            editable && (
              <Button danger type="text" onClick={() => removeGroup(group)}>
                删除分组
              </Button>
            )
          }
        >
          <Flex vertical gap={16}>
            {editable ? (
              <Select
                mode="multiple"
                aria-label={`${group.name} 使用板块`}
                value={group.areas}
                options={areas.map((area) => ({
                  ...area,
                  disabled: current.groups.some(
                    (other) =>
                      other.id !== group.id && other.areas.includes(area.value)
                  )
                }))}
                onChange={(value: string[]) =>
                  change(group.id, (item) => ({ ...item, areas: value }))
                }
                placeholder="选择使用板块（已被其他组使用的板块需先移出）"
              />
            ) : (
              <Space wrap>
                {group.areas.map((id) => (
                  <Tag key={id}>
                    {areas.find((area) => area.value === id)?.label ?? id}
                  </Tag>
                ))}
              </Space>
            )}
            {(["uk", "us"] as const).map((locale) => (
              <section
                key={locale}
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
                    return (
                      <div key={item.id} className="dubbing-recommendation">
                        <Typography.Text type="secondary">
                          {index + 1}
                        </Typography.Text>
                        <Flex vertical gap={6} style={{ minWidth: 0, flex: 1 }}>
                          {editable ? (
                            <>
                              <Input
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
                              <Select
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
                              {caps && (
                                <Space wrap>
                                  <label>
                                    语速 %{" "}
                                    <InputNumber
                                      aria-label="推荐语速"
                                      value={item.parameters.rate_percent}
                                      min={caps.min_rate_percent}
                                      max={caps.max_rate_percent}
                                      disabled={
                                        caps.min_rate_percent ===
                                        caps.max_rate_percent
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
                                  </label>
                                  <label>
                                    音调{" "}
                                    <InputNumber
                                      aria-label="推荐音调"
                                      value={item.parameters.pitch_semitones}
                                      min={caps.min_pitch_semitones}
                                      max={caps.max_pitch_semitones}
                                      disabled={
                                        caps.min_pitch_semitones ===
                                        caps.max_pitch_semitones
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
                                  </label>
                                  <Select
                                    aria-label="推荐风格"
                                    value={item.parameters.style ?? ""}
                                    style={{ minWidth: 100 }}
                                    options={[
                                      { value: "", label: "自然" },
                                      ...caps.styles.map((style) => ({
                                        value: style,
                                        label: style
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
                                </Space>
                              )}
                            </>
                          ) : (
                            <>
                              <Typography.Text strong>
                                {item.name}
                              </Typography.Text>
                              <Typography.Text type="secondary">
                                {voice?.display_name ?? "音色已不可用"}，语速{" "}
                                {(
                                  (item.parameters.rate_percent + 100) /
                                  100
                                ).toFixed(2)}
                                ×，{item.parameters.style ?? "自然"}
                              </Typography.Text>
                            </>
                          )}
                        </Flex>
                        <Space wrap>
                          <Button
                            disabled={
                              !voice ||
                              !canAudition ||
                              !Number.isInteger(item.parameters.rate_percent) ||
                              !Number.isInteger(item.parameters.pitch_semitones)
                            }
                            onClick={() => voice && onAudition(voice, item)}
                          >
                            试听
                          </Button>
                          {editable && (
                            <>
                              {[-1, 1].map((direction) => (
                                <Button
                                  key={direction}
                                  aria-label={
                                    direction < 0 ? "上移推荐" : "下移推荐"
                                  }
                                  disabled={
                                    index + direction < 0 ||
                                    index + direction >= group[locale].length
                                  }
                                  onClick={() =>
                                    change(group.id, (value) => {
                                      const items = [...value[locale]];
                                      [items[index], items[index + direction]] =
                                        [
                                          items[index + direction]!,
                                          items[index]!
                                        ];
                                      return { ...value, [locale]: items };
                                    })
                                  }
                                >
                                  {direction < 0 ? "上移" : "下移"}
                                </Button>
                              ))}
                              <Button
                                danger
                                disabled={group[locale].length <= 1}
                                onClick={() =>
                                  change(group.id, (value) => ({
                                    ...value,
                                    [locale]: value[locale].filter(
                                      (entry) => entry.id !== item.id
                                    )
                                  }))
                                }
                              >
                                移除
                              </Button>
                            </>
                          )}
                        </Space>
                      </div>
                    );
                  })}
                  {editable && (
                    <Button
                      disabled={
                        !available(locale).length || group[locale].length >= 20
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
          </Flex>
        </Card>
      ))}
    </Flex>
  );
}
