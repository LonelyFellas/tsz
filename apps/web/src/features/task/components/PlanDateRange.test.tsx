import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { PlanDateRange, type PlanDates } from "./PlanDateRange";

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(
    new Date("2026-11-02T00:00:00Z").getTime()
  );
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});

it("starts a new range for an earlier second date and permits a single learning day", () => {
  const change = vi.fn();
  render(<PlanDateRange value={null} disabled={false} onChange={change} />);
  fireEvent.click(screen.getByRole("button", { name: /不限日期/ }));
  const dialog = screen.getByRole("dialog");
  const day = (date: number) =>
    within(dialog).getByRole("button", { name: `2026年11月${date}日` });
  fireEvent.click(day(10));
  fireEvent.click(day(2));
  expect(
    within(dialog).getByRole("button", { name: "应用日期" })
  ).toBeDisabled();
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(day(2));
  fireEvent.click(within(dialog).getByRole("button", { name: "应用日期" }));
  expect(change).toHaveBeenCalledExactlyOnceWith({
    start_date: "2026-11-02",
    end_date: "2026-11-02"
  });
});

it("moves keyboard focus across a month boundary without committing the draft and restores the trigger on cancel", () => {
  const change = vi.fn();
  render(
    <PlanDateRange
      value={{ start_date: "2028-02-28", end_date: "2028-03-03" }}
      disabled={false}
      onChange={change}
    />
  );
  const trigger = screen.getByRole("button", { name: /2028\/02\/28/ });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = screen.getByRole("dialog");
  fireEvent.keyDown(
    within(dialog).getByRole("button", { name: "2028年2月28日" }),
    { key: "ArrowRight" }
  );
  expect(
    within(dialog).getByRole("button", { name: "2028年2月29日" })
  ).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
  expect(
    within(dialog).getByRole("button", { name: "2028年3月1日" })
  ).toHaveFocus();
  fireEvent.click(document.activeElement!);
  fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
  expect(change).not.toHaveBeenCalled();
  expect(trigger).toHaveFocus();
});

it("counts shortcut dates inclusively using the Beijing 04:00 boundary and supports explicit clearing", () => {
  vi.spyOn(Date, "now").mockReturnValue(
    new Date("2026-11-01T19:59:59Z").getTime()
  );
  const change = vi.fn();
  function Form() {
    const [value, setValue] = useState<PlanDates | null>(null);
    return (
      <PlanDateRange
        value={value}
        disabled={false}
        onChange={(next) => {
          change(next);
          setValue(next);
        }}
      />
    );
  }
  render(<Form />);
  fireEvent.click(screen.getByRole("button", { name: /不限日期/ }));
  fireEvent.click(screen.getByRole("button", { name: "未来 7 天" }));
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "应用日期" }));
  expect(change).toHaveBeenLastCalledWith({
    start_date: "2026-11-01",
    end_date: "2026-11-07"
  });
  fireEvent.click(screen.getByRole("button", { name: "清除日期" }));
  expect(change).toHaveBeenLastCalledWith(null);
  expect(screen.getByRole("button", { name: /不限日期/ })).toBeInTheDocument();
});
