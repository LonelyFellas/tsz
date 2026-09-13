import {
  fireEvent,
  render as renderUI,
  screen,
  waitFor
} from "@testing-library/react";
import { ConfigProvider } from "antd";
import { useState, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { RichTextV2, TextLinkV3 } from "@tsz/types";
import type { AssociationPickerProps } from "../../types";
import { VoiceEditor } from "./VoiceEditor";

function render(ui: ReactElement) {
  return renderUI(
    <ConfigProvider theme={{ token: { motion: false } }}>{ui}</ConfigProvider>
  );
}

const target: TextLinkV3 = {
  id: "link",
  source_segments: [],
  target_word_id: "word",
  target_publication_id: "pub",
  target_pos_id: "pos",
  target_base_form_id: "base",
  target_form_id: "form",
  target_variant_id: "variant",
  target_sense_id: "sense"
};

describe("正文关联编辑器", () => {
  it("替换语法工具，关联与正文共同平移、清除和撤销", async () => {
    const observe = vi.fn();
    function Host() {
      const [value, setValue] = useState<RichTextV2>({
        version: 2,
        text: "mother helps mother",
        annotations: []
      });
      const [links, setLinks] = useState<TextLinkV3[]>([]);
      return (
        <VoiceEditor
          value={value}
          textLinks={links}
          mode="association"
          contextLabel="释义正文"
          renderAssociationPicker={({ segments, onSelect }) => (
            <button
              onClick={() => onSelect({ ...target, source_segments: segments })}
            >
              选择词义
            </button>
          )}
          onChange={(next, nextLinks) => {
            observe(next, nextLinks);
            setValue(next);
            setLinks(nextLinks ?? []);
          }}
        />
      );
    }
    render(<Host />);
    expect(screen.queryByRole("button", { name: /^语法结构/ })).toBeNull();
    expect(observe).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "关联单词" }));
    fireEvent.mouseDown(screen.getByLabelText("关联 mother（1）"), {
      button: 0
    });
    fireEvent.click(await screen.findByText("选择词义"));
    await waitFor(() =>
      expect(observe.mock.lastCall?.[1]?.[0]?.source_segments).toEqual([
        { start: 0, end: 6, surface: "mother" }
      ])
    );
    fireEvent.click(screen.getByRole("button", { name: "编辑文本" }));
    fireEvent.change(screen.getByLabelText("释义正文"), {
      target: { value: "dear mother helps mother" }
    });
    await waitFor(() =>
      expect(observe.mock.lastCall?.[1]?.[0]?.source_segments[0].start).toBe(5)
    );
    fireEvent.click(screen.getByRole("button", { name: "上一步" }));
    await waitFor(() =>
      expect(observe.mock.lastCall?.[0]?.text).toBe("mother helps mother")
    );
    fireEvent.change(screen.getByLabelText("释义正文"), {
      target: { value: "father helps mother" }
    });
    await waitFor(() => expect(observe.mock.lastCall?.[1]).toEqual([]));
    expect(screen.getByText(/被修改词段的关联已移除/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "上一步" }));
    await waitFor(() => expect(observe.mock.lastCall?.[1]).toHaveLength(1));
  });
});

it.each(["grammar", "association"] as const)(
  "%s 模式可锁定正文而继续标注，Esc 不会重新允许改字",
  async (mode) => {
    const observe = vi.fn();
    render(
      <VoiceEditor
        mode={mode}
        textReadOnly
        contextLabel="只做标注的正文"
        value={{ version: 2, text: "hello there", annotations: [] }}
        onChange={observe}
      />
    );
    const input = screen.getByLabelText("只做标注的正文");
    expect(
      screen.queryByRole("button", { name: "编辑文本" })
    ).not.toBeInTheDocument();
    expect(input).toHaveAttribute("readonly");
    fireEvent.change(input, { target: { value: "不可写入" } });
    expect(observe).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "停顿" }));
    fireEvent.click(screen.getByLabelText("用停顿画笔 500ms"));
    fireEvent.mouseDown(screen.getByLabelText("第 1 处词缝"), { button: 0 });
    await waitFor(() =>
      expect(observe.mock.lastCall?.[0]).toMatchObject({
        text: "hello there",
        annotations: [{ type: "pause", at: 5, duration_ms: 500 }]
      })
    );
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveAttribute("readonly");
    fireEvent.change(input, { target: { value: "仍然不可写入" } });
    expect(observe.mock.lastCall?.[0].text).toBe("hello there");
    fireEvent.click(screen.getByRole("button", { name: "上一步" }));
    await waitFor(() =>
      expect(observe.mock.lastCall?.[0].annotations).toEqual([])
    );
    expect(input).toHaveValue("hello there");
  }
);

