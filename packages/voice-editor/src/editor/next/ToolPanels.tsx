import {
  useVoiceEditorTranslation,
  defaultVoiceEditorTranslation,
  type VoiceEditorTranslation,
  useVoiceEditorMessageState,
  createVoiceEditorMessage
} from "../i18n";
import {
  speechAccentGroup,
  speechLocaleMatchesScope,
  speechRegionLabel
} from "@tsz/shared";
import { CheckIcon, Volume2Icon } from "lucide-react";
import {
  Button,
  Space,
  Progress,
  Spin,
  Typography
} from "@tsz/ui/admin/display";
import { Form, Input, InputNumber, Select, Radio } from "@tsz/ui/admin/forms";
import { Popconfirm, Tooltip } from "@tsz/ui/admin/overlays";
import { SelectionPanel } from "./SelectionPanel";
import {
  VoiceParameterFields,
  defaultVoiceParameters,
  type VoiceParameterValues,
  type ParameterVoice
} from "./VoiceParameterFields";
import { voiceSettingFor, voiceSettingKey } from "../../core";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type {
  AudioAsset,
  AudioAssetGender,
  AudioAssetLocale,
  VoiceOption,
  VoiceSetting
} from "../../types";
import {
  AUDIO_UPLOAD_ACCEPT,
  audioUploadHint,
  audioFormatHint,
  audioSizeHint,
  progressPercent,
  type PendingUpload
} from "./audioAssets";
import {
  grammarRoleDefinitions,
  RATE_PRESETS,
  RATE_MULTIPLIER_MIN,
  RATE_MULTIPLIER_MAX,
  voiceGenderLabels,
  VOICE_LOCALES,
  voiceShortName
} from "./roles";
import type { Brush } from "./roles";

/** 工具栏中的发音、标注和音频面板。 */

/** 下拉面板里的一行：左勾选位 + 名称 + 右侧附注，可选带一个尾部按钮。 */
function PopRow({
  selected,
  label,
  meta,
  ariaLabel,
  disabled,
  onToggle,
  trailing
}: {
  selected: boolean;
  label: ReactNode;
  meta?: ReactNode;
  ariaLabel: string;
  disabled?: boolean;
  onToggle: () => void;
  trailing?: ReactNode;
}) {
  return (
    <div className="tsz-ve-pop-row" data-selected={selected || undefined}>
      <button
        type="button"
        className="tsz-ve-pop-hit"
        role="checkbox"
        aria-checked={selected}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={onToggle}
      >
        {/* 勾选位始终占宽，勾上勾下时行内其余文字不会左右跳。 */}
        <span className="tsz-ve-pop-check" aria-hidden>
          <CheckIcon />
        </span>
        <span className="tsz-ve-pop-name">{label}</span>
        {meta !== undefined && <span className="tsz-ve-pop-meta">{meta}</span>}
      </button>
      {trailing}
    </div>
  );
}

function PopSection({
  title,
  locale,
  children
}: {
  title: string;
  locale?: string;
  children: ReactNode;
}) {
  return (
    <div className="tsz-ve-pop-section" data-locale={locale}>
      <div className="tsz-ve-pop-section-head">{title}</div>
      {children}
    </div>
  );
}

export interface VoicePanelProps {
  readOnly?: boolean;
  /** 只保留这一侧的语种分组；不传表示这段正文不分英美，全部照常展示。 */
  locale?: AudioAssetLocale;
  /** Synthesis phonemes must not be auditioned with a different accent. */
  auditionLocale?: AudioAssetLocale;
  voices: VoiceOption[];
  voicesLoading: boolean;
  enabledVoiceIds: string[];
  voiceSettings?: readonly VoiceSetting[];
  editingVersionKey?: string;
  onRateChange?: (voiceId: string, ratePercent: number) => void;
  onParametersChange?: (
    voiceId: string,
    patch: Partial<Omit<VoiceSetting, "voice_id">>
  ) => void;
  onToggleVoice: (voiceId: string) => void;
  pendingVoiceId?: string;
  playingVoiceId?: string;
  canAudition: boolean;
  onAudition: (voice: VoiceOption) => void;
  auditionStatus: string;
}

