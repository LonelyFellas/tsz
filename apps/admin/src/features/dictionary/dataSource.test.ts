import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdminPartOfSpeechDataSource,
  AdminWordsDataSource
} from "./dataSource";

const METHOD_NAMES = [
  "list",
  "stats",
  "detect",
  "suggestDialectVariants",
  "create",
  "createV2",
  "get",
  "saveContent",
  "previewFormsImpact",
  "saveFormsStep",
  "saveMeaningsStep",
  "validateV2",
  "publish",
  "publishV2",
  "remove",
  "batchDelete",
  "relatedSearch"
] as const satisfies ReadonlyArray<keyof AdminWordsDataSource>;

const INVOCATIONS = [
  { method: "list", args: [{ q: "center", page: 2, page_size: 10 }] },
  { method: "stats", args: [] },
  { method: "detect", args: [{ language: "en", headword: "center" }] },
  {
    method: "suggestDialectVariants",
    args: [
      {
        source_dialect: "us",
        target_dialect: "uk",
        items: []
      }
    ]
  },
  { method: "create", args: [{ kind: "word", headword: "legacy" }] },
  {
    method: "createV2",
    args: [
      {
        schema_version: 2,
        idempotency_key: "create-key",
        detection_id: "det-1",
        headwords: { mode: "unified", common: "far" }
      }
    ]
  },
  { method: "get", args: ["word-1"] },
  {
    method: "saveContent",
    args: [
      "word-1",
      {
        base_updated_at: "2026-08-02T00:00:00.000Z",
        frequency: "12.5",
        dialect_mode: "unified",
        dialects: [],
        sense_groups: [],
        pos: []
      }
    ]
  },
  {
    method: "previewFormsImpact",
    args: ["word-1", { base_revision: 1, content: { pos: [] } }]
  },
  {
    method: "saveFormsStep",
    args: [
      "word-1",
      {
        base_revision: 1,
        operation_id: "forms-op",
        intent: "save",
        content: { pos: [] }
      }
    ]
  },
  {
    method: "saveMeaningsStep",
    args: [
      "word-1",
      {
        base_revision: 2,
        operation_id: "meanings-op",
        intent: "save",
        content: { sense_groups: [], pos: [] }
      }
    ]
  },
  { method: "validateV2", args: ["word-1", { base_revision: 2 }] },
  { method: "publish", args: ["word-1"] },
  {
    method: "publishV2",
    args: ["word-1", { base_revision: 2, idempotency_key: "publish-key" }]
  },
  { method: "remove", args: ["word-1"] },
  { method: "batchDelete", args: [["word-1", "word-2"]] },
  {
    method: "relatedSearch",
    args: ["center", { kind: "word", limit: 5 }]
  }
] as const satisfies ReadonlyArray<{
  method: keyof AdminWordsDataSource;
  args: readonly unknown[];
}>;

const PART_OF_SPEECH_METHOD_NAMES = [
  "catalog",
  "list",
  "create",
  "update",
  "remove",
  "listSubParts",
  "createSubPart",
  "updateSubPart",
  "removeSubPart"
] as const satisfies ReadonlyArray<keyof AdminPartOfSpeechDataSource>;

const PART_OF_SPEECH_INVOCATIONS = [
  { method: "catalog", args: [] },
  { method: "list", args: [{ q: "名词", page: 2, page_size: 10 }] },
  {
    method: "create",
    args: [{ code: "aux", name_zh: "助动词", name_en: "Auxiliary" }]
  },
  {
    method: "update",
    args: [
      "pos-1",
      {
        base_revision: 1,
        code: "noun",
        name_zh: "名词",
        name_en: "Noun"
      }
    ]
  },
  { method: "remove", args: ["pos-1"] },
  { method: "listSubParts", args: ["pos-1"] },
  {
    method: "createSubPart",
    args: [
      "pos-1",
      { code: "n-count", name_zh: "可数名词", name_en: "Countable noun" }
    ]
  },
  {
    method: "updateSubPart",
    args: [
      "pos-1",
      "sub-1",
      {
        base_revision: 1,
        code: "n-count",
        name_zh: "可数名词",
        name_en: "Countable noun"
      }
    ]
  },
  { method: "removeSubPart", args: ["pos-1", "sub-1"] }
] as const satisfies ReadonlyArray<{
  method: keyof AdminPartOfSpeechDataSource;
  args: readonly unknown[];
}>;

