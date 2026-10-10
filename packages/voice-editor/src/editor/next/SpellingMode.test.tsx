import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { RichTextV2 } from "@tsz/types";
import { VoiceEditor } from "./VoiceEditor";

vi.mock("../../marks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../marks")>()),
  useLiaisonArcs: (_container: unknown, collect: () => unknown[]) => ({
    arcs: collect().map((_, index) => ({
      key: String(index),
      index,
      d: "M 0 0 Q 10 -10 20 0"
    })),
    strokeWidth: 2
  })
}));

const value: RichTextV2 = {
  version: 2,
  text: "boiled potatoes",
  annotations: []
};
const button = (name: string) => screen.getByRole("button", { name });
function select(start: number, end: number) {
  const input = screen.getByLabelText<HTMLTextAreaElement>("语音编辑器");
  input.focus();
  input.setSelectionRange(start, end);
  fireEvent.mouseUp(input);
  fireEvent.select(input);
}

it("拼写选区可叠加斜体和多字符连读，清除连读保留斜体且可撤销", () => {
  const changed = vi.fn();
  render(
    <VoiceEditor
      mode="spelling"
      value={value}
      onChange={changed}
      renderActions={(canComplete) => (
        <button disabled={!canComplete}>完成</button>
      )}
    />
  );
  expect(button("斜体")).toBeDisabled();
  expect(button("连读起点")).toBeDisabled();
  select(3, 6);
  fireEvent.click(button("斜体"));
  fireEvent.click(button("连读起点"));
  expect(button("完成")).toBeDisabled();
  select(7, 9);
  fireEvent.click(button("连读终点"));
  expect(button("完成")).toBeEnabled();
  expect(changed.mock.lastCall?.[0].annotations).toEqual([
    { type: "liaison", start: 3, end: 9, start_len: 3, end_len: 2 },
    { type: "italic", start: 3, end: 6 }
  ]);
  fireEvent.click(button("清除模式"));
  fireEvent.mouseDown(document.querySelector(".tsz-ve-arc-hit")!, {
    button: 0
  });
  expect(changed.mock.lastCall?.[0].annotations).toEqual([
    { type: "italic", start: 3, end: 6 }
  ]);
  expect(changed.mock.lastCall?.[0].text).toBe(value.text);
  fireEvent.click(button("上一步"));
  expect(changed.mock.lastCall?.[0].annotations).toHaveLength(2);
  fireEvent.click(button("下一步"));
  expect(changed.mock.lastCall?.[0].annotations).toHaveLength(1);
});

it.each(["spelling", "actual-pron"] as const)(
  "%s 可一次性连读、退出清除并继续改字，实际发音没有斜体工具",
  (mode) => {
    const changed = vi.fn();
    render(<VoiceEditor mode={mode} value={value} onChange={changed} />);
    if (mode === "actual-pron")
      expect(screen.queryByRole("button", { name: "斜体" })).toBeNull();
    expect(screen.queryByRole("button", { name: "停顿" })).toBeNull();
    select(5, 8);
    fireEvent.click(button("一次性添加"));
    expect(changed.mock.lastCall?.[0].annotations).toEqual([
      { type: "liaison", start: 5, end: 8, start_len: 1, end_len: 1 }
    ]);
    fireEvent.click(button("清除模式"));
    fireEvent.keyDown(button("清除模式"), { key: "Escape" });
    expect(button("清除模式")).toHaveAttribute("aria-pressed", "false");
    fireEvent.change(screen.getByLabelText("语音编辑器"), {
      target: { value: "boiled potatoes today" }
    });
    expect(changed.mock.lastCall?.[0]).toEqual({
      version: 2,
      text: "boiled potatoes today",
      annotations: [
        { type: "liaison", start: 5, end: 8, start_len: 1, end_len: 1 }
      ]
    });
  }
);

it("完成前规范化拼写保留编辑历史，检查提示后可完成，也能撤销规范化", () => {
  const completed = vi.fn();
  const changed = vi.fn();
  render(
    <VoiceEditor
      mode="spelling"
      value={{
        version: 2,
        text: "  café",
        annotations: [{ type: "italic", start: 2, end: 6 }]
      }}
      onChange={changed}
      renderActions={(canComplete, prepare) => (
        <button
          disabled={!canComplete}
          onClick={() => {
            if (prepare?.()) completed();
          }}
        >
          完成
        </button>
      )}
    />
  );
  fireEvent.click(button("完成"));
  expect(completed).not.toHaveBeenCalled();
  expect(screen.getByLabelText("语音编辑器")).toHaveValue("café");
  expect(changed.mock.lastCall?.[0]).toEqual({
    version: 2,
    text: "café",
    annotations: [{ type: "italic", start: 0, end: 4 }]
  });
  fireEvent.click(button("上一步"));
  expect(screen.getByLabelText("语音编辑器")).toHaveValue("  café");
  fireEvent.click(button("下一步"));
  fireEvent.click(button("完成"));
  expect(completed).toHaveBeenCalledOnce();
});

it.each(["spelling", "actual-pron"] as const)(
  "只读 %s 不允许新增或清除标注",
  (mode) => {
    const changed = vi.fn();
    render(
      <VoiceEditor mode={mode} readOnly value={value} onChange={changed} />
    );
    expect(button("清除模式")).toBeDisabled();
    expect(button("一次性添加")).toBeDisabled();
    expect(changed).not.toHaveBeenCalled();
  }
);

it("规范化提示不阻断再次完成，无须撤销才能提交", () => {
  const complete = vi.fn();
  render(
    <VoiceEditor
      mode="spelling"
      value={{ version: 2, text: " ORBIT ", annotations: [] }}
      onChange={vi.fn()}
      renderActions={(canComplete, prepare) => (
        <button
          disabled={!canComplete}
          onClick={() => {
            if (prepare?.()) complete();
          }}
        >
          完成
        </button>
      )}
    />
  );
  fireEvent.click(button("完成"));
  expect(button("完成")).toBeEnabled();
  expect(screen.getByText(/已规范化拼写/)).toBeInTheDocument();
  fireEvent.click(button("完成"));
  expect(complete).toHaveBeenCalledOnce();
});
