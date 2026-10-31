import { speechAccentGroup } from "@tsz/shared";
import type {
  VoiceOption,
  VoiceProfile,
  VoiceRecommendation,
  VoiceRecommendationArea,
  VoiceSetting,
  VoicePreviewRequest
} from "../types";
import { newVoiceVersionId, voiceSettingKey } from "./voice-versions";
import { isVoiceRecommendationAvailable } from "./voice-recommendations";

/** Official IDs are case-sensitive and include the complete model suffix. */
export function providerVoiceKey(
  voiceId: string,
  voices: readonly VoiceOption[]
): string {
  const voice = voices.find((item) => item.id === voiceId);
  return voice?.provider && voice.providerVoiceId
    ? JSON.stringify([voice.provider, voice.providerVoiceId])
    : JSON.stringify(["alias", voiceId]);
}

/** Preserve raw controls in storage; only proven unsupported controls leave the request. */
export function effectiveVoiceSetting(
  setting: VoiceSetting,
  voice?: VoiceOption
): VoiceSetting {
  if (!voice) return setting;
  const next = { ...setting };
  if (voice.supportsRate === false)
    next.rate_percent = voice.rateRange?.min ?? 0;
  if (voice.supportsPitch === false) {
    if (voice.pitchRange?.min) next.pitch_semitones = voice.pitchRange.min;
    else delete next.pitch_semitones;
  }
  if (voice.supportsVolume === false) delete next.volume_percent;
  if (next.style && !voice.styles.includes(next.style)) {
    delete next.style;
    delete next.style_degree;
    delete next.role;
  }
  if (voice.supportsStyleDegree === false) delete next.style_degree;
  if (voice.roles && next.role && !voice.roles.includes(next.role))
    delete next.role;
  return next;
}

export function voicePoolConflicts(
  settings: readonly VoiceSetting[],
  voices: readonly VoiceOption[]
) {
  const groups = new Map<string, VoiceSetting[]>();
  for (const setting of settings) {
    const key = providerVoiceKey(setting.voice_id, voices);
    groups.set(key, [...(groups.get(key) ?? []), setting]);
  }
  return [...groups].filter(([, items]) => items.length > 1);
}

export function convertVoicePool(
  profile: VoiceProfile | null | undefined,
  settings: readonly VoiceSetting[],
  voices: readonly VoiceOption[],
  area: VoiceRecommendationArea,
  choices: Readonly<Record<string, string>> = {}
): VoiceProfile {
  const conflicts = voicePoolConflicts(settings, voices);
  if (
    conflicts.some(
      ([id, items]) =>
        !items.some((item) => voiceSettingKey(item) === choices[id])
    )
  )
    throw new Error("请为每个同官方 ID 的历史冲突明确选择保留配置");
  return {
    voices: settings
      .filter((item) => {
        const conflict = conflicts.find(
          ([id]) => id === providerVoiceKey(item.voice_id, voices)
        );
        return !conflict || voiceSettingKey(item) === choices[conflict[0]];
      })
      .map((item) => ({
        ...item,
        version_id: item.version_id ?? newVoiceVersionId(),
        version_name:
          item.version_name ??
          Array.from(
            voices.find((v) => v.id === item.voice_id)?.displayName ??
              voices.find((v) => v.id === item.voice_id)?.label ??
              item.voice_id
          )
            .slice(0, 40)
            .join(""),
        locale:
          item.locale ??
          (voices.find((v) => v.id === item.voice_id)?.locale as `en-${string}`)
      })),
    dubbing: {
      mode: "local",
      area,
      pool_version: "provider_id_v1",
      ...(profile?.dubbing?.recommendation
        ? { recommendation: profile.dubbing.recommendation }
        : {})
    }
  };
}

