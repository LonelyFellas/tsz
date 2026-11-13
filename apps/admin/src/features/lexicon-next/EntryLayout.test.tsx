import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import type { NextDraft } from "@tsz/types";
import { EntryLayout } from "./EntryLayout";

it("概览统计通用英语一次，忽略空白，随草稿切换英美、删空内容更新", () => {
  const draft: NextDraft = {
    schema_version: 1,
    headword: "centre",
    forms: [{ id: "common", locale: "en", text: "centre" }],
    senses: [
      {
        id: "sense",
        part_of_speech: null,
        definitions: [
          { id: "en", locale: "en", text: "middle", style: "definition" },
          { id: "zh", locale: "zh-Hans", text: " ", style: "definition" }
        ],
        equivalents: []
      }
    ]
  };
  const layout = (value: NextDraft) => (
    <MemoryRouter>
      <EntryLayout draft={value} step="forms">
        正文
      </EntryLayout>
    </MemoryRouter>
  );
  const { rerender } = render(layout(draft));
  fireEvent.click(screen.getByRole("button", { name: "展开词条概览" }));
  for (const label of ["英语词形", "英文释义", "中文解释"])
    fireEvent.click(screen.getByRole("button", { name: `展开${label}` }));
  const forms = within(screen.getByRole("region", { name: "英语词形摘要" }));
  const definitions = within(
    screen.getByRole("region", { name: "英文释义摘要" })
  );
  const meanings = within(screen.getByRole("region", { name: "中文解释摘要" }));
  expect(forms.getByText("1 项")).toBeVisible();
  expect(forms.getByText("通用英语：centre")).toBeVisible();
  expect(definitions.getByText("1 项")).toBeVisible();
  expect(definitions.getByText("通用英语：middle")).toBeVisible();
  expect(meanings.getByText("0 项")).toBeVisible();
  expect(meanings.getByText("暂未添加")).toBeVisible();
  expect(screen.getByText("2/4")).toBeVisible();

  rerender(
    layout({
      ...draft,
      forms: [
        { id: "uk", locale: "en-GB", text: "centre" },
        { id: "us", locale: "en-US", text: "center" }
      ]
    })
  );
  expect(forms.getByText("2 项")).toBeVisible();
  expect(forms.queryByText("通用英语：centre")).toBeNull();
  expect(forms.getByText("英式英语：centre")).toBeVisible();
  expect(forms.getByText("美式英语：center")).toBeVisible();

  rerender(layout({ ...draft, forms: [], senses: [] }));
  expect(forms.getByText("0 项")).toBeVisible();
  expect(forms.getByText("暂未添加")).toBeVisible();
  expect(definitions.getByText("0 项")).toBeVisible();
  expect(definitions.getByText("暂未添加")).toBeVisible();
  expect(screen.getByText("0/4")).toBeVisible();
});

it("语义区间摘要随名称修改更新完成状态，保留区间顺序和身份", () => {
  const draft: NextDraft = {
    schema_version: 1,
    headword: "centre",
    forms: [],
    senses: [],
    sense_groups: [{ id: "group", name_zh: "", name_en: "" }]
  };
  const layout = (value: NextDraft) => (
    <MemoryRouter>
      <EntryLayout draft={value} step="meanings">
        正文
      </EntryLayout>
    </MemoryRouter>
  );
  const { rerender } = render(layout(draft));
  fireEvent.click(screen.getByRole("button", { name: "展开词条概览" }));
  fireEvent.click(screen.getByRole("button", { name: "展开语义区间" }));
  const summary = within(screen.getByRole("region", { name: "语义区间摘要" }));
  expect(summary.getByText("待填写语义区间")).toBeVisible();
  expect(screen.getByText("0/5")).toBeVisible();
  rerender(
    layout({
      ...draft,
      sense_groups: [{ id: "group", name_zh: "位置", name_en: "position" }]
    })
  );
  expect(summary.getByText("位置 · position")).toBeVisible();
  expect(screen.getByText("1/5")).toBeVisible();
});