interface SourceDouble {
  source: AdminWordsDataSource;
  calls: Record<keyof AdminWordsDataSource, ReturnType<typeof vi.fn>>;
  clearSession?: ReturnType<typeof vi.fn>;
}

interface PartOfSpeechSourceDouble {
  source: AdminPartOfSpeechDataSource;
  calls: Record<keyof AdminPartOfSpeechDataSource, ReturnType<typeof vi.fn>>;
}

function createSourceDouble(
  owner: "real" | "mock",
  clearable = false
): SourceDouble {
  const calls = {} as SourceDouble["calls"];
  const entries = METHOD_NAMES.map((method) => {
    const call = vi.fn((...args: unknown[]) =>
      Promise.resolve({ owner, method, args })
    );
    calls[method] = call;
    return [method, call] as const;
  });
  const source = Object.fromEntries(entries) as unknown as AdminWordsDataSource;
  if (!clearable) return { source, calls };

  const clearSession = vi.fn();
  Object.assign(source, { clearSession });
  return { source, calls, clearSession };
}

function createPartOfSpeechSourceDouble(
  owner: "real" | "mock"
): PartOfSpeechSourceDouble {
  const calls = {} as PartOfSpeechSourceDouble["calls"];
  const entries = PART_OF_SPEECH_METHOD_NAMES.map((method) => {
    const call = vi.fn((...args: unknown[]) =>
      Promise.resolve({ owner, method, args })
    );
    calls[method] = call;
    return [method, call] as const;
  });
  return {
    source: Object.fromEntries(
      entries
    ) as unknown as AdminPartOfSpeechDataSource,
    calls
  };
}

interface AuthState {
  profile: { id: string } | null;
}

type AuthListener = (state: AuthState, previous: AuthState) => void;

interface LoadedModule {
  module: typeof import("./dataSource");
  auth: {
    getState: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
    listener?: AuthListener;
    setProfile: (profile: AuthState["profile"]) => void;
  };
  createMock: ReturnType<typeof vi.fn>;
  mockModuleFactory: ReturnType<typeof vi.fn>;
  getMockFactoryOptions: () =>
    { getAdminProfile: () => AuthState["profile"] | undefined } | undefined;
}

async function loadDataSource({
  mockEnabled,
  real,
  mock,
  realPart = createPartOfSpeechSourceDouble("real").source,
  mockPart = createPartOfSpeechSourceDouble("mock").source,
  initialProfile = { id: "admin-1" },
  production = false,
  mode = production ? "production" : "test"
}: {
  mockEnabled: boolean;
  real: AdminWordsDataSource;
  mock: AdminWordsDataSource;
  realPart?: AdminPartOfSpeechDataSource;
  mockPart?: AdminPartOfSpeechDataSource;
  initialProfile?: AuthState["profile"];
  production?: boolean;
  mode?: string;
}): Promise<LoadedModule> {
  vi.resetModules();
  vi.unstubAllEnvs();
  if (production) vi.stubEnv("PROD", true);
  vi.stubEnv("MODE", mode);

  let profile = initialProfile;
  let listener: AuthListener | undefined;
  let mockFactoryOptions:
    { getAdminProfile: () => AuthState["profile"] | undefined } | undefined;
  const getState = vi.fn(() => ({ profile }));
  const subscribe = vi.fn((next: AuthListener) => {
    listener = next;
    return vi.fn();
  });
  const createMock = vi.fn(
    (options: { getAdminProfile: () => AuthState["profile"] | undefined }) => {
      mockFactoryOptions = options;
      return Object.assign(mock, { partOfSpeechSettings: mockPart });
    }
  );
  const mockModuleFactory = vi.fn(() => ({
    createAdminWordsMock: createMock
  }));

  vi.doMock("@/lib/auth", () => ({
    api: { words: real, partOfSpeechSettings: realPart },
    useAuthStore: { getState, subscribe }
  }));
  vi.doMock("@/lib/env", () => ({ env: { ADMIN_WORDS_MOCK: mockEnabled } }));
  vi.doMock("./mock/adminWordsMock", mockModuleFactory);

  const module = await import("./dataSource");
  return {
    module,
    auth: {
      getState,
      subscribe,
      get listener() {
        return listener;
      },
      setProfile(next) {
        profile = next;
      }
    },
    createMock,
    mockModuleFactory,
    getMockFactoryOptions: () => mockFactoryOptions
  };
}

