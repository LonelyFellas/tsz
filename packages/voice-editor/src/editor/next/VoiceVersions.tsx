import { useVoiceEditorTranslation } from "../i18n";
import {
  speechAccentGroup,
  speechLocaleMatchesScope,
  speechRegionLabel
} from "@tsz/shared";
import { Button, Space, Tag, Typography } from "@tsz/ui/admin/display";
import { Input, Select } from "@tsz/ui/admin/forms";
import { Popconfirm } from "@tsz/ui/admin/overlays";
import { useState } from "react";
import type { AudioAssetLocale, VoiceOption, VoiceSetting } from "../../types";
import {
  newVoiceVersionId,
  isVoiceRecommendationAvailable,
  voiceLocale,
  voiceSettingFor,
  voiceSettingKey
} from "../../core";

export function VoiceVersions({
  settings,
  voices,
  locale,
  phonemeLocale,
  hasPause,
  hasPhoneme,
  editingKey,
  readOnly,
  canAudition,
  onEdit,
  onChange,
  onReorder,
  onSelect,
  onAudition,
  onGenerate,
  generatingVersion,
  unavailableVersions,
  multiple
}: {
  settings: VoiceSetting[];
  voices: VoiceOption[];
  locale?: AudioAssetLocale;
  phonemeLocale?: AudioAssetLocale;
  hasPause?: boolean;
  hasPhoneme?: boolean;
  editingKey?: string;
  readOnly?: boolean;
  canAudition: boolean;
  onEdit: (key: string) => void;
  onChange: (settings: VoiceSetting[]) => void;
  onReorder?: (settings: VoiceSetting[]) => void;
  onSelect: (setting: VoiceSetting) => void;
  onAudition: (voice: VoiceOption, setting: VoiceSetting) => void;
  onGenerate?: (setting: VoiceSetting) => void;
  generatingVersion?: string;
  unavailableVersions?: ReadonlySet<string>;
  multiple?: boolean;
}) {
  const { t } = useVoiceEditorTranslation();
  const [name, setName] = useState("");
  const [sourceId, setSourceId] = useState<string>();
  const candidates = voices.filter((voice) =>
    speechLocaleMatchesScope(voice.locale, locale, voice.accent)
  );
  const source =
    candidates.find((voice) => voice.id === sourceId) ?? candidates[0];
  const visible = settings.filter(
    (setting) =>
      !locale ||
      speechLocaleMatchesScope(
        voiceLocale(setting, voices) ?? "",
        locale,
        voices.find((voice) => voice.id === setting.voice_id)?.accent
      ) ||
      !voiceLocale(setting, voices)
  );
  const sourceSetting = source
    ? voiceSettingFor(settings, source.id, editingKey)
    : undefined;
  return (
    <section
      className="tsz-ve-versions"
      aria-label={t("voice_versions_for_current_text")}
    >
      <Typography.Text strong>
        {t("voice_versions_for_current_text")}
      </Typography.Text>
      <Typography.Paragraph type="secondary">
        {t(
          multiple
            ? "voice_versions_help_multiple"
            : "voice_versions_help_regional"
        )}
      </Typography.Paragraph>
      {visible.map((setting) => {
        const key = voiceSettingKey(setting);
        const voice = voices.find((item) => item.id === setting.voice_id);
        const accent = voiceLocale(setting, voices);
        const playbackVoice: VoiceOption | undefined =
          voice ??
          (setting.audio_asset_id && setting.locale
            ? {
                id: setting.voice_id,
                label: setting.version_name ?? setting.voice_id,
                locale: setting.locale,
                gender: "neutral",
                styles: [],
                supportsRate: false,
                supportsPitch: false,
                isDefault: false
              }
            : undefined);
        const available =
          !unavailableVersions?.has(key) &&
          (!phonemeLocale ||
            (accent === phonemeLocale && voice?.supportsPhoneme !== false)) &&
          (!hasPause || voice?.supportsPause !== false) &&
          (!hasPhoneme || voice?.supportsPhoneme !== false) &&
          !!speechAccentGroup(accent) &&
          isVoiceRecommendationAvailable(
            {
              id: key,
              name: setting.version_name ?? "",
              groupName: "",
              locale: accent as AudioAssetLocale,
              setting
            },
            voices
          );
        return (
          <div
            className="tsz-ve-version"
            key={key}
            aria-label={t("voice_version", {
              p0: setting.version_name ?? voice?.label ?? setting.voice_id
            })}
          >
            <Space wrap>
              <Typography.Text
                strong
                editable={
                  !readOnly && !!setting.version_id
                    ? {
                        tooltip: t("edit_version_name"),
                        maxLength: 40,
                        onChange: (version_name) => {
                          if (version_name.trim())
                            onChange(
                              settings.map((item) =>
                                voiceSettingKey(item) === key
                                  ? {
                                      ...item,
                                      version_name: version_name.trim()
                                    }
                                  : item
                              )
                            );
                        }
                      }
                    : false
                }
              >
                {setting.version_name ?? voice?.label ?? setting.voice_id}
              </Typography.Text>
              <Tag>
                {accent
                  ? t("label_4", {
                      p0:
                        speechAccentGroup(accent, voice?.accent) === "uk"
                          ? t("british")
                          : speechAccentGroup(accent, voice?.accent) === "us"
                            ? t("american")
                            : t("ungrouped"),
                      p1: speechRegionLabel(accent)
                    })
                  : t("unknown_accent")}
              </Tag>
              {setting.enabled && (
                <Tag color="blue">
                  {setting.version_id
                    ? t("selected_final_version")
                    : t("previously_enabled")}
                </Tag>
              )}
              {editingKey === key && <Tag>{t("adjusting_parameters")}</Tag>}
              {setting.audio_asset_id && (
                <Tag color="green">{t("audio_generated")}</Tag>
              )}
              {!available && (
                <Tag color="warning">
                  {t(
                    "voice_or_parameters_are_unavailable_adjust_them_to_continue"
                  )}
                </Tag>
              )}
            </Space>
            <Typography.Paragraph type="secondary">
              {voice?.label ?? setting.voice_id}，
              {((setting.rate_percent + 100) / 100).toFixed(2)}
              {t("volume_3")} {setting.volume_percent ?? 100}%
            </Typography.Paragraph>
            <Space wrap>
              <Select
                size="small"
                aria-label={t("output_format", {
                  p0: setting.version_name ?? setting.voice_id
                })}
                value={setting.output_format ?? "mp3"}
                disabled={readOnly || !!generatingVersion}
                options={[
                  { value: "mp3", label: "MP3" },
                  { value: "wav", label: "WAV" }
                ]}
                onChange={(output_format: "mp3" | "wav") =>
                  onChange(
                    settings.map((item) =>
                      voiceSettingKey(item) === key
                        ? { ...item, output_format, audio_asset_id: undefined }
                        : item
                    )
                  )
                }
              />
              <Button
                size="small"
                disabled={readOnly || !voice}
                onClick={() => onEdit(key)}
              >
                {t("adjust_parameters")}
              </Button>
              <Button
                size="small"
                disabled={
                  (!setting.audio_asset_id && !available) || !canAudition
                }
                onClick={() =>
                  playbackVoice && onAudition(playbackVoice, setting)
                }
              >
                {setting.audio_asset_id
                  ? t("play_final_audio")
                  : t("audition_this_version")}
              </Button>
              {onGenerate && setting.version_id && (
                <Button
                  size="small"
                  loading={generatingVersion === key}
                  disabled={
                    readOnly ||
                    !available ||
                    !canAudition ||
                    !!generatingVersion
                  }
                  onClick={() => onGenerate(setting)}
                >
                  {setting.audio_asset_id
                    ? t("regenerate_audio")
                    : t("generate_final_audio")}
                </Button>
              )}
              {setting.audio_asset_id && (
                <Button
                  size="small"
                  disabled={readOnly}
                  onClick={() =>
                    onChange(
                      settings.map((item) =>
                        voiceSettingKey(item) === key
                          ? { ...item, audio_asset_id: undefined }
                          : item
                      )
                    )
                  }
                >
                  {t("remove_audio")}
                </Button>
              )}
              <Button
                size="small"
                disabled={
                  readOnly ||
                  (!available &&
                    !setting.audio_asset_id &&
                    !(multiple && setting.enabled)) ||
                  (setting.enabled && !!setting.version_id && !multiple)
                }
                onClick={() => onSelect(setting)}
              >
                {multiple && setting.enabled
                  ? t("deselect")
                  : t("selected_final_version")}
              </Button>
              {multiple &&
                [-1, 1].map((offset) => {
                  const index = settings.findIndex(
                    (item) => voiceSettingKey(item) === key
                  );
                  return (
                    <Button
                      key={offset}
                      size="small"
                      disabled={
                        readOnly ||
                        index + offset < 0 ||
                        index + offset >= settings.length
                      }
                      aria-label={t("voice_version_2", {
                        p0: offset < 0 ? t("move_up") : t("move_down"),
                        p1: setting.version_name ?? setting.voice_id
                      })}
                      onClick={() => {
                        const next = [...settings];
                        [next[index], next[index + offset]] = [
                          next[index + offset]!,
                          next[index]!
                        ];
                        (onReorder ?? onChange)(next);
                      }}
                    >
                      {offset < 0 ? t("move_up") : t("move_down")}
                    </Button>
                  );
                })}
              <Popconfirm
                title={t("delete_this_voice_version")}
                onConfirm={() =>
                  onChange(
                    settings.filter((item) => voiceSettingKey(item) !== key)
                  )
                }
                disabled={readOnly || setting.enabled}
              >
                <Button
                  size="small"
                  danger
                  disabled={readOnly || setting.enabled}
                >
                  {t("delete_version")}
                </Button>
              </Popconfirm>
            </Space>
          </div>
        );
      })}
      {!readOnly && source && (
        <Space wrap className="tsz-ve-version-create">
          <Select
            aria-label={t("voice_for_saved_version")}
            value={source.id}
            onChange={setSourceId}
            options={candidates.map((voice) => ({
              value: voice.id,
              label: voice.label
            }))}
            style={{ minWidth: 180 }}
          />
          <Input
            aria-label={t("new_version_name")}
            placeholder={t("version_name_e_g_clear_slow_reading")}
            maxLength={40}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button
            disabled={!name.trim()}
            onClick={() => {
              const version: VoiceSetting = {
                ...sourceSetting,
                audio_asset_id: undefined,
                voice_id: source.id,
                rate_percent: sourceSetting?.rate_percent ?? 0,
                enabled: false,
                version_id: newVoiceVersionId(),
                version_name: name.trim(),
                locale: source.locale as AudioAssetLocale
              };
              onChange([...settings, version]);
              onEdit(version.version_id!);
              setName("");
            }}
          >
            {t("save_as_new_version")}
          </Button>
        </Space>
      )}
    </section>
  );
}
