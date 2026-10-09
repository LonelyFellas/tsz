import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { VoiceEditor } from "./VoiceEditor";

it.each(["a b  ", "a b\n\n", "a b \n\n  "])(
  "点击尾部空白保留正文位置：%j",
  (text) => {
    const { container } = render(
      <VoiceEditor
        mode="grammar"
        value={{
          version: 2,
          text,
          annotations: [{ type: "pause", at: 1, duration_ms: 200 }]
        }}
        onChange={vi.fn()}
      />
    );
    const strip = container.querySelector(".tsz-ve-strip")!;
    const range = document.createRange();
    range.selectNodeContents(strip);
    range.collapse(false);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    fireEvent.mouseUp(strip, { button: 0, clientX: 20, clientY: 300 });
    const input = screen.getByLabelText("语音编辑器") as HTMLTextAreaElement;
    expect(input.selectionStart).toBe(text.length);
    expect(input.selectionEnd).toBe(text.length);
    expect(input).toHaveValue(text);
    expect(container.querySelectorAll(".tsz-ve-inline-caret")).toHaveLength(1);
  }
);

it.each([4, 6, 7, 8, 9])("键盘光标在空白码点 %i 仍可显示", (point) => {
  const { container } = render(
    <VoiceEditor
      mode="grammar"
      value={{
        version: 2,
        text: "a b  \n\n  ",
        annotations: [{ type: "pause", at: 1, duration_ms: 200 }]
      }}
      onChange={vi.fn()}
    />
  );
  const input = screen.getByLabelText("语音编辑器") as HTMLTextAreaElement;
  input.focus();
  input.setSelectionRange(point, point);
  fireEvent.mouseUp(input);
  fireEvent.select(input);
  const caret = container.querySelector(".tsz-ve-inline-caret");
  expect(caret).not.toBeNull();
  const anchor = caret!.parentElement!;
  expect(
    Number(anchor.dataset.codepoint) +
      (caret!.getAttribute("data-edge") === "after"
        ? Array.from(anchor.dataset.letter!).length
        : 0)
  ).toBe(point);
});

it.each([
  ["Home", 7, 5],
  ["End", 6, 8],
  ["Home", 4, 4],
  ["End", 4, 4]
] as const)("%s 从码点 %i 定位到当前行的 %i", (key, from, to) => {
  const { container } = render(
    <VoiceEditor
      mode="grammar"
      value={{
        version: 2,
        text: "a b\n\nxyz",
        annotations: [{ type: "pause", at: 1, duration_ms: 200 }]
      }}
      onChange={vi.fn()}
    />
  );
  for (const element of container.querySelectorAll<HTMLElement>(
    "[data-codepoint]"
  )) {
    const point = Number(element.dataset.codepoint);
    const top = point < 4 ? 0 : point < 5 ? 20 : 40;
    const left = point < 4 ? point * 10 : Math.max(0, point - 5) * 10;
    const width = /\s/u.test(element.dataset.letter!) ? 0 : 10;
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
      x: left,
      y: top,
      top,
      bottom: top + 10,
      left,
      right: left + width,
      width,
      height: 10,
      toJSON: () => ({})
    });
  }
  const input = screen.getByLabelText("语音编辑器") as HTMLTextAreaElement;
  input.focus();
  input.setSelectionRange(from, from);
  fireEvent.mouseUp(input);
  fireEvent.select(input);
  fireEvent.keyDown(input, { key });
  expect(input.selectionStart).toBe(to);
  expect(input.selectionEnd).toBe(to);
});

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
  expect(
    container.querySelectorAll(".tsz-ve-letter.is-text-selected")
  ).toHaveLength(12);
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
  const endRange = document.createRange();
  endRange.setStart(
    container.querySelector('[data-codepoint="11"] .tsz-ve-letter-text')!
      .firstChild!,
    1
  );
  endRange.collapse(true);
  const original = Object.getOwnPropertyDescriptor(
    document,
    "caretRangeFromPoint"
  );
  Object.defineProperty(document, "caretRangeFromPoint", {
    configurable: true,
    value: vi.fn(() => endRange)
  });
  range.setEnd(range.startContainer, range.startOffset);
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
  try {
    fireEvent.mouseUp(container.querySelector(".tsz-ve-strip")!, {
      button: 0,
      clientX: 500,
      clientY: 10
    });
    expect(input.selectionStart).toBe(text.length);
    expect(input.selectionEnd).toBe(text.length);
  } finally {
    if (original)
      Object.defineProperty(document, "caretRangeFromPoint", original);
    else Reflect.deleteProperty(document, "caretRangeFromPoint");
  }
  fireEvent.change(input, { target: { value: "new jobs instead" } });
  expect(onChange.mock.lastCall?.[0].text).toBe("new jobs instead");
  expect(onChange.mock.lastCall?.[0].annotations).toContainEqual({
    type: "pause",
    at: 8,
    duration_ms: 200
  });
});
