import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { App as AntApp } from "antd";
import type { PartOfSpeechConfig, SubPartOfSpeechConfig } from "@tsz/types";
import { createRef } from "react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SubPartOfSpeechPanel } from "./SubPartOfSpeechDrawer";
import type { SubPartOfSpeechPanelHandle } from "./SubPartOfSpeechDrawer";

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

const api = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  refetch: vi.fn(),
  list: {
    isError: false,
    isPending: false,
    error: new Error("sub list failed"),
    data: undefined as { items: SubPartOfSpeechConfig[] } | undefined
  }
}));

vi.mock("./api", () => ({
  useSubPartOfSpeechLists: (ids: string[]) => ({
    isPending: api.list.isPending,
    error: api.list.isError ? api.list.error : undefined,
    items: ids.flatMap((id) =>
      (api.list.data?.items ?? []).filter(
        (item) => item.part_of_speech_id === id
      )
    ),
    refetch: api.refetch
  }),
  useCreateSubPartOfSpeech: () => ({
    mutateAsync: api.create,
    isPending: false
  }),
  useUpdateSubPartOfSpeech: () => ({
    mutateAsync: api.update,
    isPending: false
  }),
  useRemoveSubPartOfSpeech: () => ({
    mutateAsync: api.remove,
    isPending: false
  })
}));

const actor = { id: "admin-1", display_name: "管理员" };
const parent: PartOfSpeechConfig = {
  id: "pos-noun",
  code: "noun",
  name_zh: "名词",
  name_en: "NOUN",
  abbreviation: "n.",
  short_name_zh: "名词",
  full_name_en: "noun",
  sort_order: 10,
  usage_count: 3,
  sub_part_count: 2,
  sub_parts_extensible: true,
  revision: 1,
  created_by: actor,
  created_at: "2026-08-08T00:00:00.000Z",
  updated_at: "2026-08-08T00:00:00.000Z"
};
const subItems: SubPartOfSpeechConfig[] = [
  {
    id: "sub-count",
    part_of_speech_id: parent.id,
    code: "N-COUNT",
    name_zh: "可数名词",
    name_en: "Countable noun",
    short_name_zh: "可数",
    abbreviation: "n.",
    full_name_en: "countable noun",
    sort_order: 10,
    usage_count: 4,
    revision: 2,
    created_by: actor,
    created_at: "2026-08-08T00:00:00.000Z",
    updated_at: "2026-08-08T00:00:00.000Z"
  },
  {
    id: "sub-collective",
    part_of_speech_id: parent.id,
    code: "N-COLLECTIVE",
    name_zh: "集合名词",
    name_en: "Collective noun",
    short_name_zh: "集合",
    abbreviation: "n.",
    full_name_en: "collective noun",
    sort_order: 20,
    usage_count: 0,
    revision: 1,
    created_by: actor,
    created_at: "2026-08-08T00:00:00.000Z",
    updated_at: "2026-08-08T00:00:00.000Z"
  }
];

function renderPanel(value: PartOfSpeechConfig | null = parent) {
  const onSaved = vi.fn();
  const onError = vi.fn();
  const handle = createRef<SubPartOfSpeechPanelHandle>();
  const view = render(
    <AntApp>
      <SubPartOfSpeechPanel
        ref={handle}
        parents={value ? [value] : []}
        createParent={value ?? undefined}
        onSaved={onSaved}
        onError={onError}
      />
    </AntApp>
  );
  // 「新增细分词性」按钮已挪到设置页的选择器行，面板只暴露 openCreate 句柄。
  const openCreate = () => act(() => handle.current!.openCreate());
  return { onSaved, onError, openCreate, ...view };
}

function fillSubForm(values: { nameZh: string; nameEn: string }) {
  // 三个展示字段按同一约定派生，便于用例只关心中英文名。
  const fields: [string, string][] = [
    ["正式中文", values.nameZh],
    ["简洁显示", values.nameZh],
    ["正式英文", values.nameEn],
    ["英文缩写", "n."],
    ["英文全称", values.nameEn.toLowerCase()]
  ];
  for (const [label, value] of fields) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
}

async function findDeleteConfirm(name = "集合名词") {
  const titles = await screen.findAllByText(`删除细分词性“${name}”？`);
  const dialog = titles
    .map((title) => title.closest<HTMLElement>(".ant-modal-confirm"))
    .find((candidate): candidate is HTMLElement => candidate !== null);
  if (!dialog) throw new Error("delete confirmation not found");
  return dialog;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.list.isError = false;
  api.list.isPending = false;
  api.list.data = { items: subItems };
  api.create.mockResolvedValue(subItems[1]);
  api.update.mockResolvedValue(subItems[1]);
  api.remove.mockResolvedValue(undefined);
});

