import {
  speechAccentGroup,
  speechLocaleMatchesScope,
  speechRegionLabel
} from "@tsz/shared";
import {
  Button,
  Input,
  Popconfirm,
  Select,
  Space,
  Tag,
  Typography
} from "antd";
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
    <section className="tsz-ve-versions" aria-label="当前文本的配音版本">
      <Typography.Text strong>当前文本的配音版本</Typography.Text>
      <Typography.Paragraph type="secondary">
        {multiple
          ? "同口音可选多个版本，按顺序审听，首个有效已选版本作为默认。"
          : "英式与美式各选一个正式版本，其他地区按地区选用补充版本。"}
        保存后保留当前参数。
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
            aria-label={`配音版本 ${setting.version_name ?? voice?.label ?? setting.voice_id}`}
          >
            <Space wrap>
              <Typography.Text
                strong
                editable={
                  !readOnly && !!setting.version_id
                    ? {
                        tooltip: "修改版本名称",
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
                  ? `${speechAccentGroup(accent, voice?.accent) === "uk" ? "英式" : speechAccentGroup(accent, voice?.accent) === "us" ? "美式" : "不归类"} · ${speechRegionLabel(accent)}`
                  : "口音未知"}
              </Tag>
              {setting.enabled && (
                <Tag color="blue">
                  {setting.version_id ? "正式选用" : "原有已启用"}
                </Tag>
              )}
              {editingKey === key && <Tag>正在调参</Tag>}
              {setting.audio_asset_id && <Tag color="green">已生成音频</Tag>}
              {!available && (
                <Tag color="warning">音色或参数不可用，请调整</Tag>
              )}
            </Space>
            <Typography.Paragraph type="secondary">
              {voice?.label ?? setting.voice_id}，
              {((setting.rate_percent + 100) / 100).toFixed(2)}×，音量{" "}
              {setting.volume_percent ?? 100}%
            </Typography.Paragraph>
            <Space wrap>
              <Select
                size="small"
                aria-label={`输出格式 ${setting.version_name ?? setting.voice_id}`}
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
                调整参数
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
                {setting.audio_asset_id ? "播放正式音频" : "试听此版本"}
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
                  {setting.audio_asset_id ? "重新生成音频" : "生成正式音频"}
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
                  移除音频
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
                {multiple && setting.enabled ? "取消选用" : "正式选用"}
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
                      aria-label={`${offset < 0 ? "上移" : "下移"}配音版本 ${setting.version_name ?? setting.voice_id}`}
                      onClick={() => {
                        const next = [...settings];
                        [next[index], next[index + offset]] = [
                          next[index + offset]!,
                          next[index]!
                        ];
                        (onReorder ?? onChange)(next);
                      }}
                    >
                      {offset < 0 ? "上移" : "下移"}
                    </Button>
                  );
                })}
              <Popconfirm
                title="删除这个配音版本？"
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
                  删除版本
                </Button>
              </Popconfirm>
            </Space>
          </div>
        );
      })}
      {!readOnly && source && (
        <Space wrap className="tsz-ve-version-create">
          <Select
            aria-label="另存版本的音色"
            value={source.id}
            onChange={setSourceId}
            options={candidates.map((voice) => ({
              value: voice.id,
              label: voice.label
            }))}
            style={{ minWidth: 180 }}
          />
          <Input
            aria-label="新版本名称"
            placeholder="版本名称，如清晰慢读"
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
            另存为新版本
          </Button>
        </Space>
      )}
    </section>
  );
}
