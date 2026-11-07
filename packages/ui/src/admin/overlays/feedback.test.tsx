import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./feedback";

describe("后台确认弹窗", () => {
  it("失败后仍可重试，等待请求时重复点击只提交一次", async () => {
    let reject!: (reason: Error) => void;
    const submit = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((_, fail) => {
            reject = fail;
          })
      )
      .mockResolvedValueOnce(undefined);
    function Action() {
      const { modal } = App.useApp();
      return (
        <button onClick={() => modal.confirm({ title: "发布", onOk: submit })}>
          检查
        </button>
      );
    }
    render(
      <App>
        <Action />
      </App>
    );
    fireEvent.click(screen.getByRole("button", { name: "检查" }));
    const dialog = within(await screen.findByRole("dialog", { name: "发布" }));
    const ok = dialog.getByRole("button", { name: "确定" });
    fireEvent.click(ok);
    fireEvent.click(ok);
    expect(submit).toHaveBeenCalledTimes(1);
    await act(async () => reject(new Error("离线")));
    fireEvent.click(dialog.getByRole("button", { name: "确定" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it("更换账号后，旧请求完成时不能将该账号的信息重新弹出", async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    function Action() {
      const { notification } = App.useApp();
      return (
        <button
          onClick={() =>
            void pending.then(() =>
              notification.success({ title: "旧账号信息" })
            )
          }
        >
          获取结果
        </button>
      );
    }
    const view = render(
      <App key="first">
        <Action />
      </App>
    );
    fireEvent.click(screen.getByRole("button", { name: "获取结果" }));
    view.rerender(
      <App key="second">
        <Action />
      </App>
    );
    await act(async () => {
      finish();
      await pending;
    });
    expect(screen.queryByText("旧账号信息")).not.toBeInTheDocument();
  });
});
