import type {
  AudioUploadAdapter,
  VoicePreviewAdapter
} from "@tsz/voice-editor/types";
import { api } from "@/lib/auth";
import { env } from "@/lib/env";
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

export const adminVoicePreviewAdapter: VoicePreviewAdapter = {
  async listVoices(input) {
    return (await resolveAdapter()).listVoices(input);
  },
  async synthesize(input, options) {
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
    return (await resolveAudioAdapter()).upload(input);
  },
  async resolveUrl(assetId, options) {
    return (await resolveAudioAdapter()).resolveUrl(assetId, options);
  }
};
