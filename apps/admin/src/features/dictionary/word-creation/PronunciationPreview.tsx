import {
  useLexiconEditorTranslation,
  lexiconEditorMessageText,
  type LexiconEditorMessage,
  useLexiconEditorMessageState,
  createLexiconEditorMessage
} from "../i18n/editor";
import {
  speechAccentGroup,
  savedVoiceAudioAsset,
  splitVoiceDisplayName
} from "@tsz/shared";
import { ChevronDownIcon, Volume2Icon, RefreshCwIcon } from "lucide-react";
import { App, Popover, Tooltip } from "@tsz/ui/admin/overlays";
import { Button, Space, Tag } from "@tsz/ui/admin/display";
import type {
  AudioAssetV3,
  Dialect,
  RichTextV2,
  VoiceProfileV3,
  PhonemeLocaleV3
} from "@tsz/types";
import type { AdminDialectPreference } from "@tsz/shared";
import {
  retainResolvedAudio,
  voiceSettingFor,
  profileHasInheritance,
  withDefaultVoiceProfile
} from "@tsz/voice-editor/core";
import { queryClient } from "@/lib/queryClient";
import { useDialectPreference } from "@/features/settings/useDialectPreference";
import type {
  VoiceOption,
  VoicePreviewAdapter,
  VoicePreviewResult,
  VoiceSetting,
  VoiceRecommendationArea
} from "@tsz/voice-editor/types";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { env } from "@/lib/env";
import { dialectLabel } from "../word-creation-v3/presentation";
import {
  adminVoicePreviewAdapter,
  voicePreviewIsMock
} from "../voice-editor/dataSource";

interface PreviewContextValue {
  claimPlayback: (stop: () => void) => void;
  releasePlayback: (stop: () => void) => void;
  enabled: boolean;
  readOnly: boolean;
  voices: VoiceOption[];
  voicesLoading: boolean;
  voicesError: string;
  voicesRequested: boolean;
  loadVoices: () => Promise<VoiceOption[]>;
  voiceResolutionRequested: boolean;
  requestVoiceResolution: () => void;
  /** 统一内容按管理员偏好挑发音人；在 Provider 里取一次，别让每个控件各自订阅。 */
  dialectPreference: AdminDialectPreference;
  adapter: VoicePreviewAdapter;
  resolutionScope: string;
  recommendationRefresh: number;
}

const PreviewContext = createContext<PreviewContextValue | null>(null);
const voiceCatalogQueryKey = ["admin-speech", "voices", "en"] as const;
const voiceCatalogConsumers = new Map<string, number>();

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : createLexiconEditorMessage("panel_audition_request_failed_try_again");
}

