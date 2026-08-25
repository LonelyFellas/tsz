import { api, useAuthStore } from "@/lib/auth";
import { env } from "@/lib/env";
import type {
  AdminWordListQuery,
  AdminWordListResponse,
  AdminWordListResponseAny
} from "@tsz/types";
import type {
  ClaimPendingSentenceAssociationInput,
  ClaimPendingSentenceAssociationResponse,
  PendingSentenceAssociationPageV1,
  ResolveSentenceAssociationInput,
  ResolveSentenceAssociationResponse
} from "./word-creation/meaningsAndExamples/sentenceAssociationTypes";

type AdminWordsApi = typeof api.words;
type AdminPartOfSpeechSettingsApi = typeof api.partOfSpeechSettings;

type RealAdminWordsDataSource = Pick<
  AdminWordsApi,
  | "list"
  | "stats"
  | "detect"
  | "surfaceMatchSnapshotPage"
  | "suggestDialectVariants"
  | "createV2"
  | "get"
  | "previewFormsImpact"
  | "saveFormsStep"
  | "saveMeaningsStep"
  | "createContentCompletionJob"
  | "getContentCompletionJob"
  | "retryContentCompletionJob"
  | "validateV2"
  | "publishV2"
  | "archive"
  | "restore"
  | "archiveBatch"
  | "restoreBatch"
  | "deleteDraft"
  | "relatedSearch"
>;

export type AdminWordsDataSource = Omit<RealAdminWordsDataSource, "list"> & {
  list: (query?: AdminWordListQuery) => Promise<AdminWordListResponse>;
};

type RealAdminWordsAnyDataSource = Pick<
  AdminWordsApi,
  | "listAny"
  | "getAny"
  | "surfaceMatchSnapshotPageAny"
  | "archiveAny"
  | "restoreAny"
  | "archiveBatchAny"
  | "restoreBatchAny"
>;

export type AdminWordsAnyDataSource = Omit<
  RealAdminWordsAnyDataSource,
  "listAny"
> & {
  listAny: (query?: AdminWordListQuery) => Promise<AdminWordListResponseAny>;
};

export interface SentenceAssociationsDataSource {
  readonly available: boolean;
  resolve: (
    input: ResolveSentenceAssociationInput
  ) => Promise<ResolveSentenceAssociationResponse>;
  listPending: (
    targetWordId: string,
    query?: { page_size?: number; cursor?: string }
  ) => Promise<PendingSentenceAssociationPageV1>;
  claim: (
    associationId: string,
    idempotencyKey: string,
    input: ClaimPendingSentenceAssociationInput
  ) => Promise<ClaimPendingSentenceAssociationResponse>;
}

export const realAdminWordsDataSource: AdminWordsDataSource = api.words;
export const realAdminWordsAnyDataSource: AdminWordsAnyDataSource = api.words;

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
 * V2 短语、生命周期与方言建议已由真实 OpenAPI 支撑。
 */
const adminWordsMockEnabled =
  (!import.meta.env.PROD || import.meta.env.MODE === "test") &&
  env.ADMIN_WORDS_MOCK;
const adminPartOfSpeechMockEnabled =
  (!import.meta.env.PROD || import.meta.env.MODE === "test") &&
  env.ADMIN_PART_OF_SPEECH_MOCK;

export const adminWordsDataSourceCapabilities = Object.freeze({
  dialectVariantSuggestions: true,
  phraseCreation: true,
  archive: true,
  batchArchive: true
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
  sentenceAssociations: Omit<SentenceAssociationsDataSource, "available">;
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
          : "external",
        // Mirror the expand-phase policy: Forms warnings are active while
        // exact-headword Create remains temporarily gated.
        surfaceWarnings: "temporarily_disabled"
      });
      return selectedMock;
    }
  );
  return selectedMockPromise;
}

async function resolveAdminWordsDataSource(): Promise<AdminWordsDataSource> {
  // production mode 下开关可被 Rollup 静态折叠，mock chunk 不进入正式产物；
  // test mode 允许独立 mock 能力入包，words 仍严格按自己的开关选择数据源。
  return adminWordsMockEnabled
    ? resolveAdminWordsMockRuntime()
    : realAdminWordsDataSource;
}

