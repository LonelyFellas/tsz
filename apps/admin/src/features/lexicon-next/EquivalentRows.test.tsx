import { useState } from "react";
import {
  fireEvent,
  render,
  screen,
  within,
  waitFor
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LexiconTaxonomy, NextSense } from "@tsz/types";
import { EquivalentRows } from "./EquivalentRows";
import {
  equivalentScore,
  parseEquivalentBatch,
  setEquivalentScore
} from "./equivalents";
import { draftProblem, previewDraft } from "./model";

function taxonomy(id: string, name: string): LexiconTaxonomy {
  return {
    id,
    code: id,
    name_zh: name,
    name_en: name,
    revision: 1,
    sort_order: 0,
    created_at: "",
    updated_at: ""
  };
}
const catalog = {
  registers: [taxonomy("spoken", "口语"), taxonomy("formal", "正式")],
  domains: [taxonomy("business", "商业"), taxonomy("medicine", "医学")]
};
const initial: NextSense = {
  id: "sense",
  part_of_speech: "noun",
  definitions: [],
  equivalents: []
};
function Editor({
  value = initial,
  disabled = false,
  error = false,
  remaining = 500,
  retry = vi.fn()
}: {
  value?: NextSense;
  disabled?: boolean;
  error?: boolean;
  remaining?: number;
  retry?: () => void;
}) {
  const [sense, setSense] = useState(value);
  return (
    <>
      <EquivalentRows
        sense={sense}
        locale="zh-Hans"
        disabled={disabled}
        catalog={error ? undefined : catalog}
        loading={false}
        catalogError={error}
        remaining={remaining}
        onRetry={retry}
        onChange={(patch) => setSense((current) => ({ ...current, ...patch }))}
      />
      <output data-testid="saved">{JSON.stringify(sense)}</output>
    </>
  );
}
const saved = (): NextSense =>
  JSON.parse(screen.getByTestId("saved").textContent!);