describe("SubPartOfSpeechPanel", () => {
  it("展示当前基本词性的细分项、引用禁删和空 parent 提示", () => {
    const visible = renderPanel();
    const referencedRow = screen.getByText("可数名词").closest("tr")!;
    const referencedDelete = within(referencedRow)
      .getByText("删 除")
      .closest("button")!;
    expect(referencedDelete).toBeDisabled();
    expect(referencedDelete.parentElement).toHaveAttribute(
      "data-tooltip",
      "已有 4 个词义引用，只能修改"
    );
    const unreferencedRow = screen.getByText("集合名词").closest("tr")!;
    expect(
      within(unreferencedRow).getByText("删 除").closest("button")
    ).toBeEnabled();
    expect(
      within(unreferencedRow).getByText("删 除").closest("button")
        ?.parentElement
    ).not.toHaveAttribute("data-tooltip");
    visible.unmount();
    renderPanel(null);
    expect(screen.getByText("暂无基本词性")).toBeVisible();
  });

  it("新增细分词性自动生成内部编码且不展示编码列或输入", async () => {
    const callbacks = renderPanel();
    callbacks.openCreate();
    expect(screen.queryByText("编码")).not.toBeInTheDocument();
    // 已选定具体父级：所属基本词性锁定为该词性，不再让用户改。
    expect(screen.getByLabelText("所属基本词性")).toBeDisabled();
    fillSubForm({
      nameZh: "物质名词",
      nameEn: "Mass noun"
    });
    fireEvent.click(screen.getByText("新 建"));

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith({
        partId: "pos-noun",
        input: {
          code: expect.stringMatching(/^SUB_[A-F0-9]{28}$/),
          name_zh: "物质名词",
          name_en: "Mass noun",
          short_name_zh: "物质名词",
          abbreviation: "n.",
          full_name_en: "mass noun",
          sort_order: 30
        }
      })
    );
    expect(callbacks.onSaved).toHaveBeenCalledWith("细分词性已新增");
  });

  it("HTTP 环境缺少 randomUUID 时仍能创建细分词性", async () => {
    const originalCrypto = globalThis.crypto;
    vi.stubGlobal("crypto", {
      getRandomValues: originalCrypto.getRandomValues.bind(originalCrypto)
    });
    try {
      const callbacks = renderPanel();
      callbacks.openCreate();
      fillSubForm({ nameZh: "物质名词", nameEn: "Mass noun" });
      fireEvent.click(screen.getByText("新 建"));
      await waitFor(() =>
        expect(api.create).toHaveBeenCalledWith(
          expect.objectContaining({
            input: expect.objectContaining({
              code: expect.stringMatching(/^SUB_[A-F0-9]{28}$/)
            })
          })
        )
      );
      expect(callbacks.onError).not.toHaveBeenCalled();
    } finally {
      vi.stubGlobal("crypto", originalCrypto);
    }
  });

  it("修改未引用细分词性不提交编码，仍可修改名称和序号", async () => {
    renderPanel();
    const row = screen.getByText("集合名词").closest("tr")!;
    fireEvent.click(within(row).getByText("修 改"));
    expect(screen.queryByLabelText("编码")).not.toBeInTheDocument();
    expect(screen.getByLabelText("序号")).toHaveValue("20");
    fillSubForm({
      nameZh: "集合类名词",
      nameEn: "Collective noun"
    });
    fireEvent.click(screen.getByText("保 存"));

    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith({
        partId: "pos-noun",
        subId: "sub-collective",
        input: {
          base_revision: 1,
          name_zh: "集合类名词",
          name_en: "Collective noun",
          short_name_zh: "集合类名词",
          abbreviation: "n.",
          full_name_en: "collective noun",
          sort_order: 20
        }
      })
    );
  });

  it("已被词义引用的细分词性不展示编码且仍可编辑序号", () => {
    renderPanel();
    const row = screen.getByText("可数名词").closest("tr")!;
    fireEvent.click(within(row).getByText("修 改"));
    expect(screen.queryByLabelText("编码")).not.toBeInTheDocument();
    // 序号不受引用限制，照样能改。
    expect(screen.getByLabelText("序号")).toBeEnabled();
  });

  it("已引用细分词性修改序号时不提交编码", async () => {
    renderPanel();
    const row = screen.getByText("可数名词").closest("tr")!;
    fireEvent.click(within(row).getByText("修 改"));
    fireEvent.change(screen.getByLabelText("序号"), { target: { value: "5" } });
    fillSubForm({ nameZh: "可数名词", nameEn: "Countable noun" });
    fireEvent.click(screen.getByText("保 存"));

    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith(
        expect.objectContaining({
          subId: "sub-count",
          input: expect.objectContaining({ sort_order: 5 })
        })
      )
    );
    expect(api.update.mock.calls[0]![0].input).not.toHaveProperty("code");
  });

  it("正式英文在同一基本词性下允许重复", async () => {
    renderPanel();
    const row = screen.getByText("集合名词").closest("tr")!;
    fireEvent.click(within(row).getByText("修 改"));
    fillSubForm({
      nameZh: "不可数抽象名词",
      nameEn: "Countable noun"
    });
    fireEvent.click(screen.getByText("保 存"));

    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({ name_en: "Countable noun" })
        })
      )
    );
  });

  it("未引用细分词性二次确认后删除", async () => {
    const callbacks = renderPanel();
    const row = screen.getByText("集合名词").closest("tr")!;
    fireEvent.click(within(row).getByText("删 除"));
    const dialog = await findDeleteConfirm();
    fireEvent.click(within(dialog).getByText("删 除"));
    await waitFor(() =>
      expect(api.remove).toHaveBeenCalledWith({
        partId: "pos-noun",
        subId: "sub-collective",
        base_revision: 1
      })
    );
    expect(callbacks.onSaved).toHaveBeenCalledWith("细分词性已删除");
  });

  it("删除竞态失败时上报错误并刷新引用计数", async () => {
    const failure = new Error("in use");
    api.remove.mockRejectedValueOnce(failure);
    const callbacks = renderPanel();
    const row = screen.getByText("集合名词").closest("tr")!;
    fireEvent.click(within(row).getByText("删 除"));
    const dialog = await findDeleteConfirm();
    fireEvent.click(within(dialog).getByText("删 除"));
    await waitFor(() =>
      expect(callbacks.onError).toHaveBeenCalledWith(failure)
    );
    expect(api.refetch).toHaveBeenCalledTimes(1);
  });

  it("细分列表错误时显示重试入口", () => {
    api.list.isError = true;
    api.list.data = undefined;
    renderPanel();
    expect(screen.getByText("细分词性加载失败")).toBeVisible();
    fireEvent.click(screen.getByText("重 试"));
    expect(api.refetch).toHaveBeenCalledTimes(1);
  });

  it("细分表单提交失败保留弹窗并上报错误", async () => {
    const failure = new Error("conflict");
    api.create.mockRejectedValue(failure);
    const callbacks = renderPanel();
    callbacks.openCreate();
    fillSubForm({ nameZh: "物质名词", nameEn: "Mass noun" });
    fireEvent.click(screen.getByText("新 建"));
    await waitFor(() =>
      expect(callbacks.onError).toHaveBeenCalledWith(failure)
    );
    expect(screen.getByText("为“名词”新增细分词性")).toBeInTheDocument();
  });
});