async function resolveAdminWordsAnyDataSource(): Promise<AdminWordsAnyDataSource> {
  if (!adminWordsMockEnabled) return realAdminWordsAnyDataSource;
  const source = await resolveAdminWordsDataSource();
  return {
    listAny: (query = {}) => source.list(query),
    getAny: (wordId) => source.get(wordId),
    surfaceMatchSnapshotPageAny: (snapshotId, cursor, signal) =>
      source.surfaceMatchSnapshotPage(snapshotId, cursor, signal),
    archiveAny: (wordId, idempotencyKey, input) =>
      source.archive(wordId, idempotencyKey, input),
    restoreAny: (wordId, idempotencyKey, input) =>
      source.restore(wordId, idempotencyKey, input),
    archiveBatchAny: (idempotencyKey, input) =>
      source.archiveBatch(idempotencyKey, input),
    restoreBatchAny: (idempotencyKey, input) =>
      source.restoreBatch(idempotencyKey, input)
  };
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
 * words 数据源 facade。启用 mock 时所有 V2 方法延迟加载并复用同一实例；
 * 生产包不携带 fixture/mock chunk。
 */
export const adminWordsDataSource: AdminWordsDataSource = {
  list: async (query = {}) => (await resolveAdminWordsDataSource()).list(query),
  stats: async () => (await resolveAdminWordsDataSource()).stats(),
  detect: async (input) => (await resolveAdminWordsDataSource()).detect(input),
  surfaceMatchSnapshotPage: async (snapshotId, cursor, signal) =>
    (await resolveAdminWordsDataSource()).surfaceMatchSnapshotPage(
      snapshotId,
      cursor,
      signal
    ),
  suggestDialectVariants: async (input) =>
    (await resolveAdminWordsDataSource()).suggestDialectVariants(input),
  createV2: async (idempotencyKey, input) =>
    (await resolveAdminWordsDataSource()).createV2(idempotencyKey, input),
  get: async (wordId) => (await resolveAdminWordsDataSource()).get(wordId),
  previewFormsImpact: async (wordId, input) =>
    (await resolveAdminWordsDataSource()).previewFormsImpact(wordId, input),
  saveFormsStep: async (wordId, input) =>
    (await resolveAdminWordsDataSource()).saveFormsStep(wordId, input),
  saveMeaningsStep: async (wordId, input) =>
    (await resolveAdminWordsDataSource()).saveMeaningsStep(wordId, input),
  createContentCompletionJob: async (wordId, idempotencyKey, input) =>
    (await resolveAdminWordsDataSource()).createContentCompletionJob(
      wordId,
      idempotencyKey,
      input
    ),
  getContentCompletionJob: async (wordId, jobId) =>
    (await resolveAdminWordsDataSource()).getContentCompletionJob(
      wordId,
      jobId
    ),
  retryContentCompletionJob: async (wordId, jobId, idempotencyKey, input) =>
    (await resolveAdminWordsDataSource()).retryContentCompletionJob(
      wordId,
      jobId,
      idempotencyKey,
      input
    ),
  validateV2: async (wordId, input) =>
    (await resolveAdminWordsDataSource()).validateV2(wordId, input),
  publishV2: async (wordId, idempotencyKey, input) =>
    (await resolveAdminWordsDataSource()).publishV2(
      wordId,
      idempotencyKey,
      input
    ),
  archive: async (wordId, idempotencyKey, input) =>
    (await resolveAdminWordsDataSource()).archive(
      wordId,
      idempotencyKey,
      input
    ),
  restore: async (wordId, idempotencyKey, input) =>
    (await resolveAdminWordsDataSource()).restore(
      wordId,
      idempotencyKey,
      input
    ),
  archiveBatch: async (idempotencyKey, input) =>
    (await resolveAdminWordsDataSource()).archiveBatch(idempotencyKey, input),
  restoreBatch: async (idempotencyKey, input) =>
    (await resolveAdminWordsDataSource()).restoreBatch(idempotencyKey, input),
  deleteDraft: async (wordId, input) =>
    (await resolveAdminWordsDataSource()).deleteDraft(wordId, input),
  relatedSearch: async (q, opts) =>
    (await resolveAdminWordsDataSource()).relatedSearch(q, opts)
};

/**
 * 混合 V2/V3 facade。真实环境使用 schema-aware decoder；现有 mock 仅显式适配
 * V2 方法，不伪造 V3 fixture 或 V3 后端能力。
 */
export const adminWordsAnyDataSource: AdminWordsAnyDataSource = {
  listAny: async (query = {}) =>
    (await resolveAdminWordsAnyDataSource()).listAny(query),
  getAny: async (wordId) =>
    (await resolveAdminWordsAnyDataSource()).getAny(wordId),
  surfaceMatchSnapshotPageAny: async (snapshotId, cursor, signal) =>
    (await resolveAdminWordsAnyDataSource()).surfaceMatchSnapshotPageAny(
      snapshotId,
      cursor,
      signal
    ),
  archiveAny: async (wordId, idempotencyKey, input) =>
    (await resolveAdminWordsAnyDataSource()).archiveAny(
      wordId,
      idempotencyKey,
      input
    ),
  restoreAny: async (wordId, idempotencyKey, input) =>
    (await resolveAdminWordsAnyDataSource()).restoreAny(
      wordId,
      idempotencyKey,
      input
    ),
  archiveBatchAny: async (idempotencyKey, input) =>
    (await resolveAdminWordsAnyDataSource()).archiveBatchAny(
      idempotencyKey,
      input
    ),
  restoreBatchAny: async (idempotencyKey, input) =>
    (await resolveAdminWordsAnyDataSource()).restoreBatchAny(
      idempotencyKey,
      input
    )
};

async function requireSentenceAssociationMock(): Promise<
  ClearableAdminWordsDataSource["sentenceAssociations"]
> {
  if (!adminWordsMockEnabled) {
    throw new Error("多维例句关联等待 tsz-rust 正式 OpenAPI 契约");
  }
  return (await resolveAdminWordsMockRuntime()).sentenceAssociations;
}

/**
 * 契约就绪边界：当前仅开发/mock 数据源可用。真实数据源不会拼接或调用尚不存在
 * 的 URL，也不会把 shared_sentences 提前发送给 meanings 端点。
 */
export const sentenceAssociationsDataSource: SentenceAssociationsDataSource = {
  available: adminWordsMockEnabled,
  resolve: async (input) =>
    (await requireSentenceAssociationMock()).resolve(input),
  listPending: async (targetWordId, query) =>
    (await requireSentenceAssociationMock()).listPending(targetWordId, query),
  claim: async (associationId, idempotencyKey, input) =>
    (await requireSentenceAssociationMock()).claim(
      associationId,
      idempotencyKey,
      input
    )
};

/**
 * 词性配置独立选择真实或 mock。两者都启用 mock 时仍共用同一 runtime；
 * tshb-test 已将 words 和词性都切到真实数据源。
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
