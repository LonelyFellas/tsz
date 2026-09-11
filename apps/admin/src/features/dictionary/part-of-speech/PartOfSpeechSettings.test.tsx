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
import type { ReactNode, Ref } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PartOfSpeechSettings } from "./PartOfSpeechSettings";

vi.mock("antd", async (importOriginal) => {
  const actual = await importOriginal<typeof import("antd")>();
  return {
    ...actual,
    Tooltip: ({
      title,
      children
    }: {
      title?: ReactNode;
      children: ReactNode;
    }) => (
      <span data-tooltip={typeof title === "string" ? title : undefined}>
        {children}
      </span>
    )
  };
});

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
    onSaved: (saved: PartOfSpeechConfig) => void;
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
                    id: createdVerb.id,
                    code: createdVerb.code,
                    name_zh: createdVerb.name_zh,
                    name_en: createdVerb.name_en,
                    abbreviation: createdVerb.abbreviation,
                    short_name_zh: createdVerb.short_name_zh,
                    full_name_en: createdVerb.full_name_en,
                    sort_order: createdVerb.sort_order,
                    allowed_form_types: [],
                    default_form_types: [],
                    sub_parts_extensible: true,
                    sub_parts: []
                  }
                ]
              };
            }
            onSaved(value ?? createdVerb);
          }}
        >
          模拟保存基本词性
        </button>
        <button onClick={() => onSaved(createdParticle)}>
          模拟保存选填细分的词性
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

const subPanelHandle = vi.hoisted(() => ({ openCreate: vi.fn() }));

vi.mock("./SubPartOfSpeechDrawer", async () => {
  const { useImperativeHandle } = await import("react");
  const SubPartOfSpeechPanel = ({
    parents,
    createParent,
    onSaved,
    onError,
    ref
  }: {
    parents: Pick<PartOfSpeechConfig, "id" | "name_zh">[];
    createParent?: Pick<PartOfSpeechConfig, "id" | "name_zh">;
    onSaved: (text: string) => void;
    onError: (error: unknown) => void;
    ref?: Ref<{ openCreate: () => void }>;
  }) => {
    useImperativeHandle(ref, () => ({ openCreate: subPanelHandle.openCreate }));
    return (
      <div data-testid="sub-panel">
        细分-{parents.map((item) => item.id).join(",")}
        /新建父级-{createParent?.id ?? "无"}
        <button onClick={() => onSaved("细分词性已保存")}>
          模拟保存细分词性
        </button>
        <button onClick={() => onError("unknown")}>模拟细分词性错误</button>
      </div>
    );
  };
  return { SubPartOfSpeechPanel };
});

const actor = { id: "admin-1", display_name: "超级管理员" };
const items: PartOfSpeechConfig[] = [
  {
    id: "pos-noun",
    code: "noun",
    name_zh: "名词",
    name_en: "NOUN",
    abbreviation: "n.",
    short_name_zh: "名",
    full_name_en: "noun",
    sort_order: 10,
    usage_count: 3,
    sub_part_count: 5,
    sub_parts_extensible: true,
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
    short_name_zh: "小品",
    full_name_en: "particle",
    sort_order: 20,
    usage_count: 0,
    sub_part_count: 0,
    sub_parts_extensible: true,
    sub_pos_required: false,
    revision: 1,
    created_by: actor,
    created_at: "2026-08-08T00:01:00.000Z",
    updated_at: "2026-08-08T00:01:00.000Z"
  },
  {
    id: "pos-verb",
    code: "verb",
    name_zh: "动词",
    name_en: "VERB",
    abbreviation: "v.",
    short_name_zh: "动",
    full_name_en: "verb",
    sort_order: 30,
    usage_count: 0,
    sub_part_count: 5,
    sub_parts_extensible: true,
    revision: 1,
    created_by: actor,
    created_at: "2026-08-08T00:02:00.000Z",
    updated_at: "2026-08-08T00:02:00.000Z"
  }
];

