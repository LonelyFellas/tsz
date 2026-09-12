// 浏览器可见的 API 基址。默认走同源 /api/v1（dev 由 vite.config 的 proxy 代理、
// prod 由 nginx 在子域层代理到后端），保证 refresh 的 HttpOnly cookie 与请求同源。
// Vite 仅暴露以 VITE_ 前缀的前端变量（import.meta.env.VITE_*）。
import { assertAdminTtsMockAllowed, parseBooleanEnvFlag } from "./env-flags";

const VOICE_EDITOR = parseBooleanEnvFlag(
  import.meta.env.VITE_VOICE_EDITOR,
  "VITE_VOICE_EDITOR",
  !import.meta.env.PROD
);
const VOICE_PREVIEW = parseBooleanEnvFlag(
  import.meta.env.VITE_VOICE_PREVIEW,
  "VITE_VOICE_PREVIEW",
  !import.meta.env.PROD
);
// 试听默认走真实 TTS：mock 只在显式设置 VITE_ADMIN_TTS_MOCK=true 时启用，
// 否则本地对接真实后端时会误判语音链路已接通。
const ADMIN_TTS_MOCK = parseBooleanEnvFlag(
  import.meta.env.VITE_ADMIN_TTS_MOCK,
  "VITE_ADMIN_TTS_MOCK",
  false
);
const RELATED_SEARCH_V2 = parseBooleanEnvFlag(
  import.meta.env.VITE_RELATED_SEARCH_V2,
  "VITE_RELATED_SEARCH_V2",
  false
);
// 上传音频持久化（docs/features/voice-editor-audio-upload）。后端契约（audio-assets
// 端点与 audio_assets 字段）落地前默认关闭：开着的话保存草稿会把后端还不认识的字段送过去。
const VOICE_AUDIO_UPLOAD = parseBooleanEnvFlag(
  import.meta.env.VITE_VOICE_AUDIO_UPLOAD,
  "VITE_VOICE_AUDIO_UPLOAD",
  false
);
const WORD_CONTENT_COMPLETION = parseBooleanEnvFlag(
  import.meta.env.VITE_WORD_CONTENT_COMPLETION,
  "VITE_WORD_CONTENT_COMPLETION",
  false
);

assertAdminTtsMockAllowed(
  ADMIN_TTS_MOCK,
  import.meta.env.PROD,
  import.meta.env.MODE
);

export const env = {
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL ?? "/api/v1",
  VOICE_EDITOR,
  VOICE_PREVIEW,
  ADMIN_TTS_MOCK,
  RELATED_SEARCH_V2,
  VOICE_AUDIO_UPLOAD,
  WORD_CONTENT_COMPLETION
};
