import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import type { NextDraft } from "@tsz/types";
import { EntryLayout } from "./EntryLayout";

it("步骤条显示正确标题且不显示副标题", () => {
  render(
    <MemoryRouter>
      <EntryLayout step="basics" exists={false}>
        正文
      </EntryLayout>
    </MemoryRouter>
  );

  const nav = screen.getByRole("navigation", { name: "词条编辑步骤" });
  const steps = within(nav);
  expect(steps.getByRole("button", { name: "创建新词条" })).toBeVisible();
  expect(steps.getByRole("button", { name: "词形与发音" })).toBeVisible();
  expect(steps.getByRole("button", { name: "词义与例句" })).toBeVisible();
  expect(steps.getByRole("button", { name: "预览并发布" })).toBeVisible();
  expect(nav.querySelectorAll("small")).toHaveLength(0);
  expect(steps.queryByText(/基本词性|目标语言|结构核对/)).toBeNull();
});

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
  expect(forms.getByRole("button", { name: /英语词形/ })).not.toHaveAttribute(
    "aria-current"
  );
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

it("概览完成项仍显示数字序号，不显示完成图标", () => {
  const draft: NextDraft = {
    schema_version: 1,
    headword: "centre",
    forms: [
      { id: "uk", locale: "en-GB", text: "centre" },
      { id: "us", locale: "en-US", text: "center" }
    ],
    senses: [
      {
        id: "sense",
        part_of_speech: null,
        definitions: [
          {
            id: "en-GB",
            locale: "en-GB",
            text: "middle",
            style: "definition"
          },
          {
            id: "en-US",
            locale: "en-US",
            text: "middle",
            style: "definition"
          }
        ],
        equivalents: [
          { id: "zh-Hans", locale: "zh-Hans", text: "中心" },
          { id: "zh-Hant", locale: "zh-Hant", text: "中心" }
        ]
      }
    ]
  };

  render(
    <MemoryRouter>
      <EntryLayout draft={draft} step="forms">
        正文
      </EntryLayout>
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole("button", { name: "展开词条概览" }));

  const rows = Array.from(
    document.querySelectorAll<HTMLElement>(".word-creation-progress-row")
  );
  expect(rows).toHaveLength(4);
  expect(
    rows.map((row) => row.querySelector(".word-progress-index")?.textContent)
  ).toEqual(["1", "2", "3", "4"]);
  expect(rows.every((row) => !row.querySelector(".word-progress-done"))).toBe(
    true
  );
});
