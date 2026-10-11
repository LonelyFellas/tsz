import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { createPortal } from "react-dom";
import type { RichTextV2 } from "@tsz/types";
import { VoiceEditor } from "./VoiceEditor";

afterEach(() => vi.restoreAllMocks());

const value: RichTextV2 = {
  version: 2,
  text: "😀 a job",
  annotations: []
};

function select(start: number, end: number, label = "语音编辑器") {
  const input = screen.getByLabelText<HTMLTextAreaElement>(label);
  input.focus();
  input.setSelectionRange(start, end);
  fireEvent.select(input);
  return input;
}

function shortcut(
  target: HTMLElement,
  key: string,
  modifiers: KeyboardEventInit = { ctrlKey: true }
) {
  const event = createEvent.keyDown(target, { key, ...modifiers });
  fireEvent(target, event);
  return event;
}

it.each(["ctrlKey", "metaKey"])(
  "%s 的 B/I/U 操作码点选区，可局部取消并逐步撤销，保留业务关联",
  (modifier) => {
    const changed = vi.fn();
    const link = {
      id: "job",
      source_segments: [{ start: 4, end: 7, surface: "job" }]
    };
    render(
      <VoiceEditor
        mode="association"
        value={value}
        textLinks={[link]}
        onChange={changed}
      />
    );
    const input = select(5, 8);
    for (const key of ["b", "i", "u"])
      expect(shortcut(input, key, { [modifier]: true }).defaultPrevented).toBe(
        true
      );
    const formatted = changed.mock.lastCall?.[0] as RichTextV2;
    expect(formatted.annotations).toEqual([
      { type: "italic", start: 4, end: 7 },
      { type: "bold", start: 4, end: 7 },
      { type: "underline", start: 4, end: 7 }
    ]);
    expect(changed.mock.lastCall?.[1]).toEqual([link]);
    expect(
      document.querySelectorAll(".is-bold.is-italic.is-underline")
    ).toHaveLength(3);
    select(6, 7);
    shortcut(input, "u", { [modifier]: true });
    expect(changed.mock.lastCall?.[0].annotations).toContainEqual({
      type: "underline",
      start: 4,
      end: 5
    });
    expect(changed.mock.lastCall?.[0].annotations).toContainEqual({
      type: "underline",
      start: 6,
      end: 7
    });
    shortcut(input, "z", { [modifier]: true });
    expect(changed.mock.lastCall?.[0]).toEqual(formatted);
    for (let step = 0; step < 3; step++)
      shortcut(input, "z", { [modifier]: true });
    expect(changed.mock.lastCall).toEqual([value, [link]]);
    expect(shortcut(input, "z", { [modifier]: true }).defaultPrevented).toBe(
      true
    );
  }
);

it.each(["grammar", "spelling", "actual-pron", "pronunciation"] as const)(
  "%s 的 L 复用一次性连读，Z 撤销整条连线，按钮仍可重做",
  (mode) => {
    const changed = vi.fn();
    render(<VoiceEditor mode={mode} value={value} onChange={changed} />);
    const input = select(3, 8);
    expect(shortcut(input, "l").defaultPrevented).toBe(true);
    expect(changed.mock.lastCall?.[0].annotations).toEqual([
      { type: "liaison", start: 2, end: 7, start_len: 1, end_len: 1 }
    ]);
    shortcut(input, "z");
    expect(changed.mock.lastCall?.[0]).toEqual(value);
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(changed.mock.lastCall?.[0].annotations).toHaveLength(1);
  }
);

it("输入与格式共用撤销历史，格式后的新输入不会合并到之前的输入", () => {
  const changed = vi.fn();
  render(<VoiceEditor mode="spelling" value={value} onChange={changed} />);
  const input = screen.getByLabelText("语音编辑器");
  fireEvent.change(input, { target: { value: "a job" } });
  select(2, 5);
  shortcut(input, "i");
  fireEvent.change(input, { target: { value: "a job today" } });
  shortcut(input, "z");
  expect(changed.mock.lastCall?.[0]).toEqual({
    version: 2,
    text: "a job",
    annotations: [{ type: "italic", start: 2, end: 5 }]
  });
  shortcut(input, "z");
  expect(changed.mock.lastCall?.[0].annotations).toEqual([]);
  shortcut(input, "z");
  expect(changed.mock.lastCall?.[0]).toEqual(value);
});

