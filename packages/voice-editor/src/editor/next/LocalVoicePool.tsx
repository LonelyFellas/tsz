import {
  useVoiceEditorTranslation,
  defaultVoiceEditorTranslation,
  type VoiceEditorTranslation,
  useVoiceEditorMessageState,
  createVoiceEditorMessage
} from "../i18n";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PencilIcon,
  CircleHelpIcon,
  Volume2Icon
} from "lucide-react";
import { Alert, Button, Space, Spin, Typography } from "@tsz/ui/admin/display";
import { Checkbox, Input, Radio } from "@tsz/ui/admin/forms";
import { Popover, Tooltip } from "@tsz/ui/admin/overlays";
import { speechAccentGroup } from "@tsz/shared";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import type { RichTextV2 } from "@tsz/types";
import type {
  AudioAsset,
  AudioAssetLocale,
  VoiceOption,
  VoicePreviewAdapter,
  VoiceProfile,
  VoiceRecommendation,
  VoiceRecommendationArea,
  VoiceSetting
} from "../../types";
import {
  convertVoicePool,
  clearVoiceAudio,
  retainResolvedAudio,
  effectiveVoiceSetting,
  isVoiceRecommendationAvailable,
  providerVoiceKey,
  reorderPoolVoice,
  switchPoolRecommendation,
  togglePoolVoice,
  voicePoolConflicts,
  voicePoolProbabilities,
  voiceSettingKey
} from "../../core";
import { PoolVoiceName, PoolVoiceRate, PoolVoiceVolume } from "./VoiceDisplay";
import { VoiceDetail } from "./VoiceDetail";

function voiceSides(t: VoiceEditorTranslation = defaultVoiceEditorTranslation) {
  return [
    { key: "uk", locale: "en-GB", label: t("british") },
    { key: "us", locale: "en-US", label: t("american") }
  ] as const;
}

