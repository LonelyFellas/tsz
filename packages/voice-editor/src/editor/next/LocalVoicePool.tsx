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
  SearchIcon,
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
  localVoicePool,
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
  voiceSettingKey,
  voiceSettingAccent
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
  sources,
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
  sources?: Partial<
    Record<
      "uk" | "us",
      import("@tsz/types").AdminResolveDubbingResponse["source"]
    >
  >;
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
  onRestore: (side?: "uk" | "us") => void;
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
  const current = settings;
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
        voiceSettingAccent(setting, voices) ===
          speechAccentGroup(voice.locale, voice.accent) &&
        providerVoiceKey(setting.voice_id, voices) ===
          providerVoiceKey(voice.id, voices)
    );
  const sideOf = (setting: VoiceSetting) => {
    return voiceSettingAccent(setting, voices);
  };
  const conflicts = voicePoolConflicts(current, voices);
  const inheritedFor = (side: "uk" | "us") =>
    profile?.dubbing?.[side].mode === "inherit";
  const selectedRecommendations = (side: "uk" | "us") =>
    inheritedFor(side)
      ? recommendations.filter(
          (item) =>
            speechAccentGroup(item.locale) === side &&
            current.some(
              (voice) => voice.enabled && voiceSettingKey(voice) === item.id
            )
        )
      : recommendations.filter((item) =>
          profile?.dubbing?.[side].recommendations?.some(
            (source) => source.recommendation_id === item.id
          )
        );
  const excluded = new Set(
    sides.flatMap(({ key }) => {
      const ids = inheritedFor(key)
        ? selectedRecommendations(key).map((item) => item.setting.voice_id)
        : (profile?.dubbing?.[key].recommendations?.map(
            (item) => item.voice_id
          ) ?? []);
      return ids.map((id) => providerVoiceKey(id, voices));
    })
  );
  const catalogSelection = (side: "uk" | "us") =>
    !inheritedFor(side)
      ? current.find(
          (item) =>
            item.enabled &&
            sideOf(item) === side &&
            !excluded.has(providerVoiceKey(item.voice_id, voices))
        )
      : undefined;
  const probabilities = voicePoolProbabilities(
    current.filter((item) => !unavailableVersions?.has(voiceSettingKey(item))),
    voices,
    content,
    locale,
    nativeAuditionLocale
  );
  function materialize(side: "uk" | "us"): VoiceProfile | undefined {
    if (
      voicePoolConflicts(
        current.filter((item) => sideOf(item) === side),
        voices
      ).length
    ) {
      setNotice("同一官方音色只能保留一个配置");
      return;
    }
    const raw = current.map((setting) => {
      const recommendation =
        inheritedFor(side) && sideOf(setting) === side
          ? recommendations.find((item) => item.id === voiceSettingKey(setting))
          : undefined;
      return recommendation
        ? {
            ...setting,
            ...recommendation.setting,
            version_id: setting.version_id,
            version_name: setting.version_name,
            locale: setting.locale
          }
        : setting;
    });
    const local = localVoicePool(profile, raw, voices, area, side);
    const recommendation = selectedRecommendations(side)[0];
    const selected = current.find(
      (item) => item.enabled && item.version_id === recommendation?.id
    );
    if (inheritedFor(side) && recommendation?.groupId && selected)
      local.dubbing![side].recommendations = [
        {
          group_id: recommendation.groupId,
          recommendation_id: recommendation.id,
          voice_id: selected.voice_id,
          contribution_id: voiceSettingKey(selected)
        }
      ];
    return local;
  }
  function selectRecommendation(
    items: VoiceRecommendation[],
    side: "uk" | "us"
  ) {
    if (readOnly) return;
    const local = materialize(side);
    if (!local) return;
    if (inheritedFor(side) && !local.dubbing?.[side].recommendations?.length)
      local.voices = local.voices.map((item) =>
        sideOf(item) === side ? { ...item, enabled: false } : item
      );
    let result: ReturnType<typeof switchPoolRecommendation>;
    try {
      result = switchPoolRecommendation(local, items, voices, side);
    } catch {
      setNotice(t("voice_pool_accent_conflict"));
      return;
    }
    setNotice(
      result.duplicates.length
        ? createVoiceEditorMessage(
            "this_recommendation_duplicates_an_existing_voice_existing_local_parameters"
          )
        : ""
    );
    const recommendedKeys = new Set(
      result.profile.dubbing?.[side].recommendations?.map((item) =>
        providerVoiceKey(item.voice_id, voices)
      ) ?? []
    );
    const extras = result.profile.voices.filter(
      (item) =>
        item.enabled &&
        sideOf(item) === side &&
        !recommendedKeys.has(providerVoiceKey(item.voice_id, voices))
    );
    const previousCatalog = catalogSelection(side);
    const retained =
      extras.find(
        (item) =>
          previousCatalog &&
          providerVoiceKey(item.voice_id, voices) ===
            providerVoiceKey(previousCatalog.voice_id, voices)
      ) ?? extras[0];
    onChange({
      ...result.profile,
      voices: result.profile.voices.map((item) =>
        extras.includes(item) && item !== retained
          ? { ...item, enabled: false }
          : item
      )
    });
  }
  function toggle(voice: VoiceOption) {
    if (readOnly) return;
    if (phonemeIssue(voice) && !isSelected(voice)) return;
    const side = speechAccentGroup(voice.locale, voice.accent);
    if (side !== "uk" && side !== "us") return;
    const cached = profile?.voices.find(
      (item) =>
        providerVoiceKey(item.voice_id, voices) ===
        providerVoiceKey(voice.id, voices)
    );
    if (cached && sideOf(cached) !== side) {
      setNotice(t("voice_pool_accent_conflict"));
      return;
    }
    const local = materialize(side);
    if (local) {
      const next = togglePoolVoice(local, voice, voices);
      onChange({
        ...next,
        voices: next.voices.map((item) =>
          providerVoiceKey(item.voice_id, voices) ===
          providerVoiceKey(voice.id, voices)
            ? { ...item, enabled: true }
            : sideOf(item) === side &&
                providerVoiceKey(item.voice_id, voices) !==
                  providerVoiceKey(voice.id, voices) &&
                !excluded.has(providerVoiceKey(item.voice_id, voices))
              ? { ...item, enabled: false }
              : item
        )
      });
    }
  }
  function clearCatalog(side: "uk" | "us") {
    if (readOnly) return;
    const local = materialize(side);
    if (local)
      onChange({
        ...local,
        voices: local.voices.map((item) =>
          sideOf(item) === side &&
          !excluded.has(providerVoiceKey(item.voice_id, voices))
            ? { ...item, enabled: false }
            : item
        )
      });
  }
  function edit(setting: VoiceSetting) {
    if (readOnly) return;
    const side = sideOf(setting);
    if (side !== "uk" && side !== "us") return;
    const local = materialize(side);
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
        <Alert type="warning" title="同一官方音色只能保留一个配置" />
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
            onClick={() => onRestore()}
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
                return setting.enabled && sideOf(setting) === side.key;
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
                  <Typography.Text
                    type="secondary"
                    className="tsz-ve-pool-source"
                  >
                    {inheritedFor(side.key)
                      ? (() => {
                          const source = sources?.[side.key];
                          const recommendation =
                            source?.kind === "recommendation"
                              ? recommendations.find(
                                  (item) => item.id === source.recommendation_id
                                )
                              : selectedRecommendations(side.key)[0];
                          return source?.kind === "catalog" ||
                            (!source && !recommendation)
                            ? t("inherited_catalog_source")
                            : t("inherited_recommendation_source", {
                                p0:
                                  recommendation?.groupName ??
                                  t("recommended_voices"),
                                p1: recommendation?.name ?? ""
                              });
                        })()
                      : t("local_voice_settings")}
                  </Typography.Text>
                  <Button
                    size="small"
                    type="link"
                    disabled={readOnly}
                    onClick={() => onRestore(side.key)}
                  >
                    {t("restore_accent_defaults", { p0: side.label })}
                  </Button>
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
                                  const local = materialize(side.key);
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
                        {adapter?.generateAudio && !setting.audio_asset_id && (
                          <Typography.Text type="secondary">
                            {generatingVersion === key
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
                              const local = materialize(side.key);
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
          const savedSide = sideOf(item);
          if (
            locale &&
            (savedSide === "uk" || savedSide === "us") &&
            savedSide !== speechAccentGroup(locale)
          )
            return false;
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
            {!sides.some((side) => side.key === sideOf(item)) && preview(item)}
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
      <div className="tsz-ve-pool-scroll">
        <div
          className="tsz-ve-pool-recommendation-section"
          data-single={!!locale}
        >
          {sides.map((side) => {
            const selected = selectedRecommendations(side.key);
            const items = recommendations.filter(
              (item) => item.locale === side.locale && !item.fallbackOnly
            );
            return (
              <section
                key={side.key}
                aria-label={`${side.label} ${t("local_recommendation")}`}
              >
                <Typography.Title level={5}>
                  {side.label} {t("recommended_voices")}
                </Typography.Title>
                <div className="tsz-ve-pool-recommendation-row tsz-ve-pool-head">
                  <span>{t("local_recommendation")}</span>
                  <span>{t("source_group")}</span>
                  <span>{t("audition")}</span>
                  <span>{t("voice")}</span>
                  <span>{t("rate")}</span>
                  <span>{t("volume")}</span>
                </div>
                <div
                  role="group"
                  aria-label={`${side.label} ${t("local_recommendation")}`}
                >
                  <Checkbox
                    checked={
                      !selected.length &&
                      profile?.dubbing?.[side.key].mode === "local"
                    }
                    disabled={readOnly}
                    onChange={() => selectRecommendation([], side.key)}
                  >
                    {t("do_not_use_recommended_voices")}
                  </Checkbox>
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="tsz-ve-pool-recommendation-row"
                    >
                      <Checkbox
                        checked={selected.some(
                          (source) => source.id === item.id
                        )}
                        onChange={(event) =>
                          selectRecommendation(
                            event.target.checked
                              ? [...selected, item]
                              : selected.filter(
                                  (source) => source.id !== item.id
                                ),
                            side.key
                          )
                        }
                        disabled={
                          readOnly ||
                          (!selected.some((source) => source.id === item.id) &&
                            !isVoiceRecommendationAvailable(
                              {
                                ...item,
                                setting: effectiveVoiceSetting(
                                  item.setting,
                                  voices.find(
                                    (voice) =>
                                      voice.id === item.setting.voice_id
                                  )
                                )
                              },
                              voices,
                              item.locale,
                              content,
                              nativeAuditionLocale
                            ))
                        }
                      >
                        {item.name}
                      </Checkbox>
                      <span>{item.groupName}</span>
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
              </section>
            );
          })}
        </div>
      </div>
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
            <div className="tsz-ve-pool-catalog-sides" data-single={!!locale}>
              {sides.map((side) => (
                <Radio.Group
                  key={side.key}
                  className="tsz-ve-pool-catalog"
                  data-single="true"
                  aria-label={`${side.label} ${t("full_voice_catalogue")}`}
                  value={catalogSelection(side.key)?.voice_id ?? ""}
                  onChange={(event) => {
                    const voice = voices.find(
                      (item) => item.id === event.target.value
                    );
                    if (voice) toggle(voice);
                    else clearCatalog(side.key);
                  }}
                >
                  <Radio
                    value=""
                    disabled={readOnly}
                    className="tsz-ve-pool-catalog-clear"
                  >
                    {t("no_catalog_voice")}
                  </Radio>
                  {["female", "male"].map((gender) => {
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
                          <Input
                            type="search"
                            className="tsz-ve-pool-catalog-search"
                            prefix={<SearchIcon size={14} aria-hidden="true" />}
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
                                <Radio
                                  value={voice.id}
                                  aria-label={t("select", {
                                    p0: voice.displayName ?? voice.label
                                  })}
                                  disabled={
                                    readOnly ||
                                    (!!phonemeIssue(voice) &&
                                      !isSelected(voice))
                                  }
                                >
                                  <PoolVoiceName
                                    voice={voice}
                                    fallback={voice.id}
                                  />
                                </Radio>
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
                  })}
                </Radio.Group>
              ))}
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
              const local = detail.profile;
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