describe("SubPartOfSpeechPanel 基础词性规则", () => {
  it("没有可用父级时 openCreate 不打开新建弹窗", () => {
    const callbacks = renderPanel(null);

    callbacks.openCreate();
    expect(screen.queryByText("新增细分词性")).toBeNull();
  });

  it("基础词性作为父级时 openCreate 打开新建弹窗", () => {
    const callbacks = renderPanel();

    callbacks.openCreate();
    expect(screen.getByText("为“名词”新增细分词性")).toBeInTheDocument();
  });
});

describe("SubPartOfSpeechPanel 「全部」视图", () => {
  const verbParent: PartOfSpeechConfig = {
    ...parent,
    id: "pos-verb",
    code: "verb",
    name_zh: "动词",
    name_en: "VERB",
    abbreviation: "v.",
    short_name_zh: "动词",
    full_name_en: "verb"
  };
  const transitive: SubPartOfSpeechConfig = {
    ...subItems[1]!,
    id: "sub-transitive",
    part_of_speech_id: "pos-verb",
    code: "V-T",
    name_zh: "及物动词",
    name_en: "Transitive verb",
    short_name_zh: "及物",
    abbreviation: "vt.",
    full_name_en: "transitive verb"
  };

  function renderAll() {
    const onSaved = vi.fn();
    const onError = vi.fn();
    const handle = createRef<SubPartOfSpeechPanelHandle>();
    render(
      <AntApp>
        <SubPartOfSpeechPanel
          ref={handle}
          parents={[parent, verbParent]}
          onSaved={onSaved}
          onError={onError}
        />
      </AntApp>
    );
    return { onSaved, onError, handle };
  }

  it("多父级时按父级顺序拼表并多一列所属基本词性，操作走各自父级", async () => {
    api.list.data = { items: [...subItems, transitive] };
    renderAll();

    expect(screen.getByText("所属基本词性", { selector: "th" })).toBeVisible();
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("名词"),
      expect.stringContaining("名词"),
      expect.stringContaining("动词")
    ]);

    const verbRow = screen.getByText("及物动词").closest("tr")!;
    fireEvent.click(within(verbRow).getByText("删 除"));
    const dialog = await findDeleteConfirm("及物动词");
    fireEvent.click(within(dialog).getByText("删 除"));
    await waitFor(() =>
      expect(api.remove).toHaveBeenCalledWith({
        partId: "pos-verb",
        subId: "sub-transitive",
        base_revision: transitive.revision
      })
    );
  });

  it("多父级时修改用该行自己的父级；新建时在弹窗里选所属基本词性", async () => {
    api.list.data = { items: [...subItems, transitive] };
    const { handle } = renderAll();

    // 「全部」视图没有固定父级：弹窗顶部提供所属基本词性下拉，按所选父级提交并追加排序。
    act(() => handle.current!.openCreate());
    expect(screen.getByText("新增细分词性")).toBeInTheDocument();
    const parentSelect = screen.getByLabelText("所属基本词性");
    expect(parentSelect).toBeEnabled();
    fireEvent.mouseDown(parentSelect);
    // 表格里也有"动词"文案，按 antd 下拉选项的 title 定位可见选项再点击。
    const verbOption = await waitFor(() => {
      const option = document.querySelector<HTMLElement>(
        '.ant-select-item-option[title="动词"]'
      );
      if (!option) throw new Error("动词 选项尚未渲染");
      return option;
    });
    fireEvent.click(verbOption);
    // 已经手填过序号，换父级不该把它覆盖掉。
    fireEvent.change(screen.getByLabelText("序号"), { target: { value: "7" } });
    fireEvent.mouseDown(parentSelect);
    const nounOption = await waitFor(() => {
      const option = document.querySelector<HTMLElement>(
        '.ant-select-item-option[title="名词"]'
      );
      if (!option) throw new Error("名词 选项尚未渲染");
      return option;
    });
    fireEvent.click(nounOption);
    expect(screen.getByLabelText("序号")).toHaveValue("7");
    fireEvent.mouseDown(parentSelect);
    fireEvent.click(
      document.querySelector<HTMLElement>(
        '.ant-select-item-option[title="动词"]'
      )!
    );
    fillSubForm({
      nameZh: "使役动词",
      nameEn: "Causative verb"
    });
    await waitFor(() =>
      expect(screen.getByLabelText("简洁显示")).toHaveValue("使役动词")
    );
    fireEvent.click(screen.getByText("新 建"));
    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith({
        partId: "pos-verb",
        input: expect.objectContaining({
          code: expect.stringMatching(/^SUB_[A-F0-9]{28}$/),
          name_zh: "使役动词",
          sort_order: 7
        })
      })
    );

    const verbRow = screen.getByText("及物动词").closest("tr")!;
    fireEvent.click(within(verbRow).getByText("修 改"));
    fillSubForm({ nameZh: "及物动词", nameEn: "Transitive verb" });
    fireEvent.click(screen.getByText("保 存"));
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith(
        expect.objectContaining({ partId: "pos-verb", subId: "sub-transitive" })
      )
    );
  });
});

