import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { App } from "@tsz/ui/admin/overlays";
import { expect, it, vi } from "vitest";
import type { DialectRulesV3, WordConcreteFormV3 } from "@tsz/types";
import {
  commonFormFixture,
  formsFixture,
  pronunciationFixture,
  ukUsFormFixture
} from "../fixtures";
import { PronunciationPreviewProvider } from "../../word-creation/PronunciationPreview";
import { V3ConcreteFormRow } from "./V3ConcreteFormRow";

vi.mock("@/lib/env", () => ({ env: { VOICE_EDITOR: false } }));
vi.mock("./V3SynthesisInputs", () => ({ V3SynthesisInputs: () => null }));

function Harness({
  form,
  rules
}: {
  form: WordConcreteFormV3;
  rules: DialectRulesV3;
}) {
  const [content, setContent] = useState(() =>
    formsFixture({ forms: [form], dialect_rules: rules })
  );
  return (
    <App>
      <PronunciationPreviewProvider>
        <V3ConcreteFormRow
          content={content}
          dialectRules={rules}
          form={content.pos[0]!.forms[0]!}
          formLabel="原形"
          issues={[]}
          membershipCount={1}
          idFactory={() => "unused"}
          onChange={setContent}
        />
      </PronunciationPreviewProvider>
      <output data-testid="draft">{JSON.stringify(content)}</output>
    </App>
  );
}

it.each(["common", "unified", "distinguish"] as const)(
  "%s 转换缺失拼写时定位到正确输入框，在框内提示且不改草稿；补齐后可转换",
  (mode) => {
    const pronunciation = pronunciationFixture({
      dict_phonetic: "bɪb",
      actual_pron: "old"
    });
    const form =
      mode === "common"
        ? commonFormFixture({ spelling: "  ", pronunciations: [pronunciation] })
        : ukUsFormFixture({
            uk: { spelling: mode === "unified" ? "" : "other" },
            us: { spelling: "  ", pronunciations: [pronunciation] }
          });
    const rules: DialectRulesV3 = {
      spelling_mode: mode === "distinguish" ? "distinguish" : "unified",
      phonetic_mode: mode === "common" ? "unified" : "distinguish"
    };
    render(<Harness form={form} rules={rules} />);
    const spelling = screen.getByLabelText(
      mode === "distinguish" ? "原形美式拼写" : "原形英美通用拼写"
    );
    const originalDraft = screen.getByTestId("draft").textContent;
    const buttons = screen.getAllByLabelText("从字典音标填入实际发音");
    fireEvent.click(buttons.at(-1)!);

    expect(spelling).toHaveFocus();
    expect(spelling).toHaveAttribute("aria-invalid", "true");
    const errorId = spelling.getAttribute("aria-describedby");
    expect(errorId).toBeTruthy();
    expect(document.getElementById(errorId!)).toBe(
      within(spelling.parentElement!).getByRole("alert")
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.querySelector(".ui-message-notice")).toBeNull();
    expect(screen.getByTestId("draft").textContent).toBe(originalDraft);
    if (mode === "distinguish") {
      expect(screen.getByLabelText("原形英式拼写")).not.toHaveAttribute(
        "aria-invalid",
        "true"
      );
    }

    fireEvent.change(spelling, { target: { value: "bib" } });
    expect(spelling).not.toHaveAttribute("aria-invalid", "true");
    expect(spelling).not.toHaveAttribute("aria-describedby");
    expect(within(spelling.parentElement!).queryByRole("alert")).toBeNull();
    fireEvent.click(buttons.at(-1)!);
    expect(
      screen.getAllByLabelText("第 1 条发音的实际发音").at(-1)
    ).toHaveValue("bɪb");
  }
);
