import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import type { NextDefinition } from "@tsz/types";
import { ContentRows } from "./ContentRows";

it("空白释义模板只在填写后进入草稿，切换英美保留已填内容和未填录入位", () => {
  function Harness() {
    const [rows, setRows] = useState<NextDefinition[]>([]);
    const [locale, setLocale] = useState("en-GB");
    return (
      <>
        <button
          onClick={() => setLocale(locale === "en-GB" ? "en-US" : "en-GB")}
        >
          切换英美
        </button>
        <ContentRows
          rows={rows}
          locale={locale}
          label="英文释义"
          definition
          grouped
          definitionTemplates={[{}, { style: "sentence" }]}
          disabled={false}
          onChange={(next) => setRows(next as NextDefinition[])}
        />
        <output aria-label="草稿释义">{JSON.stringify(rows)}</output>
      </>
    );
  }
  render(<Harness />);
  const draft = (): NextDefinition[] =>
    JSON.parse(screen.getByLabelText("草稿释义").textContent!);
  expect(screen.getByRole("textbox", { name: "英文释义 1" })).toHaveValue("");
  expect(screen.getByRole("textbox", { name: "英文释义 2" })).toHaveValue("");
  expect(draft()).toEqual([]);
  fireEvent.change(screen.getByRole("textbox", { name: "英文释义 2" }), {
    target: { value: "It is the middle." }
  });
  expect(draft()).toEqual([
    {
      id: expect.any(String),
      locale: "en-GB",
      text: "It is the middle.",
      style: "sentence"
    }
  ]);
  const saved = draft();
  fireEvent.click(screen.getByRole("button", { name: "切换英美" }));
  expect(screen.getByRole("textbox", { name: "英文释义 2" })).toHaveValue("");
  expect(draft()).toEqual(saved);
  fireEvent.click(screen.getByRole("button", { name: "切换英美" }));
  expect(screen.getByRole("textbox", { name: "英文释义 2" })).toHaveValue(
    "It is the middle."
  );
  fireEvent.change(screen.getByRole("textbox", { name: "英文释义 2" }), {
    target: { value: "" }
  });
  expect(draft()).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: "删除英文释义 1" }));
  expect(screen.getAllByRole("textbox")).toHaveLength(1);
  expect(draft()).toEqual([]);
});

it("已有释义不补空行，只读时保留原值", () => {
  const rows: NextDefinition[] = [
    { id: "existing", locale: "zh-Hans", text: "中心", style: "definition" }
  ];
  render(
    <ContentRows
      rows={rows}
      locale="zh-Hans"
      label="中文解释"
      definition
      grouped
      definitionTemplates={[{}, {}]}
      disabled
      onChange={() => {
        throw new Error("只读内容不能回写");
      }}
    />
  );
  expect(screen.getAllByRole("textbox")).toHaveLength(1);
  expect(screen.getByRole("textbox", { name: "中文解释 1" })).toHaveValue(
    "中心"
  );
  expect(screen.getByRole("textbox", { name: "中文解释 1" })).toBeDisabled();
});