describe("SubPartFormModal 表单默认值", () => {
  it("新建时序号预填在该父级现有细分词性之后，管理员可以改", async () => {
    const callbacks = renderPanel();
    callbacks.openCreate();

    await waitFor(() =>
      expect(screen.getByLabelText("序号")).toHaveValue("30")
    );
    expect(screen.queryByLabelText("编码")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("序号"), {
      target: { value: "15" }
    });
    fillSubForm({ nameZh: "物质名词", nameEn: "Mass noun" });
    // 简洁显示由正式中文异步派生，等它落定再提交，否则必填校验会拦下。
    await waitFor(() =>
      expect(screen.getByLabelText("简洁显示")).toHaveValue("物质名词")
    );
    fireEvent.click(screen.getByText("新 建"));
    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith(
        expect.objectContaining({
          partId: "pos-noun",
          input: expect.objectContaining({ sort_order: 15 })
        })
      )
    );
  });
});

describe("SubPartOfSpeechPanel 分页", () => {
  it("超过每页条数时前端分页，序号列显示排序值", async () => {
    const many = Array.from({ length: 12 }, (_, index) => ({
      ...subItems[1]!,
      id: `sub-many-${index}`,
      code: `N-MANY-${index}`,
      name_zh: `批量名词${index}`,
      name_en: `Bulk noun ${index}`,
      sort_order: (index + 1) * 10
    }));
    api.list.data = { items: many };
    renderPanel();

    expect(screen.getByText("共 12 条")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(11);
    expect(screen.queryByText("批量名词10")).toBeNull();

    fireEvent.click(screen.getByTitle("2"));
    expect(screen.getByText("批量名词10")).toBeVisible();
    const row = screen.getByText("批量名词10").closest("tr")!;
    expect(within(row).getByText("110")).toBeInTheDocument();
  });
});
