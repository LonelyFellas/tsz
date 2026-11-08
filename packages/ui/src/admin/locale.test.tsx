import { Empty, List } from "./display/surfaces";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import dayjs from "dayjs";
import { InterfaceI18nProvider } from "@tsz/shared/i18n/react";
import type { InterfaceLocale } from "@tsz/shared/i18n";
import { Input } from "./forms/Input";
import { DatePicker } from "./forms/DatePicker";
import { Select } from "./forms/Select";
import { Pagination } from "./table/Pagination";
import { Modal } from "./overlays/dialog";

it("切换语言更新控件和门户标签，保留输入、日期值与分页语义", async () => {
  const changed = vi.fn();
  const date = dayjs("2026-11-08T08:30:00");
  const originalLocale = dayjs.locale();
  const content = (locale: InterfaceLocale) => (
    <InterfaceI18nProvider locale={locale}>
      <Input.Password aria-label="draft" defaultValue="词条原文" />
      <Select
        aria-label="selected entry"
        allowClear
        defaultValue="entry-id"
        options={[{ value: "entry-id", label: "词条原文" }]}
      />
      <DatePicker value={date} onChange={changed} />
      <Pagination current={2} pageSize={10} total={30} onChange={changed} />
      <Modal open title="词条原文">
        <span>词条原文正文</span>
      </Modal>
    </InterfaceI18nProvider>
  );
  const view = render(content("en-GB"));
  expect(
    screen.getByRole("button", { name: "Show password" })
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Page 2" })).toHaveAttribute(
    "aria-current",
    "page"
  );
  expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  view.rerender(content("zh-Hant"));
  expect(screen.getByRole("button", { name: "清除" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
  expect(screen.getByLabelText("draft")).toHaveValue("词条原文");
  expect(screen.getByText("词条原文正文")).toBeInTheDocument();
  expect(screen.getByDisplayValue("2026-11-08")).toBeInTheDocument();
  expect(dayjs.locale()).toBe(originalLocale);
  expect(date.format("YYYY-MM-DD HH:mm")).toBe("2026-11-08 08:30");
  expect(changed).not.toHaveBeenCalled();
  view.rerender(content("en-US"));
  fireEvent.click(screen.getByRole("button", { name: "Page 3" }));
  expect(changed).toHaveBeenCalledWith(3, 10);
});

it("默认空状态随四语更新，调用方提供的原文和显式空描述保持原值", () => {
  const content = (locale: InterfaceLocale) => (
    <InterfaceI18nProvider locale={locale}>
      <section data-testid="list">
        <List dataSource={[]} renderItem={() => null} />
      </section>
      <Empty description="原始业务内容 centre" />
      <Empty data-testid="explicit-empty" description={null} />
    </InterfaceI18nProvider>
  );
  const view = render(content("zh-Hans"));
  const list = screen.getByTestId("list");
  for (const [locale, label] of [
    ["zh-Hans", "暂无数据"],
    ["zh-Hant", "暫無資料"],
    ["en-GB", "No data"],
    ["en-US", "No data"]
  ] as const) {
    view.rerender(content(locale));
    expect(list).toHaveTextContent(label);
    expect(screen.getByText("原始业务内容 centre")).toBeVisible();
    expect(
      screen
        .getByTestId("explicit-empty")
        .querySelector(".ui-empty-description")
    ).toBeEmptyDOMElement();
  }
});
