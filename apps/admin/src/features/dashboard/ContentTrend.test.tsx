import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { ContentTrend, weekEnd } from "./ContentTrend";
import { InterfaceI18nProvider } from "@tsz/shared/i18n/react";
vi.mock("@/lib/auth", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ profile: { id: "admin", role: "super_admin", permissions: [] } })
}));
const data = [
  { week_start: "2026-10-26", value: 133 },
  { week_start: "2026-11-02", value: 489 }
];
it("切换语言保留表格模式与选中周，链接继续使用北京时间筛选", () => {
  const content = (locale: "zh-Hans" | "en-US") => (
    <InterfaceI18nProvider locale={locale}>
      <MemoryRouter>
        <ContentTrend data={data} generatedAt="2026-11-07T10:00:00Z" />
      </MemoryRouter>
    </InterfaceI18nProvider>
  );
  const view = render(content("zh-Hans"));
  fireEvent.click(screen.getByRole("button", { name: "查看 2026-10-26 当周" }));
  fireEvent.click(screen.getByRole("button", { name: "数据" }));
  view.rerender(content("en-US"));
  expect(screen.getByRole("table")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "View week starting 2026-10-26" })
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    screen.getByRole("link", { name: "View entries for this week →" })
  ).toHaveAttribute(
    "href",
    "/words?created_from=2026-10-26&created_to=2026-11-01&created_timezone=Asia%2FShanghai"
  );
});
it("按北京时间标记本周，选择历史周同步数量与词库筛选入口", () => {
  render(
    <MemoryRouter>
      <ContentTrend data={data} generatedAt="2026-11-07T10:00:00Z" />
    </MemoryRouter>
  );
  expect(screen.getByText("本周 · 进行中")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "查看该周词条 →" })).toHaveAttribute(
    "href",
    "/words?created_from=2026-11-02&created_to=2026-11-08&created_timezone=Asia%2FShanghai"
  );
  fireEvent.click(screen.getByRole("button", { name: "查看 2026-10-26 当周" }));
  expect(screen.getByText("133")).toBeInTheDocument();
  expect(screen.queryByText("本周 · 进行中")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "查看该周词条 →" })).toHaveAttribute(
    "href",
    "/words?created_from=2026-10-26&created_to=2026-11-01&created_timezone=Asia%2FShanghai"
  );
  fireEvent.click(screen.getByRole("button", { name: "数据" }));
  expect(screen.getByRole("table")).toHaveTextContent("2026-10-26");
  fireEvent.click(screen.getByRole("button", { name: "2026-11-02" }));
  expect(
    screen.getByRole("button", { name: "查看 2026-11-02 当周" })
  ).toHaveAttribute("aria-pressed", "true");
});
it("周结束日期跨月跨年仍准确", () => {
  expect(weekEnd("2026-12-28")).toBe("2027-01-03");
});
it("空序列保留空状态与数据表入口，不生成虚假数量和跳转", () => {
  render(
    <MemoryRouter>
      <ContentTrend data={[]} />
    </MemoryRouter>
  );
  expect(screen.getByText("近六周暂无新增词条")).toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "数据" }));
  expect(screen.getByRole("table")).toBeInTheDocument();
});
