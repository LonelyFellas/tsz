import type { VoicePreviewAdapter } from "@tsz/voice-editor/types";
import { api } from "@/lib/auth";
import { env } from "@/lib/env";
import { createAdminVoicePreviewAdapter } from "./adapter";

const realAdapter = createAdminVoicePreviewAdapter(api.speech);
let mockAdapterPromise: Promise<VoicePreviewAdapter> | undefined;

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
