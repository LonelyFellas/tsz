import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AdminControls } from "../context";
import { Input, InputNumber, Select } from "../forms";
import { Tooltip } from "../overlays";
import { Button } from "./controls";
import { Space, type Size } from "./layout";

it("组尺寸穿过浮层生效，保留显式覆盖、输入和上层禁用状态", () => {
  const action = vi.fn();
  const view = (size: Size, disabled = false) => (
    <AdminControls componentDisabled={disabled}>
      <Space.Compact size={size}>
        <Input aria-label="名称" defaultValue="初始值" />
        <InputNumber aria-label="数量" defaultValue={1} />
        <Select aria-label="类别" options={[]} />
        <Tooltip title="执行操作">
          <Button onClick={action}>执行</Button>
        </Tooltip>
        <Button size="large">独立尺寸</Button>
      </Space.Compact>
      <Button>组外操作</Button>
    </AdminControls>
  );
  const { rerender } = render(view("small"));
  expect(screen.getByLabelText("名称")).toHaveClass("ui-input-sm");
  expect(screen.getByLabelText("数量").closest(".ui-input-number")).toHaveClass(
    "ui-input-number-sm"
  );
  expect(screen.getByLabelText("类别").closest(".ui-select")).toHaveClass(
    "ui-select-sm"
  );
  expect(screen.getByRole("button", { name: "执行" })).toHaveClass("ui-btn-sm");
  expect(screen.getByRole("button", { name: "独立尺寸" })).toHaveClass(
    "ui-btn-lg"
  );
  expect(screen.getByRole("button", { name: "组外操作" })).toHaveClass(
    "ui-btn-middle"
  );
  fireEvent.change(screen.getByLabelText("名称"), {
    target: { value: "编辑中的值" }
  });
  rerender(view("large", true));
  expect(screen.getByLabelText("名称")).toHaveValue("编辑中的值");
  expect(screen.getByLabelText("名称")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "执行" }));
  expect(action).not.toHaveBeenCalled();
  rerender(view("large"));
  expect(screen.getByRole("button", { name: "执行" })).toHaveClass("ui-btn-lg");
  fireEvent.click(screen.getByRole("button", { name: "执行" }));
  expect(action).toHaveBeenCalledOnce();
});