/** 音色：按语种分组的可勾选清单，每行右侧一个试听。 */
export function VoicePanel({
  readOnly,
  locale,
  auditionLocale,
  voices,
  voicesLoading,
  enabledVoiceIds,
  voiceSettings,
  editingVersionKey,
  onRateChange,
  onParametersChange,
  onToggleVoice,
  pendingVoiceId,
  playingVoiceId,
  canAudition,
  onAudition,
  auditionStatus
}: VoicePanelProps) {
  const { t } = useVoiceEditorTranslation();
  const [moreOpen, setMoreOpen] = useState(false);
  const common = voices.filter((voice) => voice.isCommon !== false);
  const uncommon = voices.filter((voice) => voice.isCommon === false);
  const selectedUncommon = uncommon.filter((voice) =>
    enabledVoiceIds.includes(voice.id)
  ).length;
  // 已勾选却不属于本侧的音色仍要露出来，否则历史配置只能看见结果、没法取消。
  const renderGroups = (items: VoiceOption[]) =>
    (
      [
        { key: "uk", badge: "BrE", label: t("british_pronunciation") },
        { key: "us", badge: "AmE", label: t("american_pronunciation") },
        { key: "other", badge: "Other", label: t("other_voices") }
      ] as const
    ).map(({ key, badge, label: groupLabel }) => {
      const group = items.filter(
        (voice) =>
          speechAccentGroup(voice.locale, voice.accent) === key &&
          (speechLocaleMatchesScope(voice.locale, locale, voice.accent) ||
            enabledVoiceIds.includes(voice.id))
      );
      const groupLocale =
        key === "uk" ? "en-GB" : key === "us" ? "en-US" : "other";
      if (group.length === 0) return null;
      return (
        <PopSection
          key={key}
          title={`${badge} · ${groupLabel}`}
          locale={groupLocale}
        >
          <div className="tsz-ve-voice-columns">
            {[
              ...voiceGenderLabels(t),
              ...(group.some((voice) => voice.gender === "neutral")
                ? [{ gender: "neutral" as const, label: t("other") }]
                : [])
            ].map(({ gender, label }) => (
              <div
                key={gender}
                className="tsz-ve-voice-column"
                aria-label={`${badge} ${label}`}
              >
                <div className="tsz-ve-voice-column-title">{label}</div>
                {group
                  .filter((voice) => voice.gender === gender)
                  .map((voice) => {
                    const setting =
                      voiceSettingFor(
                        voiceSettings ?? [],
                        voice.id,
                        editingVersionKey
                      ) ?? voice.defaultSettings;
                    return (
                      <PopRow
                        key={voice.id}
                        selected={
                          voiceSettingFor(
                            voiceSettings ?? [],
                            voice.id,
                            editingVersionKey
                          )?.enabled ?? enabledVoiceIds.includes(voice.id)
                        }
                        label={
                          <>
                            <span>{voiceShortName(voice)}</span>
                            <span> · {speechRegionLabel(voice.locale)}</span>
                          </>
                        }
                        ariaLabel={t("enable", { p0: voice.label })}
                        meta={
                          voice.supportsVolume === false
                            ? t("natural_reading_only")
                            : undefined
                        }
                        disabled={readOnly}
                        onToggle={() => onToggleVoice(voice.id)}
                        trailing={
                          <Space size={2}>
                            {onRateChange && (
                              <VoiceRateControl
                                voice={voice}
                                ratePercent={setting?.rate_percent ?? 0}
                                readOnly={readOnly}
                                onChange={(ratePercent) =>
                                  onRateChange(voice.id, ratePercent)
                                }
                              />
                            )}
                            {onParametersChange && (
                              <details>
                                <summary>{t("more_parameters")}</summary>
                                <Space direction="vertical">
                                  {voice.supportsVolume === false &&
                                    ((setting?.volume_percent ?? 100) !== 100 ||
                                      (setting?.pitch_semitones ?? 0) !== 0 ||
                                      (setting?.rate_percent ?? 0) !== 0 ||
                                      !!setting?.style) && (
                                      <Button
                                        size="small"
                                        disabled={readOnly}
                                        onClick={() =>
                                          onParametersChange(voice.id, {
                                            volume_percent: 100,
                                            pitch_semitones: 0,
                                            rate_percent: 0,
                                            style: undefined
                                          })
                                        }
                                      >
                                        {t(
                                          "restore_this_model_s_default_parameters"
                                        )}
                                      </Button>
                                    )}
                                  <label>
                                    {t("volume")}
                                    <InputNumber
                                      aria-label={t("volume_2", {
                                        p0: voice.label
                                      })}
                                      value={setting?.volume_percent ?? 100}
                                      min={0}
                                      max={100}
                                      precision={0}
                                      suffix="%"
                                      disabled={
                                        readOnly ||
                                        voice.supportsVolume === false
                                      }
                                      onChange={(volume) => {
                                        if (volume !== null)
                                          onParametersChange(voice.id, {
                                            volume_percent: volume
                                          });
                                      }}
                                    />
                                  </label>
                                  <Select
                                    aria-label={t("style", { p0: voice.label })}
                                    value={setting?.style ?? ""}
                                    style={{ minWidth: 120 }}
                                    disabled={readOnly}
                                    options={[
                                      { value: "", label: t("natural") },
                                      ...voice.styles.map((style) => ({
                                        value: style,
                                        label: style
                                      }))
                                    ]}
                                    onChange={(style: string) =>
                                      onParametersChange(voice.id, {
                                        style: style || undefined
                                      })
                                    }
                                  />
                                  <label>
                                    {t("pitch_semitones")}
                                    <InputNumber
                                      aria-label={t("pitch", {
                                        p0: voice.label
                                      })}
                                      value={setting?.pitch_semitones ?? 0}
                                      min={voice.pitchRange?.min ?? -12}
                                      max={voice.pitchRange?.max ?? 12}
                                      disabled={
                                        readOnly || !voice.supportsPitch
                                      }
                                      precision={0}
                                      onChange={(pitch) => {
                                        if (pitch !== null)
                                          onParametersChange(voice.id, {
                                            pitch_semitones: pitch
                                          });
                                      }}
                                    />
                                  </label>
                                </Space>
                              </details>
                            )}
                            <Button
                              size="small"
                              color={"default"}
                              variant="text"
                              style={{
                                color:
                                  speechAccentGroup(
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
                              }}
                              className="tsz-ve-audition-button"
                              aria-label={t("audition_2", { p0: voice.label })}
                              loading={pendingVoiceId === voice.id}
                              icon={<Volume2Icon />}
                              aria-busy={pendingVoiceId === voice.id}
                              disabled={
                                !canAudition ||
                                (Boolean(auditionLocale) &&
                                  voice.supportsPhoneme === false) ||
                                Boolean(
                                  auditionLocale &&
                                  voice.locale.toLowerCase() !==
                                    auditionLocale.toLowerCase()
                                )
                              }
                              title={
                                auditionLocale &&
                                voice.locale.toLowerCase() !==
                                  auditionLocale.toLowerCase()
                                  ? t(
                                      "current_phonemes_use_and_cannot_be_auditioned_with_another_accent_you_can_d",
                                      { p0: auditionLocale }
                                    )
                                  : undefined
                              }
                              data-playing={playingVoiceId === voice.id}
                              onClick={() => onAudition(voice)}
                            />
                          </Space>
                        }
                      />
                    );
                  })}
              </div>
            ))}
          </div>
        </PopSection>
      );
    });
  return (
    <div className="tsz-ve-pop tsz-ve-pop-voices" aria-label={t("voice_list")}>
      {voices.find((voice) => voice.personalSettingsError)
        ?.personalSettingsError && (
        <div className="tsz-ve-pop-status" role="status">
          {
            voices.find((voice) => voice.personalSettingsError)
              ?.personalSettingsError
          }
        </div>
      )}
      {voicesLoading ? (
        <div className="tsz-ve-pop-loading">
          <Spin size="small" aria-label={t("loading_voices")} />
        </div>
      ) : (
        <>
          {voiceSettings
            ?.filter(
              (setting) =>
                setting.enabled &&
                !voices.some((voice) => voice.id === setting.voice_id)
            )
            .map((setting) => (
              <div key={voiceSettingKey(setting)} className="tsz-ve-pop-status">
                {setting.voice_id}
                {t("voice_unavailable_accent_unknown")}
                <Button
                  size="small"
                  disabled={readOnly}
                  aria-label={t("disable_unavailable_voice_3", {
                    p0: setting.voice_id
                  })}
                  onClick={() => onToggleVoice(setting.voice_id)}
                >
                  {t("disable")}
                </Button>
              </div>
            ))}
          {renderGroups(common)}
          {uncommon.length > 0 && (
            <details className="tsz-ve-more-voices" open={moreOpen}>
              <summary
                onClick={(event) => {
                  event.preventDefault();
                  setMoreOpen((open) => !open);
                }}
              >
                {t("more_voices")}
                {uncommon.length}）
                {selectedUncommon > 0
                  ? t("selected_4", { p0: selectedUncommon })
                  : ""}
              </summary>
              <div className="tsz-ve-more-voice-groups">
                {renderGroups(uncommon)}
              </div>
            </details>
          )}
        </>
      )}
      {auditionStatus && (
        <div className="tsz-ve-pop-status" aria-live="polite">
          {auditionStatus}
        </div>
      )}
    </div>
  );
}

/** 每个音色的倍率入口，调速和勾选/试听互不联动。 */
function VoiceRateControl({
  voice,
  ratePercent,
  readOnly,
  onChange
}: {
  voice: VoiceOption;
  ratePercent: number;
  readOnly?: boolean;
  onChange: (ratePercent: number) => void;
}) {
  const { t } = useVoiceEditorTranslation();
  const [open, setOpen] = useState(false);
  const [customRate, setCustomRate] = useState("");
  const [error, setError] = useVoiceEditorMessageState("");
  const allowed = (percent: number) =>
    !voice.rateRange ||
    (voice.rateRange.min <= percent && percent <= voice.rateRange.max);
  const apply = (percent: number) => {
    onChange(percent);
    setError("");
    setCustomRate("");
    setOpen(false);
  };
  return (
    <SelectionPanel
      open={open}
      onDismiss={() => setOpen(false)}
      content={
        <div role="group" aria-label={t("rate_settings", { p0: voice.label })}>
          <RatePanel
            readOnly={readOnly}
            ratePercent={ratePercent}
            isRateAllowed={allowed}
            onRate={apply}
            customRate={customRate}
            onCustomRateChange={setCustomRate}
            onCustomRateSubmit={(raw) => {
              const multiplier = Number(raw.trim());
              const percent = Math.round((multiplier - 1) * 100);
              if (
                !raw.trim() ||
                !Number.isFinite(multiplier) ||
                multiplier < RATE_MULTIPLIER_MIN ||
                multiplier > RATE_MULTIPLIER_MAX ||
                !allowed(percent)
              ) {
                setError(
                  createVoiceEditorMessage(
                    "enter_a_supported_rate_between_0_30_and_1_70"
                  )
                );
                return;
              }
              apply(percent);
            }}
          />
          {error && (
            <Typography.Text type="danger" role="alert">
              {error}
            </Typography.Text>
          )}
        </div>
      }
    >
      <Button
        size="small"
        className="tsz-ve-voice-rate"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        disabled={readOnly || !voice.supportsRate}
        aria-label={t("set_rate", { p0: voice.label })}
      >
        {(1 + ratePercent / 100).toFixed(2)}×
      </Button>
    </SelectionPanel>
  );
}

export interface RatePanelProps {
  readOnly?: boolean;
  ratePercent?: number;
  isRateAllowed: (percent: number) => boolean;
  onRate: (percent: number) => void;
  customRate: string;
  onCustomRateChange: (value: string) => void;
  onCustomRateSubmit: (raw: string) => void;
}

/** 语速：一档一行的单选清单，末尾留自定义入口。 */
export function RatePanel({
  readOnly,
  ratePercent,
  isRateAllowed,
  onRate,
  customRate,
  onCustomRateChange,
  onCustomRateSubmit
}: RatePanelProps) {
  const { t } = useVoiceEditorTranslation();
  return (
    <div
      className="tsz-ve-pop tsz-ve-pop-rate"
      aria-label={t("fine_tune_rate")}
    >
      {RATE_PRESETS.map(({ multiplier, percent }) => (
        <PopRow
          key={multiplier}
          selected={ratePercent === percent}
          label={`${multiplier.toFixed(2)} ×`}
          meta={percent === 0 ? t("original_rate") : undefined}
          ariaLabel={t("rate_2", { p0: multiplier.toFixed(2) })}
          disabled={readOnly || !isRateAllowed(percent)}
          onToggle={() => onRate(percent)}
        />
      ))}
      <div className="tsz-ve-pop-divider" aria-hidden />
      <div className="tsz-ve-pop-foot">
        <Typography.Text type="secondary">{t("custom")}</Typography.Text>
        <Input
          size="small"
          className="tsz-ve-custom-input"
          aria-label={t("custom_rate_multiplier")}
          placeholder={t("e_g_1_10_press_enter_to_apply")}
          value={customRate}
          disabled={readOnly}
          onChange={(event) => onCustomRateChange(event.target.value)}
          /*
           * 用 onKeyDown 自己判回车，不用 antd 的 onPressEnter：实测 v6 的
           * onPressEnter **只触发一次**——同一个输入框第二次回车不再回调，裸
           * Input 也复现（与 Popover 无关），表现为「自定义值只有第一次生效」。
           * 值也直接从事件里取，免得再受闭包过期影响。
           */
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            event.stopPropagation();
            onCustomRateSubmit((event.target as HTMLInputElement).value);
          }}
        />
      </div>
    </div>
  );
}

