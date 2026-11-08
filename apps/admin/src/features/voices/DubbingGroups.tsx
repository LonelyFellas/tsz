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
  Volume2Icon,
  PlusIcon,
  SaveIcon,
  CheckIcon
} from "lucide-react";
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
      setGroupSaveError(id, voiceMessage("enter_a_group_name"));
      return;
    }
    if (draft.recommendations.format !== "paired") {
      setGroupSaveError(
        id,
        voiceMessage(
          "confirm_the_existing_british_and_american_voice_pairs_before_savi"
        )
      );
      return;
    }
    const original = groups.data?.groups.find((g) => g.id === id);
    for (const pair of draft.recommendations.pairs) {
      if (!pair.name.trim()) {
        setGroupSaveError(id, voiceMessage("enter_a_recommendation_name"));
        return;
      }
      if (Array.from(pair.name).length > 40) {
        setGroupSaveError(
          id,
          voiceMessage("recommendation_names_must_be_at_most_40_characters")
        );
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
          setGroupSaveError(id, {
            format: (t) =>
              recommendationError(
                draft.name,
                side,
                item,
                voices.find((v) => v.alias === item.voice_alias),
                t
              ) ?? ""
          });
          return;
        }
      }
    }
    setSavingId(id);
    setError(undefined);
    setGroupSaveError(id);
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
      name: "新分组",
      areas: [],
      recommendations: { format: "paired", pairs: [] },
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
    const issue = recommendationError(group.name, side, item, voice, t);
    const accent = voice
      ? speechAccentGroup(voice.locale, voice.accent)
      : "other";
    return (
      <div className="dubbing-pair-side" title={issue ?? undefined}>
        <div className="dubbing-side-heading">
          <Button
            type="text"
            aria-label={t("audition_side", {
              side: sideName(side, t),
              name: item.name
            })}
            className={`voice-accent-${accent}`}
            icon={<Volume2Icon aria-hidden />}
            disabled={!auditionAllowed || !canAudition || !!issue}
            onClick={() => voice && onAudition(voice, item)}
          />
          <div className="dubbing-side-identity">
            {voice ? (
              <VoiceName voice={voice} />
            ) : (
              <span>{t("unavailable_voice", { alias: item.voice_alias })}</span>
            )}
          </div>
          {edit && (
            <Button
              type="text"
              icon={<PencilIcon aria-hidden />}
              aria-label={t("edit_side", {
                side: sideName(side, t),
                name: item.name
              })}
              onClick={() => {
                onInvalidatePreview();
                edit();
              }}
            />
          )}
        </div>
        <div className="dubbing-side-parameters">
          <span>
            {t("rate")} <VoiceRate parameters={item.parameters} />
          </span>
          <span>
            {t("volume")} <VoiceVolume parameters={item.parameters} />
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
                {t(
                  "existing_voices_have_been_kept_check_the_british_and_american_pai"
                )}
              </Typography.Text>
              {editable && (
                <Button onClick={() => setReviewId(group.id)}>
                  {t("review_voices")}
                </Button>
              )}
            </div>
            <div className="dubbing-legacy-overview">
              {sides.map((side) => (
                <section
                  key={side}
                  aria-label={t("group_legacy_side", {
                    name: group.name,
                    side: sideName(side, t)
                  })}
                >
                  <Typography.Text className={`voice-accent-${side}`}>
                    {sideName(side, t)}
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
                          {item.selected === false ? t("not_selected") : ""}
                        </span>
                      )}
                      {voiceRow(item, side, group, undefined, auditionAllowed)}
                    </div>
                  ))}
                  {!rec[side].length && (
                    <Typography.Paragraph type="secondary">
                      {t("no_side_voices", { side: sideName(side, t) })}
                    </Typography.Paragraph>
                  )}
                </section>
              ))}
            </div>
          </>
        )}
        {rec.format === "paired" && (
          <>
            {pairs.length > 0 && (
              <Typography.Text
                className="dubbing-table-scroll-hint"
                type="secondary"
              >
                {t("scroll_horizontally_to_view_all_dubbing_settings")}
              </Typography.Text>
            )}
            <div
              className="dubbing-pairs-scroll"
              tabIndex={pairs.length ? 0 : undefined}
            >
              <table
                className={`dubbing-pairs${pairs.length ? "" : " is-empty"}`}
                aria-label={t("group_pairs", { name: group.name })}
              >
                {pairs.length > 0 && (
                  <thead>
                    <tr className="dubbing-pair-head">
                      <th scope="col">{t("recommendation_pair")}</th>
                      {sides.map((side) => (
                        <th key={side} scope="col">
                          <div
                            className={`dubbing-locale-heading voice-accent-${side}`}
                          >
                            <span>{sideName(side, t)}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                )}
                <tbody>
                  {pairs.map((pair, pairIndex) => (
                    <tr
                      key={pair.id}
                      className="dubbing-pair-row"
                      data-pair-id={pair.id}
                    >
                      <td className="dubbing-pair-controls">
                        <div className="dubbing-pair-choice">
                          <Checkbox
                            aria-label={t("select_pair", { name: pair.name })}
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
                              aria-label={t("recommendation_index", {
                                index: pairIndex + 1
                              })}
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
                                ? pairIndex ===
                                  pairs.findIndex((p) => p.selected)
                                  ? t("use_first")
                                  : t("selected")
                                : t("not_selected_834924")}
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
                                aria-label={t(
                                  direction < 0
                                    ? "move_recommendation_up"
                                    : "move_recommendation_down",
                                  { name: pair.name }
                                )}
                                icon={
                                  direction < 0 ? (
                                    <ArrowUpIcon aria-hidden />
                                  ) : (
                                    <ArrowDownIcon aria-hidden />
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
                              icon={<CopyIcon aria-hidden />}
                              aria-label={t("copy_pair", { name: pair.name })}
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
                            <Popconfirm
                              title={t("delete_recommendation", {
                                name: pair.name
                              })}
                              description={t(
                                "this_british_and_american_pair_will_be_removed_when_you_save_the_"
                              )}
                              okText={t("delete")}
                              cancelText={t("cancel")}
                              okButtonProps={{ danger: true }}
                              destroyOnHidden
                              onConfirm={() =>
                                updatePairs(group.id, (items) =>
                                  items.filter((p) => p.id !== pair.id)
                                )
                              }
                            >
                              <Button
                                danger
                                type="text"
                                size="small"
                                icon={<Trash2Icon aria-hidden />}
                                aria-label={t("remove_recommendation", {
                                  name: pair.name
                                })}
                              />
                            </Popconfirm>
                          </Space>
                        )}
                      </td>
                      {sides.map((side) => (
                        <td key={side}>
                          {sideRow(
                            pair,
                            side,
                            group,
                            editable,
                            auditionAllowed
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!pairs.length && (
                    <tr>
                      <td colSpan={3} className="dubbing-pair-empty">
                        <Typography.Title level={5}>
                          {t("no_recommendations_yet")}
                        </Typography.Title>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </>
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
          const rec = group.recommendations;
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
                        onClick={() => openSettings(group)}
                      >
                        {t("edit_group")}
                      </Button>
                    )}
                    {editable && rec.format === "paired" && (
                      <Button
                        icon={<PlusIcon aria-hidden />}
                        disabled={rec.pairs.length >= 20}
                        onClick={() =>
                          setEditing({ groupId: group.id, initial: {} })
                        }
                      >
                        {t("add_recommendation")}
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
                <div className="dubbing-group-footer">
                  <Typography.Text
                    type={draft ? undefined : "secondary"}
                    className={draft ? "dubbing-group-dirty" : undefined}
                  >
                    {draft ? (
                      t("unsaved")
                    ) : (
                      <>
                        <CheckIcon aria-hidden /> {t("saved")}
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
                        {t("discard_changes")}
                      </Button>
                      <Button
                        type="primary"
                        icon={<SaveIcon aria-hidden />}
                        loading={savingId === group.id}
                        disabled={!draft || !canEdit || saving}
                        onClick={() => void save(group.id)}
                      >
                        {t("save_current_group")}
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
