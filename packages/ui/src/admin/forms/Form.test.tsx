import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Form } from "./Form";

it.each([
  [undefined, "请填写业务单号"],
  [{ required: "缺少${label}" }, "缺少业务单号"]
] as const)(
  "必填提示使用字段标签并接受表单覆盖",
  async (messages, expected) => {
    render(
      <Form validateMessages={messages}>
        <Form.Item
          name="event_id"
          label="业务单号"
          rules={[{ required: true }]}
        >
          <input />
        </Form.Item>
        <button type="submit">提交</button>
      </Form>
    );
    fireEvent.click(screen.getByRole("button", { name: "提交" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(expected);
  }
);
