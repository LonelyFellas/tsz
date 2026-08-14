import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { App as AntApp } from "antd";
import { HttpError } from "@tsz/api-client";
import type {
  PartOfSpeechCatalogResponse,
  PartOfSpeechConfig
} from "@tsz/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PartOfSpeechSettings } from "./PartOfSpeechSettings";

const mock = vi.hoisted(() => ({
  queries: [] as Array<Record<string, unknown>>,
  remove: vi.fn(),
  refetch: vi.fn(),
  catalogRefetch: vi.fn(),
  catalog: {
    isError: false,
    isPending: false,
    error: new Error("catalog failed"),
    data: undefined as PartOfSpeechCatalogResponse | undefined
  },
  list: {
    isError: false,
    isPending: false,
    error: new Error("load failed"),
    data: undefined as
      | {
          items: PartOfSpeechConfig[];
          pagination: {
            page: number;
            page_size: number;
            total: number;
            total_pages: number;
          };
        }
      | undefined
  }
}));

vi.mock("./api", () => ({
  usePartOfSpeechConfigList: (query: Record<string, unknown>) => {
    mock.queries.push(query);
    return { ...mock.list, refetch: mock.refetch };
  },
  usePartOfSpeechCatalog: () => ({
    ...mock.catalog,
    refetch: mock.catalogRefetch
  }),
  useRemovePartOfSpeech: () => ({
    mutateAsync: mock.remove,
    isPending: false
  })
}));

vi.mock("./PartOfSpeechFormModal", () => ({
  PartOfSpeechFormModal: ({
    open,
    value,
    onClose,
    onSaved,
    onError
  }: {
    open: boolean;
    value?: PartOfSpeechConfig;
    onClose: () => void;
    onSaved: (id: string) => void;
    onError: (error: unknown) => void;
  }) =>
    open ? (
      <div data-testid="part-form">
        {value ? `修改-${value.code}` : "新增基本词性表单"}
        <button
          onClick={() => {
            if (!value && mock.catalog.data) {
              mock.catalog.data = {
                ...mock.catalog.data,
                catalog_version: mock.catalog.data.catalog_version + 1,
                items: [
                  ...mock.catalog.data.items,
                  {
                    id: "pos-created",
                    code: "interjection",
                    name_zh: "感叹词",
                    name_en: "INTERJECTION",
                    abbreviation: "int.",
                    sort_order: 30,
                    allowed_form_types: [],
                    default_form_types: [],
                    sub_parts: []
                  }
                ]
              };
            }
            onSaved(value?.id ?? "pos-created");
          }}
        >
          模拟保存基本词性
        </button>
        <button onClick={onClose}>关闭基本词性表单</button>
        <button
          onClick={() =>
            onError(
              new HttpError(409, "revision conflict", [], "revision_conflict")
            )
          }
        >
          模拟基本词性错误
        </button>
      </div>
    ) : null
}));

vi.mock("./SubPartOfSpeechDrawer", () => ({
  SubPartOfSpeechPanel: ({
    parent,
    onSaved,
    onError
  }: {
    parent?: Pick<PartOfSpeechConfig, "id" | "name_zh">;
    onSaved: (text: string) => void;
    onError: (error: unknown) => void;
  }) =>
    parent ? (
      <div data-testid="sub-panel">
        细分-{parent.id}
        <button onClick={() => onSaved("细分词性已保存")}>
          模拟保存细分词性
        </button>
        <button onClick={() => onError("unknown")}>模拟细分词性错误</button>
      </div>
    ) : null
}));

const actor = { id: "admin-1", display_name: "超级管理员" };
const items: PartOfSpeechConfig[] = [
  {
    id: "pos-noun",
    code: "noun",
    name_zh: "名词",
    name_en: "NOUN",
    abbreviation: "n.",
    sort_order: 10,
    usage_count: 3,
    sub_part_count: 5,
    revision: 1,
    created_by: actor,
    created_at: "2026-08-08T00:00:00.000Z",
    updated_at: "2026-08-08T00:00:00.000Z"
  },
  {
    id: "pos-particle",
    code: "particle",
    name_zh: "小品词",
    name_en: "PARTICLE",
    abbreviation: "part.",
    sort_order: 20,
    usage_count: 0,
    sub_part_count: 1,
    revision: 1,
    created_by: actor,
    created_at: "2026-08-08T00:01:00.000Z",
    updated_at: "2026-08-08T00:01:00.000Z"
  }
];

