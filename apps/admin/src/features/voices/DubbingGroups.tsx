import { speechAccentGroup } from "@tsz/shared";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  SaveOutlined,
  CheckOutlined
} from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HttpError } from "@tsz/api-client";
import type {
  AdminDubbingGroupsV3Response,
  AdminDubbingRecommendation,
  AdminDubbingRecommendationPair,
  AdminSpeechVoice
} from "@tsz/types";
import {
  Alert,
  App,
  Button,
  Card,
  Badge,
  Checkbox,
  Form,
  Input,
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
import { useDubbingDrafts } from "./DubbingDrafts";
import { DubbingAudioUpdates } from "./DubbingAudioUpdates";
import {
  dubbingGroupsKey,
  legacyComplete,
  recommendationError,
  sideName,
  sides,
  type DubbingDraft,
  type DubbingSide
} from "./dubbing-model";
import {
  RecommendationEditor,
  type RecommendationSeed
} from "./RecommendationEditor";
import { VoiceName, VoiceRate, VoiceVolume } from "./VoiceDisplay";
import { LegacyGroupReview } from "./LegacyGroupReview";
import "./dubbing-groups.css";

const areas = [
  { value: "word", label: "词形拼写" },
  { value: "azure", label: "Azure IPA／UPS" },
  { value: "grammar", label: "词性的语法结构" },
  { value: "meaning", label: "英文释义语句" },
  { value: "example", label: "多维例句" }
];
type Editing = {
  groupId: string;
  initial: RecommendationSeed;
  side?: DubbingSide;
  legacy?: boolean;
};

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
    queryKey: dubbingGroupsKey(accountId),
    queryFn: ({ signal }) => api.speech.groupsV3(signal),
    retry: false
  });
  const [drafts, setDrafts] = useDubbingDrafts();
  const [savingId, setSavingId] = useState<string>();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState<string>();
  const [editing, setEditing] = useState<Editing>();
  const [selectedId, setSelectedId] = useState<string>();
  const [ordering, setOrdering] = useState(false);
  const [settingsId, setSettingsId] = useState<string>();
  const [settingsCreating, setSettingsCreating] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [reviewId, setReviewId] = useState<string>();
  const [previewArea, setPreviewArea] = useState<string>();
  const [settingsForm] = Form.useForm<{ name: string; areas: string[] }>();
  const saving = !!savingId;
  const dirty = Object.keys(drafts).length > 0 || settingsDirty;
  const blocker = useBlocker(dirty || saving);
  useUnsavedChanges("dubbing-groups", dirty || saving);
  useEffect(() => {
    onDirtyChange(dirty || saving);
    return () => onDirtyChange(false);
  }, [dirty, saving, onDirtyChange]);
  const current: DubbingDraft[] = [
    ...(groups.data?.groups.map((group) => drafts[group.id] ?? group) ?? []),
    ...Object.values(drafts).filter(
      (draft) => !groups.data?.groups.some((group) => group.id === draft.id)
    )
  ].sort((a, b) => Number(a.is_global) - Number(b.is_global));
  function change(id: string, update: (group: DubbingDraft) => DubbingDraft) {
    if (!canEdit || savingId === id) return;
    onInvalidatePreview();
    setDrafts((value) =>
      value[id] || groups.data?.groups.some((group) => group.id === id)
        ? {
            ...value,
            [id]: update(
              value[id] ??
                structuredClone(
                  groups.data!.groups.find((group) => group.id === id)!
                )
            )
          }
        : value
    );
    setSaved(undefined);
  }
  function discard(id: string) {
    onInvalidatePreview();
    setError(undefined);
    setDrafts((value) => {
      const next = { ...value };
      delete next[id];
      return next;
    });
  }
  async function accept(result: AdminDubbingGroupsV3Response) {
    await Promise.all([
      client.cancelQueries({
        queryKey: dubbingGroupsKey(accountId),
        exact: true
      }),
      client.cancelQueries({
        queryKey: ["admin-dubbing-groups", accountId],
        exact: true
      })
    ]);
    if (useAuthStore.getState().profile?.id !== accountId) return false;
    client.setQueryData(dubbingGroupsKey(accountId), result);
    // 文本消费者仍读取 v2；只使其失效，不把 v3 recommendations 写入旧缓存。
    void client.invalidateQueries({
      queryKey: ["admin-dubbing-groups", accountId],
      exact: true
    });
    return true;
  }
  async function save(id: string) {
    const draft = drafts[id];
    if (!draft || !canEdit || saving) return;
    if (!draft.name.trim()) {
      setError("请填写分组名称。");
      return;
    }
    if (draft.recommendations.format !== "paired") {
      setError("请先确认本组原有英美声音的组合，再保存。");
      return;
    }
    const original = groups.data?.groups.find((g) => g.id === id);
    for (const pair of draft.recommendations.pairs) {
      if (!pair.name.trim()) {
        setError("请填写推荐名称。");
        return;
      }
      if (Array.from(pair.name).length > 40) {
        setError("推荐名称最多 40 字。");
        return;
      }
      for (const side of sides) {
        const item = {
          ...pair[side],
          name: pair.name,
          selected: pair.selected
        };
        const rec = original?.recommendations;
        const stored =
          rec?.format === "paired"
            ? rec.pairs.find((p) => p[side].id === item.id)?.[side]
            : rec?.[side].find((i) => i.id === item.id);
        const issue = recommendationError(
          draft.name,
          side,
          item,
          voices.find((v) => v.alias === item.voice_alias)
        );
        if (
          issue &&
          (!stored ||
            JSON.stringify({
              id: stored.id,
              voice_alias: stored.voice_alias,
              parameters: stored.parameters
            }) !== JSON.stringify(pair[side]))
        ) {
          setError(issue);
          return;
        }
      }
    }
    setSavingId(id);
    setError(undefined);
    setSaved(undefined);
    try {
      const result = await api.speech.savePairedGroup(
        {
          group: {
            id,
            name: draft.name.trim(),
            areas: draft.areas,
            is_global: draft.is_global,
            pairs: draft.recommendations.pairs
          },
          base_revision: draft.revision
        },
        draft.revision === 0 && !original
      );
      if (await accept(result)) {
        discard(id);
        setSaved(`「${draft.name.trim()}」配音已保存。`);
      }
    } catch (cause) {
      setError(
        cause instanceof HttpError && cause.status === 409
          ? "本组已被修改或名称已被使用，全部草稿已保留。请重新载入；取消本组后可按最新配置编辑。"
          : "保存失败，本组全部草稿已保留，请重试。"
      );
    } finally {
      setSavingId(undefined);
    }
  }
  async function reorder(id: string, direction: number) {
    const snapshot = groups.data;
    if (!snapshot || !canEdit || saving) return;
    const order = snapshot.groups.map((g) => g.id);
    const index = order.indexOf(id),
      target = index + direction;
    if (
      index < 0 ||
      target < 0 ||
      target >= order.length ||
      snapshot.groups[index]?.is_global ||
      snapshot.groups[target]?.is_global
    )
      return;
    [order[index], order[target]] = [order[target]!, order[index]!];
    setSavingId("order");
    setError(undefined);
    setSaved(undefined);
    try {
      if (
        await accept(
          await api.speech.saveGroupOrder({
            group_ids: order,
            base_revision: snapshot.order_revision
          })
        )
      )
        setSaved("分组顺序已保存，未完成内容仍保留在各组草稿。");
    } catch (cause) {
      setError(
        cause instanceof HttpError && cause.status === 409
          ? "分组集合或顺序已变化，排序未保存；全部草稿已保留，请重新载入后重排。"
          : "排序失败，全部草稿已保留，请重试。"
      );
    } finally {
      setSavingId(undefined);
    }
  }
  function addGroup() {
    if (!canEdit || saving || current.filter((g) => !g.is_global).length >= 5)
      return;
    onInvalidatePreview();
    const group: DubbingDraft = {
      id: newWordNodeId(),
      name: "新分组",
      areas: [],
      recommendations: { format: "paired", pairs: [] },
      revision: 0,
      is_global: false
    };
    setDrafts((v) => ({ ...v, [group.id]: group }));
    setSelectedId(group.id);
    settingsForm.setFieldsValue({ name: group.name, areas: group.areas });
    setSettingsDirty(false);
    setSettingsCreating(true);
    setSettingsId(group.id);
  }
  function removeGroup(group: DubbingDraft) {
    modal.confirm({
      title: `删除「${group.name}」？`,
      content: "删除后按其他适用组或全局常用解析；已发布音频保持原样。",
      okText: "删除分组",
      cancelText: "取消",
      onOk: async () => {
        if (!canEdit || saving) return;
        const stored = groups.data?.groups.find((g) => g.id === group.id);
        if (!stored) {
          discard(group.id);
          cancelSettings();
          return;
        }
        setSavingId(group.id);
        try {
          if (
            await accept(
              await api.speech.deleteGroupV3(group.id, group.revision)
            )
          ) {
            discard(group.id);
            cancelSettings();
          }
        } catch (cause) {
          setError(
            cause instanceof HttpError && cause.status === 409
              ? "分组已更新，删除未生效；全部草稿保留，请重新载入。"
              : "删除失败，当前草稿保留。"
          );
        } finally {
          setSavingId(undefined);
        }
      }
    });
  }
  function updatePairs(
    groupId: string,
    update: (
      pairs: AdminDubbingRecommendationPair[]
    ) => AdminDubbingRecommendationPair[]
  ) {
    change(groupId, (group) =>
      group.recommendations.format === "paired"
        ? {
            ...group,
            recommendations: {
              format: "paired",
              pairs: update(group.recommendations.pairs)
            }
          }
        : { ...group, legacyPairs: update(group.legacyPairs ?? []) }
    );
  }
  function sideRow(
    pair: AdminDubbingRecommendationPair,
    side: DubbingSide,
    group: DubbingDraft,
    editable: boolean,
    auditionAllowed = true
  ) {
    const item = { ...pair[side], name: pair.name, selected: pair.selected };
    return voiceRow(
      item,
      side,
      group,
      editable
        ? () => setEditing({ groupId: group.id, initial: pair, side })
        : undefined,
      auditionAllowed
    );
  }
  function voiceRow(
    item: AdminDubbingRecommendation,
    side: DubbingSide,
    group: DubbingDraft,
    edit?: () => void,
    auditionAllowed = true
  ) {
    const voice = voices.find((v) => v.alias === item.voice_alias);
    const issue = recommendationError(group.name, side, item, voice);
    const accent = voice
      ? speechAccentGroup(voice.locale, voice.accent)
      : "other";
    return (
      <div className="dubbing-pair-side" title={issue ?? undefined}>
        <div className="dubbing-side-heading">
          <Button
            type="text"
            aria-label={`试听${sideName(side)} ${item.name}`}
            className={`voice-accent-${accent}`}
            icon={<PlayCircleOutlined aria-hidden />}
            disabled={!auditionAllowed || !canAudition || !!issue}
            onClick={() => voice && onAudition(voice, item)}
          />
          <div className="dubbing-side-identity">
            {voice ? (
              <VoiceName voice={voice} />
            ) : (
              <span>音色已不可用：{item.voice_alias}</span>
            )}
          </div>
          {edit && (
            <Button
              type="text"
              icon={<EditOutlined aria-hidden />}
              aria-label={`修改${sideName(side)} ${item.name}`}
              onClick={() => {
                onInvalidatePreview();
                edit();
              }}
            />
          )}
        </div>
        <div className="dubbing-side-parameters">
          <span>
            语速 <VoiceRate parameters={item.parameters} />
          </span>
          <span>
            音量 <VoiceVolume parameters={item.parameters} />
          </span>
        </div>
        {issue && (
          <Typography.Text type="danger" className="dubbing-item-issue">
            {issue}
          </Typography.Text>
        )}
      </div>
    );
  }
  const active =
    current.find((group) => group.id === selectedId) ??
    current.find((group) => group.is_global) ??
    current[0];
  const editingGroup =
    editing && current.find((group) => group.id === editing.groupId);
  const reviewGroup = current.find((group) => group.id === reviewId);
  const legacy =
    editingGroup?.recommendations.format === "legacy"
      ? editingGroup.recommendations
      : undefined;
  const matching =
    groups.data?.groups.filter(
      (group) => !group.is_global && group.areas.includes(previewArea ?? "")
    ) ?? [];
  const previewGroups = matching.length
    ? matching
    : (groups.data?.groups.filter((group) => group.is_global) ?? []);
  function openSettings(group: DubbingDraft) {
    settingsForm.setFieldsValue({ name: group.name, areas: group.areas });
    setSettingsDirty(false);
    setSettingsCreating(false);
    setSettingsId(group.id);
  }
  function cancelSettings() {
    if (settingsId && settingsCreating) discard(settingsId);
    setSettingsDirty(false);
    setSettingsCreating(false);
    setSettingsId(undefined);
  }
  function recommendations(
    group: DubbingDraft,
    editable: boolean,
    auditionAllowed = true
  ) {
    const rec = group.recommendations;
    const pairs =
      rec.format === "paired" ? rec.pairs : (group.legacyPairs ?? []);
    return (
      <>
        {rec.format === "legacy" && (
          <>
            <div className="dubbing-legacy-notice">
              <Typography.Text type="secondary">
                原有英美声音已保留，确认组合后即可维护推荐套。
              </Typography.Text>
              {editable && (
                <Button onClick={() => setReviewId(group.id)}>核对声音</Button>
              )}
            </div>
            <div className="dubbing-legacy-overview">
              {sides.map((side) => (
                <section
                  key={side}
                  aria-label={`${group.name} ${sideName(side)}原有声音`}
                >
                  <Typography.Text className={`voice-accent-${side}`}>
                    {sideName(side)}
                  </Typography.Text>
                  {rec[side].map((item) => (
                    <div key={item.id} className="dubbing-legacy-voice">
                      {(item.name.replace(/\s/g, "") !==
                        voices
                          .find((voice) => voice.alias === item.voice_alias)
                          ?.display_name.replace(/\s/g, "") ||
                        item.selected === false) && (
                        <span className="dubbing-legacy-label">
                          {item.name}
                          {item.selected === false ? "（未选）" : ""}
                        </span>
                      )}
                      {voiceRow(item, side, group, undefined, auditionAllowed)}
                    </div>
                  ))}
                  {!rec[side].length && (
                    <Typography.Paragraph type="secondary">
                      尚无{sideName(side)}声音
                    </Typography.Paragraph>
                  )}
                </section>
              ))}
            </div>
          </>
        )}
        {rec.format === "paired" && (
          <div className="dubbing-pairs-scroll">
            <div className="dubbing-pairs" aria-label={`${group.name}英美推荐`}>
              <div className="dubbing-pair-row dubbing-pair-head">
                <span>推荐套</span>
                {sides.map((side) => (
                  <div
                    key={side}
                    className={`dubbing-locale-heading voice-accent-${side}`}
                  >
                    <span>{sideName(side)}</span>
                    <span>声音 / 参数</span>
                  </div>
                ))}
              </div>
              {pairs.map((pair, pairIndex) => (
                <div
                  key={pair.id}
                  className="dubbing-pair-row"
                  data-pair-id={pair.id}
                >
                  <div className="dubbing-pair-controls">
                    <div className="dubbing-pair-choice">
                      <Checkbox
                        aria-label={`选用 ${pair.name}`}
                        disabled={!editable}
                        checked={pair.selected}
                        onChange={(event) =>
                          updatePairs(group.id, (items) =>
                            items.map((p) =>
                              p.id === pair.id
                                ? { ...p, selected: event.target.checked }
                                : p
                            )
                          )
                        }
                      />
                      <div>
                        <Input
                          variant="borderless"
                          className="dubbing-pair-name"
                          aria-label={`推荐名称 ${pairIndex + 1}`}
                          maxLength={40}
                          value={pair.name}
                          disabled={!editable}
                          onChange={(event) =>
                            updatePairs(group.id, (items) =>
                              items.map((p) =>
                                p.id === pair.id
                                  ? { ...p, name: event.target.value }
                                  : p
                              )
                            )
                          }
                        />
                        <Typography.Text
                          type="secondary"
                          className="dubbing-pair-status"
                        >
                          {pair.selected
                            ? pairIndex === pairs.findIndex((p) => p.selected)
                              ? "优先使用"
                              : "已选用"
                            : "未选用"}
                        </Typography.Text>
                      </div>
                    </div>
                    {editable && (
                      <Space size={0} className="dubbing-pair-actions">
                        {[-1, 1].map((direction) => (
                          <Button
                            key={direction}
                            size="small"
                            type="text"
                            aria-label={`${direction < 0 ? "上移" : "下移"}推荐 ${pair.name}`}
                            icon={
                              direction < 0 ? (
                                <ArrowUpOutlined aria-hidden />
                              ) : (
                                <ArrowDownOutlined aria-hidden />
                              )
                            }
                            disabled={
                              pairIndex + direction < 0 ||
                              pairIndex + direction >= pairs.length
                            }
                            onClick={() =>
                              updatePairs(group.id, (items) => {
                                const next = [...items];
                                [next[pairIndex], next[pairIndex + direction]] =
                                  [
                                    next[pairIndex + direction]!,
                                    next[pairIndex]!
                                  ];
                                return next;
                              })
                            }
                          />
                        ))}
                        <Button
                          type="text"
                          size="small"
                          icon={<CopyOutlined aria-hidden />}
                          aria-label={`复制整套 ${pair.name}`}
                          disabled={pairs.length >= 20}
                          onClick={() =>
                            setEditing({
                              groupId: group.id,
                              initial: {
                                ...structuredClone(pair),
                                id: newWordNodeId(),
                                name: `${Array.from(pair.name).slice(0, 37).join("")} 副本`,
                                uk: {
                                  ...structuredClone(pair.uk),
                                  id: newWordNodeId()
                                },
                                us: {
                                  ...structuredClone(pair.us),
                                  id: newWordNodeId()
                                }
                              }
                            })
                          }
                        />
                        <Button
                          danger
                          type="text"
                          size="small"
                          icon={<DeleteOutlined aria-hidden />}
                          aria-label={`移除推荐 ${pair.name}`}
                          onClick={() =>
                            updatePairs(group.id, (items) =>
                              items.filter((p) => p.id !== pair.id)
                            )
                          }
                        />
                      </Space>
                    )}
                  </div>
                  {sides.map((side) => (
                    <div key={side}>
                      {sideRow(pair, side, group, editable, auditionAllowed)}
                    </div>
                  ))}
                </div>
              ))}
              {!pairs.length && (
                <div className="dubbing-pair-empty">
                  <Typography.Title level={5}>
                    {editable ? "从一套英美声音开始" : "本组暂无推荐套"}
                  </Typography.Title>
                  <Typography.Paragraph type="secondary">
                    {editable
                      ? "添加一套推荐，让这组内容有合适的声音。"
                      : "当前没有可展示的成套推荐。"}
                  </Typography.Paragraph>
                </div>
              )}
            </div>
          </div>
        )}
      </>
    );
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
  if (!groups.data) return <Card loading />;
  return (
    <div className="dubbing-groups">
      {blocker.state === "blocked" && (
        <Modal
          open
          title="分组还有未保存的修改"
          onCancel={() => blocker.reset()}
          footer={
            <Space>
              <Button onClick={() => blocker.reset()}>继续编辑</Button>
              <Button
                disabled={saving}
                onClick={() => {
                  setDrafts({});
                  blocker.proceed();
                }}
              >
                放弃并离开
              </Button>
            </Space>
          }
        >
          离开后将丢弃当前分组草稿。
        </Modal>
      )}
      <div className="dubbing-page-heading">
        <div>
          <Typography.Title level={2}>分组配音</Typography.Title>
          <Typography.Text type="secondary">
            维护各类内容的英美推荐，未分组内容使用全局常用。
          </Typography.Text>
        </div>
        <Button onClick={() => setPreviewArea("word")}>词库中怎么看</Button>
      </div>
      {error && (
        <Alert
          type="error"
          showIcon
          title={error}
          action={
            <Button onClick={() => void groups.refetch()}>重新载入</Button>
          }
        />
      )}
      {saved && <Alert type="success" showIcon title={saved} />}
      <div className="dubbing-workbench">
        <aside className="dubbing-group-navigation" aria-label="配音分组">
          <div className="dubbing-navigation-heading">
            <Typography.Text type="secondary">内容分组</Typography.Text>
            {canEdit && (
              <Button
                type="text"
                size="small"
                aria-expanded={ordering}
                onClick={() => setOrdering((value) => !value)}
              >
                {ordering ? "完成排序" : "调整顺序"}
              </Button>
            )}
          </div>
          <div className="dubbing-navigation-list">
            {current
              .filter((group) => !group.is_global)
              .map((group) => {
                const storedIndex = groups.data.groups.findIndex(
                  (g) => g.id === group.id
                );
                return (
                  <div key={group.id} className="dubbing-navigation-entry">
                    <Button
                      type="text"
                      className={`dubbing-group-nav-item${active?.id === group.id ? " is-active" : ""}`}
                      aria-label={`选择分组 ${group.name}`}
                      aria-current={
                        active?.id === group.id ? "true" : undefined
                      }
                      onClick={() => {
                        onInvalidatePreview();
                        setSelectedId(group.id);
                      }}
                    >
                      <span className="dubbing-nav-name">
                        {group.name}
                        {drafts[group.id] && (
                          <Badge
                            status="processing"
                            aria-label="有未保存修改"
                          />
                        )}
                      </span>
                      <span className="dubbing-nav-areas">
                        {group.areas
                          .map(
                            (id) =>
                              areas.find((area) => area.value === id)?.label ??
                              id
                          )
                          .join(" · ") || "尚未选择板块"}
                      </span>
                    </Button>
                    {canEdit && ordering && (
                      <div
                        className="dubbing-navigation-order"
                        aria-label={`${group.name} 分组顺序`}
                      >
                        {[-1, 1].map((direction) => (
                          <Button
                            key={direction}
                            type="text"
                            size="small"
                            icon={
                              direction < 0 ? (
                                <ArrowUpOutlined aria-hidden />
                              ) : (
                                <ArrowDownOutlined aria-hidden />
                              )
                            }
                            aria-label={`${direction < 0 ? "上移" : "下移"}分组 ${group.name}`}
                            disabled={
                              saving ||
                              storedIndex < 0 ||
                              storedIndex + direction < 0 ||
                              storedIndex + direction >=
                                groups.data.groups.length ||
                              groups.data.groups[storedIndex + direction]
                                ?.is_global
                            }
                            onClick={() => void reorder(group.id, direction)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
          {canEdit && (
            <Button
              className="dubbing-add-group"
              icon={<PlusOutlined aria-hidden />}
              disabled={
                saving ||
                current.filter((group) => !group.is_global).length >= 5
              }
              onClick={addGroup}
            >
              新增分组
            </Button>
          )}
          <div className="dubbing-global-navigation">
            {current
              .filter((group) => group.is_global)
              .map((group) => (
                <Button
                  key={group.id}
                  type="text"
                  className={`dubbing-group-nav-item${active?.id === group.id ? " is-active" : ""}`}
                  aria-label={`选择分组 ${group.name}`}
                  aria-current={active?.id === group.id ? "true" : undefined}
                  onClick={() => {
                    onInvalidatePreview();
                    setSelectedId(group.id);
                  }}
                >
                  <span className="dubbing-nav-name">
                    {group.name}
                    {drafts[group.id] ? (
                      <Badge status="processing" aria-label="有未保存修改" />
                    ) : (
                      <Tag color="blue">兜底</Tag>
                    )}
                  </span>
                  <span className="dubbing-nav-areas">无适用分组时使用</span>
                </Button>
              ))}
          </div>
        </aside>
        <div className="dubbing-group-panels">
          {!current.length && (
            <div className="dubbing-empty-groups">
              <Typography.Paragraph type="secondary">
                尚未设置分组推荐
              </Typography.Paragraph>
            </div>
          )}
          {current.map((group) => {
            const draft = drafts[group.id],
              editable = canEdit && !saving;
            const rec = group.recommendations;
            return (
              <section
                key={group.id}
                className="dubbing-group"
                data-group-id={group.id}
                aria-label={`${group.name} 分组配置`}
                hidden={active?.id !== group.id}
                aria-hidden={active?.id !== group.id}
                inert={active?.id !== group.id}
              >
                <div className="dubbing-group-heading">
                  <div>
                    <div className="dubbing-group-title">
                      <Typography.Title level={3}>
                        {group.name}
                      </Typography.Title>
                      {group.is_global && <Tag>全局兜底</Tag>}
                    </div>
                    <Typography.Text type="secondary">
                      {group.is_global
                        ? "没有适用分组时，智能词库显示这里的推荐。"
                        : "这些内容会优先采用本组中已选的推荐。"}
                    </Typography.Text>
                  </div>
                  <Space>
                    {canEdit && !group.is_global && (
                      <Button
                        type="text"
                        icon={<EditOutlined aria-hidden />}
                        onClick={() => openSettings(group)}
                      >
                        编辑分组
                      </Button>
                    )}
                    {editable && rec.format === "paired" && (
                      <Button
                        icon={<PlusOutlined aria-hidden />}
                        disabled={rec.pairs.length >= 20}
                        onClick={() =>
                          setEditing({ groupId: group.id, initial: {} })
                        }
                      >
                        新增整套推荐
                      </Button>
                    )}
                  </Space>
                </div>
                {!group.is_global && (
                  <div className="dubbing-group-areas">
                    {group.areas.map((id) => (
                      <Tag key={id}>
                        {areas.find((area) => area.value === id)?.label ?? id}
                      </Tag>
                    ))}
                    {canEdit && (
                      <Button
                        type="link"
                        size="small"
                        onClick={() => openSettings(group)}
                      >
                        管理板块
                      </Button>
                    )}
                  </div>
                )}
                {recommendations(group, editable)}
                <div className="dubbing-group-footer">
                  <Typography.Text
                    type={draft ? undefined : "secondary"}
                    className={draft ? "dubbing-group-dirty" : undefined}
                  >
                    {draft ? (
                      "本组有未保存修改"
                    ) : (
                      <>
                        <CheckOutlined aria-hidden /> 本组配置已保存
                      </>
                    )}
                  </Typography.Text>
                  {(canEdit || draft) && (
                    <Space>
                      <Button
                        disabled={!draft || saving}
                        onClick={() => {
                          discard(group.id);
                          void groups.refetch();
                        }}
                      >
                        取消修改
                      </Button>
                      <Button
                        type="primary"
                        icon={<SaveOutlined aria-hidden />}
                        loading={savingId === group.id}
                        disabled={!draft || !canEdit || saving}
                        onClick={() => void save(group.id)}
                      >
                        保存当前组
                      </Button>
                    </Space>
                  )}
                </div>
                {canEdit &&
                  groups.data.groups.some((g) => g.id === group.id) && (
                    <div className="dubbing-group-updates">
                      <DubbingAudioUpdates
                        groupId={group.id}
                        revision={group.revision}
                      />
                    </div>
                  )}
              </section>
            );
          })}
        </div>
      </div>
      <Modal
        open={!!settingsId}
        title={settingsCreating ? "新建分组" : "编辑分组"}
        onCancel={cancelSettings}
        footer={null}
        destroyOnHidden
      >
        <Form
          form={settingsForm}
          layout="vertical"
          disabled={!canEdit || saving}
          onValuesChange={() => setSettingsDirty(true)}
          onFinish={(value) => {
            if (!settingsId) return;
            change(settingsId, (group) => ({
              ...group,
              name: value.name.trim(),
              areas: value.areas
            }));
            setSettingsDirty(false);
            setSettingsCreating(false);
            setSettingsId(undefined);
          }}
        >
          <Form.Item
            name="name"
            label="分组名称"
            rules={[
              { required: true, whitespace: true, message: "请填写分组名称" }
            ]}
          >
            <Input aria-label="分组名称" maxLength={30} />
          </Form.Item>
          <Form.Item name="areas" label="适用板块">
            <Select aria-label="使用板块" mode="multiple" options={areas} />
          </Form.Item>
          <div className="dubbing-settings-footer">
            <div>
              {settingsId &&
                groups.data.groups.some((g) => g.id === settingsId) && (
                  <Button
                    danger
                    type="text"
                    icon={<DeleteOutlined aria-hidden />}
                    onClick={() => {
                      const group = current.find((g) => g.id === settingsId);
                      if (group) removeGroup(group);
                    }}
                  >
                    删除分组
                  </Button>
                )}
            </div>
            <Space>
              <Button disabled={saving} onClick={cancelSettings}>
                取消
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                disabled={!canEdit || saving}
              >
                应用到本组
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>
      {reviewGroup?.recommendations.format === "legacy" && (
        <LegacyGroupReview
          key={reviewGroup.id}
          group={reviewGroup}
          voices={voices}
          open={!editing?.legacy}
          disabled={!canEdit || saving}
          onCancel={() => setReviewId(undefined)}
          onAdd={() =>
            setEditing({ groupId: reviewGroup.id, initial: {}, legacy: true })
          }
          onRemove={(id) =>
            updatePairs(reviewGroup.id, (items) =>
              items.filter((pair) => pair.id !== id)
            )
          }
          onComplete={(pairs) => {
            if (!legacyComplete({ ...reviewGroup, legacyPairs: pairs })) return;
            change(reviewGroup.id, (group) => ({
              ...group,
              recommendations: { format: "paired", pairs }
            }));
            setReviewId(undefined);
          }}
        />
      )}
      {editing && editingGroup && (
        <RecommendationEditor
          key={`${editing.groupId}-${editing.initial.id ?? "new"}-${editing.side ?? "pair"}`}
          voices={voices}
          initial={editing.initial}
          side={editing.side}
          legacy={
            editing.legacy && legacy
              ? {
                  uk: legacy.uk.filter(
                    (i) =>
                      !editingGroup.legacyPairs?.some(
                        (pair) => pair.uk.id === i.id
                      )
                  ),
                  us: legacy.us.filter(
                    (i) =>
                      !editingGroup.legacyPairs?.some(
                        (pair) => pair.us.id === i.id
                      )
                  )
                }
              : undefined
          }
          disabled={!canEdit || saving}
          onBeforeAudition={onInvalidatePreview}
          onCancel={() => setEditing(undefined)}
          onSave={(pair) => {
            updatePairs(editing.groupId, (items) =>
              items.some((p) => p.id === pair.id)
                ? items.map((p) => (p.id === pair.id ? pair : p))
                : [...items, pair]
            );
            setEditing(undefined);
          }}
        />
      )}
      <Modal
        open={previewArea !== undefined}
        title="词库中怎么看"
        onCancel={() => setPreviewArea(undefined)}
        footer={
          <Button type="primary" onClick={() => setPreviewArea(undefined)}>
            知道了
          </Button>
        }
        width={900}
      >
        <Typography.Paragraph type="secondary">
          有适用分组时展示该组推荐，没有时才展示全局常用。这里预览已保存的配置。
        </Typography.Paragraph>
        <Select
          aria-label="预览内容板块"
          options={areas}
          value={previewArea}
          onChange={setPreviewArea}
          style={{ width: 260 }}
        />
        <div className="dubbing-scope-preview">
          {previewGroups.map((group) => (
            <section key={group.id} aria-label={`${group.name} 词库推荐预览`}>
              <Typography.Title level={5}>{group.name}</Typography.Title>
              {recommendations(group, false, false)}
            </section>
          ))}
          {!previewGroups.length && (
            <Typography.Paragraph type="secondary">
              尚无推荐，请先维护分组配音。
            </Typography.Paragraph>
          )}
        </div>
      </Modal>
    </div>
  );
}
