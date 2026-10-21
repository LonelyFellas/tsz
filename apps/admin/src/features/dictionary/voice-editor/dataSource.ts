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
import { HttpError } from "@tsz/api-client";
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
  signal
}) => {
  if (voicePreviewIsMock) return [];
  signal?.throwIfAborted();
  const actor = useAuthStore.getState().profile?.id;
  const response = await queryClient.fetchQuery({
    queryKey: ["admin-dubbing-groups", actor],
    queryFn: ({ signal }) => api.speech.groups(signal),
    staleTime: 60_000
  });
  signal?.throwIfAborted();
  if (useAuthStore.getState().profile?.id !== actor) return [];
  const group = response.groups.find((item) => item.areas.includes(area));
  if (!group) return [];
  return (["en-GB", "en-US"] as const)
    .filter((value) => !locale || locale === value)
    .flatMap((value) =>
      group[value === "en-GB" ? "uk" : "us"].map(
        (item): VoiceRecommendation => ({
          id: item.id,
          name: item.name,
          locale: value,
          groupName: group.name,
          setting: {
            voice_id: item.voice_alias,
            enabled: true,
            rate_percent: item.parameters.rate_percent,
            pitch_semitones: item.parameters.pitch_semitones,
            ...(item.parameters.style ? { style: item.parameters.style } : {})
          }
        })
      )
    );
};

export const adminVoicePreviewAdapter: VoicePreviewAdapter = {
  async listVoices(input) {
    const voices = await (await resolveAdapter()).listVoices(input);
    if (voicePreviewIsMock) return voices;
    const actor = useAuthStore.getState().profile?.id;
    const personal = await queryClient
      .fetchQuery({
        queryKey: ["admin-speech-library", actor],
        queryFn: ({ signal }) => api.speech.library(signal),
        staleTime: 60_000
      })
      .catch((error) => {
        if (error instanceof HttpError && error.status === 404) return null;
        throw error;
      });
    input.signal?.throwIfAborted();
    if (useAuthStore.getState().profile?.id !== actor) return [];
    return voices.map((voice) => {
      const saved = personal?.items.find(
        (item) => item.voice_alias === voice.id
      )?.parameters;
      return saved
        ? {
            ...voice,
            defaultSettings: {
              rate_percent: saved.rate_percent,
              pitch_semitones: saved.pitch_semitones,
              ...(saved.style ? { style: saved.style } : {})
            }
          }
        : voice;
    });
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
