import type {
  AudioUploadAdapter,
  VoicePreviewAdapter,
  VoiceRecommendation,
  LoadVoiceRecommendations
} from "@tsz/voice-editor/types";
import { hasAdminPermission, hasAnyAdminPermission } from "@tsz/shared/auth";
import { api, useAuthStore } from "@/lib/auth";
import { env } from "@/lib/env";
import { queryClient } from "@/lib/queryClient";
import { createAdminVoicePreviewAdapter } from "./adapter";
import { createAdminAudioUploadAdapter } from "./audioUploadAdapter";

const realAdapter = createAdminVoicePreviewAdapter(api.speech);
let mockAdapterPromise: Promise<VoicePreviewAdapter> | undefined;
const realAudioAdapter = createAdminAudioUploadAdapter(api.audioAssets);
let mockAudioAdapterPromise: Promise<AudioUploadAdapter> | undefined;

/**
 * 当前试听是否走 mock 适配器（不发请求、返回假音频）。
 * UI 据此给出「模拟」标记，避免把假试听当成真实合成。
 * 与 env 常量同拍：模块加载时求值一次，测试需在 import 之前 stubEnv。
 */
export const voicePreviewIsMock =
  !(import.meta.env.PROD && import.meta.env.MODE !== "test") &&
  env.ADMIN_TTS_MOCK;

async function resolveAdapter(): Promise<VoicePreviewAdapter> {
  if (!voicePreviewIsMock) {
    return realAdapter;
  }
  mockAdapterPromise ??= import("./mock").then(
    ({ createMockVoicePreviewAdapter }) => createMockVoicePreviewAdapter()
  );
  return mockAdapterPromise;
}

export const loadAdminVoiceRecommendations: LoadVoiceRecommendations = async ({
  area,
  locale,
  signal,
  refresh
}) => {
  if (voicePreviewIsMock) return [];
  signal?.throwIfAborted();
  const actor = useAuthStore.getState().profile?.id;
  const response = await queryClient.fetchQuery({
    queryKey: ["admin-dubbing-groups", actor],
    queryFn: ({ signal }) => api.speech.groups(signal),
    staleTime: refresh ? 0 : 60_000
  });
  signal?.throwIfAborted();
  if (useAuthStore.getState().profile?.id !== actor) return [];
  const applicable = [
    ...response.groups.filter(
      (item) => !item.is_global && item.areas.includes(area)
    ),
    ...response.groups.filter((item) => item.is_global)
  ];
  return (["en-GB", "en-US"] as const)
    .filter((value) => !locale || locale === value)
    .flatMap((value) =>
      applicable.flatMap((source) => {
        const key = value === "en-GB" ? "uk" : "us";
        const items = source[key].filter((item) => item.selected !== false);
        return items.map((item): VoiceRecommendation => ({
          id: item.id,
          name: item.name,
          locale: value,
          groupName: source.name,
          setting: {
            voice_id: item.voice_alias,
            enabled: true,
            rate_percent: item.parameters.rate_percent,
            pitch_semitones: item.parameters.pitch_semitones,
            ...(item.parameters.volume_percent !== undefined
              ? { volume_percent: item.parameters.volume_percent }
              : {}),
            ...(item.parameters.style ? { style: item.parameters.style } : {}),
            ...(item.parameters.style_degree != null
              ? { style_degree: item.parameters.style_degree }
              : {}),
            ...(item.parameters.role != null
              ? { role: item.parameters.role }
              : {})
          }
        }));
      })
    );
};

export const adminVoicePreviewAdapter: VoicePreviewAdapter = {
  async renderSsml(input, options) {
    return (
      await api.speech.renderSsml(
        {
          source: { kind: "text", content: input.content },
          setting: input.setting
        },
        options?.signal
      )
    ).ssml;
  },
  async synthesizeSsml(input, options) {
    const result = await api.speech.manualPreview(
      {
        ssml: input.ssml,
        voice_alias: input.voiceId,
        output_format: input.outputFormat
      },
      options?.signal
    );
    return {
      audioUrl: result.audio_url,
      expiresAt: result.expires_at,
      cached: result.cache_status === "hit",
      ...(result.content_path
        ? {
            loadAudio: (options?: { signal?: AbortSignal }) =>
              api.speech.previewContent(result.content_path!, options?.signal)
          }
        : {})
    };
  },
  async resolveVoices(input, options) {
    if (voicePreviewIsMock) throw new Error("模拟试听不支持服务端推荐解析");
    const result = await api.speech.resolve(
      {
        profile: input.profile,
        source: { kind: "text", content: input.content },
        accent: input.accent
      },
      options?.signal
    );
    return result.voices;
  },
  async generateAudio(input, options) {
    if (voicePreviewIsMock) throw new Error("模拟试听不支持生成正式音频");
    const response = await api.speech.generateAudio(
      {
        request_id: input.requestId,
        source: { kind: "text", content: input.content },
        setting: input.setting,
        ...(input.profile ? { profile: input.profile } : {})
      },
      options?.signal
    );
    return response.asset;
  },
  async resolveAudio(assetId, options) {
    const result = await api.audioAssets.url(assetId, options?.signal);
    return {
      audioUrl: result.url,
      expiresAt: result.expires_at,
      cached: true,
      loadAudio: (options?: { signal?: AbortSignal }) =>
        api.audioAssets.content(assetId, options?.signal)
    };
  },
  async listVoices(input) {
    return (await resolveAdapter()).listVoices(input);
  },
  async synthesize(input, options) {
    if (!hasAdminPermission(useAuthStore.getState().profile, "speech.generate"))
      throw new Error("没有生成语音的权限");
    return (await resolveAdapter()).synthesize(input, options);
  }
};

/* 上传音频与试听共用同一个 mock 开关：后端两者都没配时一起走假的。 */
async function resolveAudioAdapter(): Promise<AudioUploadAdapter> {
  if (!voicePreviewIsMock) return realAudioAdapter;
  mockAudioAdapterPromise ??= import("./mock").then(
    ({ createMockAudioUploadAdapter }) => createMockAudioUploadAdapter()
  );
  return mockAudioAdapterPromise;
}

export const adminAudioUploadAdapter: AudioUploadAdapter = {
  loadAudio: (assetId, options) =>
    api.audioAssets.content(assetId, options?.signal),
  async upload(input) {
    if (
      !hasAdminPermission(
        useAuthStore.getState().profile,
        "speech.upload_audio"
      ) ||
      !hasAnyAdminPermission(useAuthStore.getState().profile, [
        "words.create",
        "words.edit",
        "sentences.create",
        "sentences.edit"
      ])
    )
      throw new Error("没有上传音频的权限");
    return (await resolveAudioAdapter()).upload(input);
  },
  async resolveUrl(assetId, options) {
    return (await resolveAudioAdapter()).resolveUrl(assetId, options);
  }
};
