import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { GrammarFormLinkV3, RichTextV2 } from "@tsz/types";
import { VoiceEditor } from "./VoiceEditor";

// jsdom 不测量文字墨迹；只替换弧线几何，点击仍走实际 SVG 命中区。
vi.mock("../../marks", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../marks")>();
  return {
    ...original,
    useLiaisonArcs: (_container: unknown, collectLinks: () => unknown[]) => ({
      arcs: collectLinks().map((_, index) => ({
        key: String(index),
        index,
        d: "M 0 0 Q 10 -10 20 0"
      })),
      strokeWidth: 2
    })
  };
});

const value: RichTextV2 = {
  version: 2,
  text: "a job and work",
  annotations: [
    { type: "liaison", start: 0, end: 3, start_len: 1, end_len: 1 },
    { type: "emphasis", start: 2, end: 5, level: "core" },
    { type: "pause", at: 5, duration_ms: 500 },
    { type: "pause", at: 9, duration_ms: 1000 }
  ]
};
const link: GrammarFormLinkV3 = {
  id: "job-link",
  source_segments: [{ start: 2, end: 5, surface: "job" }],
  target_word_id: "job",
  target_pos_id: "noun",
  target_form_id: "base",
  target_variant_id: "common",
  target_dialect: "common"
};

it.each(["grammar", "association"] as const)(
  "%s 清除模式逐个取消连读与停顿，保留正文、格式和关联，并支持撤销",
  (mode) => {
    const onChange = vi.fn();
    render(
      <VoiceEditor<GrammarFormLinkV3>
        mode={mode}
        value={value}
        textLinks={[link]}
        onChange={onChange}
      />
    );
    const toggle = screen.getByRole("button", { name: "清除模式" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByLabelText("第 1 处词缝"), { button: 0 });
    fireEvent.mouseDown(screen.getByLabelText("job 的第 1 个字母 j"), {
      button: 0
    });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText("清除第 2 处停顿 0.5 秒"));
    expect(onChange.mock.lastCall).toEqual([
      {
        ...value,
        annotations: value.annotations.filter(
          (item) => item.type !== "pause" || item.at !== 5
        )
      },
      [link]
    ]);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    fireEvent.mouseDown(document.querySelector(".tsz-ve-arc-hit")!, {
      button: 2
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    fireEvent.mouseDown(document.querySelector(".tsz-ve-arc-hit")!, {
      button: 0
    });
    expect(onChange.mock.lastCall?.[0].annotations).toEqual([
      value.annotations[1],
      value.annotations[3]
    ]);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    fireEvent.mouseDown(screen.getByLabelText("第 3 处词缝：停顿 1s"), {
      button: 0
    });
    expect(onChange.mock.lastCall).toEqual([
      { ...value, annotations: [value.annotations[1]] },
      [link]
    ]);
    for (let step = 0; step < 3; step += 1)
      fireEvent.click(screen.getByRole("button", { name: "上一步" }));
    expect(onChange.mock.lastCall).toEqual([value, [link]]);
  }
);

it("清除模式可再次点击或按 Esc 退出，切换工具后恢复停顿调整", () => {
  const onChange = vi.fn();
  render(<VoiceEditor mode="grammar" value={value} onChange={onChange} />);
  const toggle = screen.getByRole("button", { name: "清除模式" });
  fireEvent.click(toggle);
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(toggle);
  fireEvent.keyDown(toggle, { key: "Escape" });
  expect(toggle).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(toggle);
  fireEvent.click(screen.getByRole("button", { name: "编辑文本" }));
  expect(toggle).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(screen.getByLabelText("编辑第 2 处停顿 0.5 秒"));
  expect(screen.getByRole("button", { name: "移除停顿" })).toBeEnabled();
  expect(onChange).not.toHaveBeenCalled();
});

it("只读语法结构不能开启清除模式", () => {
  const onChange = vi.fn();
  render(
    <VoiceEditor mode="grammar" value={value} readOnly onChange={onChange} />
  );
  expect(screen.getByRole("button", { name: "清除模式" })).toBeDisabled();
  expect(onChange).not.toHaveBeenCalled();
});