function renderSettings() {
  return render(
    <AntApp>
      <PartOfSpeechSettings />
    </AntApp>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.queries.length = 0;
  mock.list.isError = false;
  mock.list.isPending = false;
  mock.list.data = {
    items,
    pagination: { page: 1, page_size: 10, total: 2, total_pages: 1 }
  };
  mock.catalog.isError = false;
  mock.catalog.isPending = false;
  mock.catalog.data = {
    catalog_version: 1,
    items: items.map((item) => ({
      id: item.id,
      code: item.code,
      name_zh: item.name_zh,
      name_en: item.name_en,
      abbreviation: item.abbreviation,
      sort_order: item.sort_order,
      sub_parts: []
    }))
  };
  mock.remove.mockResolvedValue(undefined);
});

describe("PartOfSpeechSettings", () => {
  it("配置页顶部显示基本/细分 Tab，默认展示基本词性管理", () => {
    renderSettings();

    expect(screen.getByRole("tab", { name: "基本词性" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByRole("tab", { name: "细分词性" })).toBeVisible();
    expect(screen.getByText("名词")).toBeVisible();
    expect(screen.getByText("小品词")).toBeVisible();
    const nounRow = screen.getByText("名词").closest("tr")!;
    expect(within(nounRow).getByText("删 除").closest("button")).toBeDisabled();

    fireEvent.click(screen.getByText("新增基本词性"));
    expect(screen.getByText("新增基本词性表单")).toBeVisible();

    const particleRow = screen.getByText("小品词").closest("tr")!;
    fireEvent.click(within(particleRow).getByText("修 改"));
    expect(screen.getByText("修改-particle")).toBeVisible();
  });

  it("细分词性 Tab 默认首个基本词性，并支持切换所属基本词性", async () => {
    renderSettings();

    fireEvent.click(screen.getByRole("tab", { name: "细分词性" }));
    expect(screen.getByTestId("sub-panel")).toHaveTextContent("细分-pos-noun");
    fireEvent.mouseDown(screen.getByLabelText("所属基本词性"));
    fireEvent.click(await screen.findByText("小品词", { exact: true }));
    expect(screen.getByTestId("sub-panel")).toHaveTextContent(
      "细分-pos-particle"
    );
  });

  it("父级下拉支持按基本词性中文名搜索", async () => {
    renderSettings();

    fireEvent.click(screen.getByRole("tab", { name: "细分词性" }));
    const selector = screen.getByLabelText("所属基本词性");
    fireEvent.mouseDown(selector);
    fireEvent.change(selector, { target: { value: "小品" } });

    const listbox = await screen.findByRole("listbox");
    expect(
      within(listbox).getByRole("option", { name: "小品词" })
    ).toBeInTheDocument();
    expect(
      within(listbox).queryByRole("option", { name: "名词" })
    ).not.toBeInTheDocument();
  });

  it("新增基本词性后自动进入细分词性并选中新父级", async () => {
    renderSettings();

    fireEvent.click(screen.getByText("新增基本词性"));
    fireEvent.click(screen.getByText("模拟保存基本词性"));

    expect(
      await screen.findByRole("tab", { name: "细分词性", selected: true })
    ).toBeVisible();
    expect(screen.getByText("感叹词", { exact: true })).toBeVisible();
    expect(screen.getByTestId("sub-panel")).toHaveTextContent(
      "细分-pos-created"
    );
  });

  it("处理基本词性与细分词性子表单的保存和错误事件", async () => {
    renderSettings();

    fireEvent.click(screen.getByText("新增基本词性"));
    fireEvent.click(screen.getByText("模拟保存基本词性"));
    expect(await screen.findByText("基本词性已新增")).toBeInTheDocument();
    fireEvent.click(screen.getByText("模拟基本词性错误"));
    expect(
      await screen.findByText("配置已被其他管理员修改，请刷新后重试")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("关闭基本词性表单"));
    expect(screen.queryByTestId("part-form")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "基本词性" }));
    const particleRow = screen.getByText("小品词").closest("tr")!;
    fireEvent.click(within(particleRow).getByText("修 改"));
    fireEvent.click(screen.getByText("模拟保存基本词性"));
    expect(await screen.findByText("基本词性已更新")).toBeInTheDocument();
    fireEvent.click(screen.getByText("关闭基本词性表单"));

    fireEvent.click(screen.getByRole("tab", { name: "细分词性" }));
    fireEvent.click(screen.getByText("模拟保存细分词性"));
    expect(await screen.findByText("细分词性已保存")).toBeInTheDocument();
    fireEvent.click(screen.getByText("模拟细分词性错误"));
    expect(await screen.findByText("操作失败")).toBeInTheDocument();
  });

  it("搜索和重置把中文关键词传给目录查询", async () => {
    renderSettings();

    fireEvent.click(screen.getByText("搜 索"));
    await waitFor(() =>
      expect(mock.queries.at(-1)).toMatchObject({ q: undefined, page: 1 })
    );

    fireEvent.change(screen.getByLabelText("关键词"), {
      target: { value: "  名词  " }
    });
    fireEvent.click(screen.getByText("搜 索"));
    await waitFor(() =>
      expect(mock.queries.at(-1)).toMatchObject({ q: "名词", page: 1 })
    );

    fireEvent.change(screen.getByLabelText("关键词"), {
      target: { value: "" }
    });
    fireEvent.click(screen.getByText("搜 索"));
    await waitFor(() =>
      expect(mock.queries.at(-1)).toMatchObject({ q: undefined, page: 1 })
    );

    fireEvent.click(screen.getByText("重 置"));
    await waitFor(() =>
      expect(mock.queries.at(-1)).toMatchObject({ q: undefined, page: 1 })
    );
  });

  it("未引用基本词性二次确认后删除", async () => {
    renderSettings();
    const particleRow = screen.getByText("小品词").closest("tr")!;
    fireEvent.click(within(particleRow).getByText("删 除"));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getAllByText("删除基本词性“小品词”？").length
    ).toBeGreaterThan(0);
    fireEvent.click(within(dialog).getByText("删 除"));

    await waitFor(() =>
      expect(mock.remove).toHaveBeenCalledWith({
        id: "pos-particle",
        base_revision: 1
      })
    );
    expect(await screen.findByText("基本词性已删除")).toBeInTheDocument();
  });

  it.each([
    ["part_of_speech_conflict", "词性编码或名称已存在"],
    ["sub_part_of_speech_conflict", "细分词性编码或名称已存在"],
    ["part_of_speech_in_use", "该基本词性已被单词或短语引用，只能修改"],
    ["sub_part_of_speech_in_use", "该细分词性已被词义引用，只能修改"],
    ["part_of_speech_not_found", "基本词性不存在或已被删除，请刷新后重试"],
    ["sub_part_of_speech_not_found", "细分词性不存在或已被删除，请刷新后重试"],
    ["invalid_part_of_speech", "词性配置字段不符合要求，请检查后重试"],
    ["invalid_request_body", "提交内容不完整或格式错误，请检查后重试"],
    ["invalid_query", "请求版本或查询参数无效，请刷新后重试"],
    ["unexpected_code", "服务异常"]
  ])("删除失败 code=%s 时显示对应提示并刷新列表", async (code, text) => {
    mock.remove.mockRejectedValueOnce(new HttpError(409, "服务异常", [], code));
    renderSettings();
    const particleRow = screen.getByText("小品词").closest("tr")!;
    fireEvent.click(within(particleRow).getByText("删 除"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByText("删 除"));

    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(mock.refetch).toHaveBeenCalledTimes(1);
  });

  it("非 Error 删除失败时显示通用提示", async () => {
    mock.remove.mockRejectedValueOnce("unknown");
    renderSettings();
    const particleRow = screen.getByText("小品词").closest("tr")!;
    fireEvent.click(within(particleRow).getByText("删 除"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByText("删 除"));

    expect(await screen.findByText("操作失败")).toBeInTheDocument();
    expect(mock.refetch).toHaveBeenCalledTimes(1);
  });

  it("分页切换保留页码，切换每页条数时回到第一页", async () => {
    mock.list.data = {
      items,
      pagination: { page: 1, page_size: 10, total: 35, total_pages: 4 }
    };
    renderSettings();

    fireEvent.click(screen.getByTitle("2"));
    await waitFor(() =>
      expect(mock.queries.at(-1)).toMatchObject({ page: 2, page_size: 10 })
    );

    fireEvent.mouseDown(screen.getByRole("combobox"));
    const options = await screen.findAllByRole("option");
    const twentyPerPage = options.find((option) =>
      option.textContent?.includes("20")
    );
    expect(twentyPerPage).toBeDefined();
    fireEvent.click(twentyPerPage!);
    await waitFor(() =>
      expect(mock.queries.at(-1)).toMatchObject({ page: 1, page_size: 20 })
    );
  });

  it("列表失败时保留错误态并允许重试", () => {
    mock.list.isError = true;
    mock.list.data = undefined;
    renderSettings();

    expect(screen.getByText("词性配置加载失败")).toBeVisible();
    fireEvent.click(screen.getByText("重 试"));
    expect(mock.refetch).toHaveBeenCalledTimes(1);
  });

  it("细分词性目录失败时禁用所属词性选择并允许重试", () => {
    mock.catalog.isError = true;
    mock.catalog.data = undefined;
    renderSettings();

    fireEvent.click(screen.getByRole("tab", { name: "细分词性" }));
    expect(screen.getByText("基本词性目录加载失败")).toBeVisible();
    expect(screen.getByLabelText("所属基本词性")).toBeDisabled();
    fireEvent.click(screen.getByText("重 试"));
    expect(mock.catalogRefetch).toHaveBeenCalledTimes(1);
  });
});
