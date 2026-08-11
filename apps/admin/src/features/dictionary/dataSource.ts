import { api, useAuthStore } from "@/lib/auth";
import { env } from "@/lib/env";

type AdminWordsApi = typeof api.words;
type AdminPartOfSpeechSettingsApi = typeof api.partOfSpeechSettings;

export type AdminWordsDataSource = Pick<
  AdminWordsApi,
  | "list"
  | "stats"
  | "detect"
  | "suggestDialectVariants"
  | "create"
  | "createV2"
  | "get"
  | "saveContent"
  | "previewFormsImpact"
  | "saveFormsStep"
  | "saveMeaningsStep"
  | "validateV2"
  | "publish"
  | "publishV2"
  | "remove"
  | "batchDelete"
  | "relatedSearch"
>;

export const realAdminWordsDataSource: AdminWordsDataSource = api.words;

export type AdminPartOfSpeechDataSource = Pick<
  AdminPartOfSpeechSettingsApi,
  | "catalog"
  | "list"
  | "create"
  | "update"
  | "remove"
  | "listSubParts"
  | "createSubPart"
  | "updateSubPart"
  | "removeSubPart"
>;

export const realAdminPartOfSpeechDataSource: AdminPartOfSpeechDataSource =
  api.partOfSpeechSettings;

/**
 * 方言建议端点仍在 OpenAPI PENDING 台账中。当前只允许完整 mock 数据源演示；
 * 生产/真实数据源必须明确禁用建议按钮，管理员仍可手工补齐目标方言。
 */
const adminWordsMockEnabled =
  (!import.meta.env.PROD || import.meta.env.MODE === "test") &&
  env.ADMIN_WORDS_MOCK;
const adminPartOfSpeechMockEnabled =
  (!import.meta.env.PROD || import.meta.env.MODE === "test") &&
  env.ADMIN_PART_OF_SPEECH_MOCK;

export const adminWordsDataSourceCapabilities = Object.freeze({
  dialectVariantSuggestions: adminWordsMockEnabled
});

/** 依赖注入入口：测试无需修改进程级 Vite env，也能验证真实/mock 二选一。 */
export function selectAdminWordsDataSource(
  mockEnabled: boolean,
  real: AdminWordsDataSource,
  createMock: () => AdminWordsDataSource
): AdminWordsDataSource {
  return mockEnabled ? createMock() : real;
}

type ClearableAdminWordsDataSource = AdminWordsDataSource & {
  partOfSpeechSettings: AdminPartOfSpeechDataSource;
  clearSession?: () => void;
};

let selectedMock: ClearableAdminWordsDataSource | undefined;
let selectedMockPromise: Promise<ClearableAdminWordsDataSource> | undefined;

async function resolveAdminWordsMockRuntime(): Promise<ClearableAdminWordsDataSource> {
  selectedMockPromise ??= import("./mock/adminWordsMock").then(
    ({ createAdminWordsMock }) => {
      selectedMock = createAdminWordsMock({
        getAdminProfile: () => useAuthStore.getState().profile ?? undefined,
        partOfSpeechValidation: adminPartOfSpeechMockEnabled
          ? "internal"
          : "external"
      });
      return selectedMock;
    }
  );
  return selectedMockPromise;
}

async function resolveAdminWordsDataSource(): Promise<AdminWordsDataSource> {
  // production mode 下开关可被 Rollup 静态折叠，mock chunk 不进入正式产物；
  // tshb-test 使用显式 test mode，仅保留尚未真实对接的 words mock。
  return adminWordsMockEnabled
    ? resolveAdminWordsMockRuntime()
    : realAdminWordsDataSource;
}

async function resolveAdminPartOfSpeechDataSource(): Promise<AdminPartOfSpeechDataSource> {
  if (!adminPartOfSpeechMockEnabled) return realAdminPartOfSpeechDataSource;
  return (await resolveAdminWordsMockRuntime()).partOfSpeechSettings;
}