it("撤销后原生选区未变时仍可继续格式和连读，收起选区后不使用旧范围", () => {
  const changed = vi.fn();
  render(<VoiceEditor mode="association" value={value} onChange={changed} />);
  const input = select(5, 8);
  shortcut(input, "b");
  shortcut(input, "z");
  shortcut(input, "i");
  expect(changed.mock.lastCall?.[0].annotations).toEqual([
    { type: "italic", start: 4, end: 7 }
  ]);
  shortcut(input, "z");
  shortcut(input, "l");
  expect(changed.mock.lastCall?.[0].annotations).toEqual([
    { type: "liaison", start: 4, end: 7, start_len: 1, end_len: 1 }
  ]);
  changed.mockClear();
  input.setSelectionRange(5, 5);
  shortcut(input, "u");
  expect(changed).not.toHaveBeenCalled();
});

it("连读快捷键保留停顿冲突确认，取消不写入、确认后可完整撤销", async () => {
  const paused: RichTextV2 = {
    version: 2,
    text: "a job",
    annotations: [{ type: "pause", at: 1, duration_ms: 500 }]
  };
  const changed = vi.fn();
  render(<VoiceEditor mode="grammar" value={paused} onChange={changed} />);
  let input = select(0, 5);
  shortcut(input, "l");
  fireEvent.click(
    await screen.findByRole("button", { name: "取消，保留原标注" })
  );
  expect(changed).not.toHaveBeenCalled();
  input = select(0, 5);
  shortcut(input, "l");
  fireEvent.click(
    await screen.findByRole("button", { name: "移除冲突停顿，添加连读" })
  );
  expect(changed.mock.lastCall?.[0].annotations).toEqual([
    { type: "liaison", start: 0, end: 5, start_len: 1, end_len: 1 }
  ]);
  shortcut(input, "z");
  expect(changed.mock.lastCall?.[0]).toEqual(paused);
});

it("快捷键不扩大当前字段工具或只读权限，没有选区不新增标注", () => {
  const changed = vi.fn();
  const view = render(
    <VoiceEditor mode="association" value={value} onChange={changed} />
  );
  let input = select(5, 5);
  for (const key of ["b", "i", "u", "l"]) shortcut(input, key);
  expect(changed).not.toHaveBeenCalled();
  for (const props of [
    { mode: "association" as const, readOnly: true },
    { mode: "association" as const, contentReadOnly: true },
    { mode: "association" as const, textFormattingEnabled: false },
    { mode: "dict-phonetic" as const },
    { mode: "actual-pron" as const },
    { mode: "spelling" as const }
  ]) {
    view.rerender(<VoiceEditor {...props} value={value} onChange={changed} />);
    input = select(5, 8);
    for (const key of ["b", "u"]) shortcut(input, key);
    if (props.mode !== "spelling") shortcut(input, "i");
    if (
      props.readOnly ||
      props.contentReadOnly ||
      props.mode === "dict-phonetic"
    )
      shortcut(input, "l");
    expect(changed).not.toHaveBeenCalled();
  }
});

it("已有编辑历史在切换只读后也不能通过 Z 回退，正文锁定仍可标注", () => {
  const changed = vi.fn();
  const view = render(
    <VoiceEditor
      mode="association"
      textReadOnly
      value={value}
      onChange={changed}
    />
  );
  shortcut(select(5, 8), "b");
  const formatted = changed.mock.lastCall?.[0];
  expect(formatted.annotations).toEqual([{ type: "bold", start: 4, end: 7 }]);
  for (const props of [{ readOnly: true }, { contentReadOnly: true }]) {
    view.rerender(
      <VoiceEditor
        mode="association"
        {...props}
        value={value}
        onChange={changed}
      />
    );
    changed.mockClear();
    shortcut(select(5, 8), "z");
    expect(changed).not.toHaveBeenCalled();
    expect(document.querySelectorAll(".is-bold")).toHaveLength(3);
  }
});

