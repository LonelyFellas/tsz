import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { useState } from "react";
import {
  Checkbox,
  ColorPicker,
  Radio,
  Segmented,
  Slider,
  Switch
} from "./Choice";
import { AdminControls } from "../context";
import { Modal } from "../overlays/dialog";

it("保留布尔、数字值与受控回显，同一选项不会重复通知", () => {
  const change = vi.fn();
  const view = (value: boolean | number) => (
    <Radio.Group value={value} onChange={change} name="source">
      <Radio value={false}>否</Radio>
      <Radio value={0}>零</Radio>
    </Radio.Group>
  );
  const { rerender } = render(view(false));
  expect(screen.getByRole("radio", { name: "否" })).toBeChecked();
  fireEvent.click(screen.getByRole("radio", { name: "零" }));
  expect(change).toHaveBeenCalledOnce();
  expect(change.mock.lastCall![0].target).toEqual({
    value: 0,
    checked: true,
    name: "source"
  });
  expect(screen.getByRole("radio", { name: "否" })).toBeChecked();
  rerender(view(0));
  expect(screen.getByRole("radio", { name: "零" })).toBeChecked();
  fireEvent.click(screen.getByRole("radio", { name: "零" }));
  expect(change).toHaveBeenCalledOnce();
});

it("键盘在组内切换并跳过禁用项，原生表单提交所选值且 Enter 不提交", async () => {
  const user = userEvent.setup();
  const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
  function Example() {
    const [value, setValue] = useState("ipa");
    return (
      <form aria-label="配音" onSubmit={submit}>
        <Radio.Group
          name="source"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        >
          <Radio value="ipa">Azure IPA</Radio>
          <Radio value="disabled" disabled>
            禁用
          </Radio>
          <Radio value="spelling">词形拼写</Radio>
        </Radio.Group>
      </form>
    );
  }
  render(<Example />);
  await user.tab();
  expect(screen.getByRole("radio", { name: "Azure IPA" })).toHaveFocus();
  await user.keyboard("{ArrowRight>}");
  await waitFor(() =>
    expect(screen.getByRole("radio", { name: "词形拼写" })).toBeChecked()
  );
  expect(screen.getByRole("radio", { name: "词形拼写" })).toHaveFocus();
  await user.keyboard("{/ArrowRight}");
  expect(
    new FormData(screen.getByRole("form") as HTMLFormElement).get("source")
  ).toBe("spelling");
  await user.keyboard("{Enter}");
  expect(submit).not.toHaveBeenCalled();
  await user.keyboard("{ArrowRight>}");
  await waitFor(() =>
    expect(screen.getByRole("radio", { name: "Azure IPA" })).toBeChecked()
  );
  await user.keyboard("{/ArrowRight}");
});

it("按钮组外框与独立 Radio 标签均可点击，并继承表单禁用状态", () => {
  const change = vi.fn();
  const view = (disabled: boolean) => (
    <AdminControls componentDisabled={disabled}>
      <Radio.Group optionType="button" defaultValue="uk" onChange={change}>
        <Radio.Button value="uk">英式</Radio.Button>
        <Radio.Button value="us">美式</Radio.Button>
      </Radio.Group>
      <Radio defaultChecked={false} onChange={change}>
        独立单选
      </Radio>
    </AdminControls>
  );
  const { rerender } = render(view(false));
  fireEvent.click(
    screen
      .getByRole("radio", { name: "美式" })
      .closest(".ui-radio-button-wrapper")!
  );
  expect(screen.getByRole("radio", { name: "美式" })).toBeChecked();
  fireEvent.click(screen.getByText("独立单选"));
  expect(screen.getByRole("radio", { name: "独立单选" })).toBeChecked();
  expect(change).toHaveBeenCalledTimes(2);
  rerender(view(true));
  for (const radio of screen.getAllByRole("radio"))
    expect(radio).toBeDisabled();
  fireEvent.click(
    screen
      .getByRole("radio", { name: "英式" })
      .closest(".ui-radio-button-wrapper")!
  );
  expect(change).toHaveBeenCalledTimes(2);
});