/** 下一批要添加的音频归到哪个语种/性别；每条加进来后就固定各自的归属。 */
export interface UploadDraft {
  locale: AudioAssetLocale;
  gender: AudioAssetGender;
}

export interface UploadPanelProps {
  uploadAllowed?: boolean;
  readOnly?: boolean;
  /** 只允许上传这一侧的录音；不传表示这段正文不分英美。 */
  locale?: AudioAssetLocale;
  /** 没注入适配器、或存储未开通时为 false：整块置灰并说明原因。 */
  available: boolean;
  unavailableReason?: string;
  upload: UploadDraft;
  onUploadChange: (next: Partial<UploadDraft>) => void;
  /** 已落成资产的音频。 */
  assets: AudioAsset[];
  /** 还在路上或失败待重试的上传。 */
  pending: PendingUpload[];
  limit: number;
  onAddFiles: (files: FileList) => void;
  onRetryUpload: (id: string) => void;
  onDismissUpload: (id: string) => void;
  onRemoveAsset: (asset: AudioAsset) => void;
  onPlayAsset: (asset: AudioAsset) => void;
  playingAssetId?: string;
  /** 试听失败的说明；只在这块面板里显示。 */
  playbackMessage?: string;
}

const localeBadge = (locale: string) =>
  VOICE_LOCALES.find((item) => item.locale === locale)?.badge ?? locale;
