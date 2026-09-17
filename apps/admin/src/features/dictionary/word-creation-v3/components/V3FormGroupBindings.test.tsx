import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { App as AntApp } from "antd";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  DraftFormsStepContentV3,
  DraftMeaningsStepContentWritableV3
} from "@tsz/types";
import { commonFormFixture, formsFixture } from "../fixtures";
import { V3FormDisplayProvider } from "../formDisplayState";
import { partOfSpeechCatalogFixture } from "../../word-creation/partOfSpeech.test.helper";
import { V3FormsAndPronunciationStep } from "./V3FormsAndPronunciationStep";
import { V3FormGroupSenseEditor } from "./V3FormGroupSenseEditor";

vi.mock("../../dataSource", () => ({
  partOfSpeechDataSource: {
    catalog: () => Promise.resolve(partOfSpeechCatalogFixture)
  }
}));

// 保留真实的步骤、组卡片、词义编辑和回调链；词形/语音明细由矩阵与语音测试覆盖。
// 独立文件避免绑定交互依赖大型矩阵测试积累的样式和渲染开销，不放宽 5 秒超时。
vi.mock("./V3ConcreteFormRow", () => ({
  V3ConcreteFormRow: () => null,
  V3DialectSeparatedFormMatrix: () => null
}));

function canonicalValue(): DraftFormsStepContentV3 {
  return JSON.parse(screen.getByTestId("canonical-value").textContent!);
}

describe("词形组的专用词义交互", () => {
  it("必须选择同词性词义才设为专用，取消不修改，编辑不能清空最后绑定", async () => {
    // 绑定交互不依赖派生词形或语音控件，使用仅有原形的最小草稿。
    const initial = formsFixture({
      pos: "adverb",
      forms: [commonFormFixture({ spelling: "fast", pronunciations: [] })]
    });
    const posId = initial.pos[0]!.pos_id;
    const initialMeanings: DraftMeaningsStepContentWritableV3 = {
      sense_groups: [],
      pos: [posId, "other-pos"].map((pos_id) => ({
        pos_id,
        grammar_structures: [],
        senses: [1, 2].map((index) => ({
          id: `${pos_id}-${index}`,
          sub_pos: "",
          level: "A1",
          depends_on_context: false,
          definitions: [
            {
              definition_mode: "zh_definition",
              id: `def-${index}`,
              content_id: `text-${index}`,
              level: "A1",
              content: {
                version: 2,
                text: `${pos_id === posId ? "本词性" : "其他词性"}释义${index}`,
                annotations: []
              }
            }
          ],
          sentences: [],
          relations: []
        }))
      }))
    };
    function ScopeHarness() {
      const [value, setValue] = useState(initial);
      const [meanings, setMeanings] = useState(initialMeanings);
      return (
        <V3FormDisplayProvider>
          <AntApp>
            <V3FormsAndPronunciationStep
              value={value}
              onChange={setValue}
              meanings={meanings}
              onMeaningsChange={setMeanings}
            />
            <output data-testid="canonical-value">
              {JSON.stringify(value)}
            </output>
            <output data-testid="binding-meanings">
              {JSON.stringify(meanings)}
            </output>
          </AntApp>
        </V3FormDisplayProvider>
      );
    }
    render(<ScopeHarness />);
    // 按标签与可见文案定位；复选框类型、按钮禁用及可见性仍独立断言。
    expect(screen.queryByText("通用", { exact: true })).not.toBeInTheDocument();
    const headerEntry = await screen.findByLabelText("第 1 组专用词义");
    expect(headerEntry.closest(".ant-card-head")).not.toBeNull();
    expect(headerEntry).toHaveTextContent("专用词义");
    expect(screen.queryByText("限定适用词义")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("收起第 1 组词形变化"));
    fireEvent.click(headerEntry);
    let dialog = await screen.findByLabelText("第 1 组适用词义编辑");
    expect(within(dialog).queryByText(/其他词性/)).not.toBeInTheDocument();
    expect(
      within(dialog).getByText("确认选择").closest("button")!
    ).toBeDisabled();
    fireEvent.click(within(dialog).getByLabelText(/本词性释义1/));
    expect(
      document.querySelector('[role="dialog"], dialog')
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("收起第 1 组词形变化"));
    fireEvent.click(screen.getByLabelText("展开第 1 组词形变化"));
    expect(within(dialog).getByLabelText(/本词性释义1/)).toBeChecked();
    fireEvent.click(
      within(dialog)
        .getByText(/^取\s*消$/)
        .closest("button")!
    );
    expect(canonicalValue().pos[0]!.form_groups[0]!.scope).toBe("general");
    await waitFor(() =>
      expect(
        screen.queryByLabelText("第 1 组适用词义编辑")
      ).not.toBeInTheDocument()
    );
    fireEvent.click(screen.getByLabelText("第 1 组专用词义"));
    dialog = await screen.findByLabelText("第 1 组适用词义编辑");
    for (const checkbox of within(dialog).getAllByLabelText(/本词性释义[12]/)) {
      expect(checkbox).toHaveAttribute("type", "checkbox");
      fireEvent.click(checkbox);
    }
    fireEvent.click(within(dialog).getByText("确认选择").closest("button")!);
    expect(canonicalValue().pos[0]!.form_groups[0]!.scope).toBe("dedicated");
    expect(screen.getByLabelText("第 1 组适用词义")).toBeVisible();
    const summary = screen.getByLabelText("第 1 组适用词义");
    expect(within(summary).getByText("本词性释义1")).toBeVisible();
    expect(within(summary).getByText("本词性释义2")).toBeVisible();
    fireEvent.click(screen.getByLabelText("收起第 1 组词形变化"));
    expect(screen.getByText("2 个词义")).toBeVisible();
    fireEvent.click(screen.getByLabelText("展开第 1 组词形变化"));
    const stored = JSON.parse(
      screen.getByTestId("binding-meanings").textContent!
    );
    expect(
      stored.pos[0].senses.map(
        (sense: { form_group_id?: string }) => sense.form_group_id
      )
    ).toEqual([
      initial.pos[0]!.form_groups[0]!.id,
      initial.pos[0]!.form_groups[0]!.id
    ]);
    expect(stored.pos[1].senses[0].form_group_id).toBeUndefined();
    await waitFor(() =>
      expect(
        screen.queryByLabelText("第 1 组适用词义编辑")
      ).not.toBeInTheDocument()
    );
    fireEvent.click(screen.getByLabelText("第 1 组专用词义"));
    dialog = await screen.findByLabelText("第 1 组适用词义编辑");
    for (const checkbox of within(dialog).getAllByLabelText(/本词性释义[12]/)) {
      expect(checkbox).toHaveAttribute("type", "checkbox");
      fireEvent.click(checkbox);
    }
    expect(
      within(dialog).getByText("确认选择").closest("button")!
    ).toBeDisabled();
    fireEvent.click(
      within(dialog)
        .getByText(/^取\s*消$/)
        .closest("button")!
    );
    expect(screen.getByLabelText("第 1 组适用词义")).toBeVisible();
    await waitFor(() =>
      expect(
        screen.queryByLabelText("第 1 组适用词义编辑")
      ).not.toBeInTheDocument()
    );
    fireEvent.click(screen.getByLabelText("第 1 组专用词义"));
    dialog = await screen.findByLabelText("第 1 组适用词义编辑");
    fireEvent.click(
      within(dialog).getByText("恢复适用全部词义").closest("button")!
    );
    await waitFor(() =>
      expect(canonicalValue().pos[0]!.form_groups[0]!.scope).toBe("general")
    );
    expect(screen.queryByLabelText("第 1 组适用词义")).not.toBeInTheDocument();
  });

  it("无词义时不能设为专用，提供前往当前词性添加词义入口", async () => {
    // 绑定交互不依赖派生词形或语音控件，使用仅有原形的最小草稿。
    const initial = formsFixture({
      pos: "adverb",
      forms: [commonFormFixture({ spelling: "fast", pronunciations: [] })]
    });
    const go = vi.fn();
    const change = vi.fn();
    render(
      <AntApp>
        <V3FormsAndPronunciationStep
          value={initial}
          onChange={change}
          meanings={{ sense_groups: [], pos: [] }}
          onMeaningsChange={vi.fn()}
          onGoToMeanings={go}
        />
      </AntApp>
    );
    fireEvent.click(await screen.findByLabelText("第 1 组专用词义"));
    const dialog = await screen.findByLabelText("第 1 组适用词义编辑");
    expect(
      within(dialog).getByText("确认选择").closest("button")!
    ).toBeDisabled();
    fireEvent.click(
      within(dialog).getByText("前往添加词义").closest("button")!
    );
    expect(go).toHaveBeenCalledWith(initial.pos[0]!.pos_id);
    expect(change).not.toHaveBeenCalled();
  });
});