export function switchPoolRecommendation(
  profile: VoiceProfile,
  items: readonly VoiceRecommendation[],
  voices: readonly VoiceOption[]
): { profile: VoiceProfile; duplicates: string[] } {
  if (!profile.dubbing?.pool_version) throw new Error("请先明确转换历史配置");
  const previous = new Set(
    profile.dubbing.recommendation?.contribution_ids ?? []
  );
  const settings = profile.voices.map((item) =>
    previous.has(voiceSettingKey(item)) ? { ...item, enabled: false } : item
  );
  const contribution_ids: string[] = [];
  const duplicates: string[] = [];
  for (const item of items) {
    const key = providerVoiceKey(item.setting.voice_id, voices);
    const index = settings.findIndex(
      (setting) => providerVoiceKey(setting.voice_id, voices) === key
    );
    if (index >= 0) {
      const cached = settings[index]!;
      if (cached.enabled) duplicates.push(item.setting.voice_id);
      else contribution_ids.push(voiceSettingKey(cached));
      settings[index] = { ...cached, enabled: true };
    } else {
      const voice = voices.find((voice) => voice.id === item.setting.voice_id);
      const version_id = newVoiceVersionId();
      settings.push({
        ...item.setting,
        version_id,
        version_name: item.name,
        enabled: true,
        locale: (voice?.locale ?? item.locale) as `en-${string}`
      });
      contribution_ids.push(version_id);
    }
  }
  const source = items[0];
  return {
    profile: {
      voices: settings,
      dubbing: {
        mode: "local",
        area: profile.dubbing.area,
        pool_version: "provider_id_v1",
        ...(source?.groupId && source.pairId
          ? {
              recommendation: {
                group_id: source.groupId,
                pair_id: source.pairId,
                voice_ids: [
                  ...new Set(items.map((item) => item.setting.voice_id))
                ],
                contribution_ids
              }
            }
          : {})
      }
    },
    duplicates
  };
}

export function togglePoolVoice(
  profile: VoiceProfile,
  voice: VoiceOption,
  voices: readonly VoiceOption[]
): VoiceProfile {
  const key = providerVoiceKey(voice.id, voices);
  const cached = profile.voices.find(
    (item) => providerVoiceKey(item.voice_id, voices) === key
  );
  const setting: VoiceSetting = cached
    ? { ...cached, enabled: !cached.enabled }
    : {
        voice_id: voice.id,
        version_id: newVoiceVersionId(),
        version_name: Array.from(voice.displayName ?? voice.label)
          .slice(0, 40)
          .join(""),
        locale: voice.locale as `en-${string}`,
        enabled: true,
        rate_percent: 0,
        ...voice.defaultSettings
      };
  return {
    ...profile,
    voices: cached
      ? profile.voices.map((item) => (item === cached ? setting : item))
      : [...profile.voices, setting]
  };
}

export function reorderPoolVoice(
  settings: readonly VoiceSetting[],
  key: string,
  direction: -1 | 1,
  voices: readonly VoiceOption[]
): VoiceSetting[] {
  const from = settings.findIndex((item) => voiceSettingKey(item) === key);
  const side = (item: VoiceSetting) => {
    const voice = voices.find((v) => v.id === item.voice_id);
    return speechAccentGroup(voice?.locale ?? item.locale, voice?.accent);
  };
  const current = settings[from];
  if (!current) return [...settings];
  const candidates = settings
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.enabled && side(item) === side(current));
  const rank = candidates.findIndex(({ index }) => index === from);
  const to = candidates[rank + direction]?.index;
  if (to === undefined) return [...settings];
  const next = [...settings];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

/** Admin preview only. Learning playback is a separate delivery batch. */
export function voicePoolProbabilities(
  settings: readonly VoiceSetting[],
  voices: readonly VoiceOption[],
  content: VoicePreviewRequest["content"],
  locale?: `en-${string}`
): Map<string, number> {
  const probabilities = new Map<string, number>();
  for (const accent of ["en-GB", "en-US"] as const) {
    if (locale && locale !== accent) continue;
    const eligible = settings.filter(
      (setting) =>
        setting.enabled &&
        voices.some(
          (voice) =>
            voice.id === setting.voice_id &&
            speechAccentGroup(voice.locale, voice.accent) ===
              speechAccentGroup(accent)
        ) &&
        isVoiceRecommendationAvailable(
          {
            id: voiceSettingKey(setting),
            name: "",
            groupName: "",
            locale: accent,
            setting: effectiveVoiceSetting(
              setting,
              voices.find((v) => v.id === setting.voice_id)
            )
          },
          voices,
          accent,
          content
        )
    );
    const total = eligible.reduce((sum, _, rank) => sum + 1 / (rank + 1), 0);
    eligible.forEach((item, rank) =>
      probabilities.set(voiceSettingKey(item), 1 / (rank + 1) / total)
    );
  }
  return probabilities;
}