export function LocalVoicePool({
  profile,
  settings,
  voices,
  loading,
  recommendations,
  area,
  locale,
  nativeAuditionLocale,
  content,
  sourceKey,
  adapter,
  readOnly,
  canAudition,
  canAuditionCatalog,
  auditionStatus,
  auditionActive,
  onStopAudition,
  pendingUpload,
  generatingVersion,
  audioPending,
  onRetryAudio,
  onChange,
  onAudition,
  onRestore,
  onOpenDetail,
  onCloseDetail,
  audioTools,
  audioAssets,
  error,
  unavailableVersions,
  previousAudio = []
}: {
  profile?: VoiceProfile | null;
  settings: VoiceSetting[];
  voices: VoiceOption[];
  loading: boolean;
  recommendations: VoiceRecommendation[];
  area: VoiceRecommendationArea;
  locale?: AudioAssetLocale;
  nativeAuditionLocale?: AudioAssetLocale;
  content: RichTextV2;
  sourceKey: string;
  adapter?: VoicePreviewAdapter;
  readOnly: boolean;
  canAudition: boolean;
  canAuditionCatalog: boolean;
  auditionStatus?: string;
  auditionActive: boolean;
  onStopAudition: () => void;
  pendingUpload: boolean;
  generatingVersion?: string;
  audioPending: boolean;
  onRetryAudio: () => void;
  onChange: (profile: VoiceProfile) => void;
  onAudition: (
    voice: VoiceOption,
    setting?: VoiceSetting,
    catalog?: boolean
  ) => void;
  onRestore: () => void;
  onOpenDetail: (dialect: "en-GB" | "en-US") => void;
  onCloseDetail: () => void;
  audioTools: (
    dialect: "en-GB" | "en-US",
    stopPlayback: () => void
  ) => ReactNode;
  error?: string;
  unavailableVersions?: ReadonlySet<string>;
  previousAudio?: VoiceSetting[];
  audioAssets?: AudioAsset[];
}) {
  const { t } = useVoiceEditorTranslation();
  const sides = voiceSides(t).filter(
    (side) => !locale || locale === side.locale
  );
  const [notice, setNotice] = useVoiceEditorMessageState("");
  const [search, setSearch] = useState<Record<string, string>>({});
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<{
    setting: VoiceSetting;
    profile: VoiceProfile;
    sourceKey: string;
    baseline: string;
    dialect: "en-GB" | "en-US";
  }>();
  useEffect(() => {
    if (
      detail &&
      (detail.sourceKey !== sourceKey ||
        detail.baseline !==
          JSON.stringify(profile ? clearVoiceAudio(profile) : null))
    ) {
      setDetail(undefined);
      onCloseDetail();
    }
  }, [sourceKey, profile, detail, onCloseDetail]);
  const columns = useRef(new Map<string, HTMLDivElement>());
  const positions = useRef(new Map<string, number>());
  const unfilteredPositions = useRef(new Map<string, number>());
  const previousSearch = useRef<Record<string, string>>({});
  useLayoutEffect(() => {
    columns.current.forEach((list, key) => {
      const saved =
        !search[key] && previousSearch.current[key]
          ? unfilteredPositions.current.get(key)
          : positions.current.get(key);
      if (saved !== undefined) {
        list.scrollTop = saved;
        positions.current.set(key, saved);
      }
    });
    previousSearch.current = search;
  }, [search, settings, recommendations]);
  const inherited = profile?.dubbing?.mode === "inherit";
  const converted = !!profile?.dubbing?.pool_version;
  // Resolved inheritance is a view. Only an explicit action materializes it.
  const current = converted && !inherited ? profile!.voices : settings;
  const requiresPhoneme =
    !!nativeAuditionLocale ||
    content.annotations.some((mark) => mark.type === "phoneme");
  const phonemeIssue = (voice: VoiceOption) =>
    requiresPhoneme && voice.supportsPhoneme === false
      ? t("this_voice_does_not_support_specified_phonemes_select_another_voice")
      : nativeAuditionLocale && voice.locale !== nativeAuditionLocale
        ? t(
            "current_phonemes_use_and_cannot_be_auditioned_with_another_accent_you_can_d",
            { p0: nativeAuditionLocale }
          )
        : undefined;
  const isSelected = (voice: VoiceOption) =>
    current.some(
      (setting) =>
        setting.enabled &&
        providerVoiceKey(setting.voice_id, voices) ===
          providerVoiceKey(voice.id, voices)
    );
  const conflicts = voicePoolConflicts(current, voices);
  const pairs = recommendations
    .filter((item) => item.pairId && item.groupId)
    .reduce<VoiceRecommendation[][]>((groups, item) => {
      const pair = groups.find(
        (group) =>
          group[0]!.pairId === item.pairId && group[0]!.groupId === item.groupId
      );
      if (pair) pair.push(item);
      else groups.push([item]);
      return groups;
    }, []);
  const visiblePairs = pairs.filter(
    (pair) =>
      !pair[0]!.fallbackOnly &&
      pair.some((item) => !locale || item.locale === locale)
  );
  const legacyRecommendations = recommendations.filter(
    (item) =>
      !item.pairId && !item.fallbackOnly && (!locale || item.locale === locale)
  );
  const inheritedPair = inherited
    ? pairs.find((pair) =>
        pair
          .filter((item) => !locale || item.locale === locale)
          .every((item) =>
            current.some(
              (setting) =>
                setting.enabled && voiceSettingKey(setting) === item.id
            )
          )
      )
    : undefined;
  const source = profile?.dubbing?.recommendation;
  const selectedPair = inherited
    ? inheritedPair
    : pairs.find(
        (pair) =>
          pair[0]!.pairId === source?.pair_id &&
          pair[0]!.groupId === source?.group_id
      );
  const excluded = new Set(
    (inherited
      ? inheritedPair?.map((item) => item.setting.voice_id)
      : source?.voice_ids
    )?.map((id) => providerVoiceKey(id, voices)) ?? []
  );
  const probabilities = voicePoolProbabilities(
    current.filter((item) => !unavailableVersions?.has(voiceSettingKey(item))),
    voices,
    content,
    locale,
    nativeAuditionLocale
  );
  function materialize(): VoiceProfile | undefined {
    if (conflicts.length) {
      setNotice(
        createVoiceEditorMessage(
          "resolve_the_historical_configuration_conflicts_before_converting_to_a_new_p"
        )
      );
      return;
    }
    const local = convertVoicePool(profile, current, voices, area);
    if (inherited) {
      const contributed = current
        .filter((item) => item.enabled)
        .map(voiceSettingKey);
      const pair = inheritedPair?.[0];
      if (pair?.groupId && pair.pairId)
        local.dubbing!.recommendation = {
          group_id: pair.groupId,
          pair_id: pair.pairId,
          voice_ids: inheritedPair!.map((item) => item.setting.voice_id),
          contribution_ids: contributed
        };
    }
    return local;
  }
  function selectRecommendation(pair: VoiceRecommendation[]) {
    if (readOnly) return;
    const local = materialize();
    if (!local) return;
    // An inherited legacy/default view has no pair identity but its active defaults must still be cleared.
    if (inherited && !local.dubbing?.recommendation)
      local.voices = local.voices.map((item) =>
        item.enabled ? { ...item, enabled: false } : item
      );
    const result = switchPoolRecommendation(
      local,
      pair.filter((item) => !locale || item.locale === locale),
      voices
    );
    if (result.profile.dubbing?.recommendation)
      result.profile.dubbing.recommendation.voice_ids = pair.map(
        (item) => item.setting.voice_id
      );
    setNotice(
      result.duplicates.length
        ? createVoiceEditorMessage(
            "this_recommendation_duplicates_an_existing_voice_existing_local_parameters"
          )
        : pair.length
          ? createVoiceEditorMessage(
              "local_recommendation_copy_applied_save_it_through_the_host_workflow"
            )
          : createVoiceEditorMessage(
              "recommendation_deselected_its_voice_remains_in_the_unselected_cache_voices"
            )
    );
    onChange(result.profile);
  }
  function toggle(voice: VoiceOption) {
    if (readOnly) return;
    if (phonemeIssue(voice) && !isSelected(voice)) return;
    const local = materialize();
    if (local) onChange(togglePoolVoice(local, voice, voices));
  }
  function edit(setting: VoiceSetting) {
    if (readOnly) return;
    const local = materialize();
    if (!local) return;
    const selected =
      local.voices.find(
        (item) => voiceSettingKey(item) === voiceSettingKey(setting)
      ) ?? local.voices.find((item) => item.voice_id === setting.voice_id);
    const voice = voices.find((item) => item.id === setting.voice_id);
    if (!voice || !selected) return;
    const dialect =
      speechAccentGroup(voice.locale, voice.accent) === "uk"
        ? "en-GB"
        : "en-US";
    onOpenDetail(dialect);
    setDetail({
      setting: structuredClone(selected),
      profile: local,
      sourceKey,
      baseline: JSON.stringify(profile ? clearVoiceAudio(profile) : null),
      dialect
    });
  }
  function preview(
    item: VoiceSetting,
    accent?: AudioAssetLocale,
    catalog = false
  ) {
    const catalogVoice = voices.find((v) => v.id === item.voice_id);
    const voice =
      catalogVoice ??
      (item.audio_asset_id && item.locale
        ? {
            id: item.voice_id,
            label: item.version_name ?? item.voice_id,
            locale: item.locale,
            gender: "neutral" as const,
            styles: [],
            supportsRate: false,
            supportsPitch: false,
            isDefault: false
          }
        : undefined);
    if (!voice) return;
    const currentAccent = catalogVoice
      ? speechAccentGroup(catalogVoice.locale, catalogVoice.accent)
      : "other";
    const available = isVoiceRecommendationAvailable(
      {
        id: voiceSettingKey(item),
        name: "",
        groupName: "",
        locale: accent ?? (voice.locale as AudioAssetLocale),
        setting: effectiveVoiceSetting(item, voice)
      },
      voices,
      accent,
      content,
      nativeAuditionLocale
    );
    const disabled =
      !(catalog ? canAuditionCatalog : canAudition) ||
      !!(locale && accent && locale !== accent) ||
      !!(
        nativeAuditionLocale &&
        voice.locale.toLowerCase() !== nativeAuditionLocale.toLowerCase()
      ) ||
      (!item.audio_asset_id && !available);
    return (
      <Button
        size="small"
        type="text"
        icon={<Volume2Icon />}
        data-accent={currentAccent ?? "other"}
        style={
          disabled
            ? undefined
            : {
                color:
                  currentAccent === "uk"
                    ? "#2053FF"
                    : currentAccent === "us"
                      ? "#FC007A"
                      : "#8c8c8c"
              }
        }
        aria-label={t("label", {
          p0: catalog ? t("audition_catalogue_voice") : t("audition"),
          p1: voice.displayName ?? voice.label,
          p2: !accent && item.version_name ? ` · ${item.version_name}` : ""
        })}
        disabled={disabled}
        onClick={() => onAudition(voice, item, catalog)}
      />
    );
  }
  function renderIdentity(setting: VoiceSetting, accent: AudioAssetLocale) {
    const voice = voices.find((item) => item.id === setting.voice_id);
    return (
      <>
        <span>{preview(setting, accent)}</span>
        <PoolVoiceName voice={voice} fallback={setting.voice_id} />
        <PoolVoiceRate setting={setting} />
        <PoolVoiceVolume setting={setting} />
      </>
    );
  }
  return (
    <section className="tsz-ve-local-pool" aria-label={t("local_voice_pool")}>
      {audioPending && (
        <Alert
          type={generatingVersion ? "info" : "warning"}
          showIcon
          title={
            generatingVersion
              ? t("generating_final_audio_for_selected_voices_please_wait")
              : t(
                  "some_final_audio_is_incomplete_retry_or_deselect_those_voices"
                )
          }
          action={
            <Button
              size="small"
              disabled={readOnly || !!generatingVersion}
              onClick={onRetryAudio}
            >
              {t("retry_generating_final_audio")}
            </Button>
          }
        />
      )}
      {(error || notice) && (
        <Alert
          type={error ? "warning" : "info"}
          title={error || notice}
          showIcon
        />
      )}
      {conflicts.length > 0 && (
        <section aria-label={t("historical_voice_conflicts")}>
          <Alert
            type="warning"
            title={t(
              "several_historical_configurations_share_an_official_id_existing_versions_re"
            )}
          />
          {conflicts.map(([id, items]) => (
            <div key={id}>
              <Typography.Text code>
                {voices.find((v) => v.id === items[0]!.voice_id)
                  ?.providerVoiceId ?? items[0]!.voice_id}
              </Typography.Text>
              <Radio.Group
                aria-label={t("historical_conflict", {
                  p0: items[0]!.voice_id
                })}
                value={choices[id]}
                onChange={(event) =>
                  setChoices((previous) => ({
                    ...previous,
                    [id]: event.target.value
                  }))
                }
              >
                {items.map((item) => (
                  <div key={voiceSettingKey(item)}>
                    <Radio value={voiceSettingKey(item)}>
                      {item.version_name ?? item.voice_id} ·{" "}
                      <PoolVoiceRate setting={item} /> ·{" "}
                      <PoolVoiceVolume setting={item} />
                      {item.enabled ? t("selected") : t("cached")}
                    </Radio>
                    {preview(item)}
                  </div>
                ))}
              </Radio.Group>
            </div>
          ))}
          <Button
            disabled={
              readOnly ||
              conflicts.some(
                ([id, items]) =>
                  !items.some((item) => voiceSettingKey(item) === choices[id])
              )
            }
            onClick={() => {
              onChange(
                convertVoicePool(profile, current, voices, area, choices)
              );
              setNotice(
                createVoiceEditorMessage(
                  "local_draft_converted_using_your_selections_save_it_through_the_host_workfl"
                )
              );
            }}
          >
            {t("convert_using_selections")}
          </Button>
        </section>
      )}
      <div className="tsz-ve-pool-current-header">
        <div className="tsz-ve-pool-heading">
          <Typography.Title level={5}>
            {t("current_voice_settings")}
          </Typography.Title>
          <Popover
            title={t("voice_and_playback_rules")}
            placement="bottomLeft"
            trigger={["hover", "focus"]}
            content={
              <div className="tsz-ve-pool-help-content">
                <Typography.Paragraph>
                  {t(
                    "selected_voices_for_this_text_are_listed_below_audition_them_change_their_o"
                  )}
                </Typography.Paragraph>
                <Typography.Paragraph>
                  {t(
                    "from_question_2_onwards_probability_is_each_voice_s_chance_of_being_played"
                  )}
                </Typography.Paragraph>
              </div>
            }
          >
            <Button
              type="text"
              icon={<CircleHelpIcon />}
              aria-label={t("voice_and_playback_rules")}
            />
          </Popover>
        </div>
        <Tooltip
          title={t(
            "clear_custom_voice_settings_for_this_text_and_restore_default_recommendatio"
          )}
        >
          <Button
            className="tsz-ve-pool-restore"
            type="link"
            disabled={readOnly}
            onClick={onRestore}
          >
            {t("restore_default_recommendations")}
          </Button>
        </Tooltip>
      </div>
      {auditionStatus && (
        <Space wrap role="status" aria-live="polite">
          <Typography.Text type="secondary">{auditionStatus}</Typography.Text>
          {auditionActive && (
            <Button size="small" type="link" onClick={onStopAudition}>
              {t("stop_audition")}
            </Button>
          )}
        </Space>
      )}
      <div className="tsz-ve-pool-scroll">
        <div className="tsz-ve-pool-sides" data-single={!!locale}>
          {voiceSides(t)
            .filter((side) => !locale || locale === side.locale)
            .map((side) => {
              const selected = current.filter((setting) => {
                const voice = voices.find((v) => v.id === setting.voice_id);
                return (
                  setting.enabled &&
                  speechAccentGroup(
                    voice?.locale ?? setting.locale,
                    voice?.accent
                  ) === side.key
                );
              });
              return (
                <section
                  key={side.key}
                  aria-label={t("selected_voices", { p0: side.label })}
                >
                  <Typography.Text
                    className="tsz-ve-pool-side-title"
                    data-accent={side.key}
                    strong
                  >
                    {side.label}
                  </Typography.Text>
                  {!!selected.length && (
                    <div className="tsz-ve-pool-row tsz-ve-pool-head">
                      <span>{t("no")}</span>
                      <span>{t("probability")}</span>
                      <span>{t("order")}</span>
                      <span>{t("audition")}</span>
                      <span>{t("voice")}</span>
                      <span>{t("rate")}</span>
                      <span>{t("volume")}</span>
                      <span>{t("edit")}</span>
                    </div>
                  )}
                  {!selected.length && (
                    <div className="tsz-ve-pool-empty">
                      <div className="tsz-ve-pool-empty-copy">
                        <Typography.Text strong>
                          {t("no_voices_selected")}
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          {t(
                            "select_a_recommendation_below_or_add_voices_from_the_full_catalogue"
                          )}
                        </Typography.Text>
                      </div>
                    </div>
                  )}
                  {selected.map((setting, rank) => {
                    const key = voiceSettingKey(setting);
                    const probability = probabilities.get(key);
                    const voice = voices.find((v) => v.id === setting.voice_id);
                    return (
                      <div
                        key={key}
                        aria-label={t("pool", {
                          p0: side.label,
                          p1: setting.version_name ?? setting.voice_id
                        })}
                      >
                        <div className="tsz-ve-pool-row">
                          <span>{rank + 1}</span>
                          <span>
                            {probability === undefined
                              ? "—"
                              : `${(probability * 100).toFixed(1)}%`}
                          </span>
                          <Space size={0}>
                            {([-1, 1] as const).map((direction) => (
                              <Button
                                key={direction}
                                size="small"
                                type="text"
                                aria-label={t("label_2", {
                                  p0:
                                    direction === -1
                                      ? t("move_up")
                                      : t("move_down"),
                                  p1: setting.version_name ?? setting.voice_id
                                })}
                                icon={
                                  direction === -1 ? (
                                    <ArrowUpIcon />
                                  ) : (
                                    <ArrowDownIcon />
                                  )
                                }
                                disabled={
                                  readOnly ||
                                  (direction === -1
                                    ? rank === 0
                                    : rank === selected.length - 1)
                                }
                                onClick={() => {
                                  const local = materialize();
                                  if (local)
                                    onChange({
                                      ...local,
                                      voices: reorderPoolVoice(
                                        local.voices,
                                        key,
                                        direction,
                                        voices
                                      )
                                    });
                                }}
                              />
                            ))}
                          </Space>
                          {renderIdentity(setting, side.locale)}
                          <Button
                            type="text"
                            size="small"
                            icon={<PencilIcon />}
                            aria-label={t("edit_2", {
                              p0: setting.version_name ?? setting.voice_id
                            })}
                            disabled={
                              readOnly ||
                              !!generatingVersion ||
                              !voices.some((v) => v.id === setting.voice_id)
                            }
                            onClick={() => edit(setting)}
                          />
                        </div>
                        {adapter?.generateAudio && (
                          <Typography.Text
                            type={
                              setting.audio_asset_id ? "success" : "secondary"
                            }
                          >
                            {setting.audio_asset_id
                              ? t("final_audio_ready")
                              : generatingVersion === key
                                ? t("generating_final_audio")
                                : t("final_audio_not_generated")}
                          </Typography.Text>
                        )}
                        {probability === undefined && (
                          <Typography.Text type="warning">
                            {(voice && phonemeIssue(voice)) ||
                              t(
                                "this_voice_its_parameters_or_the_text_reading_is_unavailable_configuration"
                              )}
                          </Typography.Text>
                        )}
                        {!voices.some(
                          (voice) => voice.id === setting.voice_id
                        ) && (
                          <Button
                            size="small"
                            type="link"
                            disabled={readOnly}
                            onClick={() => {
                              const local = materialize();
                              if (local)
                                onChange({
                                  ...local,
                                  voices: local.voices.map((item) =>
                                    voiceSettingKey(item) === key
                                      ? { ...item, enabled: false }
                                      : item
                                  )
                                });
                            }}
                          >
                            {t("deselect")}{" "}
                            {setting.version_name ?? setting.voice_id}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </section>
              );
            })}
        </div>
      </div>
      {current
        .filter((item) => {
          const voice = voices.find((v) => v.id === item.voice_id);
          return (
            item.enabled &&
            (!["uk", "us"].includes(
              speechAccentGroup(voice?.locale ?? item.locale, voice?.accent) ??
                ""
            ) ||
              !!(
                locale &&
                speechAccentGroup(
                  voice?.locale ?? item.locale,
                  voice?.accent
                ) !== speechAccentGroup(locale)
              ))
          );
        })
        .map((item) => (
          <div key={voiceSettingKey(item)}>
            <Alert
              type="warning"
              title={t(
                "configuration_is_retained_and_excluded_from_playback_pools",
                {
                  p0: locale
                    ? t("voice_ownership_does_not_match_this_text_s_accent")
                    : t("voice_accent_unknown"),
                  p1: item.version_name ?? item.voice_id
                }
              )}
            />
            {preview(item)}
            <Button
              disabled={readOnly}
              aria-label={t("disable_unavailable_voice", { p0: item.voice_id })}
              onClick={() =>
                onChange({
                  ...profile,
                  voices: current.map((setting) =>
                    voiceSettingKey(setting) === voiceSettingKey(item)
                      ? { ...setting, enabled: false }
                      : setting
                  )
                })
              }
            >
              {t("disable_unavailable_voice_2")} {item.voice_id}
            </Button>
          </div>
        ))}
      <Radio.Group
        className="tsz-ve-pool-recommendation-section"
        aria-label={t("local_recommendation")}
        value={
          selectedPair
            ? `${selectedPair[0]!.groupId}/${selectedPair[0]!.pairId}`
            : !inherited && converted && !source
              ? "none"
              : undefined
        }
        onChange={(event) =>
          selectRecommendation(
            event.target.value === "none"
              ? []
              : (pairs.find(
                  (pair) =>
                    `${pair[0]!.groupId}/${pair[0]!.pairId}` ===
                    event.target.value
                ) ?? [])
          )
        }
      >
        <div className="tsz-ve-pool-recommendation-header">
          <Typography.Title level={5}>
            {t("recommended_voices")}
          </Typography.Title>
          <Radio value="none" disabled={readOnly}>
            {t("do_not_use_recommended_voices")}
          </Radio>
        </div>
        <div className="tsz-ve-pool-scroll">
          <div
            className="tsz-ve-pool-recommendations tsz-ve-pool-paired-recommendations"
            data-single={!!locale}
          >
            <div className="tsz-ve-pool-pair tsz-ve-pool-head">
              <span>{t("recommended_voices")}</span>
              <span>{t("source_group")}</span>
              {sides.map((side) => (
                <div key={side.key} className="tsz-ve-pool-pair-side">
                  <span>{t("audition")}</span>
                  <span>{t("accent_voice", { accent: side.label })}</span>
                  <span>{t("rate")}</span>
                  <span>{t("volume")}</span>
                </div>
              ))}
            </div>
            {visiblePairs.map((pair) => (
              <div
                className="tsz-ve-pool-pair"
                data-selected={
                  selectedPair?.[0]?.groupId === pair[0]!.groupId &&
                  selectedPair?.[0]?.pairId === pair[0]!.pairId
                }
                key={`${pair[0]!.groupId}/${pair[0]!.pairId}`}
              >
                <Radio
                  value={`${pair[0]!.groupId}/${pair[0]!.pairId}`}
                  disabled={
                    readOnly ||
                    pair
                      .filter((item) => !locale || item.locale === locale)
                      .some(
                        (item) =>
                          !isVoiceRecommendationAvailable(
                            {
                              ...item,
                              setting: effectiveVoiceSetting(
                                item.setting,
                                voices.find(
                                  (v) => v.id === item.setting.voice_id
                                )
                              )
                            },
                            voices,
                            item.locale,
                            content,
                            nativeAuditionLocale
                          )
                      )
                  }
                >
                  {pair[0]!.name}
                </Radio>
                <span className="tsz-ve-pool-group-name">
                  {pair[0]!.groupName}
                  {pair[0]!.selected === false
                    ? t("none_selected_in_group")
                    : ""}
                </span>
                {pair
                  .filter((item) => !locale || item.locale === locale)
                  .map((item) => (
                    <div
                      className="tsz-ve-pool-pair-side"
                      data-label={
                        item.locale === "en-GB"
                          ? t("british_voice")
                          : t("american_voice")
                      }
                      key={item.id}
                    >
                      {renderIdentity(
                        {
                          ...item.setting,
                          version_name: item.name,
                          version_id: item.id
                        },
                        item.locale
                      )}
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </div>
      </Radio.Group>
      {legacyRecommendations.length > 0 && (
        <section aria-label={t("unpaired_historical_recommendation")}>
          <Typography.Paragraph type="secondary">
            {t(
              "unpaired_historical_groups_retain_default_resolution_only_organise_the_grou"
            )}
          </Typography.Paragraph>
          <div className="tsz-ve-pool-scroll">
            <div className="tsz-ve-pool-recommendations">
              <div className="tsz-ve-pool-pair tsz-ve-pool-head">
                <span>
                  {t("historical_single_accent_recommendation_source")}
                </span>
                <div className="tsz-ve-pool-pair-side">
                  <span>{t("audition")}</span>
                  <span>{t("voice")}</span>
                  <span>{t("rate")}</span>
                  <span>{t("volume")}</span>
                </div>
              </div>
              {legacyRecommendations.map((item) => (
                <div className="tsz-ve-pool-pair" key={item.id}>
                  <span>
                    {item.name}
                    <small>
                      {item.groupName} ·{" "}
                      {item.locale === "en-GB" ? t("british") : t("american")}{" "}
                      {t("unpaired")}
                      {item.selected === false
                        ? t("none_selected_in_group_2")
                        : ""}
                    </small>
                  </span>
                  <div className="tsz-ve-pool-pair-side">
                    {renderIdentity(
                      {
                        ...item.setting,
                        version_name: item.name,
                        version_id: item.id
                      },
                      item.locale
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
      {!visiblePairs.length && !loading && (
        <Typography.Paragraph type="secondary">
          {t(
            "no_paired_recommendations_apply_you_can_select_voices_from_the_catalogue"
          )}
        </Typography.Paragraph>
      )}
      {source && !selectedPair && (
        <Typography.Paragraph type="secondary">
          {t(
            "the_source_recommendation_changed_or_was_removed_applied_local_copies_are_r"
          )}
        </Typography.Paragraph>
      )}
      <details className="tsz-ve-pool-catalog-disclosure">
        <summary>
          <span className="tsz-ve-pool-heading">
            <span>{t("full_voice_catalogue")}</span>
            <Popover
              title={t("selection_and_audition_guidance")}
              placement="bottomLeft"
              trigger={["hover", "focus"]}
              content={
                <div className="tsz-ve-pool-help-content">
                  <Typography.Paragraph type="secondary">
                    {t(
                      "select_voices_to_use_for_this_text_auditioning_does_not_change_selections"
                    )}
                  </Typography.Paragraph>
                  {!content.text.trim() && (
                    <Typography.Paragraph type="secondary">
                      {t(
                        "with_empty_text_auditions_use_hello_this_is_a_voice_preview_this_is_not_wri"
                      )}
                    </Typography.Paragraph>
                  )}
                  {locale && (
                    <Typography.Paragraph type="secondary">
                      {t(
                        nativeAuditionLocale
                          ? "voice_pool_scope_native_help"
                          : "voice_pool_scope_help",
                        {
                          accent:
                            locale === "en-GB" ? t("british") : t("american")
                        }
                      )}
                    </Typography.Paragraph>
                  )}
                </div>
              }
            >
              <Button
                type="text"
                icon={<CircleHelpIcon />}
                aria-label={t("selection_and_audition_guidance")}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
              />
            </Popover>
          </span>
          <span className="tsz-ve-pool-catalog-toggle">
            <span className="tsz-ve-pool-catalog-expand">
              {t("expand")} <ChevronDownIcon />
            </span>
            <span className="tsz-ve-pool-catalog-collapse">
              {t("collapse")} <ChevronUpIcon />
            </span>
          </span>
        </summary>
        <div className="tsz-ve-pool-catalog-body">
          {loading && <Spin aria-label={t("loading_voice_catalogue")} />}
          <div className="tsz-ve-pool-scroll">
            <div className="tsz-ve-pool-catalog" data-single={!!locale}>
              {sides.flatMap((side) =>
                ["female", "male"].map((gender) => {
                  const key = `${side.key}-${gender}`;
                  const columnVoices = voices.filter(
                    (voice) =>
                      speechAccentGroup(voice.locale, voice.accent) ===
                        side.key &&
                      (voice.gender === gender ||
                        (gender === "male" && voice.gender === "neutral"))
                  );
                  const isVisible = (voice: VoiceOption) =>
                    !excluded.has(providerVoiceKey(voice.id, voices)) &&
                    `${voice.displayName ?? voice.label} ${voice.providerVoiceId ?? voice.id}`
                      .toLowerCase()
                      .includes((search[key] ?? "").trim().toLowerCase());
                  return (
                    <section
                      key={key}
                      aria-label={t("catalogue", {
                        p0: side.label,
                        p1: gender === "female" ? t("female") : t("male")
                      })}
                    >
                      <div className="tsz-ve-pool-catalog-column-head">
                        <Typography.Text
                          className="tsz-ve-pool-side-title"
                          data-accent={side.key}
                          strong
                        >
                          {side.label} ·{" "}
                          {gender === "female" ? t("female") : t("male")}
                        </Typography.Text>
                        <Input.Search
                          size="small"
                          aria-label={t("search_catalogue", {
                            p0: side.label,
                            p1: gender === "female" ? t("female") : t("male")
                          })}
                          placeholder={t("search_voices")}
                          value={search[key] ?? ""}
                          allowClear
                          onChange={(event) => {
                            const list = columns.current.get(key);
                            if (list) {
                              if (!search[key] && event.target.value)
                                unfilteredPositions.current.set(
                                  key,
                                  list.scrollTop
                                );
                              positions.current.set(key, list.scrollTop);
                            }
                            setSearch((previous) => ({
                              ...previous,
                              [key]: event.target.value
                            }));
                          }}
                        />
                      </div>
                      <div
                        className="tsz-ve-pool-catalog-list"
                        ref={(element) => {
                          if (element) columns.current.set(key, element);
                          else columns.current.delete(key);
                        }}
                        onScroll={(event) =>
                          positions.current.set(
                            key,
                            event.currentTarget.scrollTop
                          )
                        }
                      >
                        {!loading && !columnVoices.some(isVisible) && (
                          <Typography.Text
                            type="secondary"
                            className="tsz-ve-pool-catalog-empty"
                          >
                            {search[key]?.trim()
                              ? t("no_matching_voices")
                              : t("no_voices_available")}
                          </Typography.Text>
                        )}
                        {columnVoices.map((voice) => (
                          <div key={voice.id} hidden={!isVisible(voice)}>
                            <div className="tsz-ve-pool-catalog-item-head">
                              <Checkbox
                                aria-label={t("select", {
                                  p0: voice.displayName ?? voice.label
                                })}
                                disabled={
                                  readOnly ||
                                  (!!phonemeIssue(voice) && !isSelected(voice))
                                }
                                checked={isSelected(voice)}
                                onChange={() => toggle(voice)}
                              >
                                <PoolVoiceName
                                  voice={voice}
                                  fallback={voice.id}
                                />
                              </Checkbox>
                              {preview(
                                {
                                  voice_id: voice.id,
                                  enabled: true,
                                  rate_percent: 0,
                                  ...voice.defaultSettings
                                },
                                side.locale,
                                true
                              )}
                            </div>
                            <Typography.Text
                              code
                              title={voice.providerVoiceId ?? voice.id}
                              className="tsz-ve-pool-provider-id"
                              copyable={{
                                text: voice.providerVoiceId ?? voice.id
                              }}
                            >
                              <span className="tsz-ve-pool-provider-value">
                                {voice.providerVoiceId ?? voice.id}
                              </span>
                            </Typography.Text>
                            {phonemeIssue(voice) && (
                              <Typography.Text type="secondary">
                                {phonemeIssue(voice)}
                              </Typography.Text>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </details>
      {detail &&
        detail.sourceKey === sourceKey &&
        detail.baseline ===
          JSON.stringify(profile ? clearVoiceAudio(profile) : null) &&
        voices.some((voice) => voice.id === detail.setting.voice_id) && (
          <VoiceDetail
            key={`${sourceKey}/${detail.dialect}/${voiceSettingKey(detail.setting)}`}
            setting={detail.setting}
            voice={voices.find((v) => v.id === detail.setting.voice_id)!}
            content={content}
            sourceKey={sourceKey}
            dialect={detail.dialect}
            phonemeLocale={nativeAuditionLocale}
            profile={detail.profile}
            adapter={adapter}
            readOnly={readOnly}
            canAudition={canAudition}
            unavailable={unavailableVersions?.has(
              voiceSettingKey(detail.setting)
            )}
            previousAudio={previousAudio.filter(
              (item) =>
                voiceSettingKey(item) === voiceSettingKey(detail.setting)
            )}
            audioTools={(stopPlayback) =>
              audioTools(detail.dialect, stopPlayback)
            }
            pendingUpload={pendingUpload}
            defaultAudioAssetId={
              audioAssets?.find(
                (asset) => asset.is_default && asset.locale === detail.dialect
              )?.id
            }
            stopExternalAudio={onCloseDetail}
            onCancel={() => {
              onCloseDetail();
              setDetail(undefined);
            }}
            onSave={(next) => {
              if (readOnly || detail.sourceKey !== sourceKey) return;
              const local = converted && !inherited ? profile! : detail.profile;
              onChange({
                ...local,
                voices: local.voices.map((item) =>
                  voiceSettingKey(item) === voiceSettingKey(next)
                    ? next.audio_asset_id
                      ? next
                      : retainResolvedAudio([next], local.voices)[0]!
                    : item
                )
              });
              onCloseDetail();
              setDetail(undefined);
            }}
          />
        )}
    </section>
  );
}
