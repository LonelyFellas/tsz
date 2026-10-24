import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AccountMenuPopoverProps } from "./AccountMenuPopover";

const loader = vi.hoisted(() => ({
  called: vi.fn(),
  pending: undefined as
    | Promise<{ AccountMenuPopover: ComponentType<AccountMenuPopoverProps> }>
    | undefined,
  resolve: undefined as
    | ((module: {
        AccountMenuPopover: ComponentType<AccountMenuPopoverProps>;
      }) => void)
    | undefined,
  reject: undefined as ((error: Error) => void) | undefined
}));

beforeEach(() => {
  vi.resetModules();
  vi.doMock("./AccountMenuPopover", () => {
    loader.called();
    return loader.pending!;
  });
  loader.called.mockClear();
  loader.pending = new Promise((resolve, reject) => {
    loader.resolve = resolve;
    loader.reject = reject;
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function mount(
  props: Pick<
    AccountMenuPopoverProps,
    "open" | "onOpenChange" | "disableHover"
  > = {}
) {
  const { useUserStore } = await import("@/stores/user");
  useUserStore.setState({
    user: {
      id: "u1",
      display_name: "Alice",
      avatar_url: "",
      roles: ["student"],
      active_role: "student"
    },
    hydrated: true
  });
  const { AccountMenu } = await import("./AccountMenu");
  const view = render(<AccountMenu {...props} />);
  return { store: useUserStore, view, AccountMenu };
}
function LoadedMenu(props: AccountMenuPopoverProps) {
  return (
    <div
      role="menu"
      data-hover={String(props.initialHover)}
      data-open={String(props.initialOpen)}
      data-keyboard={String(props.initialKeyboard)}
    />
  );
}
async function finishLoad() {
  await waitFor(() => expect(loader.called).toHaveBeenCalledTimes(1));
  await act(async () => loader.resolve?.({ AccountMenuPopover: LoadedMenu }));
}

it("首屏不加载菜单模块，首次点击等待加载后打开；重复意图合并下载", async () => {
  await mount();
  const trigger = screen.getByRole("button", { name: "账户菜单" });
  expect(loader.called).not.toHaveBeenCalled();
  fireEvent.click(trigger, { detail: 0 });
  fireEvent.click(trigger, { detail: 0 });
  expect(trigger).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("status")).toHaveTextContent("正在加载账户菜单");
  await finishLoad();
  expect(screen.getByRole("menu")).toHaveAttribute("data-open", "true");
  expect(screen.getByRole("menu")).toHaveAttribute("data-hover", "false");
});

it("键盘聚焦只预加载，ArrowDown 再打开", async () => {
  await mount();
  const trigger = screen.getByRole("button", { name: "账户菜单" });
  act(() => trigger.focus());
  await finishLoad();
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  expect(await screen.findByRole("menu")).toHaveAttribute(
    "data-hover",
    "false"
  );
});

it("快速离开头像时取消悬停展开，迟到模块不能打开菜单", async () => {
  await mount();
  const trigger = screen.getByRole("button", { name: "账户菜单" });
  const over = new MouseEvent("pointerover", { bubbles: true });
  Object.defineProperty(over, "pointerType", { value: "mouse" });
  fireEvent(trigger, over);
  fireEvent.pointerOut(trigger);
  await finishLoad();
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

it("悬停等待后的模块以不抢焦点的模式展开", async () => {
  await mount();
  const trigger = screen.getByRole("button", { name: "账户菜单" });
  const over = new MouseEvent("pointerover", { bubbles: true });
  Object.defineProperty(over, "pointerType", { value: "mouse" });
  fireEvent(trigger, over);
  await finishLoad();
  expect(await screen.findByRole("menu")).toHaveAttribute("data-hover", "true");
});

it("父级切换到其他面板时取消下载中的展开意图", async () => {
  const { view, AccountMenu } = await mount({ open: true });
  const trigger = screen.getByRole("button", { name: "账户菜单" });
  fireEvent.click(trigger, { detail: 0 });
  await waitFor(() => expect(loader.called).toHaveBeenCalledOnce());
  view.rerender(<AccountMenu open={false} disableHover />);
  await act(async () => loader.resolve?.({ AccountMenuPopover: LoadedMenu }));
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

it("下载中切换账号，迟到结果不能展开旧账号菜单", async () => {
  const { store } = await mount();
  fireEvent.click(screen.getByRole("button", { name: "账户菜单" }), {
    detail: 0
  });
  await waitFor(() => expect(loader.called).toHaveBeenCalledTimes(1));
  act(() =>
    store.setState({
      user: {
        id: "u2",
        display_name: "Bob",
        avatar_url: "",
        roles: ["student"],
        active_role: "student"
      }
    })
  );
  await act(async () => loader.resolve?.({ AccountMenuPopover: LoadedMenu }));
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "账户菜单" })).toHaveAttribute(
    "aria-busy",
    "false"
  );
  expect(screen.getByText("B")).toBeInTheDocument();
});

it("失焦取消等待，加载失败保留头像并交给资源恢复提示", async () => {
  await mount();
  const recovered = vi.fn();
  window.addEventListener("tsz:resource-error", recovered);
  try {
    const trigger = screen.getByRole("button", { name: "账户菜单" });
    fireEvent.click(trigger, { detail: 0 });
    await waitFor(() => expect(loader.called).toHaveBeenCalledTimes(1));
    fireEvent.blur(trigger);
    await act(async () => loader.reject?.(new Error("chunk failed")));
    expect(recovered).not.toHaveBeenCalled();
    fireEvent.click(trigger, { detail: 0 });
    await waitFor(() => expect(recovered).toHaveBeenCalledTimes(1));
    expect(trigger).toHaveAttribute("aria-busy", "false");
  } finally {
    window.removeEventListener("tsz:resource-error", recovered);
  }
});

it("触摸按下直接打开，加载期间有反馈且不冒充键盘操作", async () => {
  await mount();
  const trigger = screen.getByRole("button", { name: "账户菜单" });
  const down = new MouseEvent("pointerdown", {
    bubbles: true,
    cancelable: true,
    button: 0
  });
  Object.defineProperty(down, "pointerType", { value: "touch" });
  fireEvent(trigger, down);
  expect(trigger).toHaveAttribute("aria-busy", "true");
  await finishLoad();
  expect(screen.getByRole("menu")).toHaveAttribute("data-hover", "false");
  expect(screen.getByRole("menu")).toHaveAttribute("data-keyboard", "false");
});

for (const action of ["outside", "escape"] as const) {
  it(`首次指针打开尚未聚焦，${action} 仍取消迟到菜单且不抢输入焦点`, async () => {
    await mount();
    render(<input aria-label="其他输入" />);
    const input = screen.getByRole("textbox", { name: "其他输入" });
    const trigger = screen.getByRole("button", { name: "账户菜单" });
    fireEvent(
      trigger,
      new MouseEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        button: 0
      })
    );
    expect(trigger).not.toHaveFocus();
    expect(trigger).toHaveAttribute("aria-busy", "true");
    if (action === "outside") fireEvent.pointerDown(input);
    else fireEvent.keyDown(document, { key: "Escape" });
    act(() => input.focus());
    await finishLoad();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-busy", "false");
    expect(input).toHaveFocus();
  });
}
