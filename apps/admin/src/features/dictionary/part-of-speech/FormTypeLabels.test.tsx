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
