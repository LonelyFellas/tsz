import {
  fireEvent,
  render as renderView,
  screen,
  waitFor
} from "@testing-library/react";
import { ConfigProvider } from "antd";
import { useState, type ReactElement } from "react";
const render = (element: ReactElement) =>
  renderView(element, {
    wrapper: ({ children }) => (
      <ConfigProvider theme={{ token: { motion: false } }}>
        {children}
      </ConfigProvider>
    )
  });
import { describe, expect, it, vi } from "vitest";
import type { RichTextV2 } from "@tsz/types";
import { VoiceEditor } from "./VoiceEditor";
import type { VoiceEditorProps } from "../../types";

const initial: RichTextV2 = {
  version: 2,
  text: "a centre of the city",
  annotations: [
    { type: "liaison", start: 7, end: 10, start_len: 1, end_len: 1 },
    { type: "pause", at: 15, duration_ms: 500 }
  ]
};
function Host({
  mode = "grammar",
  value = initial,
  onChange = vi.fn(),
  readOnly = false
}: {
  mode?: VoiceEditorProps["mode"];
  value?: RichTextV2;
  onChange?: (value: RichTextV2) => void;
  readOnly?: boolean;
}) {
  const [data, setData] = useState(value);
  return (
    <>
      <VoiceEditor
        mode={mode}
        value={data}
        readOnly={readOnly}
        onChange={(next) => {
          const rich = next as RichTextV2;
          setData(rich);
          onChange(rich);
        }}
      />
      <output data-testid="data">{JSON.stringify(data)}</output>
    </>
  );
}
const data = () =>
  JSON.parse(screen.getByTestId("data").textContent!) as RichTextV2;
function select(start: number, end = start) {
  const input = screen.getByLabelText("语音编辑器") as HTMLTextAreaElement;
  input.focus();
  input.setSelectionRange(start, end);
  fireEvent.select(input);
  fireEvent.click(input);
}
function openPause() {
  fireEvent.click(screen.getByRole("button", { name: "停顿" }));
}
function button(name: string) {
  return screen.getByRole("button", { name });
}

