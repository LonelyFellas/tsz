import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigProvider } from "antd";
import { AdminTable, type AdminTableProps } from "./AdminTable";

type Row = { id: string; name: string; status: string };
const columns: AdminTableProps<Row>["columns"] = [
  {
    title: "名称",
    dataIndex: "name",
    width: 140,
    sorter: (a, b) => a.name.localeCompare(b.name)
  },
  { title: <span>状态</span>, dataIndex: "status", width: 120 },
  {
    title: "操作",
    key: "actions",
    fixed: "right",
    width: 100,
    render: (_, row) => <button>编辑{row.name}</button>
  }
];
const rows: Row[] = [
  { id: "1", name: "甲", status: "已启用" },
  { id: "2", name: "乙", status: "已禁用" }
];
function table(props: Partial<AdminTableProps<Row>> = {}) {
  return (
    <AdminTable
      tableId="test-table"
      columns={columns}
      rowKey="id"
      dataSource={rows}
      pagination={false}
      {...props}
    />
  );
}
function renderTable(element: React.ReactNode) {
  return render(element, {
    wrapper: ({ children }) => (
      <ConfigProvider theme={{ token: { motion: false } }}>
        {children}
      </ConfigProvider>
    )
  });
}
function headers() {
  return screen
    .getAllByRole("columnheader")
    .map((element) => element.textContent);
}
function settings() {
  fireEvent.click(screen.getByRole("button", { name: /列设置/ }));
  return screen.getByRole("region", { name: "表格列设置" });
}
function pin(label: string, position: "固定到左侧" | "不固定" | "固定到右侧") {
  const labels = { 固定到左侧: "左侧", 不固定: "不固定", 固定到右侧: "右侧" };
  fireEvent.click(
    within(
      screen.getByRole("radiogroup", { name: `${label}固定位置` })
    ).getByRole("radio", { name: labels[position] })
  );
}

beforeEach(() => localStorage.clear());

