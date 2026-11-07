import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { Modal } from "./dialog";
import { Dropdown, Popover } from "./floating";
import { Typography } from "../display/typography";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("弹窗内用键盘打开菜单，Escape 先关闭菜单并还原焦点，再关闭弹窗", async () => {
  // Headless Portal 在 test 模式给所有浮层分配同一个 ID；嵌套 Escape 必须用真实 ID 顺序验收。
  vi.stubEnv("NODE_ENV", "development");
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  function Host() {
    const [open, setOpen] = useState(true);
    return (
      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        title="编辑词条"
        footer={null}
      >
        <Dropdown
          trigger={["click"]}
          menu={{ items: [{ key: "item", label: "编辑" }] }}
        >
          <button>更多</button>
        </Dropdown>
      </Modal>
    );
  }
  render(<Host />);
  const trigger = screen.getByRole("button", { name: "更多" });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  const item = await screen.findByRole("menuitem", { name: "编辑" });
  await waitFor(() => expect(item).toHaveFocus());
  fireEvent.keyDown(item, { key: "Escape", keyCode: 27 });
  await waitFor(() => expect(screen.queryByRole("menuitem")).toBeNull());
  expect(trigger).toHaveFocus();
  expect(screen.getByRole("dialog", { name: "编辑词条" })).toBeVisible();
  fireEvent.keyDown(trigger, { key: "Escape", keyCode: 27 });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("文字节点能作为浮层的实际锚点", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  render(
    <Popover trigger="click" content="完整英文名称">
      <Typography.Paragraph>英文名称</Typography.Paragraph>
    </Popover>
  );
  fireEvent.click(screen.getByText("英文名称"));
  expect(await screen.findByText("完整英文名称")).toBeVisible();
});
