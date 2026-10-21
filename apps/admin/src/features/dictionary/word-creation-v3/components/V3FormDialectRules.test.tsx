import { fireEvent, render, screen } from "@testing-library/react";
import { App as AntApp } from "antd";
import type { DraftFormsStepContentV3 } from "@tsz/types";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import {
  commonFormFixture,
  formsFixture,
  pronunciationFixture,
  uuidFromInt,
  uuidSequence
} from "../fixtures";
import { partOfSpeechCatalogFixture } from "../../word-creation/partOfSpeech.test.helper";
import { V3FormsAndPronunciationStep } from "./V3FormsAndPronunciationStep";

vi.mock("../../dataSource", () => ({
  partOfSpeechDataSource: {
    catalog: () => Promise.resolve(partOfSpeechCatalogFixture)
  }
}));

// 保留真实的三态控件、转换与受控回写；拼写/发音编辑由矩阵与语音测试覆盖。
// 避免三态切换反复挂载完整编辑器，保持原有 5 秒超时和全部身份断言。
vi.mock("./V3ConcreteFormRow", () => ({
  V3ConcreteFormRow: () => null,
  V3DialectSeparatedFormMatrix: () => null
}));

function Harness({
  initial,
  idFactory
}: {
  initial: DraftFormsStepContentV3;
  idFactory: () => string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <AntApp>
      <V3FormsAndPronunciationStep
        value={value}
        onChange={setValue}
        idFactory={idFactory}
      />
      <output data-testid="canonical-value">{JSON.stringify(value)}</output>
    </AntApp>
  );
}

function canonicalValue(): DraftFormsStepContentV3 {
  return JSON.parse(screen.getByTestId("canonical-value").textContent ?? "");
}

function formById(content: DraftFormsStepContentV3, formId: string) {
  return content.pos
    .flatMap((pos) => pos.forms)
    .find((form) => form.id === formId)!;
}

it("I03 三态切换按 V2 直接转换，不弹窗且保留 form UUID", () => {
  const form = commonFormFixture({
    pronunciations: [
      pronunciationFixture({ id: uuidFromInt(301) }),
      pronunciationFixture({ id: uuidFromInt(302), style: "strong" })
    ]
  });
  const nextIds = [401, 402, 403, 404, 405, 406, 407, 408, 409].map(
    uuidFromInt
  );
  render(
    <Harness
      initial={formsFixture({ forms: [form] })}
      idFactory={uuidSequence(...nextIds)}
    />
  );

  fireEvent.click(screen.getByLabelText("英美拼写有区别"));
  expect(screen.queryByRole("dialog")).toBeNull();

  const converted = formById(canonicalValue(), form.id);
  expect(converted.id).toBe(form.id);
  expect(converted.regional_variants).toMatchObject({
    mode: "uk_us",
    uk: {
      id: nextIds[0],
      spelling: "centre",
      pronunciations: [{ id: nextIds[1] }, { id: nextIds[2] }]
    },
    us: {
      id: nextIds[3],
      spelling: "centre",
      pronunciations: [{ id: nextIds[4] }, { id: nextIds[5] }]
    }
  });

  expect(screen.getByLabelText("英美音标无区别")).toBeDisabled();
  fireEvent.click(screen.getByLabelText("英美拼写无区别"));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(formById(canonicalValue(), form.id)).toMatchObject({
    id: form.id,
    regional_variants: {
      mode: "uk_us",
      uk: { spelling: "centre" },
      us: { spelling: "centre" }
    }
  });
  expect(canonicalValue().pos[0]!.form_groups[0]!.dialect_rules).toEqual({
    spelling_mode: "unified",
    phonetic_mode: "distinguish"
  });

  fireEvent.click(screen.getByLabelText("英美音标无区别"));
  expect(screen.queryByRole("dialog")).toBeNull();

  expect(formById(canonicalValue(), form.id)).toMatchObject({
    id: form.id,
    regional_variants: {
      mode: "common",
      common: {
        id: nextIds[6],
        spelling: "centre",
        pronunciations: [{ id: nextIds[7] }, { id: nextIds[8] }]
      }
    }
  });
});