const input = () => screen.getByRole("textbox", { name: "批量录入常见译词" });
function add(text: string) {
  fireEvent.change(input(), { target: { value: text } });
  fireEvent.keyDown(input(), { key: "Enter" });
}
async function chooseDomain(name: string) {
  fireEvent.mouseDown(screen.getByRole("combobox", { name: "常见度评分领域" }));
  fireEvent.click(
    await screen.findByText(name, {
      selector: ".ui-select-item-option-content"
    })
  );
  await waitFor(() =>
    expect(
      screen
        .getByRole("combobox", { name: "常见度评分领域" })
        .closest(".ui-select")
    ).toHaveTextContent(name)
  );
}
describe("媒介语译词", () => {
  it("输入法回车不提交，批量去重不覆盖另一语言，新增清除无译词声明", () => {
    render(
      <Editor
        value={{
          ...initial,
          no_equivalents: ["zh-Hans"],
          equivalents: [{ id: "traditional", locale: "zh-Hant", text: "工作" }]
        }}
      />
    );
    fireEvent.change(input(), { target: { value: "工作" } });
    fireEvent.compositionStart(input());
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(saved().equivalents).toHaveLength(1);
    fireEvent.compositionEnd(input());
    fireEvent.change(input(), { target: { value: "" } });
    fireEvent.paste(input(), {
      clipboardData: {
        getData: () => "工作，职业、工作\n part time job；ＪＯＢ;job"
      }
    });
    const rows = saved().equivalents;
    expect(rows.map((row) => row.text)).toEqual([
      "工作",
      "工作",
      "职业",
      "part time job",
      "ＪＯＢ"
    ]);
    expect(saved().no_equivalents).toEqual([]);
    expect(rows[1]!.metadata?.register_ids).toEqual([]);
    expect(rows[1]!.metadata?.commonness).toEqual([]);
    const id = rows[1]!.id;
    fireEvent.change(screen.getByRole("textbox", { name: "译词 1" }), {
      target: { value: "工作岗位" }
    });
    expect(saved().equivalents.find((row) => row.id === id)?.text).toBe(
      "工作岗位"
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "移除译词 工作岗位" })[0]!
    );
    expect(saved().equivalents.some((row) => row.id === id)).toBe(false);
    expect(saved().equivalents[0]!.locale).toBe("zh-Hant");
  });
  it("行业独立评分清空后继承通用分，查看和聚焦不持久化继承值", async () => {
    render(<Editor />);
    add("工作");
    let score = screen.getByRole("textbox", { name: "工作的常见度" });
    fireEvent.change(score, { target: { value: "95" } });
    fireEvent.blur(score);
    await chooseDomain("商业");
    score = screen.getByRole("textbox", { name: "工作的常见度" });
    expect(score).toHaveValue("95.0");
    fireEvent.focus(score);
    fireEvent.blur(score);
    expect(saved().equivalents[0]!.metadata?.commonness).toHaveLength(1);
    expect(score).toHaveAttribute(
      "aria-description",
      expect.stringContaining("当前行业未单独评分")
    );
    fireEvent.change(score, { target: { value: "80.0" } });
    await chooseDomain("通用");
    fireEvent.change(screen.getByRole("textbox", { name: "工作的常见度" }), {
      target: { value: "90.0" }
    });
    await chooseDomain("商业");
    score = screen.getByRole("textbox", { name: "工作的常见度" });
    expect(score).toHaveValue("80.0");
    fireEvent.change(score, { target: { value: "" } });
    expect(score).toHaveValue("90.0");
    expect(saved().equivalents[0]!.metadata?.commonness).toEqual([
      { score: "90.0" }
    ]);
    expect(saved().equivalents[0]!.metadata?.domain_ids).toEqual([]);
  });
  it("全选、半选和清空使用具体 ID，行业选择不创建评分", () => {
    render(<Editor />);
    add("工作");
    fireEvent.click(screen.getByRole("button", { name: "工作 行业领域" }));
    const general = screen.getByRole("checkbox", {
      name: "工作 行业领域 通用"
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "商业" }));
    expect(general).toBePartiallyChecked();
    expect(saved().equivalents[0]!.metadata?.domain_ids).toEqual(["business"]);
    fireEvent.click(general);
    expect(general).toBeChecked();
    expect(saved().equivalents[0]!.metadata?.domain_ids).toEqual([
      "business",
      "medicine"
    ]);
    fireEvent.click(general);
    expect(saved().equivalents[0]!.metadata?.domain_ids).toEqual([]);
    expect(saved().equivalents[0]!.metadata?.commonness).toEqual([]);
  });
  it("目录失败可重试并保留原引用，超限批量保留输入，只读禁止修改", () => {
    const retry = vi.fn();
    const { rerender } = render(<Editor error remaining={0} retry={retry} />);
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(retry).toHaveBeenCalledOnce();
    add("工作；职业");
    expect(input()).toHaveValue("工作；职业");
    expect(saved().equivalents).toEqual([]);
    rerender(<Editor disabled error remaining={0} retry={retry} />);
    expect(input()).toBeDisabled();
    expect(
      screen.getByRole("checkbox", { name: "本词义无合适常见译词" })
    ).toBeDisabled();
  });
  it("无译词声明与未填写区分，非法分数和重复编辑不能保存", () => {
    render(<Editor />);
    fireEvent.click(
      screen.getByRole("checkbox", { name: "本词义无合适常见译词" })
    );
    const draft = {
      schema_version: 1 as const,
      headword: "job",
      forms: [],
      senses: [saved()]
    };
    expect(previewDraft(draft, "en-GB", "zh-Hans").senses[0]).toMatchObject({
      no_equivalents: true,
      missing_equivalents: false
    });
    add("工作，职业");
    fireEvent.change(screen.getByRole("textbox", { name: "工作的常见度" }), {
      target: { value: "100" }
    });
    expect(draftProblem({ ...draft, senses: [saved()] }, true)).toContain(
      "0.1–99.9"
    );
    fireEvent.change(screen.getByRole("textbox", { name: "工作的常见度" }), {
      target: { value: "0.1" }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "译词 2" }), {
      target: { value: "工作" }
    });
    expect(
      within(screen.getByRole("table")).getAllByRole("alert").length
    ).toBeGreaterThan(0);
    expect(draftProblem({ ...draft, senses: [saved()] }, true)).toContain(
      "已有该译词"
    );
  });
  it("独立分与继承值分开，非法文本批量不部分写入", () => {
    const row = { id: "one", locale: "zh-Hans", text: "工作" };
    const general = setEquivalentScore(row, undefined, "99.9");
    const assessed = {
      ...general,
      metadata: {
        ...general.metadata!,
        commonness: [
          { score: "99.9", assessed_at: "2026-11-15T00:00:00Z" },
          { domain_id: "business", score: "80.0" }
        ]
      }
    };
    expect(setEquivalentScore(assessed, undefined, "99.9")).toBe(assessed);
    expect(setEquivalentScore(assessed, "business", "80.0")).toBe(assessed);
    expect(
      setEquivalentScore(assessed, undefined, "95.0").metadata?.commonness.map(
        (score) => score.domain_id
      )
    ).toEqual([undefined, "business"]);
    expect(equivalentScore(general, "business")).toEqual({
      value: "99.9",
      inherited: true
    });
    expect(
      setEquivalentScore(
        setEquivalentScore(general, "business", "0.1"),
        "business",
        ""
      ).metadata?.commonness
    ).toEqual([{ score: "99.9" }]);
    expect(parseEquivalentBatch("工作；坏\u0000词", [], "zh-Hans")).toEqual({
      error: "text",
      words: []
    });
  });
});