async function expectFacadeDelegation(
  facade: AdminWordsDataSource,
  source: SourceDouble,
  owner: "real" | "mock"
): Promise<void> {
  for (const { method, args } of INVOCATIONS) {
    const invoke = facade[method] as unknown as (
      ...input: unknown[]
    ) => Promise<unknown>;
    await expect(invoke(...args)).resolves.toEqual({ owner, method, args });
    expect(source.calls[method]).toHaveBeenLastCalledWith(...args);
  }
}

async function expectPartOfSpeechFacadeDelegation(
  facade: AdminPartOfSpeechDataSource,
  source: PartOfSpeechSourceDouble,
  owner: "real" | "mock"
): Promise<void> {
  for (const { method, args } of PART_OF_SPEECH_INVOCATIONS) {
    const invoke = facade[method] as unknown as (
      ...input: unknown[]
    ) => Promise<unknown>;
    await expect(invoke(...args)).resolves.toEqual({ owner, method, args });
    expect(source.calls[method]).toHaveBeenLastCalledWith(...args);
  }
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe("admin words data source selection", () => {
  it("select helper 在 real/mock 分支只构造被选择的数据源", async () => {
    const real = createSourceDouble("real");
    const mock = createSourceDouble("mock");
    const loaded = await loadDataSource({
      mockEnabled: false,
      real: real.source,
      mock: mock.source
    });
    const factory = vi.fn(() => mock.source);

    expect(
      loaded.module.selectAdminWordsDataSource(false, real.source, factory)
    ).toBe(real.source);
    expect(factory).not.toHaveBeenCalled();
    expect(
      loaded.module.selectAdminWordsDataSource(true, real.source, factory)
    ).toBe(mock.source);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("mock 关闭时 facade 全方法透传给 real，且不加载 mock chunk", async () => {
    const real = createSourceDouble("real");
    const mock = createSourceDouble("mock", true);
    const realPart = createPartOfSpeechSourceDouble("real");
    const loaded = await loadDataSource({
      mockEnabled: false,
      real: real.source,
      mock: mock.source,
      realPart: realPart.source
    });

    expect(loaded.module.realAdminWordsDataSource).toBe(real.source);
    expect(
      loaded.module.adminWordsDataSourceCapabilities.dialectVariantSuggestions
    ).toBe(false);
    await expectFacadeDelegation(
      loaded.module.adminWordsDataSource,
      real,
      "real"
    );
    await expectPartOfSpeechFacadeDelegation(
      loaded.module.partOfSpeechDataSource,
      realPart,
      "real"
    );
    await expect(loaded.module.adminWordsDataSource.list()).resolves.toEqual({
      owner: "real",
      method: "list",
      args: [{}]
    });
    expect(real.calls.list).toHaveBeenLastCalledWith({});
    expect(loaded.mockModuleFactory).not.toHaveBeenCalled();
    expect(loaded.createMock).not.toHaveBeenCalled();

    loaded.auth.listener?.(
      { profile: { id: "admin-2" } },
      { profile: { id: "admin-1" } }
    );
    loaded.auth.listener?.({ profile: null }, { profile: null });
    loaded.auth.listener?.({ profile: null }, { profile: { id: "admin-1" } });
    expect(mock.clearSession).not.toHaveBeenCalled();
  });

  it("mock 开启时延迟创建一次、全方法复用，并在 logout 后清理重建", async () => {
    const real = createSourceDouble("real");
    const mock = createSourceDouble("mock", true);
    const mockPart = createPartOfSpeechSourceDouble("mock");
    const loaded = await loadDataSource({
      mockEnabled: true,
      real: real.source,
      mock: mock.source,
      mockPart: mockPart.source
    });

    expect(loaded.createMock).not.toHaveBeenCalled();
    expect(
      loaded.module.adminWordsDataSourceCapabilities.dialectVariantSuggestions
    ).toBe(true);
    await expectFacadeDelegation(
      loaded.module.adminWordsDataSource,
      mock,
      "mock"
    );
    await expectPartOfSpeechFacadeDelegation(
      loaded.module.partOfSpeechDataSource,
      mockPart,
      "mock"
    );
    expect(loaded.mockModuleFactory).toHaveBeenCalledTimes(1);
    expect(loaded.createMock).toHaveBeenCalledTimes(1);

    const options = loaded.getMockFactoryOptions();
    expect(options?.getAdminProfile()).toEqual({ id: "admin-1" });
    expect(loaded.auth.getState).toHaveBeenCalledTimes(1);
    loaded.auth.setProfile(null);
    expect(options?.getAdminProfile()).toBeUndefined();

    loaded.auth.listener?.({ profile: null }, { profile: { id: "admin-1" } });
    expect(mock.clearSession).toHaveBeenCalledTimes(1);
    await expect(loaded.module.adminWordsDataSource.stats()).resolves.toEqual({
      owner: "mock",
      method: "stats",
      args: []
    });
    expect(loaded.createMock).toHaveBeenCalledTimes(2);

    loaded.auth.listener?.({ profile: null }, { profile: null });
    expect(mock.clearSession).toHaveBeenCalledTimes(1);
  });

  it("mock 实例没有 clearSession 时 logout 仍安全清空选择并重建", async () => {
    const real = createSourceDouble("real");
    const mock = createSourceDouble("mock");
    const loaded = await loadDataSource({
      mockEnabled: true,
      real: real.source,
      mock: mock.source
    });

    await loaded.module.adminWordsDataSource.stats();
    loaded.auth.listener?.({ profile: null }, { profile: { id: "admin-1" } });
    await loaded.module.adminWordsDataSource.stats();
    expect(loaded.createMock).toHaveBeenCalledTimes(2);
  });

  it("production 始终使用 real，且不注册 logout 订阅或加载 mock", async () => {
    const real = createSourceDouble("real");
    const mock = createSourceDouble("mock", true);
    const realPart = createPartOfSpeechSourceDouble("real");
    const loaded = await loadDataSource({
      mockEnabled: true,
      real: real.source,
      mock: mock.source,
      realPart: realPart.source,
      production: true
    });

    await expect(loaded.module.adminWordsDataSource.stats()).resolves.toEqual({
      owner: "real",
      method: "stats",
      args: []
    });
    expect(
      loaded.module.adminWordsDataSourceCapabilities.dialectVariantSuggestions
    ).toBe(false);
    expect(loaded.auth.subscribe).not.toHaveBeenCalled();
    expect(loaded.mockModuleFactory).not.toHaveBeenCalled();
    await expectPartOfSpeechFacadeDelegation(
      loaded.module.partOfSpeechDataSource,
      realPart,
      "real"
    );
  });

  it("优化后的 test mode 构建显式启用 mock 时仍复用 mock runtime", async () => {
    const real = createSourceDouble("real");
    const mock = createSourceDouble("mock", true);
    const mockPart = createPartOfSpeechSourceDouble("mock");
    const loaded = await loadDataSource({
      mockEnabled: true,
      real: real.source,
      mock: mock.source,
      mockPart: mockPart.source,
      production: true,
      mode: "test"
    });

    await expect(loaded.module.adminWordsDataSource.stats()).resolves.toEqual({
      owner: "mock",
      method: "stats",
      args: []
    });
    await expectPartOfSpeechFacadeDelegation(
      loaded.module.partOfSpeechDataSource,
      mockPart,
      "mock"
    );
    expect(
      loaded.module.adminWordsDataSourceCapabilities.dialectVariantSuggestions
    ).toBe(true);
    expect(loaded.auth.subscribe).toHaveBeenCalledTimes(1);
  });
});
