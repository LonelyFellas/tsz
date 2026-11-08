import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InterfaceI18nProvider, useTranslation } from "@tsz/shared/i18n/react";
import type { InterfaceLocale } from "@tsz/shared/i18n";

function SaveLabel() {
  const { t } = useTranslation();
  return <button>{t("actions.save")}</button>;
}

describe("界面翻译 Provider", () => {
  it("在同一 React 树中隔离不同语言，更新 Provider 不影响其他实例", () => {
    const tree = (locale: InterfaceLocale) => (
      <>
        <InterfaceI18nProvider locale={locale}>
          <SaveLabel />
        </InterfaceI18nProvider>
        <InterfaceI18nProvider>
          <SaveLabel />
        </InterfaceI18nProvider>
      </>
    );
    const view = render(tree("en-US"));
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
    view.rerender(tree("zh-Hant"));
    expect(screen.getByRole("button", { name: "儲存" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
  });

  it.each([undefined, "en-US"] as const)(
    "%s 首屏 SSR 与水合一致",
    async (locale) => {
      const tree = (
        <InterfaceI18nProvider locale={locale}>
          <SaveLabel />
        </InterfaceI18nProvider>
      );
      const container = document.createElement("div");
      const onRecoverableError = vi.fn();
      container.innerHTML = renderToString(tree);
      const initial = container.innerHTML;
      expect(container.textContent).toBe(locale ? "Save" : "保存");
      const root = hydrateRoot(container, tree, { onRecoverableError });
      try {
        await act(async () => {});
        expect(container.innerHTML).toBe(initial);
        expect(onRecoverableError).not.toHaveBeenCalled();
      } finally {
        await act(async () => root.unmount());
      }
    }
  );

  it("通过 React 文本插值展示输入，不把输入解析为 HTML", () => {
    function PageLabel() {
      const { t } = useTranslation();
      return <span>{t("pagination.page", { page: '<img src="x">' })}</span>;
    }
    const html = renderToString(
      <InterfaceI18nProvider locale="en-GB">
        <PageLabel />
      </InterfaceI18nProvider>
    );
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
  });
});
