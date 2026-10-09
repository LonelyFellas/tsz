import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { VoiceEditor } from "./VoiceEditor";

it("跨行内停顿选字按原文映射，标签不进入正文或斜体范围", () => {
  const text = "😀 jobs instead";
  const onChange = vi.fn();
  const { container } = render(
    <VoiceEditor
      mode="grammar"
      value={{
        version: 2,
        text,
        annotations: [{ type: "pause", at: 6, duration_ms: 200 }]
      }}
      onChange={onChange}
    />
  );
  const input = screen.getByLabelText("语音编辑器") as HTMLTextAreaElement;
  const range = document.createRange();
  range.setStart(
    container.querySelector('[data-codepoint="0"] .tsz-ve-letter-text')!
      .firstChild!,
    0
  );
  range.setEnd(
    container.querySelector('[data-codepoint="13"] .tsz-ve-letter-text')!
      .firstChild!,
    1
  );
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
  fireEvent.mouseUp(container.querySelector(".tsz-ve-strip")!, { button: 0 });
  expect(input).toHaveValue(text);
  expect(input.selectionStart).toBe(0);
  expect(input.selectionEnd).toBe(text.length);
  expect(document.activeElement).toBe(input);
  expect(container.querySelectorAll(".is-text-selected")).toHaveLength(12);
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "斜体" }));
  expect(onChange.mock.lastCall?.[0]).toEqual({
    version: 2,
    text,
    annotations: [
      { type: "italic", start: 0, end: 14 },
      { type: "pause", at: 6, duration_ms: 200 }
    ]
  });
});

it("标签后方选区、键盘光标和原文编辑使用同一套码点", () => {
  const text = "jobs instead";
  const onChange = vi.fn();
  const { container } = render(
    <VoiceEditor
      mode="grammar"
      value={{
        version: 2,
        text,
        annotations: [{ type: "pause", at: 4, duration_ms: 200 }]
      }}
      onChange={onChange}
    />
  );
  const input = screen.getByLabelText("语音编辑器") as HTMLTextAreaElement;
  const range = document.createRange();
  range.setStart(
    container.querySelector('[data-codepoint="5"] .tsz-ve-letter-text')!
      .firstChild!,
    0
  );
  range.setEnd(
    container.querySelector('[data-codepoint="11"] .tsz-ve-letter-text')!
      .firstChild!,
    1
  );
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
  fireEvent.mouseUp(container.querySelector(".tsz-ve-strip")!, { button: 0 });
  expect(input.selectionStart).toBe(5);
  expect(input.selectionEnd).toBe(12);
  expect(container.querySelector(".tsz-ve-selection-status")).toHaveTextContent(
    "已选中 instead"
  );
  fireEvent.doubleClick(
    [...container.querySelectorAll(".tsz-ve-token")].find(
      (word) => word.textContent === "jobs"
    )!
  );
  expect(input.selectionStart).toBe(0);
  expect(input.selectionEnd).toBe(4);
  input.setSelectionRange(5, 5);
  fireEvent.mouseUp(input);
  fireEvent.select(input);
  expect(container.querySelector(".tsz-ve-inline-caret")).toHaveAttribute(
    "data-edge",
    "before"
  );
  expect(
    container.querySelector(".tsz-ve-inline-caret")!.parentElement
  ).toHaveAttribute("data-codepoint", "5");
  for (const element of container.querySelectorAll<HTMLElement>(
    ".tsz-ve-letter"
  )) {
    const point = Number(element.dataset.codepoint);
    const left = point * 10 + (point >= 5 ? 50 : 0);
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
      left,
      right: left + 10,
      top: 0,
      bottom: 20,
      x: left,
      y: 0,
      width: 10,
      height: 20,
      toJSON: () => ({})
    });
  }
  range.setEnd(range.startContainer, range.startOffset);
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
  fireEvent.mouseUp(container.querySelector(".tsz-ve-strip")!, {
    button: 0,
    clientX: 500,
    clientY: 10
  });
  expect(input.selectionStart).toBe(text.length);
  expect(input.selectionEnd).toBe(text.length);
  fireEvent.change(input, { target: { value: "new jobs instead" } });
  expect(onChange.mock.lastCall?.[0].text).toBe("new jobs instead");
  expect(onChange.mock.lastCall?.[0].annotations).toContainEqual({
    type: "pause",
    at: 8,
    duration_ms: 200
  });
});