// 登出时同步清掉当前管理员的 sessionStorage mock 草稿，避免整页跳转前来不及清理。
if (adminWordsMockEnabled || adminPartOfSpeechMockEnabled) {
  useAuthStore.subscribe((state, previous) => {
    if (previous.profile !== null && state.profile === null) {
      selectedMock?.clearSession?.();
      selectedMock = undefined;
      selectedMockPromise = undefined;
    }
  });
}

/**
 * words 数据源 facade。启用 mock 时所有 V1/V2 方法延迟加载并复用同一实例；
 * 生产包不携带 fixture/mock chunk。
 */
export const adminWordsDataSource: AdminWordsDataSource = {
  list: async (query = {}) => (await resolveAdminWordsDataSource()).list(query),
  stats: async () => (await resolveAdminWordsDataSource()).stats(),
  detect: async (input) => (await resolveAdminWordsDataSource()).detect(input),
  suggestDialectVariants: async (input) =>
    (await resolveAdminWordsDataSource()).suggestDialectVariants(input),
  create: async (input) => (await resolveAdminWordsDataSource()).create(input),
  createV2: async (input) =>
    (await resolveAdminWordsDataSource()).createV2(input),
  get: async (wordId) => (await resolveAdminWordsDataSource()).get(wordId),
  saveContent: async (wordId, input) =>
    (await resolveAdminWordsDataSource()).saveContent(wordId, input),
  previewFormsImpact: async (wordId, input) =>
    (await resolveAdminWordsDataSource()).previewFormsImpact(wordId, input),
  saveFormsStep: async (wordId, input) =>
    (await resolveAdminWordsDataSource()).saveFormsStep(wordId, input),
  saveMeaningsStep: async (wordId, input) =>
    (await resolveAdminWordsDataSource()).saveMeaningsStep(wordId, input),
  validateV2: async (wordId, input) =>
    (await resolveAdminWordsDataSource()).validateV2(wordId, input),
  publish: async (wordId) =>
    (await resolveAdminWordsDataSource()).publish(wordId),
  publishV2: async (wordId, input) =>
    (await resolveAdminWordsDataSource()).publishV2(wordId, input),
  remove: async (wordId) =>
    (await resolveAdminWordsDataSource()).remove(wordId),
  batchDelete: async (ids) =>
    (await resolveAdminWordsDataSource()).batchDelete(ids),
  relatedSearch: async (q, opts) =>
    (await resolveAdminWordsDataSource()).relatedSearch(q, opts)
};

/**
 * 词性配置独立选择真实或 mock。两者都启用 mock 时仍共用同一 runtime；
 * tshb-test 则保持 words mock、词性真实，真实 usage_count 不包含浏览器 mock 草稿。
 */
export const partOfSpeechDataSource: AdminPartOfSpeechDataSource = {
  catalog: async () => (await resolveAdminPartOfSpeechDataSource()).catalog(),
  list: async (query = {}) =>
    (await resolveAdminPartOfSpeechDataSource()).list(query),
  create: async (input) =>
    (await resolveAdminPartOfSpeechDataSource()).create(input),
  update: async (id, input) =>
    (await resolveAdminPartOfSpeechDataSource()).update(id, input),
  remove: async (id, query) =>
    (await resolveAdminPartOfSpeechDataSource()).remove(id, query),
  listSubParts: async (id) =>
    (await resolveAdminPartOfSpeechDataSource()).listSubParts(id),
  createSubPart: async (id, input) =>
    (await resolveAdminPartOfSpeechDataSource()).createSubPart(id, input),
  updateSubPart: async (id, subId, input) =>
    (await resolveAdminPartOfSpeechDataSource()).updateSubPart(
      id,
      subId,
      input
    ),
  removeSubPart: async (id, subId, query) =>
    (await resolveAdminPartOfSpeechDataSource()).removeSubPart(id, subId, query)
};