describe("AdminTable", () => {
  it("显隐、移动和固定立即生效，刷新恢复，并可恢复默认", () => {
    const view = renderTable(table());
    const panel = settings();
    fireEvent.click(within(panel).getByRole("checkbox", { name: "状态" }));
    expect(headers()).toEqual(["名称", "操作"]);
    expect(within(panel).getByText("2 / 3 列")).toBeInTheDocument();
    expect(screen.queryByText("已启用")).not.toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("checkbox", { name: "状态" }));
    const source = within(panel).getByRole("button", { name: "拖动状态排序" });
    const target = within(panel).getByRole("button", { name: "拖动名称排序" });
    const dataTransfer = { setData: vi.fn(), setDragImage: vi.fn() };
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });
    fireEvent.dragEnd(source);
    expect(headers()).toEqual(["状态", "名称", "操作"]);
    pin("名称", "固定到左侧");
    expect(
      within(
        screen.getByRole("radiogroup", { name: "名称固定位置" })
      ).getByRole("radio", { name: "左侧" })
    ).toHaveFocus();
    expect(
      within(panel).getByRole("group", { name: "左侧固定列" })
    ).toContainElement(within(panel).getByRole("checkbox", { name: "名称" }));
    pin("状态", "固定到右侧");
    expect(
      within(panel).getByRole("group", { name: "右侧固定列" })
    ).toContainElement(within(panel).getByRole("checkbox", { name: "状态" }));
    expect(headers()).toEqual(["名称", "状态", "操作"]);
    expect(screen.getByRole("columnheader", { name: "名称" })).toHaveClass(
      "ant-table-cell-fix-start"
    );
    expect(screen.getByRole("columnheader", { name: "状态" })).toHaveClass(
      "ant-table-cell-fix-end"
    );
    view.unmount();
    renderTable(table());
    expect(screen.getByRole("columnheader", { name: "状态" })).toHaveClass(
      "ant-table-cell-fix-end"
    );
    const restoredPanel = settings();
    pin("名称", "不固定");
    expect(screen.getByRole("columnheader", { name: "名称" })).not.toHaveClass(
      "ant-table-cell-fix-start"
    );
    fireEvent.click(
      within(restoredPanel).getByRole("button", { name: "恢复默认" })
    );
    expect(headers()).toEqual(["名称", "状态", "操作"]);
    expect(screen.getByRole("columnheader", { name: "状态" })).not.toHaveClass(
      "ant-table-cell-fix-end"
    );
    expect(
      localStorage.getItem("tsz:admin:table-columns:v1:test-table")
    ).toBeNull();
  });

  it("取消拖动和跨固定分区放置不改顺序，手柄仍支持键盘排序", () => {
    renderTable(table());
    const panel = settings();
    const source = within(panel).getByRole("button", { name: "拖动状态排序" });
    const target = within(panel).getByRole("button", { name: "拖动名称排序" });
    const fixed = within(panel).getByRole("button", { name: "拖动操作排序" });
    const dataTransfer = { setData: vi.fn(), setDragImage: vi.fn() };
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.dragEnd(source);
    fireEvent.drop(target, { dataTransfer });
    expect(headers()).toEqual(["名称", "状态", "操作"]);
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragOver(fixed, { dataTransfer });
    fireEvent.drop(fixed, { dataTransfer });
    fireEvent.dragEnd(source);
    expect(headers()).toEqual(["名称", "状态", "操作"]);
    expect(fixed).toBeDisabled();
    fireEvent.keyDown(source, { key: "ArrowUp" });
    expect(headers()).toEqual(["状态", "名称", "操作"]);
    fireEvent.keyDown(source, { key: "ArrowDown" });
    expect(headers()).toEqual(["名称", "状态", "操作"]);
  });

  it("每张表独立保存，同一表的多个实例同步，至少保留一列", () => {
    const view = renderTable(table());
    const panel = settings();
    fireEvent.click(within(panel).getByRole("checkbox", { name: "状态" }));
    fireEvent.click(within(panel).getByRole("checkbox", { name: "操作" }));
    expect(
      within(panel).getByRole("checkbox", { name: "名称" })
    ).toBeDisabled();
    view.rerender(
      <>
        {table()}
        {table()}
      </>
    );
    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: /列设置/ })[0]!);
    fireEvent.click(screen.getByRole("checkbox", { name: "状态" }));
    expect(screen.getAllByRole("columnheader")).toHaveLength(4);
    view.rerender(table({ tableId: "another-table" }));
    expect(headers()).toEqual(["名称", "状态", "操作"]);
    view.rerender(table());
    expect(headers()).toEqual(["名称", "状态"]);
  });

  it("禁用本地存储时仍可调整列", () => {
    const get = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    const set = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    try {
      renderTable(table());
      fireEvent.click(
        within(settings()).getByRole("checkbox", { name: "状态" })
      );
      expect(headers()).toEqual(["名称", "操作"]);
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });

  it("调整列后保留行选择、业务操作及服务端分页回调", () => {
    const onPage = vi.fn();
    const onSelection = vi.fn();
    renderTable(
      table({
        toolbar: <span>表格操作</span>,
        rowSelection: { onChange: onSelection },
        pagination: { current: 1, pageSize: 2, total: 4, onChange: onPage }
      })
    );
    expect(
      within(screen.getByRole("group", { name: "表格操作" })).getByRole(
        "button",
        { name: /列设置/ }
      )
    ).toBeInTheDocument();
    const panel = settings();
    fireEvent.click(within(panel).getByRole("checkbox", { name: "状态" }));
    fireEvent.click(screen.getByRole("button", { name: /列设置/ }));
    fireEvent.click(
      within(screen.getByRole("table")).getAllByRole("checkbox")[1]!
    );
    expect(onSelection).toHaveBeenCalledWith(
      ["1"],
      [rows[0]],
      expect.anything()
    );
    expect(screen.getByRole("button", { name: "编辑甲" })).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("2"));
    expect(onPage).toHaveBeenCalledWith(2, 2);
  });
});
