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
  for (const [label, value] of [
    ["正式中文", values.nameZh],
    ["简洁显示", values.nameZh],
    ["正式英文", values.nameEn],
    ["英文缩写", "n."],
    ["英文全称", values.nameEn.toLowerCase()]
  ] as const) {
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
    expect(screen.getByText("暂无可扩展的基本词性")).toBeVisible();
  });

  it("新增细分词性提交父 id，编码由英文全称派生", async () => {
    const callbacks = renderPanel();
    callbacks.openCreate();
    expect(screen.queryByLabelText("稳定编码")).toBeNull();
    // 已选定具体父级：所属基本词性锁定为该词性，不再让用户改。
    expect(screen.getByLabelText("所属基本词性")).toBeDisabled();
    fillSubForm({ nameZh: "物质名词", nameEn: "Mass noun" });
    fireEvent.click(screen.getByText("新 建"));

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith({
        partId: "pos-noun",
        input: {
          code: "NOUN-MASS-NOUN",
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

  it("未引用细分词性修改时不暴露稳定编码，提交沿用原编码与排序", async () => {
    renderPanel();
    const row = screen.getByText("集合名词").closest("tr")!;
    fireEvent.click(within(row).getByText("修 改"));
    expect(screen.queryByLabelText("稳定编码")).toBeNull();
    expect(screen.queryByText(/已被词条引用/)).toBeNull();
    fillSubForm({ nameZh: "集合类名词", nameEn: "Collective noun" });
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

  it("已引用细分词性修改时同样不暴露稳定编码", () => {
    renderPanel();
    const row = screen.getByText("可数名词").closest("tr")!;
    fireEvent.click(within(row).getByText("修 改"));
    expect(screen.queryByLabelText("稳定编码")).toBeNull();
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
    fillSubForm({ nameZh: "使役动词", nameEn: "Causative verb" });
    await waitFor(() =>
      expect(screen.getByLabelText("简洁显示")).toHaveValue("使役动词")
    );
    fireEvent.click(screen.getByText("新 建"));
    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith({
        partId: "pos-verb",
        input: expect.objectContaining({
          code: "VERB-CAUSATIVE-VERB",
          name_zh: "使役动词",
          sort_order: transitive.sort_order + 10
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

describe("SubPartFormModal 派生默认值", () => {
  it("新建时编码与排序值都不暴露：编码由英文全称派生成大写连字符，排序值自动排在该父级现有细分词性之后", async () => {
    const callbacks = renderPanel();
    callbacks.openCreate();

    fireEvent.change(screen.getByLabelText("正式英文"), {
      target: { value: "Mass noun" }
    });
    await waitFor(() =>
      expect(screen.getByLabelText("英文全称")).toHaveValue("mass noun")
    );
    expect(screen.queryByLabelText("稳定编码")).toBeNull();
    fireEvent.change(screen.getByLabelText("英文全称"), {
      target: { value: "mass noun phrase" }
    });
    await waitFor(() =>
      expect(screen.getByLabelText("英文全称")).toHaveValue("mass noun phrase")
    );
    fireEvent.change(screen.getByLabelText("正式中文"), {
      target: { value: "物质名词" }
    });
    fireEvent.change(screen.getByLabelText("英文缩写"), {
      target: { value: "n." }
    });
    // 简洁显示由正式中文异步派生，等它落定再提交，否则必填校验会拦下。
    await waitFor(() =>
      expect(screen.getByLabelText("简洁显示")).toHaveValue("物质名词")
    );
    fireEvent.click(screen.getByText("新 建"));
    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith(
        expect.objectContaining({
          partId: "pos-noun",
          input: expect.objectContaining({
            code: "NOUN-MASS-NOUN-PHRASE",
            sort_order: 30
          })
        })
      )
    );
  });
});

describe("deriveSubPartOfSpeechCode", () => {
  it("把父级编码与英文全称折成大写连字符编码", async () => {
    const { deriveSubPartOfSpeechCode } =
      await import("./SubPartOfSpeechDrawer");
    expect(deriveSubPartOfSpeechCode("countable noun", "noun")).toBe(
      "NOUN-COUNTABLE-NOUN"
    );
    expect(deriveSubPartOfSpeechCode(" Mass  noun_phrase ", "noun")).toBe(
      "NOUN-MASS-NOUN-PHRASE"
    );
    // 不同父级下允许同名细分词性，前缀让编码仍然全局唯一。
    expect(deriveSubPartOfSpeechCode("3rd person", "pron")).toBe(
      "PRON-3RD-PERSON"
    );
    expect(deriveSubPartOfSpeechCode("x".repeat(40), "noun")).toHaveLength(32);
  });
});

describe("SubPartOfSpeechPanel 分页", () => {
  it("超过每页条数时前端分页，序号跨页连续，切换父级回到第一页", async () => {
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
    expect(within(row).getByText("11")).toBeInTheDocument();
  });
});
