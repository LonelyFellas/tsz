import type { VoicePreviewAdapter } from "@tsz/voice-editor/types";
import { api } from "@/lib/auth";
import { env } from "@/lib/env";
import { createAdminVoicePreviewAdapter } from "./adapter";

const realAdapter = createAdminVoicePreviewAdapter(api.speech);
let mockAdapterPromise: Promise<VoicePreviewAdapter> | undefined;

async function resolveAdapter(): Promise<VoicePreviewAdapter> {
  if (
    (import.meta.env.PROD && import.meta.env.MODE !== "test") ||
    !env.ADMIN_TTS_MOCK
  ) {
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
