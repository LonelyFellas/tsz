import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  partOfSpeechKeys,
  useCreatePartOfSpeech,
  useCreateSubPartOfSpeech,
  usePartOfSpeechCatalog,
  usePartOfSpeechConfigList,
  useRemovePartOfSpeech,
  useRemoveSubPartOfSpeech,
  useSubPartOfSpeechLists,
  useUpdatePartOfSpeech,
  useUpdateSubPartOfSpeech
} from "./api";

const source = vi.hoisted(() => ({
  catalog: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  listSubParts: vi.fn(),
  createSubPart: vi.fn(),
  updateSubPart: vi.fn(),
  removeSubPart: vi.fn()
}));

vi.mock("../dataSource", () => ({ partOfSpeechDataSource: source }));

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

beforeEach(() => {
  vi.clearAllMocks();
  source.catalog.mockResolvedValue({ catalog_version: 1, items: [] });
  source.list.mockResolvedValue({
    items: [],
    pagination: { page: 1, page_size: 10, total: 0, total_pages: 0 }
  });
  source.listSubParts.mockResolvedValue({ items: [] });
  for (const mutation of [
    source.create,
    source.update,
    source.remove,
    source.createSubPart,
    source.updateSubPart,
    source.removeSubPart
  ]) {
    mutation.mockResolvedValue({ id: "result" });
  }
});

describe("part-of-speech query hooks", () => {
  it("catalog、管理列表和细分列表使用各自 query key 与参数", async () => {
    const { wrapper } = setup();
    const catalog = renderHook(() => usePartOfSpeechCatalog(), { wrapper });
    const query = { q: "noun", page: 2, page_size: 20 };
    const list = renderHook(() => usePartOfSpeechConfigList(query), {
      wrapper
    });
    const subList = renderHook(() => useSubPartOfSpeechLists(["pos-1"]), {
      wrapper
    });

    await waitFor(() => expect(catalog.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(subList.result.current.isPending).toBe(false));
    expect(source.catalog).toHaveBeenCalledTimes(1);
    expect(source.list).toHaveBeenCalledWith(query);
    expect(source.listSubParts).toHaveBeenCalledWith("pos-1");
    expect(partOfSpeechKeys.catalog()).toEqual([
      "part-of-speech-config",
      "catalog"
    ]);
  });
});

describe("part-of-speech mutation hooks", () => {
  it("基本词性 create/update/remove 透传参数并失效目录缓存", async () => {
    const { client, wrapper } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const create = renderHook(() => useCreatePartOfSpeech(), { wrapper });
    const update = renderHook(() => useUpdatePartOfSpeech(), { wrapper });
    const remove = renderHook(() => useRemovePartOfSpeech(), { wrapper });
    const createInput = {
      code: "particle",
      name_zh: "小品词",
      name_en: "Particle",
      abbreviation: "part.",
      short_name_zh: "小品词",
      full_name_en: "particle",
      sort_order: 10
    };
    const updateInput = {
      base_revision: 1,
      name_zh: "语气词",
      name_en: "Particle",
      abbreviation: "ptcl.",
      short_name_zh: "语气词",
      full_name_en: "particle",
      sort_order: 20
    };

    await act(() => create.result.current.mutateAsync(createInput));
    await act(() =>
      update.result.current.mutateAsync({ id: "pos-1", input: updateInput })
    );
    await act(() =>
      remove.result.current.mutateAsync({ id: "pos-1", base_revision: 4 })
    );

    expect(source.create).toHaveBeenCalledWith(createInput);
    expect(source.update).toHaveBeenCalledWith("pos-1", updateInput);
    expect(source.remove).toHaveBeenCalledWith("pos-1", {
      base_revision: 4
    });
    expect(invalidate).toHaveBeenCalledTimes(3);
    expect(invalidate).toHaveBeenLastCalledWith({
      queryKey: partOfSpeechKeys.all
    });
  });

  it("细分词性 create/update/remove 透传父子 id 并失效目录缓存", async () => {
    const { client, wrapper } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const create = renderHook(() => useCreateSubPartOfSpeech(), { wrapper });
    const update = renderHook(() => useUpdateSubPartOfSpeech(), { wrapper });
    const remove = renderHook(() => useRemoveSubPartOfSpeech(), { wrapper });
    const createInput = {
      code: "N-COLLECTIVE",
      name_zh: "集合名词",
      name_en: "Collective noun",
      short_name_zh: "集合名词",
      abbreviation: "n.",
      full_name_en: "collective noun",
      sort_order: 10
    };
    const updateInput = {
      base_revision: 1,
      name_zh: "集合类名词",
      name_en: "Collective noun",
      short_name_zh: "集合类名词",
      abbreviation: "n.",
      full_name_en: "collective noun",
      sort_order: 20
    };

    await act(() =>
      create.result.current.mutateAsync({ partId: "pos-1", input: createInput })
    );
    await act(() =>
      update.result.current.mutateAsync({
        partId: "pos-1",
        subId: "sub-1",
        input: updateInput
      })
    );
    await act(() =>
      remove.result.current.mutateAsync({
        partId: "pos-1",
        subId: "sub-1",
        base_revision: 5
      })
    );

    expect(source.createSubPart).toHaveBeenCalledWith("pos-1", createInput);
    expect(source.updateSubPart).toHaveBeenCalledWith(
      "pos-1",
      "sub-1",
      updateInput
    );
    expect(source.removeSubPart).toHaveBeenCalledWith("pos-1", "sub-1", {
      base_revision: 5
    });
    expect(invalidate).toHaveBeenCalledTimes(3);
  });
});

describe("useSubPartOfSpeechLists", () => {
  it("按传入顺序拼接多个父级的细分词性并共用单父级缓存键", async () => {
    const { client, wrapper } = setup();
    source.listSubParts.mockImplementation(async (id: string) => ({
      items: [{ id: `${id}-sub`, part_of_speech_id: id }]
    }));

    const merged = renderHook(
      () => useSubPartOfSpeechLists(["pos-2", "pos-1"]),
      { wrapper }
    );
    await waitFor(() => expect(merged.result.current.isPending).toBe(false));

    expect(source.listSubParts).toHaveBeenCalledTimes(2);
    expect(merged.result.current.error).toBeUndefined();
    expect(
      merged.result.current.items.map((item) => item.part_of_speech_id)
    ).toEqual(["pos-2", "pos-1"]);
    expect(client.getQueryData(partOfSpeechKeys.subParts("pos-1"))).toEqual({
      items: [{ id: "pos-1-sub", part_of_speech_id: "pos-1" }]
    });
  });

  it("任一父级失败时暴露错误，refetch 重新拉取全部父级", async () => {
    const { wrapper } = setup();
    const failure = new Error("sub list failed");
    source.listSubParts.mockImplementation(async (id: string) => {
      if (id === "pos-2") throw failure;
      return { items: [] };
    });

    const merged = renderHook(
      () => useSubPartOfSpeechLists(["pos-1", "pos-2"]),
      { wrapper }
    );
    await waitFor(() => expect(merged.result.current.error).toBe(failure));

    source.listSubParts.mockResolvedValue({ items: [] });
    await act(() => merged.result.current.refetch());
    await waitFor(() => expect(merged.result.current.error).toBeUndefined());
    expect(source.listSubParts).toHaveBeenCalledTimes(4);
  });
});
