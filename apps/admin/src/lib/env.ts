// 浏览器可见的 API 基址。默认走同源 /api/v1（dev 由 vite.config 的 proxy 代理、
// prod 由 nginx 在子域层代理到后端），保证 refresh 的 HttpOnly cookie 与请求同源。
// Vite 仅暴露以 VITE_ 前缀的前端变量（import.meta.env.VITE_*）。
import { assertAdminWordsMockAllowed, parseBooleanEnvFlag } from "./env-flags";

const WORD_CREATION_WIZARD = parseBooleanEnvFlag(
  import.meta.env.VITE_WORD_CREATION_WIZARD,
  "VITE_WORD_CREATION_WIZARD",
  !import.meta.env.PROD
);
const ADMIN_WORDS_MOCK = parseBooleanEnvFlag(
  import.meta.env.VITE_ADMIN_WORDS_MOCK,
  "VITE_ADMIN_WORDS_MOCK",
  !import.meta.env.PROD
);

assertAdminWordsMockAllowed(ADMIN_WORDS_MOCK, import.meta.env.PROD);

export const env = {
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL ?? "/api/v1",
  WORD_CREATION_WIZARD,
  ADMIN_WORDS_MOCK
};
