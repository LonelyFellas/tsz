import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AdminConnectionStatus } from "./AdminConnectionStatus";

const props = {
  connectionError: true,
  refreshUnconfirmed: false,
  retrying: false,
  onRetry: vi.fn()
};

afterEach(() => vi.restoreAllMocks());

it("正常连接时隐藏入口，恢复后关闭浮层，再次断线从收起状态显示", async () => {
  const view = render(
    <AdminConnectionStatus {...props} connectionError={false} />
  );
  expect(screen.queryByRole("button")).toBeNull();
  view.rerender(<AdminConnectionStatus {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "无法连接" }));
  expect(await screen.findByRole("button", { name: "重试" })).toBeVisible();
  view.rerender(<AdminConnectionStatus {...props} connectionError={false} />);
  expect(screen.queryByRole("button")).toBeNull();
  view.rerender(<AdminConnectionStatus {...props} />);
  expect(screen.getByRole("button", { name: "无法连接" })).toHaveAttribute(
    "aria-expanded",
    "false"
  );
  expect(screen.queryByRole("button", { name: "重试" })).toBeNull();
});

it("区分浏览器离线和服务连接失败，网络事件只更新提示，不额外调用恢复逻辑", async () => {
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  const retry = vi.fn();
  render(<AdminConnectionStatus {...props} onRetry={retry} />);
  const trigger = screen.getByRole("button", { name: "离线" });
  fireEvent.click(trigger);
  expect(
    await screen.findByRole("heading", { name: "网络已断开" })
  ).toBeInTheDocument();
  online.mockReturnValue(true);
  act(() => window.dispatchEvent(new Event("online")));
  expect(trigger).toHaveAccessibleName("无法连接");
  expect(
    screen.getByRole("heading", { name: "暂时无法连接" })
  ).toBeInTheDocument();
  expect(retry).not.toHaveBeenCalled();
});

it("会话未确认时保留整页重新登录入口，不把它当作普通断线重试", async () => {
  const assign = vi.fn();
  const location = window.location;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { assign }
  });
  const retry = vi.fn();
  try {
    render(
      <AdminConnectionStatus {...props} refreshUnconfirmed onRetry={retry} />
    );
    fireEvent.click(screen.getByRole("button", { name: "请重新登录" }));
    fireEvent.click(await screen.findByRole("button", { name: "重新登录" }));
    expect(assign).toHaveBeenCalledWith("/login");
    expect(retry).not.toHaveBeenCalled();
  } finally {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: location
    });
  }
});

it("从浮层按 Escape 关闭后将焦点归还状态入口", async () => {
  render(<AdminConnectionStatus {...props} />);
  const trigger = screen.getByRole("button", { name: "无法连接" });
  fireEvent.click(trigger);
  const retry = await screen.findByRole("button", { name: "重试" });
  retry.focus();
  fireEvent.keyDown(retry, { key: "Escape" });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(trigger).toHaveFocus();
  expect(screen.queryByRole("button", { name: "重试" })).toBeNull();
});
