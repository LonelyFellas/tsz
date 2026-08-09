import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { App as AntApp } from "antd";
import type { PartOfSpeechConfig, SubPartOfSpeechConfig } from "@tsz/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SubPartOfSpeechPanel } from "./SubPartOfSpeechDrawer";

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
  useSubPartOfSpeechList: () => ({ ...api.list, refetch: api.refetch }),
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
  sort_order: 10,
  usage_count: 3,
  sub_part_count: 2,
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
  const view = render(
    <AntApp>
      <SubPartOfSpeechPanel
        parent={value ?? undefined}
        onSaved={onSaved}
        onError={onError}
      />
    </AntApp>
  );
  return { onSaved, onError, ...view };
}

function fillSubForm(values: {
  code?: string;
  nameZh: string;
  nameEn: string;
  sortOrder?: string;
}) {
  if (values.code) {
    fireEvent.change(screen.getByLabelText("稳定编码"), {
      target: { value: values.code }
    });
  }
  fireEvent.change(screen.getByLabelText("细分词性中文"), {
    target: { value: values.nameZh }
  });
  fireEvent.change(screen.getByLabelText("细分词性英文"), {
    target: { value: values.nameEn }
  });
  if (values.sortOrder) {
    fireEvent.change(screen.getByLabelText("排序值"), {
      target: { value: values.sortOrder }
    });
  }
}

async function findDeleteConfirm() {
  const titles = await screen.findAllByText("删除细分词性“集合名词”？");
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
    expect(screen.getByText("“名词”的细分词性")).toBeVisible();
    const referencedRow = screen.getByText("可数名词").closest("tr")!;
    expect(
      within(referencedRow).getByText("删 除").closest("button")
    ).toBeDisabled();
    visible.unmount();
    renderPanel(null);
    expect(screen.getByText("请先选择所属基本词性")).toBeVisible();
  });

  it("新增细分词性提交父 id 与稳定编码", async () => {
    const callbacks = renderPanel();
    fireEvent.click(screen.getByText("新增细分词性"));
    fillSubForm({
      code: "N-MASS",
      nameZh: "物质名词",
      nameEn: "Mass noun",
      sortOrder: "30"
    });
    fireEvent.click(screen.getByText("新 建"));

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith({
        partId: "pos-noun",
        input: {
          code: "N-MASS",
          name_zh: "物质名词",
          name_en: "Mass noun",
          sort_order: 30
        }
      })
    );
    expect(callbacks.onSaved).toHaveBeenCalledWith("细分词性已新增");
  });

  it("修改细分词性时编码只读并携带 revision", async () => {
    renderPanel();
    const row = screen.getByText("集合名词").closest("tr")!;
    fireEvent.click(within(row).getByText("修 改"));
    expect(screen.getByLabelText("稳定编码")).toBeDisabled();
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
          sort_order: 20
        }
      })
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
        subId: "sub-collective"
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
    fireEvent.click(screen.getByText("新增细分词性"));
    fillSubForm({ code: "N-MASS", nameZh: "物质名词", nameEn: "Mass noun" });
    fireEvent.click(screen.getByText("新 建"));
    await waitFor(() =>
      expect(callbacks.onError).toHaveBeenCalledWith(failure)
    );
    expect(screen.getByText("新增细分词性")).toBeVisible();
  });
});
