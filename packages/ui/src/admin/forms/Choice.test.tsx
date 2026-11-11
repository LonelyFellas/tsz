import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { useState } from "react";
import { Radio } from "./Choice";
import { AdminControls } from "../context";

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
