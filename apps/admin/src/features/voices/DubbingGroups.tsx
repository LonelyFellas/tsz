import { speechAccentGroup } from "@tsz/shared";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  SaveOutlined
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
  Checkbox,
  Collapse,
  Flex,
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
import {
  DubbingAudioUpdates,
  DubbingAudioUpdateSettings
} from "./DubbingAudioUpdates";
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
  const [settingsDirty, setSettingsDirty] = useState(false);
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
      value[id] ? { ...value, [id]: update(value[id]) } : value
    );
    setSaved(undefined);
  }
  function discard(id: string) {
    onInvalidatePreview();
    setDrafts((value) => {
      const next = { ...value };
      delete next[id];
      return next;
    });
  }
  async function accept(result: AdminDubbingGroupsV3Response) {
    await client.cancelQueries({
      queryKey: dubbingGroupsKey(accountId),
      exact: true
    });
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
      setError("请先人工整理完整英美推荐套；全部历史侧 ID 都需保留。");
      return;
    }
    const original = groups.data?.groups.find((g) => g.id === id);
    for (const pair of draft.recommendations.pairs) {
      if (!pair.name.trim()) {
        setError("请填写推荐名称。");
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
        setSaved("本组配音已保存。");
      }
    } catch (cause) {
      setError(
        cause instanceof HttpError && cause.status === 409
          ? "本组已被修改或名称已被使用，全部草稿已保留。请重新载入；取消本组后可按最新版本编辑。"
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
    const group: DubbingDraft = {
      id: newWordNodeId(),
      name: "新分组",
      areas: [],
      recommendations: { format: "paired", pairs: [] },
      revision: 0,
      is_global: false
    };
    setDrafts((v) => ({ ...v, [group.id]: group }));
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
          return;
        }
        setSavingId(group.id);
        try {
          if (
            await accept(
              await api.speech.deleteGroupV3(group.id, group.revision)
            )
          )
            discard(group.id);
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
    editable: boolean
  ) {
    const item = { ...pair[side], name: pair.name, selected: pair.selected };
    return voiceRow(
      item,
      side,
      group,
      editable
        ? () => setEditing({ groupId: group.id, initial: pair, side })
        : undefined
    );
  }
  function voiceRow(
    item: AdminDubbingRecommendation,
    side: DubbingSide,
    group: DubbingDraft,
    edit?: () => void
  ) {
    const voice = voices.find((v) => v.alias === item.voice_alias);
    const issue = recommendationError(group.name, side, item, voice);
    const accent = voice
      ? speechAccentGroup(voice.locale, voice.accent)
      : "other";
    return (
      <div className="dubbing-pair-side" title={issue ?? undefined}>
        <Button
          type="text"
          aria-label={`试听${sideName(side)} ${item.name}`}
          className={`voice-accent-${accent}`}
          icon={<PlayCircleOutlined aria-hidden />}
          disabled={!canAudition || !!issue}
          onClick={() => voice && onAudition(voice, item)}
        />
        <div className="dubbing-side-identity">
          {voice ? (
            <VoiceName voice={voice} />
          ) : (
            <span>音色已不可用：{item.voice_alias}</span>
          )}
          {issue && (
            <Typography.Text type="danger" className="dubbing-item-issue">
              {issue}
            </Typography.Text>
          )}
        </div>
        <VoiceRate parameters={item.parameters} />
        <VoiceVolume parameters={item.parameters} />
        {edit && (
          <Button
            type="text"
            icon={<EditOutlined aria-hidden />}
            aria-label={`修改${sideName(side)} ${item.name}`}
            onClick={edit}
          />
        )}
      </div>
    );
  }
  const editingGroup = editing && drafts[editing.groupId];
  const legacy =
    editingGroup?.recommendations.format === "legacy"
      ? editingGroup.recommendations
      : undefined;
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
      <Flex align="center" wrap gap={12}>
        <Typography.Text type="secondary">
          每组独立编辑；完成只保存本组，取消只丢弃本组草稿。
        </Typography.Text>
        {canEdit && (
          <Button
            icon={<PlusOutlined aria-hidden />}
            disabled={saving || current.filter((g) => !g.is_global).length >= 5}
            onClick={addGroup}
          >
            新增分组
          </Button>
        )}
      </Flex>
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
      <Typography.Text type="secondary">
        普通分组可共用板块；从上到下查找首个合格推荐，最后回退全局常用。
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
              children: <DubbingAudioUpdates revision={groups.data.revision} />
            }
          ]}
        />
      )}
      {current.length === 0 && (
        <Typography.Paragraph type="secondary">
          尚未设置分组推荐
        </Typography.Paragraph>
      )}
      <Form component="div" className="dubbing-group-list" layout="vertical">
        {current.map((group, index) => {
          const draft = drafts[group.id],
            editable = canEdit && !!draft && savingId !== group.id;
          const storedIndex = groups.data.groups.findIndex(
            (g) => g.id === group.id
          );
          const rec = group.recommendations;
          const pairs =
            rec.format === "paired" ? rec.pairs : (group.legacyPairs ?? []);
          return (
            <div key={group.id} className="dubbing-group-shell">
              <div
                className="dubbing-group-order"
                aria-label={`${group.name} 分组顺序`}
              >
                <span>{group.is_global ? "全局" : index + 1}</span>
                {canEdit && !group.is_global && (
                  <>
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
                          groups.data.groups[storedIndex + direction]?.is_global
                        }
                        onClick={() => void reorder(group.id, direction)}
                      />
                    ))}
                  </>
                )}
              </div>
              <Card
                size="small"
                className={`dubbing-group${draft ? " is-editing" : ""}`}
              >
                <Flex align="center" justify="space-between" wrap gap={12}>
                  <Space>
                    {group.is_global ? <Tag color="blue">固定末位</Tag> : null}
                    <Typography.Text className="dubbing-group-name">
                      {group.name}
                    </Typography.Text>
                  </Space>
                  <Space>
                    {canEdit && !draft && (
                      <Button
                        icon={<EditOutlined aria-hidden />}
                        onClick={() =>
                          setDrafts((v) => ({
                            ...v,
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
                <div className="dubbing-group-header">
                  {editable && !group.is_global && (
                    <Form.Item label="分组名称">
                      <Input
                        aria-label="分组名称"
                        value={group.name}
                        maxLength={30}
                        onChange={(e) =>
                          change(group.id, (g) => ({
                            ...g,
                            name: e.target.value
                          }))
                        }
                      />
                    </Form.Item>
                  )}
                  <Form.Item
                    label={
                      <Space size={4}>
                        适用板块
                        {canEdit && !draft && (
                          <Button
                            type="text"
                            size="small"
                            aria-label={`编辑${group.name}板块`}
                            icon={<EditOutlined aria-hidden />}
                            onClick={() =>
                              setDrafts((v) => ({
                                ...v,
                                [group.id]: structuredClone(group)
                              }))
                            }
                          />
                        )}
                      </Space>
                    }
                  >
                    {editable ? (
                      <Select
                        mode="multiple"
                        aria-label={`${group.name} 使用板块`}
                        disabled={group.is_global}
                        value={group.areas}
                        options={areas}
                        onChange={(value) =>
                          change(group.id, (g) => ({ ...g, areas: value }))
                        }
                      />
                    ) : (
                      <Space wrap>
                        {group.areas.map((id) => (
                          <Tag key={id}>
                            {areas.find((a) => a.value === id)?.label ?? id}
                          </Tag>
                        ))}
                      </Space>
                    )}
                  </Form.Item>
                  {editable && !group.is_global && (
                    <Button
                      danger
                      type="text"
                      aria-label="删除分组"
                      icon={<DeleteOutlined aria-hidden />}
                      disabled={saving}
                      onClick={() => removeGroup(group)}
                    />
                  )}
                </div>
                {canEdit && storedIndex >= 0 && (
                  <DubbingAudioUpdates
                    groupId={group.id}
                    revision={group.revision}
                  />
                )}
                {rec.format === "legacy" && (
                  <div className="dubbing-legacy">
                    <Alert
                      type="warning"
                      showIcon
                      title="历史推荐尚未配对"
                      description="以下英美版本各自保留原身份与参数，未按位置或名称自动配对。完成前须逐套人工配对／补齐；不删除未选或重复音色版本。"
                    />
                    {sides.map((side) => (
                      <section
                        key={side}
                        aria-label={`${group.name} ${sideName(side)}历史推荐`}
                      >
                        <Typography.Title level={5}>
                          {sideName(side)}历史推荐
                        </Typography.Title>
                        {rec[side].map((item) => (
                          <div key={item.id} className="dubbing-legacy-item">
                            <Typography.Text>
                              {item.name}
                              {item.selected === false
                                ? "（未选）"
                                : "（已选）"}
                            </Typography.Text>
                            {voiceRow(item, side, group)}
                            <Typography.Text code copyable>
                              {item.id}
                            </Typography.Text>
                          </div>
                        ))}
                        {!rec[side].length && (
                          <Typography.Text type="secondary">
                            无历史版本
                          </Typography.Text>
                        )}
                      </section>
                    ))}
                    {editable && (
                      <Space wrap>
                        <Button
                          disabled={pairs.length >= 20}
                          onClick={() =>
                            setEditing({
                              groupId: group.id,
                              initial: {},
                              legacy: true
                            })
                          }
                        >
                          人工配对／补齐
                        </Button>
                        <Button
                          disabled={!legacyComplete(group)}
                          onClick={() =>
                            change(group.id, (g) => ({
                              ...g,
                              recommendations: {
                                format: "paired",
                                pairs: g.legacyPairs ?? []
                              }
                            }))
                          }
                        >
                          完成整理
                        </Button>
                        <Typography.Text type="secondary">
                          已整理 {pairs.length} 套；须覆盖每个旧侧 ID
                          后才能转换。
                        </Typography.Text>
                      </Space>
                    )}
                  </div>
                )}
                {(rec.format === "paired" || pairs.length > 0) && (
                  <div className="dubbing-pairs-scroll">
                    <div className="dubbing-pairs">
                      <div className="dubbing-pair-row dubbing-pair-head">
                        <span>顺序／推荐</span>
                        {sides.map((side) => (
                          <div key={side} className="dubbing-pair-side">
                            <span>试听</span>
                            <span>{sideName(side)}音色</span>
                            <span>语速</span>
                            <span>音量</span>
                            <span />
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
                            <Checkbox
                              aria-label={`选用 ${pair.name}`}
                              disabled={!editable}
                              checked={pair.selected}
                              onChange={(e) =>
                                updatePairs(group.id, (items) =>
                                  items.map((p) =>
                                    p.id === pair.id
                                      ? { ...p, selected: e.target.checked }
                                      : p
                                  )
                                )
                              }
                            >
                              {pairIndex + 1}
                            </Checkbox>
                            {editable ? (
                              <Input
                                size="small"
                                className="dubbing-pair-name"
                                aria-label={`推荐名称 ${pairIndex + 1}`}
                                maxLength={40}
                                value={pair.name}
                                onChange={(e) =>
                                  updatePairs(group.id, (items) =>
                                    items.map((p) =>
                                      p.id === pair.id
                                        ? { ...p, name: e.target.value }
                                        : p
                                    )
                                  )
                                }
                              />
                            ) : (
                              <span
                                title={pair.name}
                                className="dubbing-pair-name"
                              >
                                {pair.name}
                              </span>
                            )}
                            {editable && (
                              <Space size={0}>
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
                                        [
                                          next[pairIndex],
                                          next[pairIndex + direction]
                                        ] = [
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
                                  disabled={
                                    pairs.length >= 20 ||
                                    rec.format === "legacy"
                                  }
                                  onClick={() =>
                                    setEditing({
                                      groupId: group.id,
                                      initial: {
                                        ...structuredClone(pair),
                                        id: newWordNodeId(),
                                        name: `${pair.name} 副本`,
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
                              {sideRow(
                                pair,
                                side,
                                group,
                                editable && rec.format === "paired"
                              )}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {editable && rec.format === "paired" && (
                  <Button
                    icon={<PlusOutlined aria-hidden />}
                    disabled={pairs.length >= 20}
                    onClick={() =>
                      setEditing({ groupId: group.id, initial: {} })
                    }
                  >
                    新增整套推荐
                  </Button>
                )}
              </Card>
            </div>
          );
        })}
      </Form>
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
                      !editingGroup.legacyPairs?.some((p) => p.uk.id === i.id)
                  ),
                  us: legacy.us.filter(
                    (i) =>
                      !editingGroup.legacyPairs?.some((p) => p.us.id === i.id)
                  )
                }
              : undefined
          }
          disabled={!canEdit || savingId === editing.groupId}
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
    </Flex>
  );
}
