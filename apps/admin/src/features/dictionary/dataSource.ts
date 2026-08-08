import { api, useAuthStore } from "@/lib/auth";
import { env } from "@/lib/env";

type AdminWordsApi = typeof api.words;

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

/**
 * 方言建议端点仍在 OpenAPI PENDING 台账中。当前只允许完整 mock 数据源演示；
 * 生产/真实数据源必须明确禁用建议按钮，管理员仍可手工补齐目标方言。
 */
export const adminWordsDataSourceCapabilities = Object.freeze({
  dialectVariantSuggestions: !import.meta.env.PROD && env.ADMIN_WORDS_MOCK
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
  clearSession?: () => void;
};

let selectedMock: ClearableAdminWordsDataSource | undefined;
let selectedMockPromise: Promise<ClearableAdminWordsDataSource> | undefined;

async function resolveAdminWordsDataSource(): Promise<AdminWordsDataSource> {
  // 显式 PROD 分支让 Rollup 能完全剔除动态 mock chunk；构建配置仍会在 mock=true 时先失败。
  if (import.meta.env.PROD || !env.ADMIN_WORDS_MOCK) {
    return realAdminWordsDataSource;
  }
  selectedMockPromise ??= import("./mock/adminWordsMock").then(
    ({ createAdminWordsMock }) => {
      selectedMock = createAdminWordsMock({
        getAdminProfile: () => useAuthStore.getState().profile ?? undefined
      });
      return selectedMock;
    }
  );
  return selectedMockPromise;
}

// 登出时同步清掉当前管理员的 sessionStorage mock 草稿，避免整页跳转前来不及清理。
if (!import.meta.env.PROD) {
  useAuthStore.subscribe((state, previous) => {
    if (previous.profile !== null && state.profile === null) {
      selectedMock?.clearSession?.();
      selectedMock = undefined;
      selectedMockPromise = undefined;
    }
  });
}

/**
 * dictionary 全域唯一数据源 facade。mock 开启时所有 V1/V2 方法延迟加载并复用同一实例，
 * 避免“创建成功但列表仍请求真实后端”的混合状态；生产包不携带 fixture/mock chunk。
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
