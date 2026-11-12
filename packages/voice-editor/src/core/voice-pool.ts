import { harmonicProbabilities, speechAccentGroup } from "@tsz/shared";
import type {
  VoiceOption,
  VoiceProfile,
  VoiceRecommendation,
  VoiceRecommendationArea,
  VoiceSetting,
  VoicePreviewRequest
} from "../types";
import {
  newVoiceVersionId,
  voiceSettingKey,
  voiceSettingAccent
} from "./voice-versions";
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

export function localVoicePool(
  profile: VoiceProfile | null | undefined,
  settings: readonly VoiceSetting[],
  voices: readonly VoiceOption[],
  area: VoiceRecommendationArea,
  side?: "uk" | "us"
): VoiceProfile {
  const belongsToSide = (item: VoiceSetting) => {
    return voiceSettingAccent(item, voices) === side;
  };
  // Inherited resolution is a view; retain the other side's stored draft verbatim.
  const stored = side
    ? [
        ...settings.filter(belongsToSide),
        ...(profile?.voices ?? []).filter((item) => !belongsToSide(item))
      ]
    : [...settings];
  if (
    voicePoolConflicts(side ? stored.filter(belongsToSide) : stored, voices)
      .length
  )
    throw new Error("同一官方音色只能保留一个配置");
  const dubbing = profile?.dubbing ?? {
    area,
    uk: { mode: profile ? ("local" as const) : ("inherit" as const) },
    us: { mode: profile ? ("local" as const) : ("inherit" as const) }
  };
  return {
    voices: stored.map((item) =>
      side && !belongsToSide(item)
        ? { ...item }
        : {
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
              (voices.find((v) => v.id === item.voice_id)
                ?.locale as `en-${string}`)
          }
    ),
    dubbing: {
      ...dubbing,
      ...(side
        ? { [side]: { ...dubbing[side], mode: "local" as const } }
        : {
            uk: { ...dubbing.uk, mode: "local" as const },
            us: { ...dubbing.us, mode: "local" as const }
          })
    }
  };
}

export function switchPoolRecommendation(
  profile: VoiceProfile,
  items: readonly VoiceRecommendation[],
  voices: readonly VoiceOption[],
  side: "uk" | "us"
): { profile: VoiceProfile; duplicates: string[] } {
  if (!profile.dubbing) throw new Error("缺少配音板块");
  const source = items.find((item) => speechAccentGroup(item.locale) === side);
  const previous = profile.dubbing[side].recommendation?.contribution_id;
  const settings = profile.voices.map((item) =>
    previous === voiceSettingKey(item) ? { ...item, enabled: false } : item
  );
  const duplicates: string[] = [];
  let contribution_id: string | undefined;
  let voice_id = source?.setting.voice_id;
  if (source) {
    const key = providerVoiceKey(source.setting.voice_id, voices);
    const index = settings.findIndex(
      (setting) => providerVoiceKey(setting.voice_id, voices) === key
    );
    if (index >= 0) {
      const cached = settings[index]!;
      if (voiceSettingAccent(cached, voices) !== side)
        throw new Error("此音色已有另一侧的局部配置，请先处理归属冲突。");
      voice_id = cached.voice_id;
      if (cached.enabled) duplicates.push(source.setting.voice_id);
      else contribution_id = voiceSettingKey(cached);
      settings[index] = { ...cached, enabled: true };
    } else {
      contribution_id = newVoiceVersionId();
      settings.push({
        ...source.setting,
        version_id: contribution_id,
        version_name: source.name,
        enabled: true,
        locale: (voices.find((voice) => voice.id === source.setting.voice_id)
          ?.locale ?? source.locale) as `en-${string}`,
        ...(speechAccentGroup(
          voices.find((voice) => voice.id === source.setting.voice_id)?.locale
        ) !== side
          ? { accent: side === "uk" ? ("gb" as const) : ("us" as const) }
          : {})
      });
    }
  }
  return {
    profile: {
      voices: settings,
      dubbing: {
        ...profile.dubbing,
        [side]: {
          mode: "local",
          ...(source?.groupId
            ? {
                recommendation: {
                  group_id: source.groupId,
                  recommendation_id: source.id,
                  voice_id: voice_id!,
                  ...(contribution_id ? { contribution_id } : {})
                }
              }
            : {})
        }
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
        ...(speechAccentGroup(voice.locale) !==
          speechAccentGroup(voice.locale, voice.accent) && voice.accent
          ? { accent: voice.accent }
          : {}),
        enabled: true,
        rate_percent: 0,
        ...voice.defaultSettings
      };
  const side = speechAccentGroup(voice.locale, voice.accent);
  return {
    ...profile,
    ...(profile.dubbing && (side === "uk" || side === "us")
      ? {
          dubbing: {
            ...profile.dubbing,
            [side]: { ...profile.dubbing[side], mode: "local" as const }
          }
        }
      : {}),
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
    return voiceSettingAccent(item, voices);
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

/** Same harmonic_v1 rule as formal playback, after per-accent eligibility filtering. */
export function voicePoolProbabilities(
  settings: readonly VoiceSetting[],
  voices: readonly VoiceOption[],
  content: VoicePreviewRequest["content"],
  locale?: `en-${string}`,
  phonemeLocale?: `en-${string}`
): Map<string, number> {
  const probabilities = new Map<string, number>();
  for (const accent of ["en-GB", "en-US"] as const) {
    if (locale && locale !== accent) continue;
    const eligible = settings.filter(
      (setting) =>
        setting.enabled &&
        voiceSettingAccent(setting, voices) === speechAccentGroup(accent) &&
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
          content,
          phonemeLocale
        )
    );
    const weights = harmonicProbabilities(eligible.length);
    eligible.forEach((item, rank) =>
      probabilities.set(voiceSettingKey(item), weights[rank]!)
    );
  }
  return probabilities;
}
