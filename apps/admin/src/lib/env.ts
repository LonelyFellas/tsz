// 浏览器可见的 API 基址。默认走同源 /api/v1（dev 由 vite.config 的 proxy 代理、
// prod 由 nginx 在子域层代理到后端），保证 refresh 的 HttpOnly cookie 与请求同源。
// Vite 仅暴露以 VITE_ 前缀的前端变量（import.meta.env.VITE_*）。
import {
  assertAdminPartOfSpeechMockAllowed,
  assertAdminTtsMockAllowed,
  assertAdminWordsMockAllowed,
  parseBooleanEnvFlag
} from "./env-flags";

const ADMIN_WORDS_MOCK = parseBooleanEnvFlag(
  import.meta.env.VITE_ADMIN_WORDS_MOCK,
  "VITE_ADMIN_WORDS_MOCK",
  false
);
const ADMIN_PART_OF_SPEECH_MOCK = parseBooleanEnvFlag(
  import.meta.env.VITE_ADMIN_PART_OF_SPEECH_MOCK,
  "VITE_ADMIN_PART_OF_SPEECH_MOCK",
  false
);
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
const ADMIN_TTS_MOCK = parseBooleanEnvFlag(
  import.meta.env.VITE_ADMIN_TTS_MOCK,
  "VITE_ADMIN_TTS_MOCK",
  !import.meta.env.PROD
);
const RELATED_SEARCH_V2 = parseBooleanEnvFlag(
  import.meta.env.VITE_RELATED_SEARCH_V2,
  "VITE_RELATED_SEARCH_V2",
  false
);
const WORD_CONTENT_COMPLETION = parseBooleanEnvFlag(
  import.meta.env.VITE_WORD_CONTENT_COMPLETION,
  "VITE_WORD_CONTENT_COMPLETION",
  false
);

assertAdminWordsMockAllowed(
  ADMIN_WORDS_MOCK,
  import.meta.env.PROD,
  import.meta.env.MODE
);
assertAdminPartOfSpeechMockAllowed(
  ADMIN_PART_OF_SPEECH_MOCK,
  import.meta.env.PROD,
  import.meta.env.MODE
);
assertAdminTtsMockAllowed(
  ADMIN_TTS_MOCK,
  import.meta.env.PROD,
  import.meta.env.MODE
);

export const env = {
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL ?? "/api/v1",
  ADMIN_WORDS_MOCK,
  ADMIN_PART_OF_SPEECH_MOCK,
  VOICE_EDITOR,
  VOICE_PREVIEW,
  ADMIN_TTS_MOCK,
  RELATED_SEARCH_V2,
  WORD_CONTENT_COMPLETION
};
