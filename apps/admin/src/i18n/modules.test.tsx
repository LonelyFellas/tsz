import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { createAdminI18n } from "./index";
import { InterfaceI18nProvider } from "@tsz/shared/i18n/react";
import { INTERFACE_LOCALES, type InterfaceLocale } from "@tsz/shared/i18n";
import {
  dashboardResources,
  useDashboardTranslation
} from "@/features/dashboard/i18n";
import {
  workspaceResources,
  useWorkspaceTranslation
} from "@/features/dictionary/i18n/workspace";

it("按模块加载的资源保持键、插值及复数形式完整", () => {
  const placeholders = (value: string) =>
    [...value.matchAll(/{{\s*(\w+)(?:,[^}]*)?}}/g)]
      .map((match) => match[1])
      .sort();
  const modules: Record<string, Record<string, Record<string, string>>>[] = [
    dashboardResources,
    workspaceResources
  ];
  for (const resources of modules) {
    const base = Object.values(resources["zh-Hans"]!)[0]!;
    for (const bundles of Object.values(resources)) {
      const messages = Object.values(bundles)[0]!;
      expect(Object.keys(messages).sort()).toEqual(Object.keys(base).sort());
      for (const key of Object.keys(base)) {
        expect(messages[key]!.trim(), key).not.toBe("");
        expect(placeholders(messages[key]!), key).toEqual(
          placeholders(base[key]!)
        );
      }
    }
  }
});

function DashboardProbe() {
  const { t } = useDashboardTranslation();
  return (
    <>
      <h1>{t("title")}</h1>
      <span>{t("task_count", { count: 1 })}</span>
      <span>{t("task_count", { count: 1000 })}</span>
    </>
  );
}
function EditorProbe() {
  const { t } = useWorkspaceTranslation();
  return (
    <>
      <h2>{t("forms")}</h2>
      <input aria-label="entry content" defaultValue="词条原文 centre" />
    </>
  );
}
it("模块资源不进入新建的登录实例，不在多个根节点间串语言，切换不重建输入", () => {
  const content = (locale: InterfaceLocale) => (
    <>
      <section data-testid="first">
        <InterfaceI18nProvider locale={locale}>
          <DashboardProbe />
          <EditorProbe />
        </InterfaceI18nProvider>
      </section>
      <section data-testid="second">
        <InterfaceI18nProvider locale="zh-Hant">
          <DashboardProbe />
        </InterfaceI18nProvider>
      </section>
    </>
  );
  const view = render(content("en-US"));
  const first = within(screen.getByTestId("first"));
  expect(first.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  expect(first.getByText("1 task")).toBeInTheDocument();
  expect(first.getByText("1,000 tasks")).toBeInTheDocument();
  const input = first.getByLabelText("entry content");
  fireEvent.change(input, { target: { value: "已输入中文与 English" } });
  for (const locale of INTERFACE_LOCALES) {
    view.rerender(content(locale));
    expect(first.getByLabelText("entry content")).toBe(input);
    expect(input).toHaveValue("已输入中文与 English");
    expect(
      within(screen.getByTestId("second")).getByRole("heading", {
        name: "工作台"
      })
    ).toBeInTheDocument();
  }
  const fresh = createAdminI18n("en-US");
  expect(fresh.hasResourceBundle("en", "adminDashboard")).toBe(false);
  expect(fresh.hasResourceBundle("en", "adminWorkspace")).toBe(false);
});
