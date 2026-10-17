import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AdminThemeProvider } from "@/mui-theme";
import { AdminTable } from "./AdminTable";

it("翻页保持 API 的 1 起始页码，调整条数回到第 1 页", () => {
  const change = vi.fn();
  render(
    <AdminThemeProvider>
      <AdminTable
        columns={[
          { id: "name", label: "名称", render: (row: { id: string }) => row.id }
        ]}
        rows={[{ id: "a" }]}
        rowId={(row) => row.id}
        pagination={{
          page: 2,
          pageSize: 10,
          total: 40,
          pageSizes: [10, 20],
          onChange: change
        }}
      />
    </AdminThemeProvider>
  );
  fireEvent.click(screen.getByRole("button", { name: "下一页" }));
  expect(change).toHaveBeenLastCalledWith(3, 10);
  fireEvent.mouseDown(screen.getByRole("combobox"));
  fireEvent.click(screen.getByRole("option", { name: "20" }));
  expect(change).toHaveBeenLastCalledWith(1, 20);
});
it("本页全选保留其他页选择，排除不可选行，取消本页选择不清空其他页", () => {
  const change = vi.fn();
  const rows = [
    { id: "a", disabled: false },
    { id: "super", disabled: true }
  ];
  const props = {
    rows,
    columns: [
      {
        id: "name",
        label: "名称",
        render: (row: (typeof rows)[number]) => row.id
      }
    ],
    rowId: (row: (typeof rows)[number]) => row.id
  };
  const view = render(
    <AdminTable
      {...props}
      selection={{
        ids: ["other-page"],
        onChange: change,
        disabled: (row) => row.disabled
      }}
    />
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "选择本页" }));
  expect(change).toHaveBeenLastCalledWith(["other-page", "a"]);
  expect(
    within(screen.getByText("super").closest("tr")!).getByRole("checkbox")
  ).toBeDisabled();
  view.rerender(
    <AdminTable
      {...props}
      selection={{
        ids: ["other-page", "a"],
        onChange: change,
        disabled: (row) => row.disabled
      }}
    />
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "选择本页" }));
  expect(change).toHaveBeenLastCalledWith(["other-page"]);
});

it("选择列实际宽度变化后，左侧固定列跟随边界避免遮住词头", () => {
  const OriginalResizeObserver = globalThis.ResizeObserver;
  let resize = () => {};
  globalThis.ResizeObserver = class implements ResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      resize = () => callback([], this);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  try {
    render(
      <AdminTable
        columns={[
          {
            id: "word",
            label: "词汇",
            width: 180,
            sticky: "left",
            render: () => "worker"
          }
        ]}
        rows={[{ id: "worker" }]}
        rowId={(row) => row.id}
        selection={{ ids: [], onChange: vi.fn() }}
      />
    );
    const selection = screen
      .getByRole("checkbox", { name: "选择本页" })
      .closest("th")!;
    const measure = vi.spyOn(selection, "getBoundingClientRect");
    const fixedCell = screen.getByText("worker").closest("td")!;
    for (const width of [76, 54]) {
      measure.mockReturnValue({ ...selection.getBoundingClientRect(), width });
      act(() => resize());
      expect(fixedCell).toHaveStyle({ left: `${width}px` });
      expect(screen.getByRole("columnheader", { name: "词汇" })).toHaveStyle({
        left: `${width}px`
      });
    }
  } finally {
    globalThis.ResizeObserver = OriginalResizeObserver;
  }
});
