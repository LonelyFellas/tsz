import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PartOfSpeechCatalogItem } from "@tsz/types";
import {
  PartOfSpeechLabelsProvider,
  usePartOfSpeechLabel,
  useSubPartOfSpeechLabel
} from "./PartOfSpeechLabels";

function PosLabel({ code }: { code: string }) {
  return <span>{usePartOfSpeechLabel()(code)}</span>;
}

function SubPosLabel({ code }: { code: string }) {
  return <span>{useSubPartOfSpeechLabel()(code)}</span>;
}

const noun: PartOfSpeechCatalogItem = {
  id: "pos-noun",
  kind: "word",
  code: "noun",
  name_zh: "名词",
  name_en: "NOUN",
  abbreviation: "n.",
  short_name_zh: "名",
  full_name_en: "noun",
  sort_order: 10,
  sub_parts_extensible: true,
  sub_parts: [
    {
      id: "sub-n-count",
      code: "N-COUNT",
      name_zh: "可数个体名词",
      name_en: "Countable noun",
      short_name_zh: "可数名词",
      abbreviation: "n.",
      full_name_en: "countable noun",
      sort_order: 10
    }
  ]
};

describe("PartOfSpeechLabelsProvider", () => {
  it("基本词性用正式中文名而不是简洁显示", () => {
    render(
      <PartOfSpeechLabelsProvider items={[noun]}>
        <PosLabel code="noun" />
      </PartOfSpeechLabelsProvider>
    );

    expect(screen.getByText("名词")).toBeInTheDocument();
    expect(screen.queryByText("名")).toBeNull();
  });

  it("细分词性同样用正式中文名", () => {
    render(
      <PartOfSpeechLabelsProvider items={[noun]}>
        <SubPosLabel code="N-COUNT" />
      </PartOfSpeechLabelsProvider>
    );

    expect(screen.getByText("可数个体名词")).toBeInTheDocument();
    expect(screen.queryByText("可数名词")).toBeNull();
  });

  it("目录里没有的编码回退到内置文案", () => {
    render(
      <PartOfSpeechLabelsProvider items={[noun]}>
        <PosLabel code="verb" />
        <SubPosLabel code="V-T" />
      </PartOfSpeechLabelsProvider>
    );

    expect(screen.getByText("动词")).toBeInTheDocument();
    expect(screen.getByText("及物动词")).toBeInTheDocument();
  });
});