it("L 不连接单字符或跨行选区，保留原有校验提示", () => {
  const changed = vi.fn();
  render(
    <VoiceEditor
      mode="grammar"
      value={{ version: 2, text: "a\njob", annotations: [] }}
      onChange={changed}
    />
  );
  shortcut(select(0, 1), "l");
  expect(changed).not.toHaveBeenCalled();
  shortcut(select(0, 5), "l");
  expect(
    screen.getByText("连读不能跨越换行，请把两个词放在同一行")
  ).toBeInTheDocument();
  expect(changed).not.toHaveBeenCalled();
});

it("快捷键限定当前编辑器，不接管其他输入框、输入法或额外修饰键", () => {
  const first = vi.fn();
  const second = vi.fn();
  render(
    <>
      <input aria-label="外部输入" />
      <VoiceEditor
        mode="association"
        value={value}
        onChange={first}
        renderActions={() => <input aria-label="辅助输入" />}
      />
      <VoiceEditor
        mode="association"
        contextLabel="另一个编辑器"
        value={value}
        onChange={second}
      />
    </>
  );
  const input = select(5, 8);
  for (const modifiers of [
    {},
    { ctrlKey: true, altKey: true },
    { metaKey: true, shiftKey: true },
    { ctrlKey: true, isComposing: true }
  ])
    expect(shortcut(input, "b", modifiers).defaultPrevented).toBe(false);
  for (const label of ["辅助输入", "外部输入"])
    for (const key of ["b", "l", "z"])
      expect(shortcut(screen.getByLabelText(label), key).defaultPrevented).toBe(
        false
      );
  expect(first).not.toHaveBeenCalled();
  shortcut(select(5, 8, "另一个编辑器"), "b");
  expect(second.mock.lastCall?.[0].annotations).toEqual([
    { type: "bold", start: 4, end: 7 }
  ]);
  expect(first).not.toHaveBeenCalled();
});

it("工具栏焦点可使用快捷键，与鼠标操作共用历史，新操作清空重做", () => {
  const changed = vi.fn();
  render(<VoiceEditor mode="association" value={value} onChange={changed} />);
  select(5, 8);
  const bold = screen.getByRole("button", { name: "加粗" });
  bold.focus();
  shortcut(bold, "B", { metaKey: true });
  fireEvent.click(screen.getByRole("button", { name: "斜体" }));
  const undo = screen.getByRole("button", { name: "上一步" });
  shortcut(undo, "z", { metaKey: true, isComposing: true });
  expect(changed.mock.lastCall?.[0].annotations).toHaveLength(2);
  shortcut(undo, "z", { metaKey: true });
  expect(changed.mock.lastCall?.[0].annotations).toEqual([
    { type: "bold", start: 4, end: 7 }
  ]);
  expect(screen.getByRole("button", { name: "下一步" })).toBeEnabled();
  shortcut(select(5, 8), "u");
  expect(screen.getByRole("button", { name: "下一步" })).toBeDisabled();
  fireEvent.click(undo);
  shortcut(undo, "z");
  expect(changed.mock.lastCall?.[0]).toEqual(value);
});

it.each(["ctrlKey", "metaKey"])(
  "%s 全选范围未变也同步工具栏，可在撤销后继续操作",
  (modifier) => {
    const changed = vi.fn();
    render(<VoiceEditor mode="association" value={value} onChange={changed} />);
    const input = select(0, value.text.length);
    shortcut(input, "b", { [modifier]: true });
    shortcut(input, "z", { [modifier]: true });
    const bold = screen.getByRole("button", { name: "加粗" });
    expect(bold).toBeDisabled();
    fireEvent.keyUp(input, { key: "a", [modifier]: true });
    expect(bold).toBeEnabled();
    shortcut(bold, "b", { [modifier]: true });
    expect(changed.mock.lastCall?.[0].annotations).toEqual([
      { type: "bold", start: 0, end: 7 }
    ]);
  }
);

it("重复 L 不生成重复连线或多余历史，仍可一次撤销", () => {
  const changed = vi.fn();
  render(<VoiceEditor mode="association" value={value} onChange={changed} />);
  const input = select(3, 8);
  shortcut(input, "l");
  expect(changed.mock.lastCall?.[0].annotations).toEqual([
    { type: "liaison", start: 2, end: 7, start_len: 1, end_len: 1 }
  ]);
  changed.mockClear();
  shortcut(input, "l", { ctrlKey: true, repeat: true });
  expect(changed).not.toHaveBeenCalled();
  expect(screen.getByText("这两处已经连过了")).toBeInTheDocument();
  shortcut(input, "z");
  expect(changed.mock.lastCall?.[0]).toEqual(value);
  expect(screen.getByRole("button", { name: "上一步" })).toBeDisabled();
});