it("关联短语先多选词，再确认打开候选，保留非连续词段", async () => {
  const observe = vi.fn();
  const picker = vi.fn(({ segments, onSelect }: AssociationPickerProps) => (
    <button onClick={() => onSelect({ ...target, source_segments: segments })}>
      选择词义
    </button>
  ));
  render(
    <VoiceEditor
      mode="association"
      value={{
        version: 2,
        text: "Mother loved to dress me up.",
        annotations: []
      }}
      renderAssociationPicker={picker}
      onChange={observe}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "关联短语" }));
  const choose = await screen.findByRole("button", { name: "选择关联短语" });
  await waitFor(() => expect(choose.closest('[role="tooltip"]')).toBeVisible());
  expect(choose).toBeDisabled();
  fireEvent.mouseDown(screen.getByLabelText("关联 dress（4）"), { button: 0 });
  fireEvent.click(screen.getByLabelText("关联 dress（4）"));
  expect(choose).toBeVisible();
  expect(choose).toBeDisabled();
  expect(picker).not.toHaveBeenCalled();
  fireEvent.mouseDown(screen.getByLabelText("关联 up.（6）"), { button: 0 });
  expect(choose).toBeEnabled();
  expect(picker).not.toHaveBeenCalled();
  expect(observe).not.toHaveBeenCalled();
  fireEvent.click(choose);
  await waitFor(() => expect(choose).not.toBeVisible());
  const selected = [
    { start: 16, end: 21, surface: "dress" },
    { start: 25, end: 27, surface: "up" }
  ];
  expect(picker.mock.lastCall?.[0]).toMatchObject({
    kind: "phrase",
    segments: selected
  });
  fireEvent.click(await screen.findByText("选择词义"));
  await waitFor(() =>
    expect(observe.mock.lastCall?.[1]?.[0]?.source_segments).toEqual(selected)
  );
});

it("短语选词可逐个取消，换到关联单词后始终只选一个词", async () => {
  const picker = vi.fn((_props: AssociationPickerProps) => <div>候选列表</div>);
  render(
    <VoiceEditor
      mode="association"
      value={{ version: 2, text: "give it up", annotations: [] }}
      renderAssociationPicker={picker}
      onChange={vi.fn()}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "关联短语" }));
  const word = (label: string, modifiers = {}) =>
    fireEvent.mouseDown(screen.getByLabelText(label), {
      button: 0,
      ...modifiers
    });
  word("关联 give（1）");
  word("关联 up（3）");
  word("关联 give（1）");
  expect(screen.getByRole("button", { name: "选择关联短语" })).toBeDisabled();
  expect(picker).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "关联单词" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "选择关联短语" })
    ).not.toBeInTheDocument()
  );
  word("关联 give（1）");
  expect(picker.mock.lastCall?.[0]).toMatchObject({
    kind: "word",
    segments: [{ start: 0, end: 4, surface: "give" }]
  });
  word("关联 up（3）", { ctrlKey: true });
  expect(picker.mock.lastCall?.[0]).toMatchObject({
    kind: "word",
    segments: [{ start: 8, end: 10, surface: "up" }]
  });
});

it("短语不能跨段选词", async () => {
  const picker = vi.fn((_props: AssociationPickerProps) => <div>候选列表</div>);
  render(
    <VoiceEditor
      mode="association"
      value={{ version: 2, text: "give\nup", annotations: [] }}
      renderAssociationPicker={picker}
      onChange={vi.fn()}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "关联短语" }));
  fireEvent.mouseDown(screen.getByLabelText("关联 give（1）"), { button: 0 });
  fireEvent.mouseDown(screen.getByLabelText("关联 up（2）"), { button: 0 });
  expect(screen.getByText("请选择同一段落内的词语。")).toBeVisible();
  expect(
    await screen.findByRole("button", { name: "选择关联短语" })
  ).toBeDisabled();
  expect(picker).not.toHaveBeenCalled();
});

