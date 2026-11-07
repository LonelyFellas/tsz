import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Drawer, Modal } from "./dialog";

it.each(["modal", "drawer"] as const)(
  "%s 默认使用中文关闭名称并触发回调",
  (kind) => {
    const close = vi.fn();
    render(
      kind === "modal" ? (
        <Modal open title="详情" onCancel={close}>
          内容
        </Modal>
      ) : (
        <Drawer open title="详情" onClose={close}>
          内容
        </Drawer>
      )
    );
    const button = screen.getByRole("button", { name: "关闭" });
    expect(button).toHaveTextContent("×");
    fireEvent.click(button);
    expect(close).toHaveBeenCalledOnce();
  }
);
it("弹窗保留调用方提供的关闭名称及隐藏关闭按钮设置", () => {
  const view = render(
    <Modal open title="详情" closable={{ "aria-label": "关闭词条详情" }}>
      内容
    </Modal>
  );
  expect(
    screen.getByRole("button", { name: "关闭词条详情" })
  ).toBeInTheDocument();
  view.rerender(
    <Modal open title="详情" closable={false}>
      内容
    </Modal>
  );
  expect(
    screen.queryByRole("button", { name: /关闭/ })
  ).not.toBeInTheDocument();
});