export function PronunciationPreviewProvider({
  children,
  readOnly = false,
  loadVoicesOnMount = false,
  resolveVoicesOnMount = false
}: {
  children: ReactNode;
  readOnly?: boolean;
  /** 仅用于需要显式预热目录的宿主，默认保持按需加载。 */
  loadVoicesOnMount?: boolean;
  /** 仅用于兼容需要预先解析推荐音色的旧宿主，默认保持按需解析。 */
  resolveVoicesOnMount?: boolean;
}) {
  const activePlayback = useRef<(() => void) | null>(null);
  const claimPlayback = useCallback((stop: () => void) => {
    if (activePlayback.current !== stop) activePlayback.current?.();
    activePlayback.current = stop;
  }, []);
  const releasePlayback = useCallback((stop: () => void) => {
    if (activePlayback.current === stop) activePlayback.current = null;
  }, []);
  const enabled = env.VOICE_PREVIEW && !readOnly;
  const resolutionScope = useId();
  const [recommendationRefresh, setRecommendationRefresh] = useState(0);
  useEffect(() => {
    const refresh = () => setRecommendationRefresh((value) => value + 1);
    window.addEventListener("focus", refresh);
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (
        event.type === "updated" &&
        event.action.type === "success" &&
        event.query.queryKey[0] === "admin-dubbing-groups-v3"
      )
        refresh();
    });
    return () => {
      window.removeEventListener("focus", refresh);
      unsubscribe();
      queryClient.removeQueries({
        queryKey: ["pronunciation-preview", resolutionScope]
      });
    };
  }, [resolutionScope]);
  const { preference: dialectPreference } = useDialectPreference();
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voicesError, setVoicesError] = useLexiconEditorMessageState("");
  const [voicesRequested, setVoicesRequested] = useState(false);
  const voicesRequestRef = useRef<Promise<VoiceOption[]> | null>(null);
  const [voiceResolutionRequested, setVoiceResolutionRequested] =
    useState(resolveVoicesOnMount);
  const requestVoiceResolution = useCallback(
    () => setVoiceResolutionRequested(true),
    []
  );

  useEffect(() => {
    if (resolveVoicesOnMount) setVoiceResolutionRequested(true);
  }, [resolveVoicesOnMount]);

  useEffect(() => {
    if (!enabled) return;
    const key = JSON.stringify(voiceCatalogQueryKey);
    voiceCatalogConsumers.set(key, (voiceCatalogConsumers.get(key) ?? 0) + 1);
    return () => {
      const next = (voiceCatalogConsumers.get(key) ?? 1) - 1;
      if (next > 0) {
        voiceCatalogConsumers.set(key, next);
        return;
      }
      voiceCatalogConsumers.delete(key);
      queryClient.removeQueries({
        queryKey: voiceCatalogQueryKey
      });
    };
  }, [enabled]);

  const loadVoices = useCallback(() => {
    if (!enabled) return Promise.resolve([] as VoiceOption[]);
    if (voicesRequestRef.current) return voicesRequestRef.current;
    setVoicesRequested(true);
    setVoicesLoading(true);
    setVoicesError("");
    const request = queryClient
      .fetchQuery({
        queryKey: voiceCatalogQueryKey,
        queryFn: ({ signal }) =>
          adminVoicePreviewAdapter.listVoices({ language: "en", signal }),
        staleTime: 10 * 60 * 1000,
        gcTime: 30 * 60 * 1000
      })
      .then((items) => {
        setVoices(items);
        if (items.length === 0)
          setVoicesError(
            createLexiconEditorMessage("panel_no_speakers_available")
          );
        return items;
      })
      .catch((error) => {
        setVoicesError(errorMessage(error));
        throw error;
      })
      .finally(() => {
        voicesRequestRef.current = null;
        setVoicesLoading(false);
      });
    voicesRequestRef.current = request;
    return request;
  }, [enabled, setVoicesError]);

  useEffect(() => {
    if (loadVoicesOnMount) void loadVoices().catch(() => undefined);
  }, [loadVoices, loadVoicesOnMount]);

  useEffect(() => {
    if (enabled) return;
    voicesRequestRef.current = null;
    setVoices([]);
    setVoicesRequested(false);
    setVoicesLoading(false);
    setVoicesError("");
  }, [enabled, setVoicesError]);

  const value = useMemo(
    () => ({
      claimPlayback,
      releasePlayback,
      enabled,
      readOnly,
      voices,
      voicesLoading,
      voicesError,
      voicesRequested,
      loadVoices,
      voiceResolutionRequested,
      requestVoiceResolution,
      dialectPreference,
      adapter: adminVoicePreviewAdapter,
      resolutionScope,
      recommendationRefresh
    }),
    [
      claimPlayback,
      releasePlayback,
      dialectPreference,
      enabled,
      readOnly,
      voices,
      voicesError,
      voicesLoading,
      voicesRequested,
      loadVoices,
      voiceResolutionRequested,
      requestVoiceResolution,
      resolutionScope,
      recommendationRefresh
    ]
  );
  return (
    <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>
  );
}

function localeForDialect(
  dialect: Dialect,
  preference: AdminDialectPreference
): PhonemeLocaleV3 | undefined {
  // 统一内容没有自己的方言，按管理员偏好挑发音人（需求：试听也按偏好选发音人）。
  if (dialect === "common") return preference === "uk" ? "en-GB" : "en-US";
  if (dialect === "uk") return "en-GB";
  if (dialect === "us") return "en-US";
  return undefined;
}

function voiceForSetting(
  setting: VoiceSetting,
  voices: VoiceOption[]
): VoiceOption | undefined {
  return voices.find((voice) => voice.id === setting.voice_id);
}

function settingMatchesDialect(
  setting: VoiceSetting,
  voices: VoiceOption[],
  locale: PhonemeLocaleV3 | undefined
) {
  const voice = voiceForSetting(setting, voices);
  const settingLocale = setting.locale ?? voice?.locale;
  if (!settingLocale || !locale) return setting;
  return speechAccentGroup(settingLocale, setting.accent) ===
    speechAccentGroup(locale)
    ? setting
    : undefined;
}

function voiceForDialect(
  voices: VoiceOption[],
  dialect: Dialect,
  preference: AdminDialectPreference
): VoiceOption | undefined {
  const locale = localeForDialect(dialect, preference);
  // 扩大供应商目录后仍优先沿用已有默认发音人，缺席时再按目录顺序回退。
  const preferredIds =
    locale === "en-GB"
      ? ["en-gb-sonia", "en-gb-sonianeural"]
      : ["en-us-aria", "en-us-arianeural"];
  const matched = locale
    ? (voices.find(
        (voice) => voice.locale === locale && preferredIds.includes(voice.id)
      ) ?? voices.find((voice) => voice.locale === locale))
    : undefined;
  // Common content also resolves to an explicit locale; never cross accents to keep playback enabled.
  return matched;
}

/**
 * 当前页面缺少哪一侧发音人的常驻说明。
 *
 * 目录里没有匹配 locale 的 voice 时「获取语音」只会禁用，原因过去只挂在悬停
 * Tooltip 上，用户不悬停就看不到；这里给页面一句可直接读到的说明。
 */
