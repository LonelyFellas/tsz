import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { App as AntApp } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FormTypeConfig } from "@tsz/types";
import { beforeEach, expect, it, vi } from "vitest";
import { FormTypeSettings } from "./FormTypeSettings";

const mock = vi.hoisted(() => ({
  items: [] as FormTypeConfig[],
  list: vi.fn((_query: unknown) => ({}) as Record<string, never>),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn()
}));
vi.mock("../dataSource", () => ({
  partOfSpeechDataSource: {
    catalog: async () => ({
      catalog_version: 1,
      items: [
        {
          id: "pos-verb",
          code: "verb",
          name_zh: "动词",
          name_en: "VERB",
          abbreviation: "v.",
          short_name_zh: "动词",
          full_name_en: "verb",
          sort_order: 10,
          sub_parts_extensible: true,
          sub_pos_required: true,
          sub_parts: []
        }
      ],
      form_types: mock.items
    }),
    listFormTypes: async (query: unknown) => ({
      ...(mock.list(query) as Record<string, never>),
      items: mock.items,
      pagination: {
        page: 1,
        page_size: 10,
        total: mock.items.length,
        total_pages: 1
      }
    }),
    createFormType: (...args: unknown[]) => mock.create(...args),
    updateFormType: (...args: unknown[]) => mock.update(...args),
    removeFormType: (...args: unknown[]) => mock.remove(...args)
  }
}));
const base: FormTypeConfig = {
  id: "base-id",
  code: "base",
  name_zh: "原形",
  name_en: "Base form",
  short_name_zh: "原形",
  abbreviation: "base",
  full_name_en: "base form",
  sort_order: 0,
  usage_count: 0,
  revision: 1,
  created_by: { id: "system", display_name: "系统" },
  created_at: "2026-09-09T00:00:00Z",
  updated_at: "2026-09-09T00:00:00Z"
};
beforeEach(() => {
  mock.items = [{ ...base }];
  vi.clearAllMocks();
});
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={client}>
      <AntApp>
        <FormTypeSettings />
      </AntApp>
    </QueryClientProvider>
  );
}
it("新增沿用五名称字段，派生编码与排序并刷新列表", async () => {
  mock.create.mockImplementation(async (input) => {
    const value = { ...base, ...input, id: "custom-id" };
    mock.items = [...mock.items, value];
    return value;
  });
  setup();
  await waitFor(() =>
    expect(
      screen.getByText("新增词形变化").closest("button")
    ).not.toBeDisabled()
  );
  fireEvent.click(screen.getByText("新增词形变化"));
  fireEvent.mouseDown(
    screen.getAllByLabelText("所属基本词性").at(-1) as HTMLElement
  );
  fireEvent.click(await screen.findByText("动词", { exact: true }));
  fireEvent.change(screen.getByLabelText("正式中文"), {
    target: { value: "自定义词形" }
  });
  fireEvent.change(screen.getByLabelText("正式英文"), {
    target: { value: "Custom variant" }
  });
  fireEvent.change(screen.getByLabelText("英文缩写"), {
    target: { value: "custom" }
  });
  await waitFor(() =>
    expect(screen.getByLabelText("英文全称")).toHaveValue("custom variant")
  );
  fireEvent.click(screen.getByText(/^新\s*建$/));
  await waitFor(() =>
    expect(mock.create).toHaveBeenCalledWith({
      part_of_speech_id: "pos-verb",
      // 编码带父词性前缀：不同词性下允许重名，编码仍要全局唯一。
      code: "verb_custom_variant",
      name_zh: "自定义词形",
      name_en: "Custom variant",
      short_name_zh: "自定义词形",
      abbreviation: "custom",
      full_name_en: "custom variant",
      sort_order: 10
    })
  );
  await waitFor(() =>
    expect(document.querySelector("tbody")).toHaveTextContent("自定义词形")
  );
  expect(screen.getAllByText("自定义词形").length).toBeGreaterThan(0);
});
it("编辑原形时不给归属选择，也不把归属发给后端", async () => {
  mock.update.mockImplementation(async (id, input) => ({
    ...base,
    ...input,
    id,
    revision: 2
  }));
  setup();
  await waitFor(() =>
    expect(document.querySelector("tbody tr.ant-table-row")).not.toBeNull()
  );
  const row = document.querySelector("tbody tr.ant-table-row")!;
  fireEvent.click(row.querySelector("button")!);

  const dialog = await screen.findByRole("dialog");
  await within(dialog).findByText("原形对所有基本词性通用，不归属某一个词性。");
  // 筛选栏也叫「所属基本词性」，这里只看弹窗里有没有。
  expect(within(dialog).queryByLabelText("所属基本词性")).toBeNull();
  fireEvent.change(screen.getByLabelText("正式中文"), {
    target: { value: "原形改名" }
  });
  fireEvent.click(screen.getByText(/^保\s*存$/));
  await waitFor(() => expect(mock.update).toHaveBeenCalledTimes(1));
  expect(mock.update.mock.calls[0]![1]).not.toHaveProperty("part_of_speech_id");
});

it("按所属基本词性筛选时把参数带进列表请求", async () => {
  setup();
  // 目录加载完筛选器才可用，否则 mouseDown 打不开下拉。
  await waitFor(() =>
    expect(screen.getByLabelText("所属基本词性")).not.toBeDisabled()
  );
  mock.list.mockClear();

  fireEvent.mouseDown(screen.getByLabelText("所属基本词性"));
  fireEvent.click(await screen.findByText("动词", { exact: true }));

  await waitFor(() =>
    expect(mock.list).toHaveBeenCalledWith(
      expect.objectContaining({ part_of_speech_id: "pos-verb", page: 1 })
    )
  );
});

it("原形及已引用类型禁止删除，修改使用当前revision", async () => {
  mock.items.push({
    ...base,
    id: "used-id",
    part_of_speech_id: "pos-verb",
    code: "custom_variant",
    name_zh: "已引用词形",
    short_name_zh: "已引用",
    usage_count: 2,
    revision: 4
  });
  mock.update.mockImplementation(async (id, input) => {
    mock.items = mock.items.map((item) =>
      item.id === id ? { ...item, ...input, revision: 5 } : item
    );
    return mock.items.find((item) => item.id === id);
  });
  setup();
  await screen.findByText("已引用词形");
  const row = screen.getByText("已引用词形").closest("tr")!;
  expect(
    [...row.querySelectorAll("button")].find(
      (b) => b.textContent?.replaceAll(" ", "") === "删除"
    )
  ).toBeDisabled();
  fireEvent.click(row.querySelector("button")!);
  fireEvent.change(screen.getByLabelText("正式中文"), {
    target: { value: "修改后的词形" }
  });
  fireEvent.click(screen.getByText(/^保\s*存$/));
  await waitFor(() =>
    expect(mock.update).toHaveBeenCalledWith(
      "used-id",
      expect.objectContaining({
        base_revision: 4,
        part_of_speech_id: "pos-verb",
        name_zh: "修改后的词形"
      })
    )
  );
  expect(mock.remove).not.toHaveBeenCalled();
});