it.each(["word", "phrase"] as const)(
  "已有 %s 关联不能被另一种关联覆盖，清除后才可重新关联",
  async (existingKind) => {
    const original: TextLinkV3 = {
      ...target,
      source_segments:
        existingKind === "word"
          ? [{ start: 0, end: 4, surface: "give" }]
          : [
              { start: 0, end: 4, surface: "give" },
              { start: 8, end: 10, surface: "up" }
            ]
    };
    const other: TextLinkV3 = {
      ...target,
      id: "other",
      source_segments: [{ start: 11, end: 15, surface: "give" }]
    };
    const observe = vi.fn();
    const picker = vi.fn(
      ({ selected, onSelect, segments }: AssociationPickerProps) => (
        <>
          <div>{selected ? "已有关联" : "新关联候选"}</div>
          <button
            onClick={() =>
              onSelect({ ...target, id: "new", source_segments: segments })
            }
          >
            提交新关联
          </button>
          {selected && (
            <button onClick={() => onSelect(undefined)}>清除原关联</button>
          )}
        </>
      )
    );
    render(
      <VoiceEditor
        mode="association"
        value={{ version: 2, text: "give it up give", annotations: [] }}
        textLinks={[original, other]}
        renderAssociationPicker={picker}
        onChange={observe}
      />
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: existingKind === "word" ? "关联短语" : "关联单词"
      })
    );
    fireEvent.mouseDown(screen.getByLabelText("关联 give（1）"), { button: 0 });
    await screen.findByText("已有关联");
    expect(picker.mock.lastCall?.[0]).toMatchObject({
      selected: original,
      segments: original.source_segments
    });
    fireEvent.click(screen.getByText("提交新关联"));
    expect(observe).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("清除原关联"));
    await waitFor(() => expect(observe.mock.lastCall?.[1]).toEqual([other]));
    fireEvent.click(screen.getByRole("button", { name: "关联单词" }));
    fireEvent.mouseDown(screen.getByLabelText("关联 give（1）"), { button: 0 });
    await screen.findByText("新关联候选");
    fireEvent.click(screen.getByText("提交新关联"));
    await waitFor(() =>
      expect(observe.mock.lastCall?.[1]).toEqual([
        other,
        {
          ...target,
          id: "new",
          source_segments: [{ start: 0, end: 4, surface: "give" }]
        }
      ])
    );
  }
);

it("例句的关联恢复跟随撤销重做，主动清除后不再自动恢复", async () => {
  const original = {
    ...target,
    source_segments: [{ start: 0, end: 7, surface: "make up" }]
  };
  const observe = vi.fn();
  function Host() {
    const [value, setValue] = useState<RichTextV2>({
      version: 2,
      text: "make up",
      annotations: []
    });
    const [links, setLinks] = useState([original]);
    return (
      <VoiceEditor
        mode="association"
        restoreTextLinksOnCorrection
        value={value}
        textLinks={links}
        contextLabel="例句正文"
        renderAssociationPicker={({ onSelect }) => (
          <button onClick={() => onSelect(undefined)}>清除原关联</button>
        )}
        onChange={(next, nextLinks) => {
          observe(next, nextLinks);
          setValue(next);
          setLinks(nextLinks ?? []);
        }}
      />
    );
  }
  render(<Host />);
  const input = screen.getByLabelText("例句正文");
  fireEvent.change(input, { target: { value: "makke up" } });
  await waitFor(() => expect(observe.mock.lastCall?.[1]).toEqual([]));
  fireEvent.click(screen.getByRole("button", { name: "上一步" }));
  await waitFor(() => expect(observe.mock.lastCall?.[1]).toEqual([original]));
  fireEvent.click(screen.getByRole("button", { name: "下一步" }));
  await waitFor(() => expect(observe.mock.lastCall?.[1]).toEqual([]));
  fireEvent.change(input, { target: { value: "make up" } });
  await waitFor(() => expect(observe.mock.lastCall?.[1]).toEqual([original]));
  expect(screen.queryByText(/部分关联暂时失效/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "关联短语" }));
  fireEvent.mouseDown(screen.getByLabelText("关联 make（1）"), { button: 0 });
  fireEvent.click(await screen.findByText("清除原关联"));
  await waitFor(() => expect(observe.mock.lastCall?.[1]).toEqual([]));
  fireEvent.click(screen.getByRole("button", { name: "编辑文本" }));
  fireEvent.change(input, { target: { value: "makke up" } });
  fireEvent.change(input, { target: { value: "make up" } });
  await waitFor(() => expect(observe.mock.lastCall?.[0]?.text).toBe("make up"));
  expect(observe.mock.lastCall?.[1]).toEqual([]);
});