// 模拟新建返回：两者都能挂细分词性，区别只在释义是否必填细分词性。
const createdVerb: PartOfSpeechConfig = {
  id: "pos-created",
  code: "verb_custom",
  name_zh: "新动词",
  name_en: "NEW VERB",
  abbreviation: "nv.",
  short_name_zh: "新动",
  full_name_en: "new verb",
  sort_order: 40,
  usage_count: 0,
  sub_part_count: 0,
  sub_parts_extensible: true,
  revision: 1,
  created_by: actor,
  created_at: "2026-08-08T00:03:00.000Z",
  updated_at: "2026-08-08T00:03:00.000Z"
};
const createdParticle: PartOfSpeechConfig = {
  ...createdVerb,
  id: "pos-created-particle",
  code: "particle_custom",
  name_zh: "新小品词",
  name_en: "NEW PARTICLE",
  abbreviation: "np.",
  short_name_zh: "新小品",
  full_name_en: "new particle",
  sub_pos_required: false
};

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
    pagination: { page: 1, page_size: 10, total: 3, total_pages: 1 }
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
      short_name_zh: item.short_name_zh,
      full_name_en: item.full_name_en,
      sort_order: item.sort_order,
      sub_parts_extensible: item.sub_parts_extensible,
      sub_pos_required: item.sub_pos_required,
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
    expect(screen.getByText("正式中文", { selector: "th" })).toBeVisible();
    expect(screen.getByText("正式英文", { selector: "th" })).toBeVisible();
    expect(screen.queryByText("稳定编码")).toBeNull();
    expect(screen.getByText("名词")).toBeVisible();
    expect(screen.getByText("小品词")).toBeVisible();
    const nounRow = screen.getByText("名词").closest("tr")!;
    expect(within(nounRow).getByText("5 项")).toBeVisible();
    expect(within(nounRow).getByText("名")).toBeVisible();
    expect(within(nounRow).getByText("noun")).toBeVisible();
    const referencedDelete = within(nounRow)
      .getByText("删 除")
      .closest("button")!;
    expect(referencedDelete).toBeDisabled();
    expect(referencedDelete.parentElement).toHaveAttribute(
      "data-tooltip",
      "已有 3 个单词或短语引用，只能修改"
    );

    const particleRow = screen.getByText("小品词").closest("tr")!;
    expect(within(particleRow).getByText("0 项")).toBeVisible();
    // 动词没有词条引用但还挂着 5 项细分词性：同样禁删并说明先删细分词性。
    const verbRow = screen.getByText("动词").closest("tr")!;
    const verbDelete = within(verbRow).getByText("删 除").closest("button")!;
    expect(verbDelete).toBeDisabled();
    expect(verbDelete.parentElement).toHaveAttribute(
      "data-tooltip",
      "还有 5 项细分词性，请先删除细分词性"
    );
    expect(
      within(particleRow).getByText("删 除").closest("button")
    ).toBeEnabled();
    expect(
      within(particleRow).getByText("删 除").closest("button")?.parentElement
    ).not.toHaveAttribute("data-tooltip");

    fireEvent.click(screen.getByText("新增基本词性"));
    expect(screen.getByText("新增基本词性表单")).toBeVisible();

    fireEvent.click(within(particleRow).getByText("修 改"));
    expect(screen.getByText("修改-particle")).toBeVisible();
  });

  it("细分词性 Tab 默认「全部」展示所有基本词性，并支持切换所属基本词性", async () => {
    renderSettings();

    fireEvent.click(screen.getByRole("tab", { name: "细分词性" }));
    expect(screen.getByText("全部", { exact: true })).toBeVisible();
    expect(screen.getByTestId("sub-panel")).toHaveTextContent(
      "细分-pos-noun,pos-particle,pos-verb/新建父级-无"
    );
    fireEvent.mouseDown(screen.getByLabelText("所属基本词性"));
    fireEvent.click(await screen.findByText("动词", { exact: true }));
    expect(screen.getByTestId("sub-panel")).toHaveTextContent(
      "细分-pos-verb/新建父级-pos-verb"
    );
  });

  it("父级下拉支持按基本词性中文名搜索", async () => {
    renderSettings();

    fireEvent.click(screen.getByRole("tab", { name: "细分词性" }));
    const selector = screen.getByLabelText("所属基本词性");
    fireEvent.mouseDown(selector);
    fireEvent.change(selector, { target: { value: "动" } });

    const listbox = await screen.findByRole("listbox");
    expect(
      within(listbox).getByRole("option", { name: "动词" })
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
    expect(screen.getByText("新动词", { exact: true })).toBeVisible();
    expect(screen.getByTestId("sub-panel")).toHaveTextContent(
      "细分-pos-created"
    );
  });

  it("新增释义选填细分词性的词性后同样跳到细分词性 Tab", async () => {
    renderSettings();

    fireEvent.click(screen.getByText("新增基本词性"));
    fireEvent.click(screen.getByText("模拟保存选填细分的词性"));

    expect(await screen.findByText("基本词性已新增")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "细分词性" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    // 新建的词性还没进目录快照，这里只看跳转本身：面板已经在细分词性 Tab 上。
    expect(screen.getByTestId("sub-panel")).toBeInTheDocument();
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

  it("名下还有词形变化的词性，删除按钮预判禁用并说明原因", async () => {
    mock.list.data = {
      items: [
        {
          ...items[1]!,
          usage_count: 0,
          sub_part_count: 0,
          allowed_form_types: ["past_tense", "plural"]
        }
      ],
      pagination: { page: 1, page_size: 10, total: 1, total_pages: 1 }
    };
    renderSettings();

    const row = screen.getByText("小品词").closest("tr")!;
    const remove = within(row).getByText("删 除").closest("button")!;
    expect(remove).toBeDisabled();
    expect(remove.parentElement).toHaveAttribute(
      "data-tooltip",
      "还有 2 项词形变化，请先删除词形变化"
    );
  });

  it.each([
    ["part_of_speech_conflict", "基本词性名称已存在"],
    ["sub_part_of_speech_conflict", "细分词性名称已存在"],
    ["part_of_speech_in_use", "该基本词性已被单词或短语引用，只能修改"],
    [
      "part_of_speech_has_sub_parts",
      "该基本词性下还有细分词性，请先删除细分词性"
    ],
    [
      "part_of_speech_has_form_types",
      "该基本词性下还有词形变化，请先删除词形变化"
    ],
    [
      "sub_part_of_speech_in_use",
      "该细分词性已被词义引用，不能删除，编码也不能再改"
    ],
    ["sub_part_of_speech_not_allowed", "该基本词性不支持细分词性"],
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

  it("编码冲突（field=code）时提示调整英文全称，而不是暴露编码", async () => {
    mock.remove.mockRejectedValueOnce(
      new HttpError(409, "conflict", [], "part_of_speech_conflict", {
        type: "urn:tsz:problem:part_of_speech_conflict",
        title: "Conflict",
        status: 409,
        detail: "part of speech already exists",
        code: "part_of_speech_conflict",
        field: "code"
      })
    );
    renderSettings();
    const particleRow = screen.getByText("小品词").closest("tr")!;
    fireEvent.click(within(particleRow).getByText("删 除"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByText("删 除"));
    expect(
      await screen.findByText("英文全称与已有基本词性过于接近，请调整英文全称")
    ).toBeInTheDocument();
  });

  it("序号列显示真实排序值，而不是行内位置", () => {
    renderSettings();
    const particleRow = screen.getByText("小品词").closest("tr")!;
    // 小品词的 sort_order 是 20，排在第 2 行——位置序号也会显示 2，所以再看第 3 行。
    expect(particleRow.cells[0]!.textContent).toBe("20");
    const verbRow = screen.getByText("动词").closest("tr")!;
    expect(verbRow.cells[0]!.textContent).toBe("30");
  });

  it("细分词性编码冲突时提示换编码，因为编码是管理员自己填的", async () => {
    mock.remove.mockRejectedValueOnce(
      new HttpError(409, "conflict", [], "sub_part_of_speech_conflict", {
        type: "urn:tsz:problem:sub_part_of_speech_conflict",
        title: "Conflict",
        status: 409,
        detail: "sub part of speech already exists",
        code: "sub_part_of_speech_conflict",
        field: "code"
      })
    );
    renderSettings();
    const particleRow = screen.getByText("小品词").closest("tr")!;
    fireEvent.click(within(particleRow).getByText("删 除"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByText("删 除"));
    expect(
      await screen.findByText("编码已被其他细分词性占用，请换一个")
    ).toBeInTheDocument();
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
    expect(screen.getByText("新增细分词性").closest("button")).toBeDisabled();
    fireEvent.click(screen.getByText("重 试"));
    expect(mock.catalogRefetch).toHaveBeenCalledTimes(1);
  });

  it("细分词性 Tab 的新增按钮在「全部」下也可用，点击后交给面板打开新建", () => {
    renderSettings();

    fireEvent.click(screen.getByRole("tab", { name: "细分词性" }));
    const addButton = screen.getByText("新增细分词性").closest("button")!;
    expect(addButton).toBeEnabled();
    expect(addButton.parentElement).not.toHaveAttribute("data-tooltip");
    fireEvent.click(addButton);
    expect(subPanelHandle.openCreate).toHaveBeenCalledTimes(1);
  });

  it("目录里没有基本词性时新增细分词性禁用并说明", () => {
    mock.catalog.data = { catalog_version: 1, items: [] };
    renderSettings();

    fireEvent.click(screen.getByRole("tab", { name: "细分词性" }));
    const addButton = screen.getByText("新增细分词性").closest("button")!;
    expect(addButton).toBeDisabled();
    expect(addButton.parentElement).toHaveAttribute(
      "data-tooltip",
      "暂无基本词性"
    );
  });
});