it("portal 控件、可编辑辅助区域和已被处理的事件不触发编辑器命令", () => {
  const changed = vi.fn();
  render(
    <VoiceEditor
      mode="association"
      value={value}
      onChange={changed}
      renderActions={() => (
        <>
          {createPortal(<button>外部浮层操作</button>, document.body)}
          <div contentEditable aria-label="辅助富文本" />
          <button onKeyDown={(event) => event.preventDefault()}>
            已处理的操作
          </button>
        </>
      )}
    />
  );
  select(5, 8);
  for (const target of [
    screen.getByRole("button", { name: "外部浮层操作" }),
    screen.getByLabelText("辅助富文本")
  ]) {
    for (const key of ["b", "l", "z"])
      expect(shortcut(target, key).defaultPrevented).toBe(false);
  }
  shortcut(screen.getByRole("button", { name: "已处理的操作" }), "b");
  expect(changed).not.toHaveBeenCalled();
});

it("受控值回灌保留快捷键历史，外部替换正文后不能撤销回旧内容", () => {
  function Host() {
    const [current, setCurrent] = useState(value);
    return (
      <>
        <VoiceEditor mode="association" value={current} onChange={setCurrent} />
        <output data-testid="current">{JSON.stringify(current)}</output>
        <button
          onClick={() =>
            setCurrent({ version: 2, text: "new content", annotations: [] })
          }
        >
          切换正文
        </button>
      </>
    );
  }
  render(<Host />);
  shortcut(select(5, 8), "b");
  shortcut(screen.getByLabelText("语音编辑器"), "z");
  expect(JSON.parse(screen.getByTestId("current").textContent!)).toEqual(value);
  fireEvent.click(screen.getByRole("button", { name: "下一步" }));
  expect(
    JSON.parse(screen.getByTestId("current").textContent!).annotations
  ).toEqual([{ type: "bold", start: 4, end: 7 }]);
  fireEvent.click(screen.getByRole("button", { name: "切换正文" }));
  shortcut(screen.getByLabelText("语音编辑器"), "z");
  expect(screen.getByLabelText("语音编辑器")).toHaveValue("new content");
  expect(screen.getByRole("button", { name: "上一步" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "下一步" })).toBeDisabled();
});

it.each([
  ["加粗", "B"],
  ["斜体", "I"],
  ["下划线", "U"],
  ["一次性添加", "L"],
  ["上一步", "Z"]
])("Mac 悬停 %s 只显示 ⌘ + %s 快捷键", async (name, key) => {
  vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
  render(<VoiceEditor mode="association" value={value} onChange={vi.fn()} />);
  select(5, 8);
  fireEvent.click(screen.getByRole("button", { name: "加粗" }));
  fireEvent.mouseOver(screen.getByRole("button", { name }));
  const tooltip = await screen.findByRole("tooltip");
  expect(tooltip).toHaveTextContent(`⌘ + ${key}`);
  expect(tooltip).not.toHaveTextContent("Ctrl");
  expect(tooltip).not.toHaveTextContent("Mac");
  expect(tooltip).not.toHaveTextContent("Win");
});

it.each([false, true])(
  "正文只读=%s 时悬停正文和文本按钮不显示剪贴板提示",
  (readOnly) => {
    render(
      <VoiceEditor
        mode="association"
        readOnly={readOnly}
        value={value}
        onChange={vi.fn()}
      />
    );
    fireEvent.mouseOver(screen.getByLabelText("语音编辑器"));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.mouseOver(screen.getByRole("button", { name: "编辑文本" }));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  }
);

it("连续剪切、粘贴和键入分别撤销，不合并为一次打字", () => {
  const changed = vi.fn();
  render(<VoiceEditor mode="association" value={value} onChange={changed} />);
  const input = screen.getByLabelText("语音编辑器");
  fireEvent.input(input, { target: { value: "" }, inputType: "deleteByCut" });
  fireEvent.input(input, {
    target: { value: "a job" },
    inputType: "insertFromPaste"
  });
  fireEvent.input(input, {
    target: { value: "a jobs" },
    inputType: "insertText"
  });
  shortcut(input, "z");
  expect(changed.mock.lastCall?.[0].text).toBe("a job");
  shortcut(input, "z");
  expect(changed.mock.lastCall?.[0].text).toBe("");
  shortcut(input, "z");
  expect(changed.mock.lastCall?.[0]).toEqual(value);
});

