import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { NextDefinition } from "@tsz/types";
import { DefinitionRows } from "./DefinitionRows";

vi.mock("./DefinitionText", () => ({
  DefinitionText: ({ definition }: { definition: NextDefinition }) => (
    <span>{definition.text}</span>
  )
}));
const initial: NextDefinition[] = [
  {
    id: "gb1",
    locale: "en-GB",
    text: "centre",
    style: "definition",
    level: "A1",
    content: { version: 2, text: "centre", annotations: [] },
    voice_profile: { voices: [] }
  },
  {
    id: "zh",
    locale: "zh-Hans",
    text: "中心",
    style: "definition",
    grammar_unbound: true
  },
  {
    id: "gb2",
    locale: "en-GB",
    text: "middle",
    style: "sentence",
    level: "A1",
    grammar_structure_id: "invalid"
  },
  { id: "us", locale: "en-US", text: "center", style: "definition" },
  { id: "hant", locale: "zh-Hant", text: "中央", style: "definition" }
];
function setup(disabled = false, rows = initial) {
  function Harness() {
    const [value, setValue] = useState(rows);
    const [locale, setLocale] = useState("en-GB");
    return (
      <>
        <button onClick={() => setLocale("en-US")}>美式</button>
        <button onClick={() => setLocale("zh-Hans")}>中文</button>
        <DefinitionRows
          rows={value}
          locale={locale}
          scopeId="s"
          label="释义"
          grammarLocale="en-GB"
          grammars={[]}
          grammarDisabled={false}
          remaining={10}
          disabled={disabled}
          onChange={(update) => setValue(update)}
        />
        <output aria-label="草稿">{JSON.stringify(value)}</output>
      </>
    );
  }
  render(<Harness />);
  return (): NextDefinition[] =>
    JSON.parse(screen.getByLabelText("草稿").textContent!);
}
function choose(label: string, text: string) {
  fireEvent.mouseDown(screen.getByRole("combobox", { name: label }));
  fireEvent.click(
    screen.getByText(text, { selector: ".ui-select-item-option-content" })
  );
}
it("同级释义独立改级与方式，排序保留ID和隐藏语言，语法区分未选、不绑定和失效", () => {
  const draft = setup();
  expect(screen.getByRole("table")).toHaveTextContent("centre");
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  choose("释义 1 等级", "C2");
  expect(draft()[2]!.level).toBe("A1");
  choose("释义 1 方式", "整句");
  choose("释义 1 语法结构", "不绑定");
  expect(draft()[0]).toMatchObject({
    id: "gb1",
    level: "C2",
    style: "sentence",
    grammar_unbound: true
  });
  expect(draft()[0]).not.toHaveProperty("grammar_structure_id");
  choose("释义 1 语法结构", "未选择");
  expect(draft()[0]).not.toHaveProperty("grammar_unbound");
  choose("释义 1 等级", "未评估");
  expect(draft()[0]).not.toHaveProperty("level");
  const before = draft();
  fireEvent.keyDown(screen.getByRole("button", { name: "拖动释义 1" }), {
    key: "ArrowDown"
  });
  expect(draft()).toEqual([
    before[2],
    before[1],
    before[0],
    before[3],
    before[4]
  ]);
  fireEvent.click(screen.getByRole("button", { name: "美式" }));
  expect(within(screen.getByRole("table")).getByText("center")).toBeVisible();
  const reordered = draft();
  fireEvent.click(screen.getByRole("button", { name: "中文" }));
  expect(screen.getByRole("textbox", { name: "释义 1" })).toHaveValue("中心");
  expect(
    screen.queryByRole("button", { name: /编辑.*配音/ })
  ).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "释义 1" }), {
    target: { value: "中央位置" }
  });
  expect(draft()).toEqual(
    reordered.map((row) =>
      row.id === "zh" ? { ...row, text: "中央位置" } : row
    )
  );
  fireEvent.click(screen.getByRole("button", { name: "添加释义" }));
  expect(draft().at(-1)).toMatchObject({
    locale: "zh-Hans",
    text: "",
    style: "definition"
  });
  expect(draft().at(-1)).not.toHaveProperty("level");
  fireEvent.click(screen.getByRole("button", { name: "删除释义 2" }));
  expect(draft()).toHaveLength(reordered.length);
});
it("从空区块添加首条释义并删除后可再次录入，不写入占位数据", () => {
  const draft = setup(false, []);
  const add = screen.getByRole("button", { name: "添加释义" });
  expect(draft()).toEqual([]);
  fireEvent.click(add);
  expect(draft()).toEqual([
    expect.objectContaining({ locale: "en-GB", text: "" })
  ]);
  expect(screen.getByRole("table", { name: "释义" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "删除释义 1" }));
  expect(draft()).toEqual([]);
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(add).toBeEnabled();
});
it("显式 en 仅在缺少当前口音时回退，不复制另一口音", () => {
  const common = { ...initial[0]!, id: "common", locale: "en" };
  const draft = setup(false, [common, initial[3]!]);
  expect(screen.getByRole("table")).toHaveTextContent("centre");
  fireEvent.click(screen.getByRole("button", { name: "美式" }));
  expect(screen.getByRole("table")).toHaveTextContent("center");
  expect(screen.getByRole("table")).not.toHaveTextContent("centre");
  expect(draft()).toEqual([common, initial[3]]);
});
it("只读不能改字段、增删或键盘排序", () => {
  const draft = setup(true);
  for (const field of screen.getAllByRole("combobox"))
    expect(field).toBeDisabled();
  expect(screen.getByRole("button", { name: "添加释义" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "删除释义 1" })).toBeDisabled();
  fireEvent.keyDown(screen.getByRole("button", { name: "拖动释义 1" }), {
    key: "ArrowDown"
  });
  expect(draft()).toEqual(initial);
});
