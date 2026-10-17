import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { expect, it } from "vitest";
import { SelectionPanel } from "./SelectionPanel";

it("允许浮层输入，Esc 关闭后焦点返回原编辑区而不关闭外部对话框", async () => {
  function Harness() {
    const [open, setOpen] = useState(true);
    return (
      <div role="dialog" aria-label="外部编辑器">
        <section className="tsz-ve-editor">
          <textarea
            className="tsz-ve-canvas-input"
            aria-label="原正文"
            defaultValue="hello"
          />
          <SelectionPanel
            open={open}
            content={<input aria-label="候选搜索" />}
            onDismiss={() => setOpen(false)}
          >
            <span>hello</span>
          </SelectionPanel>
        </section>
      </div>
    );
  }
  render(<Harness />);
  const field = await screen.findByLabelText("候选搜索");
  field.focus();
  fireEvent.change(field, { target: { value: "中文" } });
  expect(field).toHaveValue("中文");
  fireEvent.keyDown(field, { key: "Escape" });
  await waitFor(() => expect(screen.getByLabelText("原正文")).toHaveFocus());
  expect(
    screen.getByRole("dialog", { name: "外部编辑器" })
  ).toBeInTheDocument();
  expect(screen.queryByLabelText("候选搜索")).toBeNull();
});
