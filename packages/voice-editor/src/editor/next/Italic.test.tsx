import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { RichTextV2 } from "@tsz/types";
import { normalizeRichTextV2, validateRichTextV2 } from "../../core";
import { RichTextReadOnly } from "../../reader/RichTextReadOnly";
import { annotationsToMarks, marksToAnnotations, remapMarks } from "./tokens";
import { VoiceEditor } from "./VoiceEditor";

function select(start: number, end: number) {
  const input = screen.getByLabelText("语音编辑器") as HTMLTextAreaElement;
  input.focus();
  input.setSelectionRange(start, end);
  fireEvent.mouseUp(input);
  fireEvent.select(input);
}

it("斜体按选区设置、部分取消、撤销和重做，保存重开后与加粗及发音标注共存", () => {
  const value: RichTextV2 = {
    version: 2,
    text: "a job",
    annotations: [
      { type: "emphasis", start: 2, end: 5, level: "core" },
      { type: "phoneme", start: 2, end: 5, alphabet: "ipa", phoneme: "dʒɒb" }
    ]
  };
  const onChange = vi.fn();
  const view = render(
    <VoiceEditor mode="grammar" value={value} onChange={onChange} />
  );
  const italic = screen.getByRole("button", { name: "斜体" });
  expect(italic).toBeDisabled();
  select(2, 5);
  fireEvent.mouseDown(italic);
  fireEvent.click(italic);
  expect(italic).toHaveAttribute("aria-pressed", "true");
  expect(onChange.mock.lastCall?.[0].annotations).toEqual([
    ...value.annotations,
    { type: "italic", start: 2, end: 5 }
  ]);
  select(3, 4);
  fireEvent.click(italic);
  expect(
    onChange.mock.lastCall?.[0].annotations.filter(
      (item: { type: string }) => item.type === "italic"
    )
  ).toEqual([
    { type: "italic", start: 2, end: 3 },
    { type: "italic", start: 4, end: 5 }
  ]);
  fireEvent.click(screen.getByRole("button", { name: "上一步" }));
  expect(onChange.mock.lastCall?.[0].annotations).toContainEqual({
    type: "italic",
    start: 2,
    end: 5
  });
  fireEvent.click(screen.getByRole("button", { name: "下一步" }));
  const saved = onChange.mock.lastCall?.[0] as RichTextV2;
  expect(saved.annotations.filter((item) => item.type !== "italic")).toEqual(
    value.annotations
  );
  view.unmount();
  const reopened = render(
    <VoiceEditor mode="grammar" value={saved} onChange={vi.fn()} />
  );
  expect(
    [...reopened.container.querySelectorAll(".tsz-ve-letter.is-italic")].map(
      (node) => node.textContent
    )
  ).toEqual(["j", "b"]);
  select(4, 5);
  expect(screen.getByRole("button", { name: "斜体" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
});

it("斜体按 Unicode 码点归一化，与其他标注独立，改字只移除受影响片段", () => {
  const value: RichTextV2 = {
    version: 2,
    text: "😀 jobs",
    annotations: [
      { type: "italic", start: 2, end: 4 },
      { type: "italic", start: 4, end: 6 },
      { type: "emphasis", start: 2, end: 6, level: "core" }
    ]
  };
  const normalized = normalizeRichTextV2(value);
  expect(normalized.annotations).toEqual([
    { type: "emphasis", start: 2, end: 6, level: "core" },
    { type: "italic", start: 2, end: 6 }
  ]);
  expect(normalizeRichTextV2(normalized)).toEqual(normalized);
  const mapped = remapMarks(
    value.text,
    "😀 joXs",
    annotationsToMarks(normalized)
  );
  expect(
    marksToAnnotations("😀 joXs", mapped).filter(
      (item) => item.type === "italic"
    )
  ).toEqual([
    { type: "italic", start: 2, end: 4 },
    { type: "italic", start: 5, end: 6 }
  ]);
  for (const [start, end] of [
    [2, 2],
    [0, 9],
    [0, 6]
  ]) {
    expect(
      validateRichTextV2({
        version: 2,
        text: "a\njobs",
        annotations: [{ type: "italic", start: start!, end: end! }]
      })
    ).not.toEqual([]);
  }
});

it("只读预览只对指定范围显示斜体，并保留加粗", () => {
  const { container } = render(
    <RichTextReadOnly
      value={{
        version: 2,
        text: "a job",
        annotations: [
          { type: "italic", start: 3, end: 5 },
          { type: "emphasis", start: 2, end: 5, level: "core" }
        ]
      }}
    />
  );
  expect(container.querySelector("i.tsz-ve-italic")).toHaveTextContent("ob");
  expect(container.querySelectorAll("i.tsz-ve-italic")).toHaveLength(1);
  expect(container.querySelectorAll("strong")[1]).toContainElement(
    container.querySelector("i.tsz-ve-italic")
  );
});

it("整词斜体删除中间字母后，选区仍识别为斜体且可一次取消", () => {
  const onChange = vi.fn();
  render(
    <VoiceEditor
      mode="grammar"
      value={{
        version: 2,
        text: "jobs",
        annotations: [{ type: "italic", start: 0, end: 4 }]
      }}
      onChange={onChange}
    />
  );
  const input = screen.getByLabelText("语音编辑器");
  fireEvent.change(input, { target: { value: "jbs" } });
  const confirm = screen.queryByRole("button", { name: "确认修改" });
  if (confirm) fireEvent.click(confirm);
  expect(input).toHaveValue("jbs");
  select(0, 3);
  const italic = screen.getByRole("button", { name: "斜体" });
  expect(italic).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(italic);
  expect(onChange.mock.lastCall?.[0]).toEqual({
    version: 2,
    text: "jbs",
    annotations: []
  });
});

it("清空标注移除斜体，清除模式只取消连读和停顿", () => {
  const value: RichTextV2 = {
    version: 2,
    text: "a job",
    annotations: [{ type: "italic", start: 2, end: 5 }]
  };
  const onChange = vi.fn();
  render(<VoiceEditor mode="grammar" value={value} onChange={onChange} />);
  const clear = screen.getByRole("button", { name: "清空标注" });
  expect(clear).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "清除模式" }));
  fireEvent.mouseDown(screen.getByLabelText("job 的第 1 个字母 j"), {
    button: 0
  });
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(clear);
  expect(onChange.mock.lastCall?.[0]).toEqual({ ...value, annotations: [] });
});
