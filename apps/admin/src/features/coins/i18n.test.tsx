import { render, screen } from "@testing-library/react";
import { HttpError } from "@tsz/api-client";
import { INTERFACE_LOCALES, type InterfaceLocale } from "@tsz/shared/i18n";
import { InterfaceI18nProvider } from "@tsz/shared/i18n/react";
import { expect, it } from "vitest";
import { CoinError, formatCoinAmount, useCoinTranslation } from "./i18n";

it("四语只翻译金额单位和已知错误，完整大整数、未知服务端原文和计数语义保持正确", () => {
  const unknown = new HttpError(
    409,
    "该账号暂时不可用 original",
    [],
    "future_error"
  );
  function Probe() {
    const { t } = useCoinTranslation();
    return (
      <>
        <p>{formatCoinAmount("-9223372036854775807", t)}</p>
        <p>{formatCoinAmount("1", t)}</p>
        <p>{t("total", { count: 1 })}</p>
        <p>{t("total", { count: 2 })}</p>
        <p role="alert">
          <CoinError error={unknown} />
        </p>
      </>
    );
  }
  const content = (locale: InterfaceLocale) => (
    <InterfaceI18nProvider locale={locale}>
      <Probe />
    </InterfaceI18nProvider>
  );
  const view = render(content("zh-Hans"));
  for (const locale of INTERFACE_LOCALES) {
    view.rerender(content(locale));
    expect(screen.getByText(/-9,223,372,036,854,775,807/)).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(unknown.message);
  }
  expect(screen.getByText("1 coin")).toBeVisible();
  expect(screen.getByText("1 record")).toBeVisible();
  expect(screen.getByText("2 records")).toBeVisible();
});