describe("停顿定位与显式编辑", () => {
  it("打开停顿即可点击词间插入位，选中位置高亮，选择时长后原位显示标记", async () => {
    render(<Host value={{ ...initial, annotations: [] }} />);
    openPause();
    expect(document.querySelector(".tsz-ve-canvas")).toHaveAttribute(
      "data-target",
      "gap"
    );
    const gaps = document.querySelectorAll(".tsz-ve-gap");
    fireEvent.mouseDown(gaps[1]!, { button: 0 });
    expect(gaps[1]).toHaveClass("is-pause-selected");
    expect(document.querySelector(".tsz-ve-pause-location")).toHaveTextContent(
      "centre Ⅱ of"
    );
    expect(data().annotations).toEqual([]);
    fireEvent.click(button("停顿 0.5 秒"));
    await waitFor(() =>
      expect(
        screen.getByLabelText("编辑第 2 处停顿 0.5 秒")
      ).toBeInTheDocument()
    );
    expect(data().annotations).toEqual([
      { type: "pause", at: 8, duration_ms: 500 }
    ]);
    expect(document.querySelector(".tsz-ve-canvas")).toHaveAttribute(
      "data-target",
      "none"
    );
  });
  it("历史冲突只提示，不在载入时自动清理数据", () => {
    const changed = vi.fn();
    const value: RichTextV2 = {
      ...initial,
      annotations: [
        ...initial.annotations,
        { type: "pause", at: 8, duration_ms: 500 }
      ]
    };
    render(<Host value={value} onChange={changed} />);
    expect(
      screen.getByText("现有内容有 1 处停顿与连读重叠，请选择保留哪一种标注")
    ).toBeInTheDocument();
    expect(data()).toEqual(value);
    expect(changed).not.toHaveBeenCalled();
  });

  it("三位小数的秒数转换为整数毫秒，不被浮点误差拒绝", () => {
    render(<Host />);
    fireEvent.click(screen.getByLabelText("编辑第 4 处停顿 0.5 秒"));
    const input = screen.getByLabelText("自定义停顿秒");
    fireEvent.change(input, { target: { value: "1.001" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(data().annotations).toContainEqual({
      type: "pause",
      at: 15,
      duration_ms: 1001
    });
  });
  it.each(["grammar", "pronunciation", "association"] as const)(
    "%s 模式按光标插入，支持改时长、移除、撤销",
    async (mode) => {
      render(
        <Host
          mode={mode}
          value={{ version: 2, text: initial.text, annotations: [] }}
        />
      );
      openPause();
      expect(button("停顿 0.5 秒")).toBeDisabled();
      expect(document.querySelector(".tsz-ve-canvas")).toHaveAttribute(
        "data-brush",
        "none"
      );
      select(8);
      fireEvent.click(button("停顿 0.5 秒"));
      await waitFor(() =>
        expect(data().annotations).toEqual([
          { type: "pause", at: 8, duration_ms: 500 }
        ])
      );
      await waitFor(() =>
        expect(
          screen.queryByRole("button", { name: "停顿 1 秒" })
        ).not.toBeInTheDocument()
      );
      fireEvent.click(screen.getByLabelText("编辑第 2 处停顿 0.5 秒"));
      fireEvent.click(button("停顿 1 秒"));
      expect(data().annotations).toEqual([
        { type: "pause", at: 8, duration_ms: 1000 }
      ]);
      fireEvent.click(screen.getByLabelText("编辑第 2 处停顿 1 秒"));
      fireEvent.click(button("移除停顿"));
      expect(data().annotations).toEqual([]);
      fireEvent.click(button("上一步"));
      expect(data().annotations).toEqual([
        { type: "pause", at: 8, duration_ms: 1000 }
      ]);
    }
  );

  it("连读冲突取消不写入，确认后只替换冲突范围，一次撤销可恢复", async () => {
    const changed = vi.fn();
    render(<Host onChange={changed} />);
    select(8);
    openPause();
    fireEvent.click(button("停顿 0.5 秒"));
    expect(data()).toEqual(initial);
    fireEvent.click(button("取消，保留原标注"));
    expect(changed).not.toHaveBeenCalled();
    select(8);
    openPause();
    fireEvent.click(button("停顿 0.5 秒"));
    fireEvent.click(button("移除冲突连读，添加停顿"));
    await waitFor(() =>
      expect(data().annotations).toEqual([
        { type: "pause", at: 8, duration_ms: 500 },
        { type: "pause", at: 15, duration_ms: 500 }
      ])
    );
    fireEvent.click(button("上一步"));
    expect(data()).toEqual(initial);
  });

  it("添加连读跨过停顿也必须确认，取消保留原标注", async () => {
    render(<Host />);
    fireEvent.click(button("连读"));
    fireEvent.mouseDown(document.querySelector('[data-codepoint="12"]')!, {
      button: 0
    });
    fireEvent.click(screen.getByLabelText("选择终点"));
    fireEvent.mouseDown(document.querySelector('[data-codepoint="18"]')!, {
      button: 0
    });
    expect(screen.getByLabelText("添加连读")).not.toBeDisabled();
    fireEvent.click(screen.getByLabelText("添加连读"));
    expect(data()).toEqual(initial);
    fireEvent.click(
      await screen.findByRole("button", { name: "移除冲突停顿，添加连读" })
    );
    expect(data().annotations.filter((a) => a.type === "pause")).toEqual([]);
    expect(data().annotations.filter((a) => a.type === "liaison")).toHaveLength(
      2
    );
    fireEvent.click(button("上一步"));
    expect(data()).toEqual(initial);
  });

  it("外部切换正文清除待确认冲突，不得把旧决定写到新内容", async () => {
    const changed = vi.fn();
    const { rerender } = render(
      <VoiceEditor value={initial} onChange={changed} />
    );
    select(8);
    openPause();
    fireEvent.click(button("停顿 0.5 秒"));
    rerender(
      <VoiceEditor
        value={{ version: 2, text: "hello world", annotations: [] }}
        onChange={changed}
      />
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "移除冲突连读，添加停顿" })
      ).not.toBeInTheDocument()
    );
    expect(changed).not.toHaveBeenCalled();
  });

  it("只读不允许点击停顿标签修改；保存重挂载后保持原值", () => {
    const changed = vi.fn();
    const { unmount } = render(<Host onChange={changed} />);
    fireEvent.click(screen.getByLabelText("编辑第 4 处停顿 0.5 秒"));
    fireEvent.change(screen.getByLabelText("自定义停顿秒"), {
      target: { value: "0.35" }
    });
    fireEvent.keyDown(screen.getByLabelText("自定义停顿秒"), { key: "Enter" });
    const saved = data();
    unmount();
    render(<Host value={saved} readOnly onChange={changed} />);
    expect(screen.getByLabelText("编辑第 4 处停顿 0.35 秒")).toBeDisabled();
    expect(data()).toEqual(saved);
  });
});