it("滑块保留数值回调、小数步长和边界键盘操作", async () => {
  const user = userEvent.setup();
  const change = vi.fn();
  function Example() {
    const [value, setValue] = useState(0);
    return (
      <Slider
        ariaLabelForHandle="自由度"
        value={value}
        min={0}
        max={1}
        step={0.1}
        onChange={(next) => {
          change(next);
          setValue(next);
        }}
      />
    );
  }
  render(<Example />);
  const slider = screen.getByRole("slider", { name: "自由度" });
  expect(slider).not.toBeInstanceOf(HTMLInputElement);
  await user.tab();
  expect(slider).toHaveFocus();
  await user.keyboard("{ArrowRight}");
  expect(change).toHaveBeenLastCalledWith(0.1);
  expect(slider).toHaveAttribute("aria-valuenow", "0.1");
  await user.keyboard("{End}{ArrowRight}");
  expect(slider).toHaveAttribute("aria-valuenow", "1");
  expect(change).toHaveBeenCalledTimes(2);
  await user.keyboard("{Home}{ArrowLeft}");
  expect(slider).toHaveAttribute("aria-valuenow", "0");
  expect(change).toHaveBeenCalledTimes(3);
});

it("滑块遵循受控值并继承后台禁用状态", () => {
  const change = vi.fn();
  const view = (value: number, disabled: boolean) => (
    <AdminControls componentDisabled={disabled}>
      <Slider
        ariaLabelForHandle="自由度"
        value={value}
        step={0.1}
        onChange={change}
      />
    </AdminControls>
  );
  const { rerender } = render(view(52, false));
  const slider = screen.getByRole("slider", { name: "自由度" });
  fireEvent.keyDown(slider, { key: "ArrowRight" });
  expect(change).toHaveBeenLastCalledWith(52.1);
  expect(slider).toHaveAttribute("aria-valuenow", "52");
  rerender(view(52.1, true));
  expect(slider).toHaveAttribute("aria-valuenow", "52.1");
  expect(slider).toHaveAttribute("aria-disabled", "true");
  expect(slider).not.toHaveAttribute("tabindex", "0");
  change.mockClear();
  fireEvent.keyDown(slider, { key: "ArrowRight" });
  expect(change).not.toHaveBeenCalled();
});

it("复选框支持半选、键盘及原生表单值，每次切换只通知一次", async () => {
  const user = userEvent.setup();
  const change = vi.fn();
  const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
  function Example() {
    const [checked, setChecked] = useState(false);
    const [mixed, setMixed] = useState(true);
    return (
      <form aria-label="复选框表单" onSubmit={submit}>
        <Checkbox
          name="setting"
          value={0}
          checked={checked}
          indeterminate={mixed}
          onChange={(event) => {
            change(event);
            setChecked(event.target.checked);
            setMixed(false);
          }}
        >
          保存设置
        </Checkbox>
      </form>
    );
  }
  render(<Example />);
  const checkbox = screen.getByRole("checkbox", { name: "保存设置" });
  expect(checkbox).toBePartiallyChecked();
  expect(checkbox.tagName).toBe("BUTTON");
  await user.tab();
  expect(checkbox).toHaveFocus();
  await user.keyboard(" ");
  expect(checkbox).toBeChecked();
  expect(change).toHaveBeenCalledOnce();
  expect(change.mock.calls[0]![0].target).toEqual({
    checked: true,
    value: 0,
    name: "setting"
  });
  expect(
    new FormData(screen.getByRole("form") as HTMLFormElement).get("setting")
  ).toBe("0");
  expect(submit).not.toHaveBeenCalled();
  await user.click(screen.getByText("保存设置"));
  expect(checkbox).not.toBeChecked();
  expect(change).toHaveBeenCalledTimes(2);
});

it("复选框组保留布尔和数字值并继承禁用状态", () => {
  const change = vi.fn();
  function Example({ disabled = false }: { disabled?: boolean }) {
    const [values, setValues] = useState<(number | boolean)[]>([0]);
    return (
      <AdminControls componentDisabled={disabled}>
        <Checkbox.Group
          value={values}
          onChange={(next) => {
            change(next);
            setValues(next);
          }}
        >
          <Checkbox value={0}>零</Checkbox>
          <Checkbox value={false}>否</Checkbox>
        </Checkbox.Group>
      </AdminControls>
    );
  }
  const { rerender } = render(<Example />);
  fireEvent.click(screen.getByRole("checkbox", { name: "否" }));
  expect(change).toHaveBeenLastCalledWith([0, false]);
  fireEvent.click(screen.getByRole("checkbox", { name: "零" }));
  expect(change).toHaveBeenLastCalledWith([false]);
  rerender(<Example disabled />);
  expect(screen.getByRole("checkbox", { name: "否" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: "否" }));
  expect(change).toHaveBeenCalledTimes(2);
});

