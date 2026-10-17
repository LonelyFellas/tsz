import { fireEvent, render, screen, within } from "@testing-library/react";
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