it.each([false, true])(
  "含停顿正文只读=%s 时悬停显示层不显示剪贴板提示",
  (readOnly) => {
    const { container } = render(
      <VoiceEditor
        mode="grammar"
        readOnly={readOnly}
        value={{
          version: 2,
          text: "a job",
          annotations: [{ type: "pause", at: 1, duration_ms: 200 }]
        }}
        onChange={vi.fn()}
      />
    );
    const strip = container.querySelector(".tsz-ve-strip")!;
    fireEvent.mouseOver(strip);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  }
);

it("清除画笔下显示层不显示剪贴板提示，点击停顿可正常清除", () => {
  const changed = vi.fn();
  const { container } = render(
    <VoiceEditor
      mode="grammar"
      value={{
        version: 2,
        text: "a job",
        annotations: [{ type: "pause", at: 1, duration_ms: 200 }]
      }}
      onChange={changed}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "清除模式" }));
  fireEvent.mouseOver(container.querySelector(".tsz-ve-strip")!);
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  const pause = container.querySelector(".tsz-ve-pause-chip")!;
  expect(pause).toHaveAttribute("aria-label", "清除第 1 处停顿 0.2 秒");
  fireEvent.click(pause);
  expect(changed.mock.lastCall?.[0]).toEqual({
    version: 2,
    text: "a job",
    annotations: []
  });
});

it("剪切带连读的正文保留改字确认，取消不写入，确认后可一次撤销", async () => {
  const annotated: RichTextV2 = {
    version: 2,
    text: "a job",
    annotations: [
      { type: "liaison", start: 0, end: 5, start_len: 1, end_len: 1 },
      { type: "italic", start: 2, end: 5 }
    ]
  };
  const changed = vi.fn();
  render(
    <VoiceEditor mode="association" value={annotated} onChange={changed} />
  );
  const input = screen.getByLabelText("语音编辑器");
  fireEvent.input(input, { target: { value: "" }, inputType: "deleteByCut" });
  fireEvent.click(await screen.findByRole("button", { name: "保留原文" }));
  expect(changed).not.toHaveBeenCalled();
  expect(input).toHaveValue("a job");
  fireEvent.input(input, { target: { value: "" }, inputType: "deleteByCut" });
  fireEvent.click(await screen.findByRole("button", { name: "确认修改" }));
  expect(changed.mock.lastCall?.[0]).toEqual({
    version: 2,
    text: "",
    annotations: []
  });
  shortcut(input, "z");
  expect(changed.mock.lastCall?.[0]).toEqual(annotated);
});

it("粘贴改错再粘贴原文可恢复句内关联，并能逐步撤销", async () => {
  const original: RichTextV2 = { version: 2, text: "a job", annotations: [] };
  const link = {
    id: "job",
    source_segments: [{ start: 2, end: 5, surface: "job" }]
  };
  const changed = vi.fn();
  render(
    <VoiceEditor
      mode="association"
      value={original}
      textLinks={[link]}
      restoreTextLinksOnCorrection
      onChange={changed}
    />
  );
  const input = screen.getByLabelText("语音编辑器");
  fireEvent.input(input, {
    target: { value: "a work" },
    inputType: "insertFromPaste"
  });
  fireEvent.click(await screen.findByRole("button", { name: "确认修改" }));
  expect(changed.mock.lastCall?.[1]).toEqual([]);
  expect(screen.getByText(/部分关联暂时失效/)).toBeVisible();
  fireEvent.input(input, {
    target: { value: "a job" },
    inputType: "insertFromPaste"
  });
  expect(changed.mock.lastCall?.[1]).toEqual([link]);
  shortcut(input, "z");
  expect(changed.mock.lastCall?.[0].text).toBe("a work");
  expect(changed.mock.lastCall?.[1]).toEqual([]);
  shortcut(input, "z");
  expect(changed.mock.lastCall).toEqual([original, [link]]);
});