it("开关通过键盘切换并保留表单值，请求中禁止重复切换", async () => {
  const user = userEvent.setup();
  const change = vi.fn();
  function Example({ loading = false }: { loading?: boolean }) {
    const [checked, setChecked] = useState(false);
    return (
      <form aria-label="通知表单">
        <Switch
          name="notify"
          aria-label="通知"
          checked={checked}
          loading={loading}
          onChange={(next) => {
            change(next);
            setChecked(next);
          }}
        />
      </form>
    );
  }
  const { rerender } = render(<Example />);
  const control = screen.getByRole("switch", { name: "通知" });
  await user.tab();
  await user.keyboard(" ");
  expect(control).toBeChecked();
  expect(change).toHaveBeenLastCalledWith(true);
  expect(
    new FormData(screen.getByRole("form") as HTMLFormElement).get("notify")
  ).toBe("on");
  rerender(<Example loading />);
  expect(control).toBeDisabled();
  fireEvent.click(control);
  expect(change).toHaveBeenCalledOnce();
});

it("分段选择用方向键跳过禁用项，回调与表单值保持原有类型", async () => {
  const user = userEvent.setup();
  const change = vi.fn();
  function Example() {
    const [value, setValue] = useState(0);
    return (
      <form aria-label="分段表单">
        <Segmented
          name="position"
          value={value}
          options={[
            { value: 0, label: "左" },
            { value: 1, label: "中", disabled: true },
            { value: 2, label: "右" }
          ]}
          onChange={(next) => {
            change(next);
            setValue(next);
          }}
        />
      </form>
    );
  }
  render(<Example />);
  await user.tab();
  expect(screen.getByRole("radio", { name: "左" })).toHaveFocus();
  await user.keyboard("{ArrowRight}");
  await waitFor(() =>
    expect(screen.getByRole("radio", { name: "右" })).toBeChecked()
  );
  expect(change).toHaveBeenLastCalledWith(2);
  expect(
    new FormData(screen.getByRole("form") as HTMLFormElement).get("position")
  ).toBe("2");
  await user.click(screen.getByRole("radio", { name: "右" }));
  expect(change).toHaveBeenCalledOnce();
});

it("颜色弹层支持 HEX 和 RGB，非法输入不写入，Esc 关闭后返回触发按钮", async () => {
  const user = userEvent.setup();
  const change = vi.fn();
  const opened = vi.fn();
  const cancelModal = vi.fn();
  function Example() {
    const [value, setValue] = useState("#2053ff");
    return (
      <Modal open title="颜色设置" onCancel={cancelModal}>
        <ColorPicker
          aria-label="主题色"
          value={value}
          onOpenChange={opened}
          onChange={(color) => {
            change(color.toHexString());
            setValue(color.toHexString());
          }}
        />
      </Modal>
    );
  }
  render(<Example />);
  const trigger = screen.getByRole("button", { name: "主题色" });
  await user.click(trigger);
  const input = await screen.findByRole("textbox", { name: "主题色 HEX" });
  fireEvent.change(input, { target: { value: "#ff0011" } });
  expect(change).toHaveBeenLastCalledWith("#ff0011");
  expect(screen.getByRole("slider", { name: "主题色 R" })).toHaveAttribute(
    "aria-valuenow",
    "255"
  );
  fireEvent.change(input, { target: { value: "#xx" } });
  fireEvent.blur(input);
  expect(screen.getByRole("alert")).toBeVisible();
  expect(change).toHaveBeenCalledOnce();
  fireEvent.keyDown(screen.getByRole("slider", { name: "主题色 R" }), {
    key: "ArrowLeft"
  });
  expect(change).toHaveBeenLastCalledWith("#fe0011");
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "主题色" })).toBeNull()
  );
  expect(trigger).toHaveFocus();
  expect(cancelModal).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog", { name: "颜色设置" })).toBeVisible();
  expect(opened.mock.calls.map(([open]) => open)).toEqual([true, false]);
});