it("编辑专用组保留已绑定的空释义，未保存的新词义不能直接绑定", () => {
  const pos = formsFixture().pos[0]!;
  const group = { ...pos.form_groups[0]!, scope: "dedicated" as const };
  const blank: DraftMeaningsStepContentWritableV3["pos"][number]["senses"][number] =
    {
      id: "saved-blank",
      form_group_id: group.id,
      sub_pos: "",
      level: "A1",
      depends_on_context: false,
      definitions: [],
      sentences: [],
      relations: []
    };
  const unsaved = {
    ...blank,
    id: "unsaved",
    form_group_id: undefined,
    definitions: [
      {
        definition_mode: "zh_definition" as const,
        id: "new-definition",
        content_id: "new-content",
        level: "A1",
        content: {
          version: 2 as const,
          text: "尚未保存的词义",
          annotations: []
        }
      }
    ]
  };
  const confirm = vi.fn();
  render(
    <V3FormGroupSenseEditor
      pos={pos}
      group={group}
      senses={[blank, unsaved]}
      savedSenseIds={new Set([blank.id])}
      onConfirm={confirm}
      onCancel={vi.fn()}
      onGoToMeanings={vi.fn()}
    />
  );
  expect(screen.getByRole("checkbox", { name: /待填写释义/ })).toBeChecked();
  expect(
    screen.getByRole("checkbox", { name: /尚未保存的词义/ })
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "确认选择" }));
  expect(confirm).toHaveBeenCalledWith([blank.id]);
});
