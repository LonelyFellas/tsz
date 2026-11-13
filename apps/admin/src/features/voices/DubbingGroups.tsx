import {
  useVoiceTranslation,
  VoiceText,
  voiceMessage,
  useVoiceMessageState,
  voiceMessageText,
  voiceLabel,
  type VoiceMessageValue
} from "./i18n";
import { speechAccentGroup } from "@tsz/shared";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  Trash2Icon,
  PencilIcon,
  GripVerticalIcon,
  Volume2Icon,
  PlusIcon
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HttpError } from "@tsz/api-client";
import type {
  AdminDubbingGroupsV3Response,
  AdminDubbingRecommendation,
  AdminSpeechVoice
} from "@tsz/types";
import {
  Alert,
  Button,
  Card,
  PageHeader,
  Space,
  Tag,
  Typography
} from "@tsz/ui/admin/display";
import { App, Modal, Popconfirm } from "@tsz/ui/admin/overlays";
import { Checkbox, Form, Input, Select } from "@tsz/ui/admin/forms";
import { useEffect, useState } from "react";
import { useUnsavedChanges } from "@tsz/shared/recovery";
import { useBlocker } from "react-router-dom";
import { api, useAuthStore, usePermission } from "@/lib/auth";
import { newWordNodeId } from "@/features/dictionary/word-model/primitives";
import { useDubbingDrafts } from "./DubbingDrafts";
import { DubbingAudioUpdates } from "./DubbingAudioUpdates";
import {
  dubbingGroupsKey,
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
  side: DubbingSide;
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
  const { t } = useVoiceTranslation();
  const areaOptions = areas.map((option) => ({
    ...option,
    label: voiceLabel(option.label, t)
  }));
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
  const [error, setError] = useVoiceMessageState();
  const [saveErrors, setSaveErrors] = useState<
    Record<string, VoiceMessageValue>
  >({});
  const [saved, setSaved] = useVoiceMessageState();
  const [editing, setEditing] = useState<Editing>();
  const [dragging, setDragging] = useState<{
    groupId: string;
    side: DubbingSide;
    id: string;
  }>();
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    after: boolean;
  }>();
  const [settingsId, setSettingsId] = useState<string>();
  const [settingsCreating, setSettingsCreating] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);
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
  function setGroupSaveError(id: string, message?: VoiceMessageValue) {
    setSaveErrors((value) => {
      const next = { ...value };
      if (message) next[id] = message;
      else delete next[id];
      return next;
    });
  }
  function discard(id: string) {
    onInvalidatePreview();
    setError(undefined);
    setGroupSaveError(id);
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
    // 文本入口使用独立查询缓存，保存后重新读取推荐。
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
      setGroupSaveError(id, voiceMessage("enter_a_group_name"));
      return;
    }
    const original = groups.data?.groups.find((g) => g.id === id);
    for (const side of sides)
      for (const item of draft[side]) {
        const stored = original?.[side].find((value) => value.id === item.id);
        const issue = recommendationError(
          draft.name,
          side,
          item,
          voices.find((voice) => voice.alias === item.voice_alias)
        );
        const retained =
          stored && item.selected === false
            ? { ...stored, selected: false }
            : stored;
        if (issue && JSON.stringify(retained) !== JSON.stringify(item)) {
          setGroupSaveError(id, {
            format: (t) =>
              recommendationError(
                draft.name,
                side,
                item,
                voices.find((voice) => voice.alias === item.voice_alias),
                t
              ) ?? ""
          });
          return;
        }
      }
    setSavingId(id);
    setError(undefined);
    setGroupSaveError(id);
    setSaved(undefined);
    try {
      const result = await api.speech.saveIndependentGroup(
        {
          group: {
            id,
            name: draft.name.trim(),
            areas: draft.areas,
            is_global: draft.is_global,
            uk: draft.uk,
            us: draft.us,
            revision: draft.revision
          },
          base_revision: draft.revision
        },
        draft.revision === 0 && !original
      );
      if (await accept(result)) {
        discard(id);
        setSaved(voiceMessage("group_saved", { name: draft.name.trim() }));
      }
    } catch (cause) {
      setGroupSaveError(
        id,
        cause instanceof HttpError && cause.status === 409
          ? voiceMessage(
              "this_group_changed_or_its_name_is_in_use_all_drafts_have_been_kep"
            )
          : voiceMessage(
              "could_not_save_all_drafts_in_this_group_have_been_kept_try_again"
            )
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
        setSaved(
          voiceMessage(
            "group_order_saved_incomplete_content_remains_in_each_group_s_draf"
          )
        );
    } catch (cause) {
      setError(
        cause instanceof HttpError && cause.status === 409
          ? voiceMessage(
              "the_group_set_or_order_changed_the_order_was_not_saved_all_drafts"
            )
          : voiceMessage(
              "could_not_save_the_order_all_drafts_have_been_kept_try_again"
            )
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
      name: t("new_group"),
      areas: [],
      uk: [],
      us: [],
      revision: 0,
      is_global: false
    };
    setDrafts((v) => ({ ...v, [group.id]: group }));
    settingsForm.setFieldsValue({ name: group.name, areas: group.areas });
    setSettingsDirty(false);
    setSettingsCreating(true);
    setSettingsId(group.id);
  }
  function removeGroup(group: DubbingDraft) {
    modal.confirm({
      title: <VoiceText message="delete_group" params={{ name: group.name }} />,
      content: (
        <VoiceText message="other_applicable_groups_or_global_defaults_will_be_used_published" />
      ),
      okText: <VoiceText message="delete_group_label" />,
      cancelText: <VoiceText message="cancel" />,
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
              ? voiceMessage(
                  "the_group_changed_and_was_not_deleted_all_drafts_have_been_kept_r"
                )
              : voiceMessage("could_not_delete_the_current_draft_has_been_kept")
          );
        } finally {
          setSavingId(undefined);
        }
      }
    });
  }
  function updateSide(
    groupId: string,
    side: DubbingSide,
    update: (
      items: AdminDubbingRecommendation[]
    ) => AdminDubbingRecommendation[]
  ) {
    change(groupId, (group) => ({ ...group, [side]: update(group[side]) }));
  }
  function moveRecommendation(
    groupId: string,
    side: DubbingSide,
    id: string,
    targetId: string,
    after: boolean
  ) {
    if (!canEdit || saving || id === targetId) return;
    const items = current.find((group) => group.id === groupId)?.[side];
    if (!items) return;
    const from = items.findIndex((item) => item.id === id);
    const target = items.findIndex((item) => item.id === targetId);
    if (from < 0 || target < 0) return;
    const to = target + Number(after) - Number(from < target);
    if (from === to) return;
    updateSide(groupId, side, (values) => {
      const next = [...values];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item!);
      return next;
    });
  }
  function finishDrag() {
    setDragging(undefined);
    setDropTarget(undefined);
  }
  const editingGroup =
    editing && current.find((group) => group.id === editing.groupId);
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
    return (
      <div className="dubbing-lists">
        <Typography.Text type="secondary" className="dubbing-table-scroll-hint">
          {t("scroll_horizontally_to_view_all_dubbing_settings")}
        </Typography.Text>
        <div className="dubbing-lists-scroll" tabIndex={0}>
          <div className="dubbing-independent-lists">
            {sides.map((side) => (
              <section
                key={side}
                aria-label={`${group.name} ${sideName(side, t)}`}
              >
                <div className="dubbing-list-heading">
                  <Typography.Text className={`voice-accent-${side}`}>
                    {sideName(side, t)}
                  </Typography.Text>
                  {editable && (
                    <Button
                      size="small"
                      icon={<PlusIcon aria-hidden />}
                      disabled={group[side].length >= 20}
                      onClick={() =>
                        setEditing({ groupId: group.id, side, initial: {} })
                      }
                    >
                      {t("add_recommendation")}
                    </Button>
                  )}
                </div>
                <table
                  className="dubbing-side-table"
                  aria-label={t("side_recommendations", {
                    side: sideName(side, t),
                    name: group.name
                  })}
                >
                  <thead>
                    <tr>
                      <th scope="col">{t("use_recommendation")}</th>
                      <th scope="col">{t("order")}</th>
                      <th scope="col">{t("recommendation_name")}</th>
                      <th scope="col">{t("voice")}</th>
                      <th scope="col">{t("rate")}</th>
                      <th scope="col">{t("volume")}</th>
                      {editable && <th scope="col">{t("actions")}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {group[side].map((item, index) => {
                      const voice = voices.find(
                        (voice) => voice.alias === item.voice_alias
                      );
                      const issue = recommendationError(
                        group.name,
                        side,
                        item,
                        voice,
                        t
                      );
                      const accent = voice
                        ? speechAccentGroup(voice.locale, voice.accent)
                        : "other";
                      const canReorder = editable && group[side].length > 1;
                      const sameList =
                        editable &&
                        dragging?.groupId === group.id &&
                        dragging.side === side;
                      const dropPosition =
                        sameList && dropTarget?.id === item.id
                          ? dropTarget.after
                            ? "after"
                            : "before"
                          : undefined;
                      return (
                        <tr
                          key={item.id}
                          data-recommendation-id={item.id}
                          draggable={canReorder}
                          className={
                            sameList && dragging.id === item.id
                              ? "dubbing-recommendation-dragging"
                              : undefined
                          }
                          data-drop-position={dropPosition}
                          onDragStart={(event) => {
                            const control = (
                              event.target as HTMLElement
                            ).closest('input, button, a, [role="checkbox"]');
                            if (
                              !canReorder ||
                              (control &&
                                !control.hasAttribute(
                                  "data-dubbing-drag-handle"
                                ))
                            ) {
                              event.preventDefault();
                              return;
                            }
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", item.id);
                            event.dataTransfer.setDragImage(
                              event.currentTarget,
                              24,
                              24
                            );
                            setDragging({
                              groupId: group.id,
                              side,
                              id: item.id
                            });
                          }}
                          onDragEnd={finishDrag}
                          onDragOver={(event) => {
                            if (!sameList || dragging.id === item.id) return;
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                            const rect =
                              event.currentTarget.getBoundingClientRect();
                            setDropTarget({
                              id: item.id,
                              after: event.clientY > rect.top + rect.height / 2
                            });
                          }}
                          onDragLeave={(event) => {
                            if (
                              !event.currentTarget.contains(
                                event.relatedTarget as Node | null
                              )
                            )
                              setDropTarget(undefined);
                          }}
                          onDrop={(event) => {
                            if (!sameList) return;
                            event.preventDefault();
                            const rect =
                              event.currentTarget.getBoundingClientRect();
                            moveRecommendation(
                              group.id,
                              side,
                              dragging.id,
                              item.id,
                              event.clientY > rect.top + rect.height / 2
                            );
                            finishDrag();
                          }}
                        >
                          <td>
                            <Checkbox
                              aria-label={t("select_side_recommendation", {
                                side: sideName(side, t),
                                name: item.name
                              })}
                              disabled={!editable}
                              checked={item.selected !== false}
                              onChange={(event) =>
                                updateSide(group.id, side, (items) =>
                                  items.map((value) =>
                                    value.id === item.id
                                      ? {
                                          ...value,
                                          selected: event.target.checked
                                        }
                                      : value
                                  )
                                )
                              }
                            />
                          </td>
                          <td>
                            <div className="dubbing-item-order">
                              <span>{index + 1}</span>
                              {editable && (
                                <Button
                                  size="small"
                                  type="text"
                                  data-dubbing-drag-handle=""
                                  aria-label={t("drag_recommendation", {
                                    side: sideName(side, t),
                                    name: item.name
                                  })}
                                  title={t("drag_recommendation_help")}
                                  icon={<GripVerticalIcon aria-hidden />}
                                  draggable={canReorder}
                                  disabled={!canReorder}
                                  onKeyDown={(event) => {
                                    const direction =
                                      event.key === "ArrowUp"
                                        ? -1
                                        : event.key === "ArrowDown"
                                          ? 1
                                          : 0;
                                    const target =
                                      group[side][index + direction];
                                    if (!direction || !target) return;
                                    event.preventDefault();
                                    moveRecommendation(
                                      group.id,
                                      side,
                                      item.id,
                                      target.id,
                                      direction > 0
                                    );
                                  }}
                                />
                              )}
                            </div>
                          </td>
                          <td>
                            {editable ? (
                              <Input
                                aria-label={`${sideName(side, t)} ${index + 1} ${t("recommendation_name")}`}
                                value={item.name}
                                maxLength={40}
                                onChange={(event) =>
                                  updateSide(group.id, side, (items) =>
                                    items.map((value) =>
                                      value.id === item.id
                                        ? { ...value, name: event.target.value }
                                        : value
                                    )
                                  )
                                }
                              />
                            ) : (
                              item.name
                            )}
                          </td>
                          <td>
                            <div
                              className="dubbing-item-voice"
                              title={issue ?? undefined}
                            >
                              <Button
                                type="text"
                                size="small"
                                aria-label={t("audition_side", {
                                  side: sideName(side, t),
                                  name: item.name
                                })}
                                className={`voice-accent-${accent}`}
                                icon={<Volume2Icon aria-hidden />}
                                disabled={
                                  !auditionAllowed || !canAudition || !!issue
                                }
                                onClick={() => voice && onAudition(voice, item)}
                              />
                              <span className="dubbing-side-identity">
                                {voice ? (
                                  <VoiceName voice={voice} />
                                ) : (
                                  <span>
                                    {t("unavailable_voice", {
                                      alias: item.voice_alias
                                    })}
                                  </span>
                                )}
                              </span>
                              {editable && (
                                <Button
                                  type="text"
                                  size="small"
                                  icon={<PencilIcon aria-hidden />}
                                  aria-label={t("edit_side", {
                                    side: sideName(side, t),
                                    name: item.name
                                  })}
                                  onClick={() => {
                                    onInvalidatePreview();
                                    setEditing({
                                      groupId: group.id,
                                      side,
                                      initial: item
                                    });
                                  }}
                                />
                              )}
                            </div>
                            {issue && (
                              <Typography.Text
                                type="danger"
                                className="dubbing-item-issue"
                              >
                                {issue}
                              </Typography.Text>
                            )}
                          </td>
                          <td>
                            <VoiceRate parameters={item.parameters} />
                          </td>
                          <td>
                            <VoiceVolume parameters={item.parameters} />
                          </td>
                          {editable && (
                            <td>
                              <Space size={0}>
                                <Button
                                  type="text"
                                  size="small"
                                  aria-label={t("copy_side_recommendation", {
                                    side: sideName(side, t),
                                    name: item.name
                                  })}
                                  icon={<CopyIcon aria-hidden />}
                                  disabled={group[side].length >= 20}
                                  onClick={() =>
                                    setEditing({
                                      groupId: group.id,
                                      side,
                                      initial: {
                                        ...structuredClone(item),
                                        id: newWordNodeId(),
                                        name: t("recommendation_copy_name", {
                                          name: Array.from(item.name)
                                            .slice(0, 32)
                                            .join("")
                                        })
                                      }
                                    })
                                  }
                                />
                                <Popconfirm
                                  title={t("delete_side_recommendation", {
                                    side: sideName(side, t),
                                    name: item.name
                                  })}
                                  okText={t("delete")}
                                  cancelText={t("cancel")}
                                  onConfirm={() =>
                                    updateSide(group.id, side, (items) =>
                                      items.filter(
                                        (value) => value.id !== item.id
                                      )
                                    )
                                  }
                                >
                                  <Button
                                    type="text"
                                    size="small"
                                    danger
                                    aria-label={t(
                                      "delete_side_recommendation",
                                      {
                                        side: sideName(side, t),
                                        name: item.name
                                      }
                                    )}
                                    icon={<Trash2Icon aria-hidden />}
                                  />
                                </Popconfirm>
                              </Space>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!group[side].length && (
                  <Typography.Paragraph
                    className="dubbing-list-empty"
                    type="secondary"
                  >
                    {t("no_side_voices", { side: sideName(side, t) })}
                  </Typography.Paragraph>
                )}
              </section>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (groups.isError && !dirty)
    return (
      <Alert
        type="error"
        showIcon
        title={t("could_not_load_groups_try_again")}
        action={
          <Button onClick={() => void groups.refetch()}>
            {t("try_again")}
          </Button>
        }
      />
    );
  if (!groups.data) return <Card loading />;
  return (
    <div className="dubbing-groups">
      {blocker.state === "blocked" && (
        <Modal
          open
          title={t("group_changes_have_not_been_saved")}
          onCancel={() => blocker.reset()}
          footer={
            <Space>
              <Button onClick={() => blocker.reset()}>
                {t("continue_editing")}
              </Button>
              <Button
                disabled={saving}
                onClick={() => {
                  setDrafts({});
                  blocker.proceed();
                }}
              >
                {t("discard_and_leave")}
              </Button>
            </Space>
          }
        >
          {t("leaving_discards_the_current_group_drafts")}
        </Modal>
      )}
      <PageHeader
        className="dubbing-page-heading"
        title={t("group_dubbing")}
        actions={
          <Space wrap>
            <Button onClick={() => setPreviewArea("word")}>
              {t("lexicon_preview")}
            </Button>
            {canEdit && (
              <Button
                type="primary"
                icon={<PlusIcon aria-hidden />}
                disabled={
                  saving ||
                  current.filter((group) => !group.is_global).length >= 5
                }
                onClick={addGroup}
              >
                {t("add_group")}
              </Button>
            )}
          </Space>
        }
      >
        {t("set_british_and_american_voices_for_each_area_global_defaults_app")}
      </PageHeader>
      {error && (
        <Alert
          type="error"
          showIcon
          title={error}
          action={
            <Button onClick={() => void groups.refetch()}>{t("reload")}</Button>
          }
        />
      )}
      {saved && <Alert type="success" showIcon title={saved} />}
      <div className="dubbing-group-panels">
        {!current.length && (
          <div className="dubbing-empty-groups">
            <Typography.Paragraph type="secondary">
              {t("no_group_recommendations_configured")}
            </Typography.Paragraph>
          </div>
        )}
        {current.map((group, groupIndex) => {
          const draft = drafts[group.id],
            editable = canEdit && !saving;
          const storedIndex = groups.data.groups.findIndex(
            (g) => g.id === group.id
          );
          return (
            <div key={group.id} className="dubbing-group-entry">
              <div
                className="dubbing-group-priority"
                aria-label={t("group_order", { name: group.name })}
              >
                <span className="dubbing-group-number">{groupIndex + 1}</span>
                {canEdit && !group.is_global && (
                  <Space size={0}>
                    {[-1, 1].map((direction) => (
                      <Button
                        key={direction}
                        type="text"
                        size="small"
                        icon={
                          direction < 0 ? (
                            <ArrowUpIcon aria-hidden />
                          ) : (
                            <ArrowDownIcon aria-hidden />
                          )
                        }
                        aria-label={t(
                          direction < 0 ? "move_group_up" : "move_group_down",
                          { name: group.name }
                        )}
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
                  </Space>
                )}
              </div>
              <section
                className="dubbing-group"
                data-group-id={group.id}
                aria-label={t("group_settings", { name: group.name })}
              >
                <div className="dubbing-group-heading">
                  <div>
                    <div className="dubbing-group-title">
                      <Typography.Title level={3}>
                        {group.name}
                      </Typography.Title>
                      {group.is_global && <Tag>{t("global_fallback")}</Tag>}
                    </div>
                    {!group.is_global && (
                      <div className="dubbing-group-areas">
                        {group.areas.length ? (
                          group.areas.map((id) => (
                            <Tag key={id}>
                              {areaOptions.find((area) => area.value === id)
                                ?.label ?? id}
                            </Tag>
                          ))
                        ) : (
                          <Typography.Text type="secondary">
                            {t("no_areas_selected")}
                          </Typography.Text>
                        )}
                      </div>
                    )}
                  </div>
                  <Space wrap>
                    {canEdit && !group.is_global && (
                      <Button
                        type="text"
                        icon={<PencilIcon aria-hidden />}
                        disabled={saving}
                        onClick={() => openSettings(group)}
                      >
                        {t("edit_group")}
                      </Button>
                    )}
                  </Space>
                </div>
                {recommendations(group, editable)}
                {saveErrors[group.id] && (
                  <Alert
                    type="error"
                    showIcon
                    title={voiceMessageText(saveErrors[group.id], t)}
                    className="dubbing-group-save-error"
                    action={
                      <Button onClick={() => void groups.refetch()}>
                        {t("reload")}
                      </Button>
                    }
                  />
                )}
                {draft && (
                  <div className="dubbing-group-footer">
                    <Typography.Text className="dubbing-group-dirty">
                      {t("unsaved")}
                    </Typography.Text>
                    <Space>
                      <Button
                        disabled={saving}
                        onClick={() => {
                          discard(group.id);
                          void groups.refetch();
                        }}
                      >
                        {t("cancel")}
                      </Button>
                      <Button
                        type="primary"
                        loading={savingId === group.id}
                        disabled={!canEdit || saving}
                        onClick={() => void save(group.id)}
                      >
                        {t("done")}
                      </Button>
                    </Space>
                  </div>
                )}
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
            </div>
          );
        })}
      </div>
      <Modal
        open={!!settingsId}
        title={settingsCreating ? t("create_group") : t("edit_group")}
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
            label={t("group_name")}
            rules={[
              {
                required: true,
                whitespace: true,
                message: <VoiceText message="enter_a_group_name_c4069d" />
              }
            ]}
          >
            <Input aria-label={t("group_name")} maxLength={30} />
          </Form.Item>
          <Form.Item name="areas" label={t("applicable_areas")}>
            <Select
              aria-label={t("areas")}
              mode="multiple"
              options={areaOptions}
            />
          </Form.Item>
          <div className="dubbing-settings-footer">
            <div>
              {settingsId &&
                groups.data.groups.some((g) => g.id === settingsId) && (
                  <Button
                    danger
                    type="text"
                    icon={<Trash2Icon aria-hidden />}
                    onClick={() => {
                      const group = current.find((g) => g.id === settingsId);
                      if (group) removeGroup(group);
                    }}
                  >
                    {t("delete_group_label")}
                  </Button>
                )}
            </div>
            <Space>
              <Button disabled={saving} onClick={cancelSettings}>
                {t("cancel")}
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                disabled={!canEdit || saving}
              >
                {t("apply_to_this_group")}
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>
      {editing && editingGroup && (
        <RecommendationEditor
          key={`${editing.groupId}-${editing.initial.id ?? "new"}-${editing.side}`}
          voices={voices}
          initial={editing.initial}
          side={editing.side}
          disabled={!canEdit || saving}
          onBeforeAudition={onInvalidatePreview}
          onCancel={() => setEditing(undefined)}
          onSave={(item) => {
            updateSide(editing.groupId, editing.side, (items) =>
              items.some((value) => value.id === item.id)
                ? items.map((value) => (value.id === item.id ? item : value))
                : [...items, item]
            );
            setEditing(undefined);
          }}
        />
      )}
      <Modal
        open={previewArea !== undefined}
        title={t("lexicon_preview")}
        onCancel={() => setPreviewArea(undefined)}
        footer={
          <Button type="primary" onClick={() => setPreviewArea(undefined)}>
            {t("understood")}
          </Button>
        }
        width={900}
      >
        <Typography.Paragraph type="secondary">
          {t(
            "preview_saved_recommendations_global_defaults_apply_when_no_group"
          )}
        </Typography.Paragraph>
        <Select
          aria-label={t("preview_area")}
          options={areaOptions}
          value={previewArea}
          onChange={setPreviewArea}
          style={{ width: 260 }}
        />
        <div className="dubbing-scope-preview">
          {previewGroups.map((group) => (
            <section
              key={group.id}
              aria-label={t("group_preview", { name: group.name })}
            >
              <Typography.Title level={5}>{group.name}</Typography.Title>
              {recommendations(group, false, false)}
            </section>
          ))}
          {!previewGroups.length && (
            <Typography.Paragraph type="secondary">
              {t("no_recommendations_yet_add_one_first")}
            </Typography.Paragraph>
          )}
        </div>
      </Modal>
    </div>
  );
}
