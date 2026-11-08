import { InterfaceI18nProvider } from "@tsz/shared/i18n/react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FormTypeCatalogItem } from "@tsz/types";
import { FormTypeLabelsProvider, useFormTypeLabel } from "./FormTypeLabels";

function Label({ code }: { code: string }) {
  return <span>{useFormTypeLabel()(code)}</span>;
}

const thirdPersonSingular: FormTypeCatalogItem = {
  id: "form-type-third_person_singular",
  code: "third_person_singular",
  name_zh: "第三人称单数",
  name_en: "Third person singular",
  short_name_zh: "三单",
  abbreviation: "3sg",
  full_name_en: "third person singular",
  sort_order: 10
};

describe("FormTypeLabelsProvider", () => {
  it("业务页面用简洁显示而不是正式中文名", () => {
    render(
      <FormTypeLabelsProvider items={[thirdPersonSingular]}>
        <Label code="third_person_singular" />
      </FormTypeLabelsProvider>
    );

    expect(screen.getByText("三单")).toBeInTheDocument();
    expect(screen.queryByText("第三人称单数")).toBeNull();
  });

  it("目录里没有的词形回退到内置文案", () => {
    render(
      <FormTypeLabelsProvider items={[thirdPersonSingular]}>
        <Label code="past_tense" />
      </FormTypeLabelsProvider>
    );

    expect(screen.getByText("过去式")).toBeInTheDocument();
  });
});

it("已有英文目录名与无 Provider 的 fallback 随语言变化，未知编码原样保留", () => {
  const content = (locale: "zh-Hant" | "en-GB") => (
    <InterfaceI18nProvider locale={locale}>
      <FormTypeLabelsProvider items={[thirdPersonSingular]}>
        <Label code="third_person_singular" />
      </FormTypeLabelsProvider>
      <Label code="past_tense" />
      <Label code="future_raw_code" />
    </InterfaceI18nProvider>
  );
  const view = render(content("en-GB"));
  expect(screen.getByText("Third person singular")).toBeVisible();
  expect(screen.getByText("Past tense")).toBeVisible();
  expect(screen.getByText("future_raw_code")).toBeVisible();
  view.rerender(content("zh-Hant"));
  expect(screen.getByText("三单")).toBeVisible();
  expect(screen.getByText("過去式")).toBeVisible();
  expect(screen.getByText("future_raw_code")).toBeVisible();
});