export function usePronunciationVoiceNotice(
  dialects: readonly Dialect[]
): string | undefined {
  const { t } = useLexiconEditorTranslation();
  const context = useContext(PreviewContext);
  if (!context?.enabled || !context.voicesRequested || context.voicesLoading)
    return undefined;
  if (context.voicesError) return context.voicesError;
  const preference = context.dialectPreference;
  const missing = dialects.filter(
    (dialect) => !voiceForDialect(context.voices, dialect, preference)
  );
  if (missing.length === 0) return undefined;
  const labels = missing
    .map((dialect) =>
      t("panel_label_6", {
        p0: dialectLabel(dialect, t),
        p1: localeForDialect(dialect, preference) ?? t("panel_english_2")
      })
    )
    .join("、");
  return t(
    "panel_no_speakers_available_for_get_audio_is_disabled_for_these_accents",
    { p0: labels }
  );
}

export function resolvePronunciationPreviewVoice(
  voices: VoiceOption[],
  dialect: Dialect,
  preference: AdminDialectPreference,
  profile?: VoiceProfileV3
) {
  const locale = localeForDialect(dialect, preference);
  const settings = profile?.voices.filter((setting) => setting.enabled) ?? [];
  const voice = settings.length
    ? settings
        .map((setting) => voices.find((row) => row.id === setting.voice_id))
        .find(
          (row) =>
            row &&
            speechAccentGroup(row.locale, row.accent) ===
              speechAccentGroup(locale)
        )
    : profile?.dubbing
      ? undefined
      : voiceForDialect(voices, dialect, preference);
  return {
    voice,
    rate:
      (voice
        ? voiceSettingFor(profile?.voices ?? [], voice.id)?.rate_percent
        : undefined) ?? 0,
    isDefault: settings.length === 0
  };
}

function useResolvedPreviewProfile(
  context: PreviewContextValue,
  profile: VoiceProfileV3 | undefined,
  content: RichTextV2,
  dialect: Dialect,
  adapter = context.adapter,
  recommendationArea?: VoiceRecommendationArea,
  resolveRequested = context.voiceResolutionRequested
) {
  const { t } = useLexiconEditorTranslation();
  profile = recommendationArea
    ? withDefaultVoiceProfile(profile, recommendationArea)
    : profile;
  const locale = localeForDialect(dialect, context.dialectPreference);
  const key = JSON.stringify([
    profile,
    content,
    locale,
    adapter.audioSourceKey,
    profileHasInheritance(profile, locale) ? context.recommendationRefresh : 0
  ]);
  const inputRef = useRef({ profile, content, locale, adapter });
  inputRef.current = { profile, content, locale, adapter };
  const [resolved, setResolved] = useState<{
    key: string;
    voices: VoiceSetting[];
    error?: string | LexiconEditorMessage;
  }>();
  useEffect(() => {
    const { profile, content, locale, adapter } = inputRef.current;
    if (
      !context.enabled ||
      !resolveRequested ||
      !profile?.dubbing ||
      !adapter.resolveVoices ||
      !content.text.trim()
    )
      return;
    const controller = new AbortController();
    void queryClient
      .fetchQuery({
        queryKey: ["pronunciation-preview", context.resolutionScope, key],
        queryFn: ({ signal }) =>
          adapter.resolveVoices!(
            { profile, content, accent: locale === "en-GB" ? "gb" : "us" },
            { signal }
          ),
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        retry: false
      })
      .then(({ voices }) => {
        if (!controller.signal.aborted) setResolved({ key, voices });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResolved({ key, voices: [], error: errorMessage(error) });
      });
    return () => controller.abort();
  }, [key, context.enabled, context.resolutionScope, resolveRequested]);
  if (!profile?.dubbing) return { profile, pending: false, error: undefined };
  if (!adapter.resolveVoices)
    return {
      profile: { ...profile, voices: [] },
      pending: false,
      error: t(
        "panel_this_environment_does_not_support_resolving_recommended_voices_yet"
      )
    };
  return {
    profile: {
      ...profile,
      voices: retainResolvedAudio(
        resolved?.key === key ? resolved.voices : [],
        profile.voices
      )
    },
    pending: resolveRequested && !!content.text.trim() && resolved?.key !== key,
    error:
      resolved?.key === key
        ? lexiconEditorMessageText(resolved.error, t)
        : undefined
  };
}