const genderLabel = (gender: string, t: VoiceEditorTranslation) =>
  voiceGenderLabels(t).find((item) => item.gender === gender)?.label ?? gender;

/**
 * 音频：先定归属再选文件；上面是还在路上的（进度 / 失败可重试），下面是已保存的（试听 / 移除）。
 * 上传本身在宿主注入的适配器里跑，这里只呈现队列。
 */
export function UploadPanel({
  uploadAllowed = true,
  readOnly,
  locale,
  available,
  unavailableReason,
  upload,
  onUploadChange,
  assets,
  pending,
  limit,
  onAddFiles,
  onRetryUpload,
  onDismissUpload,
  onRemoveAsset,
  onPlayAsset,
  playingAssetId,
  playbackMessage
}: UploadPanelProps) {
  const { t, i18n } = useVoiceEditorTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inFlight = pending.filter((item) => !item.error).length;
  const used = assets.length + inFlight;
  const canAdd = available && uploadAllowed && !readOnly && used < limit;
  return (
    <div className="tsz-ve-pop tsz-ve-pop-upload" aria-label={t("audio")}>
      {/*
       * 原生 file input 藏起来、只用它的能力：默认控件是英文且无法定制，
       * 更要命的是我们每次添加后会清空 value（好让同名文件能再传一次），
       * 于是它会永远显示「No file chosen」——下面明明已经列了几条。
       */}
      <input
        ref={fileInputRef}
        type="file"
        accept={AUDIO_UPLOAD_ACCEPT}
        multiple
        aria-label={t("upload_audio")}
        style={{ display: "none" }}
        disabled={!canAdd}
        onChange={(event) => {
          if (event.target.files?.length) onAddFiles(event.target.files);
          event.target.value = "";
        }}
      />

      {/*
       * 归属放在按钮之前：从上往下读即「先定归属 → 再选文件」，
       * 顺序本身说明了它只作用于接下来添加的那批，不必再写一句解释。
       */}
      <div className="tsz-ve-pop-field">
        <Typography.Text type="secondary">{t("ownership")}</Typography.Text>
        <Radio.Group
          size="small"
          optionType="button"
          aria-label={t("upload_audio_language")}
          value={upload.locale}
          disabled={readOnly || !available || !uploadAllowed}
          onChange={(event) => onUploadChange({ locale: event.target.value })}
          options={VOICE_LOCALES.filter(
            (entry) => !locale || entry.locale === locale
          ).map(({ locale: value, badge }) => ({
            value,
            label: badge
          }))}
        />
        <Radio.Group
          size="small"
          optionType="button"
          aria-label={t("upload_audio_gender")}
          value={upload.gender}
          disabled={readOnly || !available || !uploadAllowed}
          onChange={(event) => onUploadChange({ gender: event.target.value })}
          options={voiceGenderLabels(t).map(({ gender, label }) => ({
            value: gender,
            label
          }))}
        />
      </div>

      <Button
        block
        size="small"
        disabled={!canAdd}
        onClick={() => fileInputRef.current?.click()}
      >
        {t("select_audio_files")}
      </Button>
      <Typography.Text
        type="secondary"
        className="tsz-ve-upload-hint"
        role={available && uploadAllowed ? undefined : "note"}
      >
        {!uploadAllowed
          ? t("audio_upload_permission_is_required")
          : available
            ? t("up_to_items_used", {
                p0: audioUploadHint(t),
                p1: limit,
                p2: used
              })
            : unavailableReason}
      </Typography.Text>
      {playbackMessage && (
        <Typography.Text
          type="danger"
          className="tsz-ve-upload-hint"
          role="alert"
        >
          {playbackMessage}
        </Typography.Text>
      )}

      {(pending.length > 0 || assets.length > 0) && (
        <>
          <div className="tsz-ve-pop-divider" aria-hidden />
          <ul className="tsz-ve-upload-list" aria-label={t("uploaded_audio")}>
            {pending.map((item) => (
              <li
                key={item.id}
                className="tsz-ve-upload-item is-pending"
                data-state={item.error ? "failed" : "uploading"}
              >
                <span className="tsz-ve-upload-status" aria-hidden />
                <span className="tsz-ve-upload-name" title={item.name}>
                  {item.name}
                </span>
                {item.error ? (
                  <span className="tsz-ve-upload-error" role="alert">
                    {item.error.code === "unsupported_type"
                      ? audioFormatHint(t)
                      : item.error.code === "too_large"
                        ? audioSizeHint(t)
                        : item.error.code === "too_many"
                          ? t("at_most_audio_items_allowed", { p0: limit })
                          : item.error.code === "permission_denied"
                            ? t("you_do_not_have_permission_to_upload_audio")
                            : (item.error.displayMessage?.(i18n.language) ??
                              item.error.message)}
                  </span>
                ) : (
                  <Progress
                    className="tsz-ve-upload-progress"
                    percent={progressPercent(item.progress)}
                    size="small"
                    showInfo={false}
                    aria-label={t("upload_progress_for", { p0: item.name })}
                  />
                )}
                <span className="tsz-ve-upload-actions">
                  {item.error?.retryable && (
                    <Button
                      size="small"
                      type="text"
                      aria-label={t("retry", { p0: item.name })}
                      disabled={!available || readOnly || !uploadAllowed}
                      onClick={() => onRetryUpload(item.id)}
                    >
                      {t("try_again")}
                    </Button>
                  )}
                  <Button
                    size="small"
                    type="text"
                    className="tsz-ve-upload-remove"
                    aria-label={t("remove", { p0: item.name })}
                    disabled={readOnly}
                    onClick={() => onDismissUpload(item.id)}
                  >
                    {t("remove_2")}
                  </Button>
                </span>
              </li>
            ))}
            {assets.map((asset) => (
              <li key={asset.id} className="tsz-ve-upload-item">
                <Button
                  size="small"
                  type="text"
                  className="tsz-ve-audition-button"
                  aria-label={t("audition_3", { p0: asset.original_name })}
                  data-playing={playingAssetId === asset.id}
                  disabled={!available}
                  onClick={() => onPlayAsset(asset)}
                >
                  <Volume2Icon />
                </Button>
                <span
                  className="tsz-ve-upload-name"
                  title={asset.original_name}
                >
                  {asset.original_name}
                </span>
                <span className="tsz-ve-upload-tag">
                  {localeBadge(asset.locale)} · {genderLabel(asset.gender, t)}
                </span>
                {/* 移除只是从草稿里去掉引用、保存后才生效，但不进撤销栈，所以要确认一下 */}
                <Popconfirm
                  title={t("remove_this_audio")}
                  description={t("applies_after_saving_the_draft")}
                  okText={t("remove_2")}
                  cancelText={t("cancel")}
                  okButtonProps={{ danger: true }}
                  disabled={readOnly}
                  onConfirm={() => onRemoveAsset(asset)}
                >
                  <Button
                    size="small"
                    type="text"
                    className="tsz-ve-upload-remove"
                    aria-label={t("remove_3", { p0: asset.original_name })}
                    disabled={readOnly}
                  >
                    {t("remove_2")}
                  </Button>
                </Popconfirm>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** 连读弧图标：与标注带上真正画出来的那条弧同形，按钮和结果能对上。 */
export function LiaisonIcon({ part }: { part?: "start" | "end" } = {}) {
  return (
    <svg
      viewBox={part ? "0 0 14 12" : "0 0 24 12"}
      width={part ? "14" : "22"}
      height="11"
      aria-hidden
      focusable="false"
      className="tsz-ve-liaison-icon"
    >
      <path
        d={
          part === "start"
            ? "M2 11 C 4 6, 8 3.5, 12 3.5"
            : part === "end"
              ? "M2 3.5 C 6 3.5, 10 6, 12 11"
              : "M2 11 C 6 1, 18 1, 22 11"
        }
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export interface RolePanelProps {
  readOnly?: boolean;
  hasWords: boolean;
  onBrushChange: (brush: Brush) => void;
  selectionText?: string;
  selectedLevel?: string;
}

function roleDescriptions(
  t: VoiceEditorTranslation = defaultVoiceEditorTranslation
): Record<string, string> {
  return {
    function: t("a_part_that_can_be_replaced_with_other_content"),
    core: t("a_part_that_stays_fixed_in_the_pattern"),
    grammar: t("part_of_speech_hints_such_as_n_or_adj")
  };
}

function roleShortLabels(
  t: VoiceEditorTranslation = defaultVoiceEditorTranslation
): Record<string, string> {
  return {
    function: t("replaceable_slot"),
    core: t("fixed_core"),
    grammar: t("part_of_speech_indicator")
  };
}

/** 先选文字再设置语法分类。 */
export function RolePanel({
  readOnly,
  hasWords,
  onBrushChange,
  selectionText,
  selectedLevel
}: RolePanelProps) {
  const { t } = useVoiceEditorTranslation();
  return (
    <div
      className="tsz-ve-grammar-panel"
      aria-label={t("grammar_structure_annotation")}
      onMouseDown={(event) => event.preventDefault()}
    >
      <Space.Compact
        role="group"
        aria-label={t("grammar_annotation_category")}
        size="small"
      >
        {Object.values(grammarRoleDefinitions(t)).map((role) => (
          <Tooltip
            key={role.level}
            title={`${role.label}：${roleDescriptions(t)[role.level]}`}
          >
            <Button
              className="tsz-ve-grammar-option"
              color={selectedLevel === role.level ? "primary" : "default"}
              variant={selectedLevel === role.level ? "filled" : "outlined"}
              aria-label={t("mark_as", { p0: role.label })}
              aria-pressed={selectedLevel === role.level}
              disabled={readOnly || !hasWords || selectionText === undefined}
              onClick={() => onBrushChange({ kind: "role", level: role.level })}
            >
              <span
                className={`tsz-ve-pop-swatch is-${role.level}`}
                aria-hidden
              />
              {roleShortLabels(t)[role.level]}
            </Button>
          </Tooltip>
        ))}
      </Space.Compact>
      <div
        className="tsz-ve-grammar-hint"
        role="status"
        title={
          selectionText !== undefined
            ? t("selected_5", { p0: selectionText })
            : t(
                "drag_to_select_text_or_double_click_a_word_then_set_a_category_select_an_ex"
              )
        }
      >
        {selectionText !== undefined ? (
          <>
            {t("selected_3")}{" "}
            <strong title={selectionText}>「{selectionText}」</strong>
          </>
        ) : hasWords ? (
          <>{t("drag_to_select_text_or_double_click_a_word")}</>
        ) : (
          <>{t("enter_a_pattern_or_phrase_then_select_text_to_annotate")}</>
        )}
      </div>
    </div>
  );
}

export interface PausePanelProps {
  active: boolean;
  readOnly?: boolean;
  hasWords: boolean;
  brush: Brush;
  location?: { before: string; after: string };
  duration?: number;
  onApply: (duration: number) => void;
  onRemove: () => void;
  onClose: () => void;
  customPause: string;
  onCustomPauseChange: (value: string) => void;
  onCustomPauseSubmit: (raw: string) => void;
}

/** 选择时长后点词缝添加，也可直接编辑已有停顿。 */
export function PausePanel({
  active,
  readOnly,
  hasWords,
  brush,
  location,
  duration,
  onApply,
  onRemove,
  onClose,
  customPause,
  onCustomPauseChange,
  onCustomPauseSubmit
}: PausePanelProps) {
  const { t } = useVoiceEditorTranslation();
  const continuous = brush.kind === "pause";
  const current = continuous ? brush.durationMs : duration;
  const choices = [250, 500, 750, 1000, 2000, 3000];
  const disabled = readOnly || !active || !hasWords;
  const submit = () => {
    if (disabled) return;
    const raw = customPause.trim();
    // 仅接收最多三位小数的秒数；避免 1.001 * 1000 的浮点尾差误判非法毫秒。
    const valid = /^(?:\d+(?:\.\d{1,3})?|\.\d{1,3})$/.test(raw);
    onCustomPauseSubmit(valid ? String(Math.round(Number(raw) * 1000)) : "");
  };
  return (
    <div className="tsz-ve-pause-editor" aria-label={t("pause_settings")}>
      <div className="tsz-ve-pause-editor-head">
        <strong>
          {continuous
            ? t("add_multiple_pauses")
            : duration !== undefined
              ? t("edit_pause")
              : t("insert_pause")}
        </strong>
        <Button
          size="small"
          type="text"
          aria-label={t("close_pause_settings")}
          onClick={onClose}
        >
          {t("close")}
        </Button>
      </div>
      <div className="tsz-ve-pause-location" role="status">
        {continuous ? (
          t("choose_a_duration_then_click_word_gaps_esc_to_exit")
        ) : location ? (
          <>
            <b>{location.before}</b>
            <span> Ⅱ </span>
            <b>{location.after}</b>
          </>
        ) : active ? (
          t(
            "choose_a_pause_duration_then_click_a_grey_insertion_point_between_words"
          )
        ) : (
          t("select_pause_choose_a_duration_and_click_a_word_gap")
        )}
      </div>
      <div className="tsz-ve-pause-presets">
        {choices.map((ms) => (
          <Button
            key={ms}
            size="small"
            disabled={disabled}
            color={current === ms ? "primary" : "default"}
            variant={current === ms ? "filled" : "outlined"}
            aria-label={t("pause_duration_seconds", { count: ms / 1000 })}
            aria-pressed={current === ms}
            onClick={() => onApply(ms)}
          >
            {t("seconds_value", { count: ms / 1000 })}
          </Button>
        ))}
      </div>
      <div className="tsz-ve-pause-custom">
        <Input
          size="small"
          aria-label={t("custom_pause_in_seconds")}
          placeholder={current ? `${current / 1000}` : t("custom_seconds")}
          value={customPause}
          disabled={disabled}
          onChange={(e) => onCustomPauseChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        <span className="tsz-ve-pause-unit">{t("seconds")}</span>
        <Button
          size="small"
          disabled={disabled || !customPause.trim()}
          onClick={submit}
        >
          {t("apply")}
        </Button>
      </div>
      {!continuous && duration !== undefined && (
        <div className="tsz-ve-pause-editor-foot">
          <Button
            size="small"
            type="text"
            danger
            disabled={readOnly}
            onClick={onRemove}
          >
            {t("remove_pause")}
          </Button>
        </div>
      )}
    </div>
  );
}

/** A single voice draft: no catalogue, selection controls or hidden parameter panels. */
export function VoiceParameters({
  voice,
  setting,
  readOnly,
  onChange,
  onValidationChange
}: {
  voice: VoiceOption;
  setting: VoiceSetting;
  readOnly?: boolean;
  onChange: (patch: Partial<VoiceSetting>) => void;
  onValidationChange?: (valid: boolean) => void;
}) {
  const { t } = useVoiceEditorTranslation();
  const [form] = Form.useForm<VoiceParameterValues>();
  const parameterVoice: ParameterVoice = {
    capabilities: {
      supports_volume_percent: voice.supportsVolume,
      styles: voice.styles,
      min_rate_percent: voice.supportsRate
        ? (voice.rateRange?.min ?? -50)
        : (voice.rateRange?.min ?? 0),
      max_rate_percent: voice.supportsRate
        ? (voice.rateRange?.max ?? 100)
        : (voice.rateRange?.min ?? 0),
      min_pitch_semitones: voice.supportsPitch
        ? (voice.pitchRange?.min ?? -12)
        : (voice.pitchRange?.min ?? 0),
      max_pitch_semitones: voice.supportsPitch
        ? (voice.pitchRange?.max ?? 12)
        : (voice.pitchRange?.min ?? 0)
    },
    capability_evidence: {
      roles: voice.roles ?? null,
      supports_style_degree: voice.supportsStyleDegree ?? null
    }
  };
  const values = {
    rate_percent: setting.rate_percent,
    pitch_semitones: setting.pitch_semitones ?? 0,
    volume_percent: setting.volume_percent ?? 100,
    style: setting.style ?? "",
    style_degree: setting.style_degree,
    role: setting.role
  };
  const serialized = JSON.stringify(values);
  const emitted = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (serialized === emitted.current) return;
    form.setFieldsValue({
      style_degree: undefined,
      role: undefined,
      ...JSON.parse(serialized)
    });
    onValidationChange?.(true);
  }, [serialized, form, onValidationChange]);
  const emit = (next: VoiceParameterValues) =>
    onChange({
      ...next,
      style: next.style || undefined,
      role: next.role || undefined,
      style_degree: next.style_degree ?? undefined
    });
  const defaults = defaultVoiceParameters(parameterVoice);
  const resetDisabled = Object.entries(defaults).every(
    ([key, value]) => values[key as keyof typeof values] === value
  );
  return (
    <Form
      component="div"
      form={form}
      layout="vertical"
      requiredMark={false}
      initialValues={values}
      disabled={readOnly}
      className="tsz-ve-voice-parameters"
      onFieldsChange={() =>
        onValidationChange?.(
          !form.isFieldsValidating() &&
            !form.getFieldsError().some((field) => field.errors.length)
        )
      }
      onValuesChange={(changed: Partial<VoiceParameterValues>) => {
        onValidationChange?.(false);
        const patch: Partial<VoiceSetting> = {};
        for (const [key, value] of Object.entries(changed)) {
          if (
            ["rate_percent", "pitch_semitones", "volume_percent"].includes(
              key
            ) &&
            (value == null || !Number.isFinite(value))
          )
            continue;
          Object.assign(patch, {
            [key]:
              key === "style" || key === "role"
                ? value || undefined
                : (value ?? undefined)
          });
        }
        const next = { ...setting, ...patch };
        emitted.current = JSON.stringify({
          rate_percent: next.rate_percent,
          pitch_semitones: next.pitch_semitones ?? 0,
          volume_percent: next.volume_percent ?? 100,
          style: next.style ?? "",
          style_degree: next.style_degree,
          role: next.role
        });
        onChange(patch);
      }}
    >
      <VoiceParameterFields
        voice={parameterVoice}
        disabled={!!readOnly}
        volume={values.volume_percent}
        style={values.style}
        resetDisabled={resetDisabled}
        rateBounds={{
          min: parameterVoice.capabilities.min_rate_percent,
          max: parameterVoice.capabilities.max_rate_percent
        }}
        labels={{
          rate: t("current_voice_rate"),
          volume: t("current_voice_volume"),
          pitch: t("current_voice_pitch"),
          style: t("current_voice_style"),
          degree: t("current_voice_style_intensity"),
          role: t("current_voice_role")
        }}
        onReset={() => {
          form.setFieldsValue(defaults);
          emit(defaults);
          onValidationChange?.(true);
        }}
      />
    </Form>
  );
}
