import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AdminThemeProvider } from "@/mui-theme";
import { DateRangeField } from "./DateRangeField";

it("开始日期不会发出半成品范围，结束日期选定后才提交，清空显式提交 null", async () => {
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    matches: true,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true
  }));
  const change = vi.fn();
  render(
    <AdminThemeProvider>
      <DateRangeField value={null} onChange={change} />
    </AdminThemeProvider>
  );
  fireEvent.click(screen.getAllByRole("button", { name: "选择日期" })[0]!);
  fireEvent.click(await screen.findByRole("gridcell", { name: "15" }));
  expect(change).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByRole("grid")).toBeNull());
  fireEvent.click(
    screen.getAllByRole("button", { name: /选择日期|所选日期/ })[1]!
  );
  fireEvent.click(await screen.findByRole("gridcell", { name: "15" }));
  expect(change).toHaveBeenCalledTimes(1);
  const range = change.mock.calls[0]![0];
  expect(range[0].isValid() && range[1].isValid()).toBe(true);
  expect(range[0].isAfter(range[1])).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "清空日期" }));
  expect(change).toHaveBeenLastCalledWith(null);
  vi.restoreAllMocks();
});

it.each([
  { label: "窄屏精细指针", wide: false, finePointer: true },
  { label: "宽屏触摸", wide: true, finePointer: false }
])(
  "$label 使用移动端日期时间弹层确认有效范围",
  async ({ wide, finePointer }) => {
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      matches:
        (!query.includes("min-width: 600px") || wide) &&
        (!query.includes("pointer: fine") || finePointer),
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => true
    }));
    const change = vi.fn();
    render(
      <AdminThemeProvider>
        <DateRangeField withTime size="small" value={null} onChange={change} />
      </AdminThemeProvider>
    );
    for (const index of [0, 1]) {
      fireEvent.click(
        screen.getAllByRole("button", { name: /^选择日期/ })[index]!
      );
      const dialog = await screen.findByRole("dialog", {
        name: "选择日期和时间"
      });
      fireEvent.click(within(dialog).getByRole("gridcell", { name: "15" }));
      fireEvent.click(within(dialog).getByRole("tab", { name: "选择时间" }));
      fireEvent.click(within(dialog).getByRole("button", { name: "确认" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      if (index === 0) expect(change).not.toHaveBeenCalled();
    }
    const range = change.mock.lastCall![0];
    expect(range[0].isValid() && range[1].isValid()).toBe(true);
    expect(range[0].isAfter(range[1])).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "清空日期" }));
    expect(change).toHaveBeenLastCalledWith(null);
    vi.restoreAllMocks();
  }
);