export function PronunciationPreviewVoiceSummary({
  dialect,
  voiceProfile,
  pronunciationId,
  content,
  recommendationArea,
  column = "voice"
}: {
  dialect: Dialect;
  voiceProfile?: VoiceProfileV3;
  pronunciationId?: string;
  content?: RichTextV2;
  recommendationArea?: VoiceRecommendationArea;
  column?: "voice" | "rate" | "volume";
}) {
  const { t } = useLexiconEditorTranslation();
  const context = useContext(PreviewContext);
  if (!context) throw new Error("PronunciationPreviewProvider is required");
  const resolved = useResolvedPreviewProfile(
    context,
    voiceProfile,
    content ?? { version: 2, text: "", annotations: [] },
    dialect,
    context.adapter,
    context.readOnly ? undefined : recommendationArea
  );
  const { voice, rate, isDefault } = resolvePronunciationPreviewVoice(
    context.voices,
    dialect,
    context.dialectPreference,
    resolved.profile
  );
  const enabled = resolved.profile?.voices.filter((row) => row.enabled) ?? [];
  if (column === "rate")
    return (
      <span data-has-voice={Boolean(voice)}>
        {voice ? `${(1 + rate / 100).toFixed(2)}×` : "—"}
      </span>
    );
  if (column === "volume") {
    const setting = voice
      ? voiceSettingFor(resolved.profile?.voices ?? [], voice.id)
      : undefined;
    return (
      <span data-has-voice={Boolean(voice)}>
        {voice ? `${setting?.volume_percent ?? 100}%` : "—"}
      </span>
    );
  }
  const summary = (
    <span
      className="word-pronunciation-voice-label"
      data-has-voice={Boolean(voice)}
      role={context.voicesLoading || resolved.pending ? "status" : undefined}
      aria-label={
        context.voicesLoading || resolved.pending
          ? t("panel_loading_voices")
          : undefined
      }
      title={
        voice
          ? t("panel_label_7", {
              p0: isDefault ? t("panel_default") : "",
              p1: voice.label
            })
          : undefined
      }
    >
      {context.voicesLoading || resolved.pending
        ? "—"
        : voice
          ? voice.label.replace(` · ${voice.locale}`, "")
          : resolved.error ||
            context.voicesError ||
            t("panel_no_voices_available_for_this_accent")}
    </span>
  );
  if (enabled.length <= 1) return summary;
  return (
    <Popover
      trigger="click"
      classNames={{ root: "word-pronunciation-voice-popover" }}
      title={
        <div className="word-pronunciation-voice-heading">
          <span>{t("panel_enabled_voices")}</span>
          <span className="word-pronunciation-voice-count">
            {enabled.length}
          </span>
        </div>
      }
      destroyOnHidden
      content={
        <ul
          className="word-pronunciation-voice-list"
          aria-label={t("panel_enabled_voices")}
        >
          {enabled.map((setting) => {
            const option = context.voices.find(
              (row) => row.id === setting.voice_id
            );
            const name = option
              ? option.label.replace(` · ${option.locale}`, "")
              : setting.voice_id;
            return (
              <li
                className="word-pronunciation-voice-row"
                key={setting.version_id ?? setting.voice_id}
              >
                <div className="word-pronunciation-voice-info">
                  <span className="word-pronunciation-voice-name" title={name}>
                    {name}
                  </span>
                  <span className="word-pronunciation-voice-locale">
                    {option?.locale ?? t("panel_unavailable")}
                  </span>
                </div>
                <span
                  className="word-pronunciation-voice-rate"
                  title={t("panel_rate")}
                >
                  {(1 + setting.rate_percent / 100).toFixed(2)}×
                </span>
                <span
                  className="word-pronunciation-voice-volume"
                  title={t("panel_volume")}
                >
                  {setting.volume_percent ?? 100}%
                </span>
                {pronunciationId && (
                  <div className="word-pronunciation-voice-controls">
                    <PronunciationPreviewControls
                      pronunciationId={pronunciationId}
                      dialect={dialect}
                      content={content}
                      voiceProfile={{ voices: [setting] }}
                      disabled={!content}
                      disabledReason={t(
                        "panel_enter_synthesis_input_for_this_accent_first"
                      )}
                      ariaLabelPrefix={option?.label ?? setting.voice_id}
                      compact
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      }
    >
      <Button
        type="text"
        size="small"
        className="word-pronunciation-voice-summary"
        aria-label={t("panel_view_all_voices", {
          p0:
            dialect === "uk"
              ? t("panel_british")
              : dialect === "us"
                ? t("panel_american")
                : t("panel_common"),
          p1: enabled.length
        })}
      >
        {summary}
        <ChevronDownIcon />
      </Button>
    </Popover>
  );
}

/** 目录加载完成前仍按已保存的 locale 归属展示，不让已配置的声音暂时消失。 */
export function pronunciationVoiceRows(
  profile: VoiceProfileV3 | undefined,
  voices: VoiceOption[],
  dialect: Dialect,
  preference: AdminDialectPreference
): VoiceSetting[] {
  const locale = localeForDialect(dialect, preference);
  const rows =
    profile?.voices.filter(
      (setting) =>
        setting.enabled && settingMatchesDialect(setting, voices, locale)
    ) ?? [];
  if (rows.length || !profile?.dubbing || !locale) return rows;

  const matched = voiceForDialect(voices, dialect, preference);
  if (!matched) return [];
  const stored = profile.voices.find(
    (setting) => setting.voice_id === matched.id
  );
  if (stored) return stored.enabled ? [stored] : [];
  return [
    {
      voice_id: matched.id,
      enabled: true,
      rate_percent: matched.defaultSettings?.rate_percent ?? 0,
      ...(matched.defaultSettings?.pitch_semitones !== undefined
        ? { pitch_semitones: matched.defaultSettings.pitch_semitones }
        : {}),
      ...(matched.defaultSettings?.volume_percent !== undefined
        ? { volume_percent: matched.defaultSettings.volume_percent }
        : {}),
      locale: matched.locale as PhonemeLocaleV3
    }
  ];
}

export function PronunciationPreviewVoiceList({
  dialect,
  voiceProfile,
  content,
  recommendationArea,
  source,
  audioAssets,
  audioAssetId,
  column = "voice",
  layout = "table"
}: {
  dialect: Dialect;
  voiceProfile?: VoiceProfileV3;
  content?: RichTextV2;
  recommendationArea?: VoiceRecommendationArea;
  source?: string;
  audioAssets?: readonly AudioAssetV3[] | null;
  audioAssetId?: string;
  column?: "voice" | "rate" | "volume";
  layout?: "table" | "media";
}) {
  const { t } = useLexiconEditorTranslation();
  const context = useContext(PreviewContext);
  if (!context) throw new Error("PronunciationPreviewProvider is required");
  const resolved = useResolvedPreviewProfile(
    context,
    voiceProfile,
    content ?? { version: 2, text: "", annotations: [] },
    dialect,
    context.adapter,
    recommendationArea
  );
  const rows = pronunciationVoiceRows(
    resolved.profile,
    context.voices,
    dialect,
    context.dialectPreference
  );
  const targetLocale = localeForDialect(dialect, context.dialectPreference);
  if (source === "none")
    return (
      <span className="v3-voice-inline-status">
        {column === "voice" ? t("creation_accent_not_configured") : "—"}
      </span>
    );
  const uploaded =
    source === "upload"
      ? (audioAssets?.find((asset) => asset.id === audioAssetId) ??
        audioAssets?.find(
          (asset) =>
            asset.is_default &&
            speechAccentGroup(asset.locale) === speechAccentGroup(targetLocale)
        ) ??
        audioAssets?.find(
          (asset) =>
            speechAccentGroup(asset.locale) === speechAccentGroup(targetLocale)
        ))
      : undefined;
  if (source === "upload") {
    if (!uploaded)
      return (
        <span className="v3-voice-inline-status">
          {t("creation_uploaded_source")}
        </span>
      );
    return (
      <ul
        className={`v3-voice-inline-list${layout === "media" ? " is-media" : ""}`}
        aria-label={t("creation_uploaded_source")}
      >
        <li className="v3-voice-inline-row" title={uploaded.original_name}>
          {column === "voice" ? (
            <InlineVoiceName
              displayName={t("creation_uploaded_source")}
              gender={uploaded.gender}
              secondary={uploaded.original_name}
            />
          ) : (
            <span className="v3-voice-inline-muted">—</span>
          )}
        </li>
      </ul>
    );
  }
  if (context.voicesLoading || resolved.pending)
    return (
      <span
        className="v3-voice-inline-status"
        role="status"
        aria-label={t("panel_loading_voices")}
      >
        —
      </span>
    );
  if (!rows.length)
    return (
      <span className="v3-voice-inline-status">
        {resolved.error ||
          context.voicesError ||
          t("panel_no_voices_available_for_this_accent")}
      </span>
    );
  return (
    <ul
      className={`v3-voice-inline-list${layout === "media" ? " is-media" : ""}`}
      aria-label={t("panel_enabled_voices")}
    >
      {rows.map((setting) => {
        const voice = voiceForSetting(setting, context.voices);
        const displayName =
          voice?.displayName ??
          voice?.label ??
          setting.version_name ??
          setting.voice_id;
        return (
          <li
            className="v3-voice-inline-row"
            key={setting.version_id ?? setting.voice_id}
          >
            {column === "voice" ? (
              <InlineVoiceName
                displayName={
                  voice
                    ? displayName.replace(` · ${voice.locale}`, "")
                    : displayName
                }
                gender={voice?.gender}
              />
            ) : column === "rate" ? (
              <span className="v3-voice-inline-number" title={t("panel_rate")}>
                {(1 + setting.rate_percent / 100).toFixed(2)}×
              </span>
            ) : (
              <span
                className="v3-voice-inline-number"
                title={t("panel_volume")}
              >
                {setting.volume_percent ?? 100}%
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function InlineVoiceName({
  displayName,
  gender,
  secondary
}: {
  displayName: string;
  gender?: "female" | "male" | "neutral";
  secondary?: string;
}) {
  const { english, chinese } = splitVoiceDisplayName(displayName);
  const genderLabel =
    gender === "female" ? "女声" : gender === "male" ? "男声" : undefined;
  return (
    <span className="v3-voice-inline-name" title={secondary ?? displayName}>
      <strong>{english}</strong>
      {chinese && chinese !== english && <small>{chinese}</small>}
      {secondary && <small>{secondary}</small>}
      {gender === "female" ? (
        <span
          className="v3-voice-inline-gender is-female"
          role="img"
          aria-label={genderLabel}
        >
          ♀
        </span>
      ) : gender === "male" ? (
        <span
          className="v3-voice-inline-gender is-male"
          role="img"
          aria-label={genderLabel}
        >
          ♂
        </span>
      ) : null}
    </span>
  );
}

export function PronunciationPreviewControls({
  pronunciationId,
  previewAdapter,
  spelling,
  content,
  voiceProfile,
  recommendationArea,
  playbackOnly = false,
  assetOnly: assetOnlyProp = false,
  audioAssetId,
  audioAssets,
  dialect,
  ariaLabelPrefix,
  disabled = false,
  disabledReason,
  compact = false,
  audioFactory = (src) => new Audio(src),
  children
}: {
  pronunciationId: string;
  previewAdapter?: VoicePreviewAdapter;
  spelling?: string;
  content?: RichTextV2;
  voiceProfile?: VoiceProfileV3;
  recommendationArea?: VoiceRecommendationArea;
  playbackOnly?: boolean;
  assetOnly?: boolean;
  audioAssetId?: string;
  audioAssets?: readonly AudioAssetV3[] | null;
  dialect: Dialect;
  ariaLabelPrefix?: string;
  disabled?: boolean;
  disabledReason?: string;
  compact?: boolean;
  audioFactory?: (src: string) => HTMLAudioElement;
  children?: ReactNode;
}) {
  const { t } = useLexiconEditorTranslation();
  const context = useContext(PreviewContext);
  if (!context) throw new Error("PronunciationPreviewProvider is required");
  const targetLocale = localeForDialect(dialect, context.dialectPreference);
  const selectedAssetId =
    audioAssetId ??
    audioAssets?.find(
      (asset) =>
        asset.is_default &&
        speechAccentGroup(asset.locale) === speechAccentGroup(targetLocale)
    )?.id;
  const assetOnly = assetOnlyProp || context.readOnly || !!selectedAssetId;
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const [resolveRequested, setResolveRequested] = useState(false);
  const [result, setResult] = useState<VoicePreviewResult>();
  const [status, setStatus] = useLexiconEditorMessageState("");
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef<symbol | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const resultRef = useRef<VoicePreviewResult | null>(null);
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingGenerateRef = useRef<string | undefined>(undefined);
  const generateRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const previewContent = useMemo<RichTextV2>(
    () => content ?? { version: 2, text: spelling ?? "", annotations: [] },
    [content, spelling]
  );
  const playbackProfile = useMemo(
    () =>
      assetOnly && voiceProfile
        ? { voices: voiceProfile.voices }
        : voiceProfile,
    [assetOnly, voiceProfile]
  );
  const resolved = useResolvedPreviewProfile(
    context,
    playbackProfile,
    previewContent,
    dialect,
    previewAdapter ?? context.adapter,
    assetOnly ? undefined : recommendationArea,
    resolveRequested || context.voiceResolutionRequested
  );
  const enabledSettings =
    resolved.profile?.voices.filter((setting) => setting.enabled) ?? [];
  const { voice } = resolvePronunciationPreviewVoice(
    context.voices,
    dialect,
    context.dialectPreference,
    resolved.profile
  );
  const selectedSetting = voice
    ? voiceSettingFor(resolved.profile?.voices ?? [], voice.id)
    : resolved.profile?.voices.find(
        (setting) =>
          setting.enabled &&
          (!setting.locale ||
            speechAccentGroup(setting.locale) ===
              speechAccentGroup(targetLocale))
      );
  const savedAssetId =
    selectedAssetId ??
    (assetOnly
      ? savedVoiceAudioAsset(playbackProfile, targetLocale)
      : selectedSetting?.audio_asset_id);
  const canReadSavedAudio =
    !!savedAssetId && !!(previewAdapter ?? context.adapter).resolveAudio;
  // 音色就绪会更新播放状态，但只有用户请求的内容变化才取消等待。
  const requestKey = JSON.stringify([
    pronunciationId,
    previewContent,
    targetLocale,
    voiceProfile,
    selectedAssetId,
    assetOnly,
    playbackOnly,
    recommendationArea,
    previewAdapter?.audioSourceKey
  ]);
  const contentKey = JSON.stringify(
    assetOnly
      ? [savedAssetId, targetLocale]
      : [
          previewContent,
          targetLocale,
          voice?.id,
          selectedSetting?.rate_percent ?? 0,
          selectedSetting?.pitch_semitones ?? 0,
          selectedSetting?.volume_percent ?? 100,
          selectedSetting?.style ?? "",
          selectedSetting?.style_degree,
          selectedSetting?.role,
          selectedSetting?.output_format,
          selectedSetting?.audio_asset_id,
          audioAssetId,
          playbackOnly,
          voiceProfile?.dubbing,
          resolved.pending
        ]
  );
  const text = previewContent.text.trim();
  const playLabel = ariaLabelPrefix
    ? t("panel_play_audio", { p0: ariaLabelPrefix })
    : t("panel_play_audio_2");
  const generateLabel = ariaLabelPrefix
    ? t("panel_get_audio", { p0: ariaLabelPrefix })
    : t("panel_get_audio_2");

  const clearExpiry = useCallback(() => {
    if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
    expiryTimerRef.current = null;
  }, []);

  const discardResult = useCallback(() => {
    clearExpiry();
    audioRef.current?.pause();
    audioRef.current = null;
    resultRef.current?.dispose?.();
    resultRef.current = null;
    setResult(undefined);
  }, [clearExpiry]);

  const cleanup = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    discardResult();
  }, [discardResult]);

  const stopPlayback = useCallback(() => {
    pendingGenerateRef.current = undefined;
    generationRef.current = null;
    cleanup();
    setBusy(false);
    setStatus("");
  }, [cleanup, setStatus]);
  const { claimPlayback, releasePlayback } = context;

  useLayoutEffect(() => {
    generationRef.current = null;
    cleanup();
    setBusy(false);
    setStatus("");
  }, [
    cleanup,
    contentKey,
    pronunciationId,
    disabled,
    previewAdapter,
    setStatus
  ]);

  useEffect(
    () => () => {
      generationRef.current = null;
      cleanup();
      releasePlayback(stopPlayback);
    },
    [cleanup, releasePlayback, stopPlayback]
  );

  const attachAudio = useCallback(
    (preview: VoicePreviewResult): HTMLAudioElement => {
      audioRef.current?.pause();
      const audio = audioFactory(preview.audioUrl);
      audioRef.current = audio;
      audio.addEventListener(
        "error",
        () => {
          if (audioRef.current !== audio) return;
          discardResult();
          const error = savedAssetId
            ? t("panel_could_not_read_final_audio_try_again")
            : t("panel_could_not_load_audition_audio_generate_it_again");
          setStatus(error);
          void message.error(error);
        },
        { once: true }
      );
      audio.addEventListener(
        "ended",
        () => {
          if (audioRef.current === audio)
            setStatus(
              savedAssetId
                ? createLexiconEditorMessage("panel_final_audio_ready")
                : createLexiconEditorMessage("panel_audition_generated")
            );
        },
        { once: true }
      );
      return audio;
    },
    [audioFactory, discardResult, message, savedAssetId, setStatus, t]
  );

  const generate = async () => {
    const adapter = previewAdapter ?? context.adapter;
    const assetId = savedAssetId;
    if (
      disabled ||
      busy ||
      generationRef.current ||
      abortRef.current ||
      (assetOnly
        ? !assetId || !adapter.resolveAudio
        : !context.enabled || context.voicesLoading || !text)
    )
      return;
    claimPlayback(stopPlayback);
    if (
      !assetOnly &&
      resolved.profile?.dubbing &&
      adapter.resolveVoices &&
      !resolveRequested &&
      !context.voiceResolutionRequested
    ) {
      pendingGenerateRef.current = requestKey;
      setResolveRequested(true);
      context.requestVoiceResolution();
      return;
    }
    if (!assetOnly && resolved.pending) {
      pendingGenerateRef.current = requestKey;
      return;
    }
    if (!assetOnly && !voice) {
      if (!context.voicesRequested) {
        pendingGenerateRef.current = requestKey;
        void context.loadVoices().catch(() => undefined);
      }
      return;
    }
    if (
      !assetOnly &&
      voice &&
      previewContent.annotations.some((mark) => mark.type === "phoneme") &&
      voice.locale !== targetLocale
    ) {
      setStatus(
        createLexiconEditorMessage(
          "panel_specified_phonemes_require_an_exact_regional_match_select_the_matching_voic"
        )
      );
      return;
    }
    const generation = Symbol("pronunciation-preview-generation");
    generationRef.current = generation;
    cleanup();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setStatus(
      assetId
        ? createLexiconEditorMessage("panel_loading_final_audio")
        : createLexiconEditorMessage("panel_generating_audition")
    );
    try {
      let preview: VoicePreviewResult;
      if (assetId && adapter.resolveAudio) {
        preview = await adapter.resolveAudio(assetId, {
          signal: controller.signal
        });
      } else {
        if (assetOnly || !voice) return;
        preview = await adapter.synthesize(
          {
            language: "en",
            content: previewContent,
            voiceId: voice.id,
            ratePercent: selectedSetting?.rate_percent ?? 0,
            ...(selectedSetting?.output_format
              ? { outputFormat: selectedSetting.output_format }
              : {}),
            ...(selectedSetting?.pitch_semitones !== undefined
              ? { pitchSemitones: selectedSetting.pitch_semitones }
              : {}),
            ...(selectedSetting?.volume_percent !== undefined
              ? { volumePercent: selectedSetting.volume_percent }
              : {}),
            ...(selectedSetting?.style ? { style: selectedSetting.style } : {}),
            ...(selectedSetting?.style_degree !== undefined
              ? { styleDegree: selectedSetting.style_degree }
              : {}),
            ...(selectedSetting?.role !== undefined
              ? { role: selectedSetting.role }
              : {})
          },
          { signal: controller.signal }
        );
      }
      if (controller.signal.aborted) {
        preview.dispose?.();
        return;
      }
      resultRef.current = preview;
      setResult(preview);
      const expiresIn = Date.parse(preview.expiresAt) - Date.now();
      const expire = () => {
        discardResult();
        setStatus(
          assetId
            ? createLexiconEditorMessage(
                "panel_the_audio_url_expired_play_it_again"
              )
            : createLexiconEditorMessage(
                "panel_the_audition_expired_generate_it_again"
              )
        );
      };
      if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
        expire();
        return;
      }
      expiryTimerRef.current = setTimeout(expire, expiresIn);

      const audio = attachAudio(preview);
      try {
        await audio.play();
        if (audioRef.current === audio) {
          setStatus(
            assetId
              ? createLexiconEditorMessage("panel_playing_final_audio")
              : preview.cached
                ? createLexiconEditorMessage("panel_playing_cached")
                : createLexiconEditorMessage("panel_playing_new_synthesis")
          );
        }
      } catch {
        if (audioRef.current === audio) {
          setStatus(
            createLexiconEditorMessage(
              "panel_the_browser_blocked_autoplay_click_play_audio"
            )
          );
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        const nextStatus = errorMessage(error);
        setStatus(nextStatus);
        void message.error(lexiconEditorMessageText(nextStatus, t));
      }
    } finally {
      if (generationRef.current === generation) {
        generationRef.current = null;
      }
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBusy(false);
      }
    }
  };

  generateRef.current = generate;
  useEffect(() => {
    if (pendingGenerateRef.current === undefined) return;
    if (disabled || pendingGenerateRef.current !== requestKey) {
      pendingGenerateRef.current = undefined;
      return;
    }
    if (context.voicesLoading || resolved.pending) return;
    pendingGenerateRef.current = undefined;
    void generateRef.current();
  }, [
    context.voiceResolutionRequested,
    context.voicesLoading,
    context.voicesRequested,
    disabled,
    requestKey,
    resolveRequested,
    resolved.pending
  ]);

  const replay = async () => {
    if (disabled || (!assetOnly && !context.enabled) || !result) return;
    claimPlayback(stopPlayback);
    const audio = attachAudio(result);
    try {
      await audio.play();
      if (audioRef.current === audio)
        setStatus(
          savedAssetId
            ? createLexiconEditorMessage("panel_playing_final_audio")
            : createLexiconEditorMessage("panel_playing")
        );
    } catch {
      if (audioRef.current === audio) {
        setStatus(
          createLexiconEditorMessage(
            "panel_playback_failed_check_browser_audio_permissions_and_retry"
          )
        );
        void message.error(
          t("panel_playback_failed_check_browser_audio_permissions_and_retry")
        );
      }
    }
  };

  const unavailableReason = !context.enabled
    ? t("panel_voice_auditions_are_disabled")
    : context.voicesLoading || resolved.pending
      ? t("panel_loading_speakers")
      : !context.voicesRequested
        ? t("panel_get_audio_2")
        : resolved.error
          ? resolved.error
          : context.voicesError
            ? context.voicesError
            : !text
              ? content
                ? t("panel_enter_the_dictionary_transcription_first")
                : t("panel_enter_the_form_spelling_first")
              : !voice
                ? enabledSettings.length
                  ? t(
                      "panel_the_selected_voice_does_not_match_select_a_matching_voice_in_pronunciation",
                      { p0: targetLocale ?? t("panel_current_accent") }
                    )
                  : t("panel_no_speakers_available_for", {
                      p0: targetLocale ?? t("panel_english_2")
                    })
                : t("panel_get_audio_2");

  const controls = (
    <>
      {
        <Tooltip
          title={
            (disabled ? disabledReason : undefined) ||
            status ||
            (result || canReadSavedAudio
              ? t("panel_play_audio_2")
              : assetOnly
                ? savedAssetId
                  ? t("panel_play_final_audio")
                  : t(
                      "panel_final_audio_has_not_been_saved_return_to_the_editor_to_add_it"
                    )
                : playbackOnly
                  ? unavailableReason
                  : t("panel_get_audio_first"))
          }
        >
          <Button
            className="word-pronunciation-play-action"
            data-playback-dialect={targetLocale === "en-GB" ? "uk" : "us"}
            icon={<Volume2Icon />}
            disabled={
              disabled ||
              busy ||
              (!result &&
                (assetOnly
                  ? !savedAssetId ||
                    !(previewAdapter ?? context.adapter).resolveAudio
                  : (!playbackOnly && !canReadSavedAudio) ||
                    (context.voicesRequested && context.voicesLoading) ||
                    resolved.pending ||
                    (context.voicesRequested && !voice) ||
                    !text)) ||
              (!assetOnly && !context.enabled)
            }
            aria-label={playLabel}
            loading={playbackOnly && busy}
            onClick={() => void (result ? replay() : generate())}
          />
        </Tooltip>
      }
      {children}
      {voicePreviewIsMock && (
        <Tooltip
          title={t(
            "panel_local_tts_mock_is_active_audition_audio_is_not_a_real_synthesis_result"
          )}
        >
          <Tag
            className="word-pronunciation-mock-tag"
            color="warning"
            role="note"
            aria-label={t(
              "panel_audition_uses_local_tts_mock_audio_is_not_a_real_synthesis_result"
            )}
          >
            {t("panel_mock")}
          </Tag>
        </Tooltip>
      )}
      {!playbackOnly && (
        <Tooltip title={status || unavailableReason}>
          <Button
            className="word-pronunciation-voice-action word-pronunciation-sync-action"
            aria-label={generateLabel}
            icon={
              <RefreshCwIcon className={busy ? "ui-icon-spin" : undefined} />
            }
            loading={busy}
            disabled={
              disabled ||
              !context.enabled ||
              context.voicesLoading ||
              (context.voicesRequested && !voice) ||
              !text ||
              busy
            }
            onClick={() => void generate()}
          />
        </Tooltip>
      )}
    </>
  );
  return compact ? <Space.Compact block>{controls}</Space.Compact> : controls;
}
