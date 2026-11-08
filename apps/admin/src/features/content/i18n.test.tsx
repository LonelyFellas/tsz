import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { HttpError } from "@tsz/api-client";
import { InterfaceI18nProvider } from "@tsz/shared/i18n/react";
import { ContentError } from "../dictionary/part-of-speech/PartOfSpeechSettings";
it("目录错误只按稳定 code 本地化，未知服务端原文不会因中文相似而被替换", () => {
  const known = new HttpError(
    409,
    "original backend detail",
    [],
    "revision_conflict"
  );
  const unknown = new HttpError(
    409,
    "配置已被其他管理员修改，请刷新后重试",
    [],
    "future_error"
  );
  const content = (locale: "zh-Hans" | "en-US") => (
    <InterfaceI18nProvider locale={locale}>
      <p role="alert">
        <ContentError error={known} />
      </p>
      <p>
        <ContentError error={unknown} />
      </p>
    </InterfaceI18nProvider>
  );
  const view = render(content("zh-Hans"));
  view.rerender(content("en-US"));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Another administrator changed these settings. Refresh and try again."
  );
  expect(screen.getByText(unknown.message)).toBeVisible();
});
